"""星火知识库 (ChatDoc) API 服务

封装讯飞星火 ChatDoc 知识库 API，提供：
- 文档上传与状态管理
- 向量检索
- 知识库（仓库）管理
- WebSocket 流式问答

鉴权方式: appId + timestamp + signature
签名算法: auth = MD5(appId + timestamp), signature = Base64(HmacSHA1(secret, auth))
"""

import asyncio
import base64
import hashlib
import hmac
import json
import logging
import time
from typing import AsyncGenerator, Optional

import httpx

from config import settings

logger = logging.getLogger(__name__)


class SparkKBService:
    """星火 ChatDoc 知识库 API 客户端"""

    BASE_URL = "https://chatdoc.xfyun.cn"
    WS_URL = "wss://chatdoc.xfyun.cn/openapi/chat"

    @property
    def app_id(self) -> str:
        return settings.spark_kb_app_id

    @property
    def app_secret(self) -> str:
        return settings.spark_kb_app_secret

    @property
    def enabled(self) -> bool:
        return bool(self.app_id and self.app_secret and settings.spark_kb_enabled)

    # ── 鉴权 ─────────────────────────────────────────────────────

    def _build_auth_headers(self) -> dict[str, str]:
        """构建 ChatDoc API 鉴权 Header"""
        timestamp = str(int(time.time()))
        # auth = MD5(appId + timestamp)
        auth_str = f"{self.app_id}{timestamp}"
        auth_md5 = hashlib.md5(auth_str.encode("utf-8")).hexdigest()
        # signature = Base64(HmacSHA1(secret, auth))
        signature = base64.b64encode(
            hmac.new(
                self.app_secret.encode("utf-8"),
                auth_md5.encode("utf-8"),
                hashlib.sha1,
            ).digest()
        ).decode("utf-8")
        return {
            "appId": self.app_id,
            "timestamp": timestamp,
            "signature": signature,
        }

    def _build_ws_auth_params(self) -> str:
        """构建 WebSocket 鉴权查询参数"""
        h = self._build_auth_headers()
        return f"appId={h['appId']}&timestamp={h['timestamp']}&signature={h['signature']}"

    # ── 文件管理 ──────────────────────────────────────────────────

    async def upload_file(
        self,
        file_bytes: bytes,
        filename: str,
        parse_type: str = "AUTO",
        step_by_step: bool = False,
    ) -> dict:
        """上传文档到星火知识库。

        Args:
            file_bytes: 文件二进制内容
            filename: 文件名（含后缀）
            parse_type: 解析类型 AUTO/TEXT/OCR
            step_by_step: 是否分步处理

        Returns:
            {fileId, parseType, quantity} 或 {error: ...}
        """
        if not self.enabled:
            return {"error": "星火知识库未启用"}

        headers = self._build_auth_headers()
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    f"{self.BASE_URL}/openapi/v1/file/upload",
                    headers=headers,
                    files={"file": (filename, file_bytes)},
                    data={
                        "fileType": "wiki",
                        "parseType": parse_type,
                        "stepByStep": str(step_by_step).lower(),
                    },
                )
                result = resp.json()
                if result.get("code") == 0:
                    logger.info("星火上传成功: fileId=%s, quantity=%s",
                                result["data"].get("fileId"), result["data"].get("quantity"))
                    return result["data"]
                else:
                    logger.error("星火上传失败: code=%s, desc=%s",
                                 result.get("code"), result.get("desc"))
                    return {"error": result.get("desc", "上传失败"), "code": result.get("code")}
        except Exception as e:
            logger.error("星火上传异常: %s", e)
            return {"error": str(e)}

    async def get_file_status(self, file_ids: list[str]) -> list[dict]:
        """查询文件状态。

        Returns:
            [{fileId, fileStatus}, ...]
        """
        if not self.enabled or not file_ids:
            return []

        headers = self._build_auth_headers()
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{self.BASE_URL}/openapi/v1/file/status",
                    headers=headers,
                    data={"fileIds": ",".join(file_ids)},
                )
                result = resp.json()
                if result.get("code") == 0:
                    return result.get("data", [])
                logger.warning("星火状态查询失败: %s", result.get("desc"))
                return []
        except Exception as e:
            logger.error("星火状态查询异常: %s", e)
            return []

    async def wait_file_ready(
        self,
        file_id: str,
        timeout: int = 120,
        poll_interval: float = 3.0,
    ) -> bool:
        """轮询文件状态直到 vectored 或失败。

        Returns:
            True 如果文件已就绪（vectored），False 超时或失败
        """
        deadline = time.time() + timeout
        while time.time() < deadline:
            statuses = await self.get_file_status([file_id])
            if statuses:
                status = statuses[0].get("fileStatus", "")
                if status == "vectored":
                    return True
                if status == "failed":
                    logger.error("星火文件处理失败: fileId=%s", file_id)
                    return False
            await asyncio.sleep(poll_interval)
        logger.warning("星火文件处理超时: fileId=%s", file_id)
        return False

    async def delete_files(self, file_ids: list[str]) -> bool:
        """删除文件。"""
        if not self.enabled or not file_ids:
            return False

        headers = self._build_auth_headers()
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{self.BASE_URL}/openapi/v1/file/del",
                    headers=headers,
                    data={"fileIds": ",".join(file_ids)},
                )
                result = resp.json()
                return result.get("code") == 0
        except Exception as e:
            logger.error("星火删除文件异常: %s", e)
            return False

    # ── 向量检索 ──────────────────────────────────────────────────

    async def vector_search(
        self,
        query: str,
        file_ids: list[str] | None = None,
        top_k: int = 5,
        wiki_filter_score: float = 0.6,
    ) -> list[dict]:
        """语义向量检索用户文档。

        Returns:
            [{content, score, fileId, index, type}, ...]
        """
        if not self.enabled:
            return []

        payload: dict = {
            "content": query,
            "topN": top_k,
            "chatExtends": {
                "wikiFilterScore": wiki_filter_score,
            },
        }
        if file_ids:
            payload["fileIds"] = file_ids

        headers = self._build_auth_headers()
        headers["Content-Type"] = "application/json"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{self.BASE_URL}/openapi/v1/vector/search",
                    headers=headers,
                    json=payload,
                )
                result = resp.json()
                if result.get("code") == 0:
                    data = result.get("data") or []
                    logger.info("星火向量检索: query=%r, hits=%d", query[:30], len(data))
                    return data
                logger.warning("星火向量检索失败: %s", result.get("desc"))
                return []
        except Exception as e:
            logger.error("星火向量检索异常: %s", e)
            return []

    # ── 知识库（仓库）管理 ────────────────────────────────────────

    async def create_repo(
        self, name: str, desc: str = "", tags: str = ""
    ) -> str | None:
        """创建知识库，返回 repoId。"""
        if not self.enabled:
            return None

        headers = self._build_auth_headers()
        headers["Content-Type"] = "application/json"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{self.BASE_URL}/openapi/v1/repo/create",
                    headers=headers,
                    json={"repoName": name, "repoDesc": desc, "repoTags": tags},
                )
                result = resp.json()
                if result.get("code") == 0:
                    repo_id = result.get("data")
                    logger.info("星火知识库创建成功: repoId=%s", repo_id)
                    return repo_id
                logger.error("星火知识库创建失败: %s", result.get("desc"))
                return None
        except Exception as e:
            logger.error("星火知识库创建异常: %s", e)
            return None

    async def list_repos(self) -> list[dict]:
        """列出所有知识库。"""
        if not self.enabled:
            return []

        headers = self._build_auth_headers()
        headers["Content-Type"] = "application/json"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{self.BASE_URL}/openapi/v1/repo/list",
                    headers=headers,
                    json={"currentPage": 1, "pageSize": 50},
                )
                result = resp.json()
                if result.get("code") == 0:
                    return result.get("data") or []
                return []
        except Exception as e:
            logger.error("星火知识库列表异常: %s", e)
            return []

    async def add_files_to_repo(
        self, repo_id: str, file_ids: list[str]
    ) -> dict:
        """向知识库添加文件。"""
        if not self.enabled or not file_ids:
            return {}

        headers = self._build_auth_headers()
        headers["Content-Type"] = "application/json"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{self.BASE_URL}/openapi/v1/repo/file/add",
                    headers=headers,
                    json={"repoId": repo_id, "fileIds": file_ids[:20]},
                )
                result = resp.json()
                if result.get("code") == 0:
                    return result.get("data") or {}
                return {"error": result.get("desc")}
        except Exception as e:
            logger.error("星火知识库添加文件异常: %s", e)
            return {"error": str(e)}

    async def get_repo_files(self, repo_id: str) -> list[dict]:
        """获取知识库下的文件列表。"""
        if not self.enabled:
            return []

        headers = self._build_auth_headers()
        headers["Content-Type"] = "application/json"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{self.BASE_URL}/openapi/v1/repo/file/list",
                    headers=headers,
                    json={"repoId": repo_id, "currentPage": 1, "pageSize": 100},
                )
                result = resp.json()
                if result.get("code") == 0:
                    return result.get("data") or []
                return []
        except Exception as e:
            logger.error("星火知识库文件列表异常: %s", e)
            return []

    async def delete_repo(self, repo_id: str) -> bool:
        """删除知识库。"""
        if not self.enabled:
            return False

        headers = self._build_auth_headers()
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{self.BASE_URL}/openapi/v1/repo/del",
                    headers=headers,
                    data={"repoId": repo_id},
                )
                result = resp.json()
                return result.get("code") == 0
        except Exception as e:
            logger.error("星火知识库删除异常: %s", e)
            return False

    # ── 用户级仓库管理 ────────────────────────────────────────────

    async def get_or_create_user_repo(self, user_id: str) -> str | None:
        """获取或创建用户的星火知识库。

        每个用户对应一个星火 repo，所有文档都加到这个 repo 中。
        repo 命名格式: "智学_{user_id}"
        """
        if not self.enabled:
            return None

        # 检查是否已存在
        repos = await self.list_repos()
        prefix = f"智学_{user_id}"
        for r in repos:
            if r.get("repoName", "").startswith(prefix):
                return r.get("repoId")

        # 创建新的
        repo_id = await self.create_repo(
            name=prefix,
            desc=f"用户 {user_id} 的个人知识库",
            tags="personal,auto",
        )
        if repo_id:
            logger.info("为用户 %s 创建星火知识库: %s", user_id, repo_id)
        return repo_id

    async def sync_doc_to_repo(
        self, repo_id: str, spark_file_id: str
    ) -> bool:
        """将文件添加到知识库。"""
        if not self.enabled or not repo_id or not spark_file_id:
            return False
        result = await self.add_files_to_repo(repo_id, [spark_file_id])
        return "error" not in result

    # ── WebSocket 问答（流式） ────────────────────────────────────

    async def chat_stream(
        self,
        question: str,
        repo_id: str | None = None,
        file_ids: list[str] | None = None,
        history: list[dict] | None = None,
        temperature: float = 0.3,
    ) -> AsyncGenerator[dict, None]:
        """基于星火知识库的流式问答。

        Yields:
            {"type": "content", "text": "..."}
            {"type": "references", "data": [...]}
            {"type": "done"}
            {"type": "error", "message": "..."}
        """
        if not self.enabled:
            yield {"type": "error", "message": "星火知识库未启用"}
            return

        # 构建消息列表
        messages = list(history or [])
        messages.append({"role": "user", "content": question})

        # 构建请求 payload
        payload: dict = {
            "messages": messages,
            "chatExtends": {
                "temperature": temperature,
                "spark": True,  # 无匹配时大模型兜底
            },
        }
        if repo_id:
            payload["repoId"] = repo_id
        elif file_ids:
            payload["fileIds"] = file_ids

        # WebSocket 连接
        auth_params = self._build_ws_auth_params()
        ws_url = f"{self.WS_URL}?{auth_params}"

        try:
            import websockets
            async with websockets.connect(ws_url, max_size=10 * 1024 * 1024) as ws:
                # 发送问答消息
                await ws.send(json.dumps(payload, ensure_ascii=False))

                # 接收流式响应
                async for raw in ws:
                    try:
                        data = json.loads(raw)
                    except json.JSONDecodeError:
                        continue

                    code = data.get("code", -1)
                    if code != 0:
                        yield {"type": "error", "message": data.get("message", "未知错误")}
                        return

                    status = data.get("status", -1)
                    content = data.get("content", "")

                    # status=99 是引用文档信息
                    if status == 99:
                        file_refer = data.get("fileRefer", "")
                        if file_refer:
                            try:
                                refs = json.loads(file_refer) if isinstance(file_refer, str) else file_refer
                                yield {"type": "references", "data": refs}
                            except Exception:
                                pass
                        continue

                    if content:
                        yield {"type": "content", "text": content}

                    # status=2 表示最后一个结果
                    if status == 2:
                        yield {"type": "done"}
                        return

                # 正常结束
                yield {"type": "done"}

        except ImportError:
            logger.error("websockets 库未安装")
            yield {"type": "error", "message": "websockets 库未安装"}
        except Exception as e:
            logger.error("星火知识库问答异常: %s", e)
            yield {"type": "error", "message": str(e)}


spark_kb_service = SparkKBService()
