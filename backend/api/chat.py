"""对话画像 API —— SSE 流式对话 + 画像自动构建 + 对话持久化"""

import json
import asyncio
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from sqlalchemy import select
from db import async_session
from models import User, Conversation, ConversationMessage, StudentProfile
from auth import get_current_user
from services.spark_service import spark_service
from agents.profile_coordinator import ProfileCoordinator

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("/stream")
async def chat_stream(
    req: Request,
    current_user: User = Depends(get_current_user),
):
    """流式对话接口（SSE）

    流程：
      1. 从 DB 加载对话历史或创建新对话
      2. 从 DB 加载已有画像，构建上下文感知系统提示词
      3. 流式输出 AI 回复并保存到 DB
      4. 提取画像并自动写入 DB
    """
    body = await req.json()
    message = body.get("message", "")
    conversation_id = body.get("conversation_id", None)
    user_id = current_user.username

    # ── 获取或创建对话 ──
    async with async_session() as session:
        if conversation_id:
            conv = await session.get(Conversation, conversation_id)
            if not conv or conv.user_id != user_id:
                conv = Conversation(user_id=user_id, title="新对话")
                session.add(conv)
                await session.commit()
                await session.refresh(conv)
                conversation_id = conv.id
            else:
                conversation_id = conv.id
        else:
            conv = Conversation(user_id=user_id, title="新对话")
            session.add(conv)
            await session.commit()
            await session.refresh(conv)
            conversation_id = conv.id

        # 从数据库加载历史消息
        result = await session.execute(
            select(ConversationMessage)
            .where(ConversationMessage.conversation_id == conversation_id)
            .order_by(ConversationMessage.created_at)
        )
        db_messages = result.scalars().all()
        history = [{"role": m.role, "content": m.content} for m in db_messages]

        # 首条消息自动生成标题
        if not history:
            conv.title = message[:50] + ("..." if len(message) > 50 else "")
            await session.commit()

        # 从数据库加载已有画像
        profile_result = await session.execute(
            select(StudentProfile).where(StudentProfile.user_id == user_id)
        )
        db_profile = profile_result.scalar_one_or_none()
        existing_profile = None
        if db_profile:
            existing_profile = {
                "knowledge_base": db_profile.knowledge_base,
                "cognitive_style": db_profile.cognitive_style,
                "weak_points": db_profile.weak_points,
                "learning_goal": db_profile.learning_goal,
                "available_time": db_profile.available_time,
                "interests": db_profile.interests,
            }

    # 构建消息列表（history 不含当前消息，无重复）
    messages = list(history) + [{"role": "user", "content": message}]

    # 构建带上下文的系统提示词
    system_prompt_content = build_system_prompt(existing_profile, db_profile)
    system_prompt = {"role": "system", "content": system_prompt_content}
    full_messages = [system_prompt] + messages

    async def generate():
        conversation_text = ""
        try:
            # 保存用户消息到数据库
            async with async_session() as session:
                user_msg = ConversationMessage(
                    conversation_id=conversation_id,
                    role="user",
                    content=message,
                )
                session.add(user_msg)
                await session.commit()

            # 流式输出 AI 回复
            async for chunk in spark_service.chat_stream(full_messages):
                conversation_text += chunk
                yield f"data: {json.dumps({'type': 'text', 'content': chunk})}\n\n"
                await asyncio.sleep(0.01)

            # 保存助手回复到数据库
            async with async_session() as session:
                assistant_msg = ConversationMessage(
                    conversation_id=conversation_id,
                    role="assistant",
                    content=conversation_text,
                )
                session.add(assistant_msg)
                await session.commit()

            # 提取画像并自动保存
            profile = await ProfileCoordinator.extract(
                user_message=message,
                conversation_history=messages,
                existing_profile=existing_profile,
            )

            if profile:
                await _save_profile(user_id, profile)
                yield (
                    f"data: {json.dumps({'type': 'profile_update', 'data': profile})}\n\n"
                )
                await asyncio.sleep(0.01)

            # 返回 conversation_id 供前端使用
            yield (
                f"data: {json.dumps({'type': 'done', 'conversation_id': conversation_id})}\n\n"
            )
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


# ── 辅助函数 ─────────────────────────────────────────────────────


def build_system_prompt(
    profile: dict | None,
    db_profile: StudentProfile | None,
) -> str:
    """构建注入画像和对话摘要的系统提示词"""
    base = (
        "你是一个友好的AI学习助手。请通过自然对话了解学生的："
        "专业背景、已学课程、学习目标、每周学习时间、感兴趣的方向、难点困惑。"
        "对话温和自然，每次只问1-2个相关问题。"
    )

    # 注入画像信息
    if profile:
        profile_parts = []
        if profile.get("knowledge_base"):
            kb = profile["knowledge_base"]
            kb_str = "、".join(
                f"{k}({int(v * 100)}%)" for k, v in kb.items()
            )
            profile_parts.append(f"知识基础：{kb_str}")
        if profile.get("cognitive_style"):
            profile_parts.append(f"认知风格：{profile['cognitive_style']}")
        if profile.get("weak_points"):
            profile_parts.append(
                f"薄弱环节：{'、'.join(profile['weak_points'])}"
            )
        if profile.get("learning_goal"):
            profile_parts.append(f"学习目标：{profile['learning_goal']}")
        if profile.get("available_time"):
            profile_parts.append(f"可用时间：{profile['available_time']}")
        if profile.get("interests"):
            profile_parts.append(
                f"兴趣方向：{'、'.join(profile['interests'])}"
            )
        if profile_parts:
            base += "\n\n已知的学生画像：\n" + "\n".join(profile_parts)

    # 注入对话摘要
    if db_profile and db_profile.conversation_summary:
        base += f"\n\n之前的对话摘要：{db_profile.conversation_summary}"

    base += "\n\n请根据以上信息，避免重复询问已知内容，有针对性地引导学生。"
    return base


async def _save_profile(user_id: str, profile: dict):
    """将提取的画像保存到数据库"""
    async with async_session() as session:
        result = await session.execute(
            select(StudentProfile).where(StudentProfile.user_id == user_id)
        )
        db_profile = result.scalar_one_or_none()
        if not db_profile:
            db_profile = StudentProfile(user_id=user_id)
            session.add(db_profile)

        if profile.get("knowledge_base"):
            db_profile.knowledge_base = profile["knowledge_base"]
        if profile.get("cognitive_style"):
            db_profile.cognitive_style = profile["cognitive_style"]
        if profile.get("weak_points"):
            db_profile.weak_points = profile["weak_points"]
        if profile.get("learning_goal"):
            db_profile.learning_goal = profile["learning_goal"]
        if profile.get("available_time"):
            db_profile.available_time = profile["available_time"]
        if profile.get("interests"):
            db_profile.interests = profile["interests"]
        if profile.get("conversation_summary"):
            db_profile.conversation_summary = profile["conversation_summary"]

        await session.commit()
