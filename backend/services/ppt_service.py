"""讯飞 AI PPT 生成 WebAPI 服务

认证: base64(hmac-sha1(APISecret, md5(APPID + timestamp)))
Header: {appId, timestamp, signature}
路径:
  POST /api/ppt/v2/create    (multipart/form-data) → {"code":0,"data":{"sid":"..."}}
  GET  /api/ppt/v2/progress?sid=xxx → {"code":0,"data":{"pptUrl":"...","pptStatus":"done"}}
"""

import hashlib
import hmac
import base64
import logging
import time

import httpx

from config import settings

logger = logging.getLogger(__name__)

BASE_URL = "https://zwapi.xfyun.cn"


class PPTService:
    TIMEOUT = 30.0

    @property
    def available(self) -> bool:
        return bool(settings.ppt_app_id and settings.ppt_api_secret)

    def _auth_headers(self, content_type: str = "application/json; charset=utf-8") -> dict:
        ts = int(time.time())
        raw = hashlib.md5((settings.ppt_app_id + str(ts)).encode("utf-8")).hexdigest()
        signature = base64.b64encode(
            hmac.new(settings.ppt_api_secret.encode("utf-8"), raw.encode("utf-8"), hashlib.sha1).digest()
        ).decode("utf-8")
        return {"appId": settings.ppt_app_id, "timestamp": str(ts), "signature": signature, "Content-Type": content_type}

    def _build_multipart(self, fields: dict) -> tuple[str, str]:
        """构造 multipart/form-data 正文和 content-type"""
        boundary = "----WebKit" + hashlib.md5(str(time.time()).encode()).hexdigest()[:16]
        parts = []
        for k, v in fields.items():
            parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}")
        parts.append(f"--{boundary}--")
        body = "\r\n".join(parts) + "\r\n"
        return body, f"multipart/form-data; boundary={boundary}"

    async def create_ppt(self, query: str, template_id: str = "202407179097C2D", search: int = 1) -> dict:
        """创建 PPT 生成任务，返回 sid"""
        if not self.available:
            raise RuntimeError("PPT_APP_ID / PPT_API_SECRET 未配置")

        fields = {
            "query": query,
            "templateId": template_id,
            "author": "智学AI",
            "isCardNote": "True",
            "search": "True" if search else "False",
            "isFigure": "True",
            "aiImage": "normal",
        }
        body, ct = self._build_multipart(fields)
        headers = self._auth_headers(ct)

        try:
            async with httpx.AsyncClient(timeout=self.TIMEOUT) as client:
                resp = await client.post(f"{BASE_URL}/api/ppt/v2/create", content=body, headers=headers)
                data = resp.json()
            logger.info("createPPT 响应: %s", data)
            if data.get("code") != 0:
                raise RuntimeError(f"PPT 生成失败: {data}")
            sid = data.get("data", {}).get("sid", "")
            if not sid:
                raise RuntimeError(f"未获取到 sid: {data}")
            return {"sid": sid, "code": data["code"]}
        except httpx.HTTPError as e:
            logger.error("createPPT 网络错误: %s", e)
            raise RuntimeError(f"PPT 生成网络错误: {e}")

    async def query_progress(self, sid: str) -> dict:
        """查询 PPT 生成进度"""
        if not sid:
            raise RuntimeError("sid 不能为空")

        headers = self._auth_headers()
        try:
            async with httpx.AsyncClient(timeout=self.TIMEOUT) as client:
                resp = await client.get(
                    f"{BASE_URL}/api/ppt/v2/progress", params={"sid": sid}, headers=headers
                )
                data = resp.json()
            logger.info("queryProgress 响应: %s", data)
            if data.get("code") != 0:
                raise RuntimeError(f"查询进度失败: {data}")
            payload = data.get("data", {})
            logger.info("queryProgress 完整 payload: %s", payload)
            # 尝试多种可能的 URL 字段名
            file_url = (
                payload.get("pptUrl")
                or payload.get("url")
                or payload.get("fileUrl")
                or payload.get("downloadUrl")
                or payload.get("ppt_download_url")
                or payload.get("previewUrl")
                or ""
            )
            ppt_status = payload.get("pptStatus") or payload.get("status") or ""
            return {
                "code": data["code"],
                "progress": payload.get("process") or payload.get("progress") or 0,
                "fileUrl": file_url,
                "pptStatus": ppt_status,
                "totalPages": payload.get("totalPages") or 0,
                "donePages": payload.get("donePages") or 0,
                "_raw": payload,  # 透传原始字段，方便前端调试
            }
        except httpx.HTTPError as e:
            logger.error("queryProgress 网络错误: %s", e)
            raise RuntimeError(f"进度查询网络错误: {e}")


ppt_service = PPTService()
