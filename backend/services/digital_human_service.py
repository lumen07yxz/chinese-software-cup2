"""讯飞超拟人数字人交互 WebSocket 服务

认证: HMAC-SHA256 签名 URL query params (appId, timestamp, signature)
端点: wss://sparkos.xfyun.cn/v1/openapi/chat
协议: 全双工 JSON 帧 (audio in → iat/nlp/tts/event out)
"""

import asyncio
import base64
import hashlib
import hmac
import json
import logging
import time
import urllib.parse
from dataclasses import dataclass, field
from datetime import datetime, timezone

import websockets
from websockets.asyncio.client import ClientConnection

from config import settings

logger = logging.getLogger(__name__)


@dataclass
class DigitalHumanSession:
    """一个活跃的数字人会话"""
    session_id: str
    ws: ClientConnection
    created_at: float = field(default_factory=time.time)


class DigitalHumanService:
    """讯飞超拟人数字人 WebSocket 客户端（每浏览器会话一个连接）"""

    def __init__(self):
        self._sessions: dict[str, DigitalHumanSession] = {}

    @property
    def available(self) -> bool:
        return bool(
            settings.digital_human_app_id
            and settings.digital_human_api_key
            and settings.digital_human_api_secret
        )

    def _build_auth_url(self) -> str:
        """生成带 HMAC-SHA256 签名的 WebSocket URL

        讯飞标准 WebSocket 认证方式：
        1. signature_origin = "host: {host}\ndate: {date}\nGET {path} HTTP/1.1"
        2. signature = base64(hmac-sha256(api_secret, signature_origin))
        3. authorization_origin = 'api_key="{key}", algorithm="hmac-sha256", ...'
        4. authorization = base64(authorization_origin)
        5. URL: wss://{host}{path}?authorization={auth}&date={date}&host={host}
        """
        from urllib.parse import urlparse

        parsed = urlparse(settings.digital_human_ws_url)
        host = parsed.hostname or "sparkos.xfyun.cn"
        path = parsed.path or "/v1/openapi/chat"

        # UTC date 格式: "Mon, 22 Jun 2026 12:00:00 GMT"
        now = datetime.now(timezone.utc)
        date_str = now.strftime("%a, %d %b %Y %H:%M:%S GMT")

        # 1. 构建签名原始字符串
        signature_origin = f"host: {host}\ndate: {date_str}\nGET {path} HTTP/1.1"

        # 2. HMAC-SHA256 签名（使用 api_secret 作为密钥）
        signature_sha = hmac.new(
            settings.digital_human_api_secret.encode("utf-8"),
            signature_origin.encode("utf-8"),
            hashlib.sha256,
        ).digest()
        signature_b64 = base64.b64encode(signature_sha).decode("utf-8")

        # 3. 构建 authorization 原始字符串
        authorization_origin = (
            f'api_key="{settings.digital_human_api_key}", '
            f'algorithm="hmac-sha256", '
            f'headers="host date request-line", '
            f'signature="{signature_b64}"'
        )

        # 4. Base64 编码 authorization
        authorization = base64.b64encode(
            authorization_origin.encode("utf-8")
        ).decode("utf-8")

        # 5. 拼接最终 URL
        params = urllib.parse.urlencode({
            "authorization": authorization,
            "date": date_str,
            "host": host,
        })
        return f"wss://{host}{path}?{params}"

    async def connect_session(self, session_id: str) -> DigitalHumanSession:
        """建立到讯飞的 WebSocket 连接"""
        if not self.available:
            raise RuntimeError("数字人服务未配置 (DIGITAL_HUMAN_APP_ID / API_KEY / API_SECRET)")

        # 关闭同一 session_id 的旧连接
        await self.close_session(session_id)

        url = self._build_auth_url()
        logger.info("Connecting to iFlytek digital human: session=%s", session_id)

        ws = await websockets.connect(
            url,
            max_size=2**22,       # 4MB
            ping_interval=25,     # keepalive < 30s
            ping_timeout=10,
            open_timeout=10,
        )

        session = DigitalHumanSession(session_id=session_id, ws=ws)
        self._sessions[session_id] = session
        return session

    async def close_session(self, session_id: str):
        """关闭一个会话连接"""
        session = self._sessions.pop(session_id, None)
        if session:
            try:
                await session.ws.close()
            except Exception:
                pass

    async def send_config(self, ws: ClientConnection, avatar_id: str, uid: str = "user_001"):
        """发送初始配置帧（紧跟音频流之前）"""
        config = {
            "header": {
                "app_id": settings.digital_human_app_id,
                "uid": uid,
                "status": 0,
                "stmid": "0",
                "scene": "sos_app",
                "interact_mode": "continuous_vad",
            },
            "parameter": {
                "tts": {
                    "tts": {
                        "encoding": "raw",
                        "sample_rate": 16000,
                        "channels": 1,
                        "bit_depth": 16,
                    },
                },
                "avatar": {
                    "avatar_id": avatar_id,
                },
            },
            "payload": {},
        }
        await ws.send(json.dumps(config))
        logger.info("Sent config frame with avatar_id=%s", avatar_id)

    async def send_audio(self, ws: ClientConnection, pcm_data: bytes):
        """发送 PCM 音频帧"""
        frame = {
            "header": {
                "app_id": settings.digital_human_app_id,
                "status": 2,
            },
            "payload": {
                "audio": {
                    "status": 0,
                    "audio": base64.b64encode(pcm_data).decode("utf-8"),
                    "encoding": "raw",
                    "sample_rate": 16000,
                    "channels": 1,
                    "bit_depth": 16,
                },
            },
        }
        await ws.send(json.dumps(frame))

    async def send_audio_end(self, ws: ClientConnection):
        """发送音频结束帧（VAD 后端点）"""
        frame = {
            "header": {
                "app_id": settings.digital_human_app_id,
                "status": 2,
            },
            "payload": {
                "audio": {
                    "status": 2,
                    "audio": "",
                },
            },
        }
        await ws.send(json.dumps(frame))

    async def send_text(self, ws: ClientConnection, text: str):
        """发送文本输入（备用文字模式）"""
        frame = {
            "header": {
                "app_id": settings.digital_human_app_id,
                "status": 0,
                "stmid": "0",
                "scene": "sos_app",
                "interact_mode": "continuous_vad",
            },
            "parameter": {
                "nlp": {
                    "nlp": {
                        "encoding": "utf8",
                        "compress": "raw",
                        "format": "json",
                    },
                    "sub_scene": "cbm_v45",
                },
                "tts": {
                    "vcn": "x5_lingxiaoyue_flow",
                    "speed": 50,
                    "volume": 50,
                    "pitch": 50,
                },
                "avatar": {
                    "avatar_id": settings.digital_human_avatar_id,
                    "width": 512,
                    "height": 512,
                },
            },
            "payload": {
                "message": {"text": text},
            },
        }
        await ws.send(json.dumps(frame))

    async def receive(self, ws: ClientConnection) -> dict:
        """接收并解析讯飞响应"""
        msg = await ws.recv()
        data = json.loads(msg)
        header = data.get("header", {})
        payload = data.get("payload", {})

        result: dict = {"header": header}

        # ASR 语音识别结果
        if "iat" in payload:
            iat = payload["iat"]
            text_content = ""
            if isinstance(iat, dict):
                # iat 可能是 {text: "...", status: N} 或内嵌 JSON text 字段
                raw_text = iat.get("text", "")
                status = iat.get("status", 3)
                if isinstance(raw_text, str):
                    text_content = raw_text
                result["type"] = "asr"
                result["text"] = text_content
                result["is_final"] = status in (2, 3)

        # LLM 大模型语义结果
        if "nlp" in payload:
            nlp = payload["nlp"]
            if isinstance(nlp, dict):
                raw_text = nlp.get("text", "")
                status = nlp.get("status", 3)
                # nlp.text 可能是 JSON 字符串需要二次解析
                text_content = raw_text
                if isinstance(raw_text, str) and raw_text.startswith("{"):
                    try:
                        inner = json.loads(raw_text)
                        text_content = inner.get("text", raw_text)
                    except (json.JSONDecodeError, TypeError):
                        pass
                result["type"] = "llm"
                result["text"] = text_content
                result["is_final"] = status in (2, 3)

        # TTS 合成音频
        if "tts" in payload:
            tts = payload["tts"]
            if isinstance(tts, dict):
                result["type"] = "tts"
                result["audio"] = tts.get("data", "")
                result["is_final"] = tts.get("status", 0) in (2, 3)

        # VAD 事件
        if "event" in payload:
            event = payload["event"]
            if isinstance(event, dict):
                raw_text = event.get("text", "")
                event_data = {}
                if isinstance(raw_text, str) and raw_text.startswith("{"):
                    try:
                        event_data = json.loads(raw_text)
                    except (json.JSONDecodeError, TypeError):
                        pass
                result["type"] = "vad"
                result["event_type"] = event_data.get("type", "")
                result["key"] = event_data.get("key", "")

        # 虚拟人流地址
        if "cbm_vms" in payload:
            vms = payload["cbm_vms"]
            if isinstance(vms, dict):
                raw_text = vms.get("text", "")
                vms_data = {}
                if isinstance(raw_text, str) and raw_text.startswith("{"):
                    try:
                        vms_data = json.loads(raw_text)
                    except (json.JSONDecodeError, TypeError):
                        pass
                result["type"] = "avatar_stream"
                result["event_type"] = vms_data.get("event_type", "")
                result["stream_url"] = vms_data.get("stream_url", "")
                result["vmr_status"] = vms_data.get("vmr_status", -1)

        # 意图拆分
        if "cbm_tidy" in payload:
            tidy = payload["cbm_tidy"]
            if isinstance(tidy, dict):
                result["type"] = "tidy"
                result["text"] = tidy.get("text", "")
                result["is_final"] = tidy.get("status", 0) in (2, 3)

        return result


# 模块级单例
digital_human_service = DigitalHumanService()
