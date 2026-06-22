"""
讯飞语音听写 (IAT) WebSocket 服务

端点: wss://iat-api.xfyun.cn/v2/iat
输入: PCM 16kHz 16bit mono
输出: 识别文本
"""

import asyncio
import base64
import hashlib
import hmac
import json
import logging
import urllib.parse
from datetime import datetime, timezone

import websockets

from config import settings

logger = logging.getLogger(__name__)

IAT_WS_URL = "wss://iat-api.xfyun.cn/v2/iat"


class IATService:
    """讯飞语音听写服务"""

    @property
    def available(self) -> bool:
        return bool(settings.digital_human_app_id and settings.digital_human_api_key and settings.digital_human_api_secret)

    def _build_auth_url(self) -> str:
        parsed = urllib.parse.urlparse(IAT_WS_URL)
        host = parsed.hostname
        path = parsed.path
        now = datetime.now(timezone.utc)
        date_str = now.strftime("%a, %d %b %Y %H:%M:%S GMT")
        sig_origin = f"host: {host}\ndate: {date_str}\nGET {path} HTTP/1.1"
        signature = base64.b64encode(
            hmac.new(
                settings.digital_human_api_secret.encode("utf-8"),
                sig_origin.encode("utf-8"),
                hashlib.sha256,
            ).digest()
        ).decode("utf-8")
        auth_origin = (
            f'api_key="{settings.digital_human_api_key}", '
            f'algorithm="hmac-sha256", '
            f'headers="host date request-line", '
            f'signature="{signature}"'
        )
        authorization = base64.b64encode(auth_origin.encode("utf-8")).decode("utf-8")
        params = urllib.parse.urlencode({
            "authorization": authorization,
            "date": date_str,
            "host": host,
        })
        return f"wss://{host}{path}?{params}"

    async def transcribe(self, pcm_data: bytes) -> str:
        """
        发送 PCM 音频到讯飞语音听写，返回识别文本
        pcm_data: 完整的 PCM 16kHz 16bit mono 数据
        """
        url = self._build_auth_url()
        ws = await websockets.connect(url, max_size=2**22, ping_interval=25, open_timeout=10)

        # 配置帧
        await ws.send(json.dumps({
            "common": {"app_id": settings.digital_human_app_id},
            "business": {
                "language": "zh_cn",
                "domain": "iat",
                "accent": "mandarin",
                "vad_eos": 2000,
                "dwa": "wpgs",
            },
            "data": {
                "status": 0,
                "format": "audio/L16;rate=16000",
                "encoding": "raw",
                "audio": "",
            },
        }))

        # 按 1280 字节（40ms）分包发送
        chunk_size = 1280
        total = len(pcm_data)
        pos = 0
        while pos < total:
            end = min(pos + chunk_size, total)
            chunk = pcm_data[pos:end]
            is_last = end >= total
            await ws.send(json.dumps({
                "data": {
                    "status": 2 if is_last else 1,
                    "format": "audio/L16;rate=16000",
                    "encoding": "raw",
                    "audio": base64.b64encode(chunk).decode("utf-8"),
                },
            }))
            pos = end

        # 收集结果
        full_text = ""
        while True:
            try:
                msg = await asyncio.wait_for(ws.recv(), timeout=15)
                data = json.loads(msg)
                code = data.get("code", 0)
                if code != 0:
                    logger.warning("IAT API error: %s", data)
                    break

                payload = data.get("data", {})
                result = payload.get("result", {})
                ws_list = result.get("ws", [])
                for w in ws_list:
                    for cw in w.get("cw", []):
                        full_text += cw.get("w", "")

                if payload.get("status") == 2:
                    break
            except asyncio.TimeoutError:
                logger.warning("IAT recv timeout")
                break

        await ws.close()
        return full_text.strip()


ias_service = IATService()
