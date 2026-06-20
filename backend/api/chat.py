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
                "conversation_summary": db_profile.conversation_summary,
            }

    # 构建消息列表（history 不含当前消息，无重复）
    messages = list(history) + [{"role": "user", "content": message}]

    # 构建带上下文的系统提示词
    system_prompt_content = build_system_prompt(existing_profile, db_profile, message)
    system_prompt = {"role": "system", "content": system_prompt_content}
    full_messages = [system_prompt] + messages

    async def generate():
        conversation_text = ""
        try:
            # 流式调用 LLM
            async for content_chunk in spark_service.chat_stream(full_messages):
                conversation_text += content_chunk
                yield f"data: {json.dumps({'type': 'text', 'content': content_chunk})}\n\n"
                await asyncio.sleep(0.01)

            # 保存助手回复 + 画像（合并为单 session，#13）
            async with async_session() as session:
                assistant_msg = ConversationMessage(
                    conversation_id=conversation_id,
                    role="assistant",
                    content=conversation_text,
                )
                session.add(assistant_msg)
                await session.commit()

            # D48: 根据画像完整度动态调整提取频率
            user_msg_count = sum(1 for m in history if m.get("role") == "user") + 1
            profile_completeness = 0
            if existing_profile:
                fields = ["knowledge_base", "cognitive_style", "weak_points", "learning_goal", "interests"]
                profile_completeness = sum(1 for f in fields if existing_profile.get(f)) / len(fields)
            extract_interval = 1 if profile_completeness < 0.6 else 5
            should_extract = not db_profile or user_msg_count % extract_interval == 0
            if should_extract:
                profile = await ProfileCoordinator.extract(
                    user_message=message,
                    conversation_history=messages,
                    existing_profile=existing_profile,
                )
                if profile:
                    await _save_profile(user_id, profile)
                    yield f"data: {json.dumps({'type': 'profile_update', 'data': profile})}\n\n"
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
    user_message: str = "",
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

    # 指导 AI 输出推荐回复按钮（D46: 严格个性化，禁止通用推荐）
    base += (
        "\n\n重要：在回复的最后，用「」括起2-3个学生可能想问的后续问题，"
        "例如：\n"
        "「能具体解释一下反向传播吗」\n"
        "「帮我出一道练习题」\n"
        "这些会显示为按钮供学生点击。\n"
        "【个性化要求】必须根据学生画像生成差异化推荐：\n"
        "- 有 weak_points → 针对薄弱环节推荐复习/练习（如薄弱点是CNN，则推荐「帮我巩固CNN的池化层原理」）\n"
        "- 有 interests → 结合兴趣方向推荐深入学习（如兴趣是NLP，则推荐「介绍一下Transformer在NLP中的应用」）\n"
        "- 有 knowledge_base → 根据掌握度调整难度（基础弱则推荐基础概念，基础强则推荐拓展/应用）\n"
        "- 绝对禁止每次给出「推荐一些学习资源」「帮我规划学习路径」等通用内容\n"
        "- 每个追问必须与当前对话内容直接相关，不能脱离上下文"
    )
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
