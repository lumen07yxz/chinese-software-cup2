"""向量嵌入服务 — 星火 Embedding API + n-gram 降级兜底

API 规范参考：https://www.xfyun.cn/doc/spark/Embedding_new_api.html
基于 LangChain SparkLLMTextEmbeddings 实现，使用 HMAC-SHA256 签名鉴权。
"""

import asyncio
import base64
import hashlib
import hmac
import logging
import math
import struct
from datetime import datetime
from time import mktime
from typing import Optional
from urllib.parse import urlencode
from wsgiref.handlers import format_date_time

import httpx

from config import settings

logger = logging.getLogger(__name__)

# ── 星火 Embedding API 配置 ────────────────────────────────────────────
SPARK_EMBEDDING_URL = settings.spark_embedding_url  # 默认 https://emb-cn-huabei-1.xf-yun.com/
SPARK_EMBED_BATCH = 16                               # 单次最大文本数
SPARK_EMBED_TIMEOUT = 30.0                           # 单次请求超时（秒）
TARGET_DIM = 2560                                    # 星火 Embedding 输出维度
FALLBACK_DIM = 256                                   # n-gram 兜底维度

# 断路器：临时性失败重试 2 次，持续性失败（licc/配额）直接转兜底
_MAX_RETRIES = 2
_RETRY_DELAY = 1.0
_LICC_CODES = {11200, 11201, 11202, 11203, 11204, 11205, 11206, 11207, 11208, 11209,
               10004, 10005, 10006, 10008, 10009, 10012, 10019}  # 账号/鉴权/配额类错误
_api_dead = False  # 断路器：True 后直接走 n-gram 兜底


