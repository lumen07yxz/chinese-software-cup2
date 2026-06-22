"""数字人超拟人交互 WebSocket 代理 API

浏览器 <-> FastAPI WebSocket <-> 讯飞 WebSocket

鉴权: JWT token 通过 query param 传递 (WebSocket 不支持 Authorization header)
"""

import asyncio
import base64
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import JWTError, jwt

from config import settings
from services.digital_human_service import digital_human_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/digital-human", tags=["digital-human"])


def _verify_ws_token(token: str) -> str | None:
    """验证 JWT token，返回 username 或 None"""
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
        return payload.get("sub")
    except JWTError:
        return None


@router.get("/health")
async def digital_human_health():
    """健康检查：数字人服务是否已配置"""
    configured = digital_human_service.available
    return {
        "status": "ok" if configured else "not_configured",
        "configured": configured,
        "avatar_id": settings.digital_human_avatar_id if configured else None,
    }


@router.websocket("/ws")
async def digital_human_ws(
    websocket: WebSocket,
    token: str = Query(...),
):
    """WebSocket 代理：浏览器 <-> 讯飞数字人服务

    浏览器发送:
      {type: "audio", data: "<base64 PCM>"}   — 音频帧
      {type: "audio_end"}                       — 语音结束
      {type: "text", text: "..."}               — 文本输入（备用）
      {type: "ping"}                            — 心跳
      {type: "stop"}                            — 结束会话

    浏览器接收:
      {type: "asr", text: "...", is_final: bool}       — 语音识别
      {type: "llm", text: "...", is_final: bool}       — LLM 回复
      {type: "tts", audio: "<base64>", is_final: bool} — 合成音频
      {type: "vad", event_type: "...", key: "..."}     — VAD 事件
      {type: "avatar_stream", stream_url: "..."}       — 数字人流地址
      {type: "connected"}                               — 连接成功
      {type: "error", content: "..."}                   — 错误
      {type: "pong"}                                    — 心跳回应
    """
    # 1. JWT 鉴权
    username = _verify_ws_token(token)
    if not username:
        await websocket.accept()
        await websocket.send_json({"type": "error", "content": "认证失败"})
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()

    # 2. 检查配置
    if not digital_human_service.available:
        await websocket.send_json({
            "type": "error",
            "content": "数字人服务未配置，请在 .env 中设置 DIGITAL_HUMAN_APP_ID / API_KEY / API_SECRET",
        })
        await websocket.close(code=4002, reason="Service not configured")
        return

    # 3. 连接讯飞
    session_id = f"dh_{username}_{id(websocket)}"
    try:
        session = await digital_human_service.connect_session(session_id)
    except Exception as e:
        logger.error("iFlytek connection failed for %s: %s", username, e)
        await websocket.send_json({
            "type": "error",
            "content": f"连接数字人服务失败: {e}",
        })
        await websocket.close(code=4003, reason="Upstream connection failed")
        return

    # 4. 通知浏览器连接成功（暂不发送配置，等用户开始说话）
    await websocket.send_json({"type": "connected"})

    # 5. 双向代理
    stop_event = asyncio.Event()
    config_sent = False

    async def forward_browser_to_iflytek():
        """浏览器 → 讯飞"""
        try:
            while not stop_event.is_set():
                try:
                    data = await asyncio.wait_for(
                        websocket.receive_json(), timeout=60
                    )
                except asyncio.TimeoutError:
                    # 60s 无数据，发送 ping 保活
                    continue

                msg_type = data.get("type", "")

                if msg_type == "audio":
                    audio_b64 = data.get("data", "")
                    if audio_b64:
                        try:
                            pcm = base64.b64decode(audio_b64)
                            # 首次收到音频时先发配置
                            if not config_sent:
                                config_sent = True
                                await digital_human_service.send_config(
                                    session.ws, settings.digital_human_avatar_id, uid=username
                                )
                            await digital_human_service.send_audio(session.ws, pcm)
                        except Exception as e:
                            logger.warning("Audio forwarding error: %s", e)

                elif msg_type == "audio_end":
                    await digital_human_service.send_audio_end(session.ws)

                elif msg_type == "text":
                    text = data.get("text", "")
                    if text:
                        await digital_human_service.send_text(session.ws, text)

                elif msg_type == "ping":
                    await websocket.send_json({"type": "pong"})

                elif msg_type == "stop":
                    stop_event.set()
                    break

        except WebSocketDisconnect:
            stop_event.set()
        except Exception as e:
            logger.error("Browser→iFlytek forward error: %s", e)
            stop_event.set()

    async def forward_iflytek_to_browser():
        """讯飞 → 浏览器"""
        try:
            while not stop_event.is_set():
                try:
                    result = await asyncio.wait_for(
                        digital_human_service.receive(session.ws), timeout=60
                    )
                    await websocket.send_json(result)
                except asyncio.TimeoutError:
                    continue
        except Exception as e:
            logger.error("iFlytek→Browser forward error: %s", e)
            stop_event.set()

    try:
        await asyncio.gather(
            forward_browser_to_iflytek(),
            forward_iflytek_to_browser(),
            return_exceptions=True,
        )
    finally:
        await digital_human_service.close_session(session_id)
        try:
            await websocket.close()
        except Exception:
            pass
        logger.info("Session closed: %s", session_id)
