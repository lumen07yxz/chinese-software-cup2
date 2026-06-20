"""讯飞 AI PPT 生成 WebAPI 服务

接口：
  POST /api/ppt (zwapi.xfyun.cn)
  GET  /api/ppt?sid=xxx  查询进度

认证：
  1. signature = base64(hmac-sha256(APISecret, signature_origin))
  2. authorization_origin = api_key="APPID", algorithm="hmac-sha256", headers="host date request-line", signature="{signature}"
  3. authorization = base64(authorization_origin)
  4. 作为 URL 查询参数传递：?authorization=xxx&date=xxx&host=xxx
"""

import base64
import hashlib
import hmac
import logging
from datetime import datetime, timezone
from email.utils import format_datetime
from urllib.parse import urlencode

import httpx

from config import settings

logger = logging.getLogger(__name__)

BASE_URL = "https://zwapi.xfyun.cn"


def _sign(method: str, path: str, query: str = "") -> tuple[str, str]:
    """生成讯飞 API 签名的 authorization 和 date

    Returns:
        (authorization_b64, date_rfc1123)
    """
    api_key = settings.ppt_app_id
    api_secret = settings.ppt_api_secret
    host = "zwapi.xfyun.cn"

    date = format_datetime(datetime.now(timezone.utc), usegmt=True)
    request_line = f"{method} {path}{('?' + query) if query else ''} HTTP/1.1"
    signature_origin = f"host: {host}\ndate: {date}\n{request_line}"
    signature_bytes = hmac.new(
        api_secret.encode("utf-8"),
        signature_origin.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    signature = base64.b64encode(signature_bytes).decode("utf-8")

    auth_origin = (
        f'api_key="{api_key}", algorithm="hmac-sha256", '
        f'headers="host date request-line", signature="{signature}"'
    )
    authorization = base64.b64encode(auth_origin.encode("utf-8")).decode("utf-8")
    return authorization, date


class PPTService:
    """讯飞 AI PPT 生成服务"""

    TIMEOUT = 30.0
    POLL_TIMEOUT = 60.0

    @property
    def available(self) -> bool:
        return bool(settings.ppt_app_id and settings.ppt_api_secret)

    async def create_ppt(
        self, query: str, language: str = "cn", search: int = 1
    ) -> dict:
        """发起 PPT 生成任务，返回 sid"""
        if not self.available:
            raise RuntimeError("PPT_APP_ID / PPT_API_SECRET 未配置")

        path = "/api/ppt"
        auth, date = _sign("POST", path)
        params = urlencode({"authorization": auth, "date": date, "host": "zwapi.xfyun.cn"})
        url = f"{BASE_URL}{path}?{params}"

        body = {
            "header": {
                "appId": settings.ppt_app_id,
                "language": language,
            },
            "body": {
                "query": query,
                "isCard": 1,
                "search": search,
            },
        }

        try:
            async with httpx.AsyncClient(timeout=self.TIMEOUT) as client:
                resp = await client.post(url, json=body)
                data = resp.json()
            logger.info("createPPT 响应: %s", data)
            code = data.get("header", {}).get("code", -1)
            if code != 0:
                msg = data.get("header", {}).get("message", str(data))
                raise RuntimeError(f"PPT 生成失败: {msg}")
            sid = data.get("header", {}).get("sid", "")
            return {"sid": sid, "code": code}
        except httpx.HTTPError as e:
            logger.error("createPPT 网络错误: %s", e)
            raise RuntimeError(f"PPT 生成网络错误: {e}")

    async def query_progress(self, sid: str) -> dict:
        """查询 PPT 生成进度"""
        if not sid:
            raise RuntimeError("sid 不能为空")

        path = "/api/ppt"
        query_str = urlencode({"sid": sid})
        auth, date = _sign("GET", path, query_str)
        params = urlencode({"authorization": auth, "date": date, "host": "zwapi.xfyun.cn"})
        url = f"{BASE_URL}{path}?{query_str}&{params}"

        try:
            async with httpx.AsyncClient(timeout=self.TIMEOUT) as client:
                resp = await client.get(url)
                data = resp.json()
            logger.info("queryProgress 响应: %s", data)
            header = data.get("header", {})
            code = header.get("code", -1)
            if code != 0:
                raise RuntimeError(f"查询失败: {header.get('message', str(data))}")
            payload = data.get("payload", {})
            return {
                "code": code,
                "progress": payload.get("process", 0),
                "fileUrl": payload.get("pptUrl", ""),
                "pptId": payload.get("pptId", ""),
            }
        except httpx.HTTPError as e:
            logger.error("queryProgress 网络错误: %s", e)
            raise RuntimeError(f"进度查询网络错误: {e}")


ppt_service = PPTService()