class EmbeddingService:
    """语义向量嵌入：优先星火 API，失败时降级为 n-gram 哈希"""

    # ── 公开接口 ──────────────────────────────────────────────────────

    def embed(self, text: str, dim: int = 2560) -> list[float]:
        """单条文本 → 向量"""
        vec = self._spark_embed([text])
        if vec is not None and len(vec) > 0 and vec[0] is not None:
            return vec[0]
        logger.warning("星火 Embedding API 不可用，降级为 n-gram 兜底")
        return self._pad_to_dim(self._ngram_embed(text, FALLBACK_DIM), dim)

    def embed_batch(self, texts: list[str], dim: int = 2560) -> list[list[float]]:
        """批量文本 → 向量列表（自动分片）"""
        if not texts:
            return []

        all_vecs: list[Optional[list[float]]] = [None] * len(texts)

        for start in range(0, len(texts), SPARK_EMBED_BATCH):
            batch = texts[start : start + SPARK_EMBED_BATCH]
            result = self._spark_embed(batch)
            if result is not None:
                for i, vec in enumerate(result):
                    if vec is not None:
                        all_vecs[start + i] = vec

        need_fallback = [i for i, v in enumerate(all_vecs) if v is None]
        if need_fallback:
            if len(need_fallback) == len(texts):
                logger.warning("星火 Embedding API 不可用，全部降级为 n-gram")
            for i in need_fallback:
                all_vecs[i] = self._pad_to_dim(self._ngram_embed(texts[i], FALLBACK_DIM), dim)

        return all_vecs  # type: ignore[return-value]

    async def a_embed(self, text: str, dim: int = 2560) -> list[float]:
        """异步单条文本 → 向量"""
        vec = await self._a_spark_embed([text])
        if vec is not None and len(vec) > 0 and vec[0] is not None:
            return vec[0]
        logger.warning("星火 Embedding API 不可用，降级为 n-gram 兜底")
        return self._pad_to_dim(self._ngram_embed(text, FALLBACK_DIM), dim)

    # ── 同步 API 调用 ─────────────────────────────────────────────────

    def _spark_embed(self, texts: list[str]) -> Optional[list[list[float]]]:
        """调用星火语义向量接口（同步），带断路器 + 自动重试，失败返回 None"""
        global _api_dead
        if _api_dead:
            logger.debug("断路器已断开，跳过星火 Embedding API")
            return None

        if not settings.spark_app_id or not settings.spark_api_key or not settings.spark_api_secret:
            logger.warning("缺少星火 API 凭证")
            return None

        auth_url = self._build_auth_url(SPARK_EMBEDDING_URL, "POST",
                                        settings.spark_api_key, settings.spark_api_secret)

        results: list[Optional[list[float]]] = []
        for text in texts:
            body = self._build_body(settings.spark_app_id, text)
            vec: Optional[list[float]] = None
            last_err: str = ""

            for attempt in range(1, _MAX_RETRIES + 1):
                try:
                    with httpx.Client(timeout=SPARK_EMBED_TIMEOUT) as client:
                        resp = client.post(
                            auth_url, json=body,
                            headers={"Content-Type": "application/json"},
                        )
                        # 解析响应体中的业务错误码
                        parsed_code = self._peek_error_code(resp.text)

                        # 持续性错误（license/配额）→ 触发断路器
                        if parsed_code in _LICC_CODES:
                            last_err = f"code {parsed_code}: {resp.text[:200]}"
                            _api_dead = True
                            logger.error("星火 Embedding API 持久性故障（code=%s, msg=%s），断路器已断开",
                                         parsed_code,
                                         self._peek_error_msg(resp.text))
                            # 本轮失败，但继续完成剩余文本（直接标记 None）
                            vec = None
                            break

                        if resp.status_code >= 500:
                            last_err = f"HTTP {resp.status_code}: {resp.text[:200]}"
                            if attempt < _MAX_RETRIES:
                                import time
                                time.sleep(_RETRY_DELAY * attempt)
                            continue

                        resp.raise_for_status()
                        parsed = self._parse_response(resp.text)
                        if parsed is not None:
                            vec = parsed
                        break
                except Exception as e:
                    last_err = str(e)
                    if attempt < _MAX_RETRIES:
                        import time
                        time.sleep(_RETRY_DELAY * attempt)
                    continue

            if vec is None:
                logger.warning("星火 Embedding API 调用失败（%d 次重试后）(text[:50]=%r): %s",
                               _MAX_RETRIES, text[:50], last_err)
                results.append(None)
            else:
                results.append(vec)
        return results

    # ── 异步 API 调用 ─────────────────────────────────────────────────

    async def _a_spark_embed(self, texts: list[str]) -> Optional[list[list[float]]]:
        """调用星火语义向量接口（异步），带断路器 + 自动重试，失败返回 None"""
        global _api_dead
        if _api_dead:
            logger.debug("断路器已断开，跳过星火 Embedding API")
            return None

        if not settings.spark_app_id or not settings.spark_api_key or not settings.spark_api_secret:
            logger.warning("缺少星火 API 凭证")
            return None

        auth_url = self._build_auth_url(SPARK_EMBEDDING_URL, "POST",
                                        settings.spark_api_key, settings.spark_api_secret)

        results: list[Optional[list[float]]] = []
        async with httpx.AsyncClient(timeout=SPARK_EMBED_TIMEOUT) as client:
            for text in texts:
                body = self._build_body(settings.spark_app_id, text)
                vec: Optional[list[float]] = None
                last_err: str = ""

                for attempt in range(1, _MAX_RETRIES + 1):
                    try:
                        resp = await client.post(
                            auth_url, json=body,
                            headers={"Content-Type": "application/json"},
                        )
                        parsed_code = self._peek_error_code(resp.text)

                        # 持续性错误（license/配额）→ 触发断路器
                        if parsed_code in _LICC_CODES:
                            last_err = f"code {parsed_code}: {resp.text[:200]}"
                            _api_dead = True
                            logger.error("星火 Embedding API 持久性故障（code=%s, msg=%s），断路器已断开",
                                         parsed_code,
                                         self._peek_error_msg(resp.text))
                            vec = None
                            break

                        if resp.status_code >= 500:
                            last_err = f"HTTP {resp.status_code}: {resp.text[:200]}"
                            if attempt < _MAX_RETRIES:
                                await asyncio.sleep(_RETRY_DELAY * attempt)
                            continue

                        resp.raise_for_status()
                        parsed = self._parse_response(resp.text)
                        if parsed is not None:
                            vec = parsed
                        break
                    except Exception as e:
                        last_err = str(e)
                        if attempt < _MAX_RETRIES:
                            await asyncio.sleep(_RETRY_DELAY * attempt)
                        continue

                if vec is None:
                    logger.warning("星火 Embedding API 异步调用失败（%d 次重试后）(text[:50]=%r): %s",
                                   _MAX_RETRIES, text[:50], last_err)
                    results.append(None)
                else:
                    results.append(vec)
        return results

    @staticmethod
    def _peek_error_code(raw_text: str) -> int:
        """快速读取响应中的错误码，不做完整解析"""
        try:
            import json as _json
            data = _json.loads(raw_text)
            return data.get("header", {}).get("code", 0)
        except Exception:
            return 0

    @staticmethod
    def _peek_error_msg(raw_text: str) -> str:
        """快速读取响应中的错误消息"""
        try:
            import json as _json
            data = _json.loads(raw_text)
            return data.get("header", {}).get("message", "") or ""
        except Exception:
            return ""

    # ── HMAC-SHA256 签名鉴权 ──────────────────────────────────────────

    @staticmethod
    def _build_auth_url(
        request_url: str, method: str, api_key: str, api_secret: str
    ) -> str:
        """构建带 HMAC-SHA256 签名的鉴权 URL（签名放入 query string）"""
        # 解析 URL 的 host / path
        st_idx = request_url.index("://")
        schema = request_url[: st_idx + 3]
        host_path = request_url[st_idx + 3:]
        ed_idx = host_path.index("/") if "/" in host_path else len(host_path)
        host = host_path[:ed_idx]
        path = host_path[ed_idx:] if ed_idx < len(host_path) else "/"

        now = datetime.now()
        date = format_date_time(mktime(now.timetuple()))

        # 待签名字符串
        signature_origin = f"host: {host}\ndate: {date}\n{method} {path} HTTP/1.1"
        signature_sha = hmac.new(
            api_secret.encode("utf-8"),
            signature_origin.encode("utf-8"),
            digestmod=hashlib.sha256,
        ).digest()
        signature_str = base64.b64encode(signature_sha).decode("utf-8")

        # 组装 authorization
        authorization_origin = (
            f'api_key="{api_key}", algorithm="hmac-sha256", '
            f'headers="host date request-line", signature="{signature_str}"'
        )
        authorization = base64.b64encode(authorization_origin.encode("utf-8")).decode("utf-8")

        params = {"host": host, "date": date, "authorization": authorization}
        return f"{schema}{host}{path}?{urlencode(params)}"

    @staticmethod
    def _build_body(app_id: str, text: str) -> dict:
        """构建请求体（文本 base64 编码）"""
        import json as _json
        payload = {"messages": [{"content": text, "role": "user"}]}
        text_b64 = base64.b64encode(_json.dumps(payload).encode("utf-8")).decode()
        return {
            "header": {
                "app_id": app_id,
                "uid": "student-learning-system",
                "status": 3,
            },
            "parameter": {
                "emb": {
                    "domain": "para",  # "para"=文档嵌入 / "query"=查询嵌入
                    "feature": {"encoding": "utf8"},
                }
            },
            "payload": {
                "messages": {"text": text_b64}
            },
        }

    @staticmethod
    def _parse_response(raw_text: str) -> Optional[list[float]]:
        """解析 API 响应（base64 → float32 小端二进制）"""
        import json as _json
        data = _json.loads(raw_text)
        code = data["header"]["code"]
        if code != 0:
            logger.warning("Embedding API 返回错误码 %s: %s", code, data.get("header", {}).get("message", ""))
            return None

        text_b64 = data["payload"]["feature"]["text"]
        binary = base64.b64decode(text_b64)

        # 解析为 float32 小端数组，取前 2560 维
        fmt = "<" + str(len(binary) // 4) + "f"
        vec = list(struct.unpack(fmt, binary))
        if len(vec) > 2560:
            vec = vec[:2560]
        return vec

    # ── n-gram 哈希兜底（先生成 FALLBACK_DIM 再 pad 到目标）──────────

    @staticmethod
    def _pad_to_dim(vec: list[float], target_dim: int) -> list[float]:
        """将向量 pad 或 truncate 到目标维度"""
        if len(vec) == target_dim:
            return vec
        if len(vec) > target_dim:
            return vec[:target_dim]
        return vec + [0.0] * (target_dim - len(vec))

    @staticmethod
    def _ngram_embed(text: str, dim: int = FALLBACK_DIM) -> list[float]:
        """基于字符 2-4 gram + 双哈希的轻量嵌入（仅兜底）"""
        if not text:
            text = " "
        if len(text) < 3:
            text = text * 3

        vec = [0.0] * dim
        total = 0
        for n in range(2, 5):
            for i in range(len(text) - n + 1):
                gram = text[i : i + n]
                h1 = int(hashlib.md5((gram + "h1").encode()).hexdigest()[:8], 16)
                h2 = int(hashlib.md5((gram + "h2").encode()).hexdigest()[:8], 16)
                vec[h1 % dim] += 1.0
                vec[h2 % dim] += 1.0
                total += 2
        if total > 0:
            norm = math.sqrt(sum(v * v for v in vec))
            if norm > 0:
                vec = [v / norm for v in vec]
        return vec


embedding_service = EmbeddingService()
