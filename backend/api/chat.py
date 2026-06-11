"""对话画像 API —— SSE 流式对话 + 画像自动构建"""

import json
import asyncio
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from services.spark_service import spark_service
from agents.profile_coordinator import ProfileCoordinator

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("/stream")
async def chat_stream(req: Request):
    """流式对话接口（SSE）

    流程：
      1. 流式输出 AI 对话回复
      2. 对话流结束后，自动调 ProfileCoordinator 提取结构化画像
      3. 通过 profile_update 事件推送给前端直接更新
    """
    body = await req.json()
    message = body.get("message", "")
    user_id = body.get("user_id", "default")
    history = body.get("history", [])
    existing_profile = body.get("profile", None)

    messages = list(history) + [{"role": "user", "content": message}]

    system_prompt = {
        "role": "system",
        "content": (
            "你是一个友好的AI学习助手。请通过自然对话了解学生的："
            "专业背景、已学课程、学习目标、每周学习时间、感兴趣的方向、难点困惑。"
            "对话温和自然，每次只问1-2个相关问题。"
        ),
    }
    full_messages = [system_prompt] + messages

    async def generate():
        conversation_text = ""
        try:
            # ── 流式输出对话 ──
            async for chunk in spark_service.chat_stream(full_messages):
                conversation_text += chunk
                yield f"data: {json.dumps({'type': 'text', 'content': chunk})}\n\n"
                await asyncio.sleep(0.01)

            # ── 对话流结束，提取画像 ──
            profile = await ProfileCoordinator.extract(
                user_message=message,
                conversation_history=messages,
                existing_profile=existing_profile,
            )

            if profile:
                yield f"data: {json.dumps({'type': 'profile_update', 'data': profile})}\n\n"
                await asyncio.sleep(0.01)

            # ── 完成事件 ──
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
