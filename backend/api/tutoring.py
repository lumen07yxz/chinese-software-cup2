"""智能辅导 API —— 多模态答疑（含来源引用、难度自适应、追问建议）"""

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from models import User, LearningResource, RealtimeLearningState
from auth import get_current_user
from services.spark_service import spark_service
from services.rag_service import rag_service
from services.safety_service import check_safety, add_hallucination_disclaimer
from services.web_search_service import web_search_service
from services.realtime_state_service import realtime_state_service
from db import async_session
from prompts import tutoring_system, build_adaptive_instruction
import json
import asyncio
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tutoring", tags=["tutoring"])


class TutoringRequest(BaseModel):
    question: str
    context: str = ""
    history: list[dict] = []
    profile: dict = {}
    images: list[str] = []  # base64 data URL 列表，用于图片答疑


# ── 导出诊断和适应性教学指令 ─────────────────────────────────────
# 这些函数已迁移到 prompts.py，但保留底层逻辑供 tutoring 专用


@router.post("/ask")
async def ask_question(
    req: TutoringRequest,
    current_user: User = Depends(get_current_user),
):
    """流式智能答疑 —— 融合 RAG + 星火知识库 + Mermaid 图表 + 资源推荐 + 联网搜索 + 来源引用 + 难度自适应"""
    # 星火知识库增强检索
    from api.knowledge import _spark_vector_search_for_user
    spark_results = await _spark_vector_search_for_user(
        current_user.username, req.question, top_k=5
    )
    # 本地 RAG 检索
    local_results = rag_service.search(req.question, top_k=8)
    # 合并：星火结果放前面
    results = spark_results + local_results
    context = "\n\n".join([r["content"][:800] for r in results])

    # 构建来源引用编号（D23）
    sources: list[str] = []
    for r in results:
        ch = r.get("chapter", "")
        src = r.get("source", "")
        score = r.get("score", 0)
        if src == "spark_kb":
            title = r.get("metadata", {}).get("title", "星火知识库")
            label = f"{title}（星火知识库）"
            sources.append(f"{label}，相关度 {score:.0%}")
        elif ch:
            label = f"{ch}（课程知识库）" if src == "course" else f"{ch}（用户上传）"
            sources.append(f"{label}，相关度 {score:.0%}")
    sources_text = "\n".join(
        f"[{i+1}] {s}" for i, s in enumerate(sources)
    ) if sources else "（无可用来源）"

    # 联网搜索补充（始终执行，提供最新信息）
    web_context = ""
    try:
        web_results = await web_search_service.search(req.question, top_k=5)
        web_context = "\n\n".join([
            f"[网络搜索|{r.get('title', '')}] {r['snippet']}" for r in web_results if r.get('snippet')
        ])[:3000]
    except Exception:
        web_context = ""

    # 检索相关学习资源
    try:
        from sqlalchemy import select
        async with async_session() as session:
            resource_result = await session.execute(
                select(LearningResource).where(
                    LearningResource.user_id == current_user.username
                ).order_by(LearningResource.created_at.desc()).limit(10)
            )
            resources = resource_result.scalars().all()
            resource_text = ""
            for r in resources[:5]:
                title = getattr(r, 'title', '')
                rtype = getattr(r, 'resource_type', '')
                resource_text += f"- [{rtype}] {title}\n"
    except Exception:
        resource_text = ""

    # 实时学情分析与个性化策略注入
    realtime_state = realtime_state_service.analyze_message(req.question)
    strategy = realtime_state_service.get_strategy(req.profile, realtime_state)
    strategy_text = realtime_state_service.format_strategy_for_prompt(strategy)

    adaptive = build_adaptive_instruction(req.profile)

    system_prompt = tutoring_system(
        profile=req.profile,
        sources_text=sources_text,
        context=context,
        web_context=web_context,
        resources_text=resource_text,
        adaptive_instruction=adaptive,
        strategy_text=strategy_text,
    )
    async def generate():
        full = ""
        try:
            messages = [
                {"role": "system", "content": system_prompt},
            ]
            for h in req.history:
                messages.append(h)
            # 支持图片：视觉模型识别 → 降级纯文本
            if req.images:
                from services.vision_service import vision_service
                logger.info("图片上传: vision backend=%s, is_available=%s", vision_service.backend, vision_service.is_available)
                if vision_service.is_available:
                    try:
                        # 1) 调用视觉模型识别图片内容
                        vision_result = await vision_service.recognize_images(
                            images=req.images,
                            question=f"请识别这张图片中的题目或内容，然后回答这个问题：{req.question}" if req.question else "请详细识别这张图片中的所有内容，包括文字、公式、代码等",
                        )
                        # 2) 将识别结果传给文字模型整合成完整解答
                        messages.append({"role": "user", "content": req.question or "请解答图片中的问题"})
                        messages.append({"role": "assistant", "content": f"[图片识别结果]\n{vision_result}"})
                        messages.append({"role": "user", "content": "请基于上面的图片识别结果，结合课程知识，给出完整的解答。保留数学公式（LaTeX）和分步骤讲解。"})
                    except Exception as e:
                        logger.warning("视觉模型调用失败，降级纯文本: %s", e)
                        messages.append({"role": "user", "content": f"[用户上传了图片但图片识别失败({e})，请根据以下文字描述解答]\n{req.question}"})
                else:
                    messages.append({"role": "user", "content": f"[用户上传了图片但系统暂不支持图片识别，请根据以下文字描述解答]\n{req.question}"})
            else:
                messages.append({"role": "user", "content": req.question})

            async for chunk in spark_service.chat_stream(messages, temperature=0.5, max_tokens=8192):
                full += chunk
                yield f"data: {json.dumps({'type': 'text', 'content': chunk}, ensure_ascii=False)}\n\n"
                await asyncio.sleep(0.01)

            full = add_hallucination_disclaimer(full)
            safety = check_safety(full)
            if not safety["safe"]:
                flags_str = str(safety["flags"])
                yield f"data: {json.dumps({'type': 'warning', 'content': f'content flagged: {flags_str}'}, ensure_ascii=False)}\n\n"

            # 持久化实时学情
            try:
                async with async_session() as session:
                    rt = RealtimeLearningState(
                        user_id=current_user.username,
                        emotion=realtime_state.get("emotion", ""),
                        confusion=realtime_state.get("confusion", 0.0),
                        cognitive_load=realtime_state.get("cognitive_load", 0.0),
                        confidence=realtime_state.get("confidence", 0.5),
                        engagement=realtime_state.get("engagement", 0.5),
                    )
                    session.add(rt)
                    await session.commit()
            except Exception:
                pass

            yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
