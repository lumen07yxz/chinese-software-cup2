"""对话画像 API —— SSE 流式对话 + 画像自动构建 + 对话持久化"""

import json
import asyncio
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from sqlalchemy import select
from db import async_session
from models import User, Conversation, ConversationMessage, StudentProfile, RealtimeLearningState
from auth import get_current_user
from services.spark_service import spark_service
from services.realtime_state_service import realtime_state_service
from services.rag_service import rag_service
from agents.profile_coordinator import ProfileCoordinator
from prompts import chat_system

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

        # ── RAG 知识库检索 ──
        rag_results = rag_service.search(message, top_k=6)
        rag_context = ""
        sources_text = ""
        if rag_results:
            context_parts = []
            sources_lines = []
            seen_titles: list[str] = []
            for idx, r in enumerate(rag_results, 1):
                title = r.get("metadata", {}).get("title", r.get("chapter", "未知"))
                source_label = r.get("source", "course")
                score = r.get("score", 0)
                context_parts.append(f"[{title}] {r['content'][:600]}")
                if title not in seen_titles:
                    seen_titles.append(title)
                    source_tag = "用户文档" if source_label == "user_upload" else "课程知识库"
                    sources_lines.append(f"[{idx}] {title}（来源: {source_tag}, 相关度: {score:.2f}）")
            rag_context = "\n\n".join(context_parts)
            sources_text = "\n".join(sources_lines)

        # 实时学情分析
        realtime_state = realtime_state_service.analyze_message(message)
        strategy = realtime_state_service.get_strategy(existing_profile, realtime_state)
        strategy_text = realtime_state_service.format_strategy_for_prompt(strategy)
 
        # 构建带上下文的系统提示词（使用集中 prompt 管理）
        summary = db_profile.conversation_summary if db_profile else ""
        system_prompt_content = chat_system(
            profile=existing_profile,
            conversation_summary=summary,
            rag_context=rag_context,
            sources_text=sources_text,
        )
        # 注入个性化教学策略
        system_prompt_content += "\n\n" + strategy_text
        system_prompt = {"role": "system", "content": system_prompt_content}
        full_messages = [system_prompt] + messages

    async def generate():
        conversation_text = ""
        try:
            # 发送实时学情事件
            yield f"data: {json.dumps({'type': 'realtime_state', 'data': realtime_state}, ensure_ascii=False)}\n\n"
            await asyncio.sleep(0.01)

            # 流式调用 LLM
            async for content_chunk in spark_service.chat_stream(full_messages):
                conversation_text += content_chunk
                yield f"data: {json.dumps({'type': 'text', 'content': content_chunk})}\n\n"
                await asyncio.sleep(0.01)

            # 保存助手回复 + 画像 + 实时学情持久化（合并为单 session）
            async with async_session() as session:
                # 保存用户消息
                user_msg = ConversationMessage(
                    conversation_id=conversation_id,
                    role="user",
                    content=message,
                )
                session.add(user_msg)

                # 保存助手回复
                assistant_msg = ConversationMessage(
                    conversation_id=conversation_id,
                    role="assistant",
                    content=conversation_text,
                )
                session.add(assistant_msg)

                # 持久化实时学情状态
                rt = RealtimeLearningState(
                    user_id=user_id,
                    emotion=realtime_state.get("emotion", ""),
                    confusion=realtime_state.get("confusion", 0.0),
                    cognitive_load=realtime_state.get("cognitive_load", 0.0),
                    confidence=realtime_state.get("confidence", 0.5),
                    engagement=realtime_state.get("engagement", 0.5),
                )
                session.add(rt)

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