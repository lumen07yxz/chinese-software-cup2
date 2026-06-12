"""资源管理 API —— 多智能体协作生成"""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from db import async_session
from models import LearningResource, User
from services.safety_service import (
    check_safety,
    add_hallucination_disclaimer,
)
from auth import get_current_user
from agents.coordinator import ResourceCoordinator
import json
import asyncio

router = APIRouter(prefix="/api/resources", tags=["resources"])


class GenerateRequest(BaseModel):
    resource_type: str
    topic: str
    chapter: str = ""
    difficulty: float = 0.5
    profile: dict = {}


@router.get("/")
async def list_resources(
    resource_type: str | None = None,
    current_user: User = Depends(get_current_user),
):
    async with async_session() as session:
        from sqlalchemy import select
        query = select(LearningResource).where(LearningResource.user_id == current_user.username)
        if resource_type:
            query = query.where(LearningResource.resource_type == resource_type)
        query = query.order_by(LearningResource.created_at.desc()).limit(50)
        result = await session.execute(query)
        resources = result.scalars().all()
        return {
            "resources": [
                {
                    "id": r.id,
                    "type": r.resource_type,
                    "title": r.title,
                    "description": r.description,
                    "chapter": r.course_chapter,
                    "difficulty": r.difficulty,
                    "created_at": r.created_at.isoformat() if r.created_at else "",
                }
                for r in resources
            ]
        }


@router.post("/generate")
async def generate_resource_stream(
    req: GenerateRequest,
    current_user: User = Depends(get_current_user),
):
    """多智能体协作生成资源（SSE 流式）

    编排流程：
      检索助手 (RAG) → 资源设计总监 (Orchestrator) → 专业 Agent → 安全审查员
    """
    coordinator = ResourceCoordinator(
        resource_type=req.resource_type,
        topic=req.topic,
        chapter=req.chapter,
        difficulty=req.difficulty,
        profile=req.profile,
    )

    async def generate():
        full_content = ""
        try:
            async for event_str in coordinator.generate():
                data = json.loads(event_str)

                # coordinator.generate() 分两种产出：
                #   1. SSE 事件 dict → 直接转发
                #   2. 纯文本字符串（最后一个 yield）→ 累积但不转发（已在 SSE text 事件中推送过）
                if isinstance(data, dict) and data.get("type") in (
                    "agent_status", "text"
                ):
                    yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
                    await asyncio.sleep(0.01)
                    # 累积 text 内容用于存储
                    if data.get("type") == "text":
                        full_content += data.get("content", "")
                elif isinstance(data, str):
                    # 最后返回的完整文本（备用）
                    if not full_content:
                        full_content = data
                else:
                    # 兜底转发
                    yield f"data: {json.dumps({'type': 'text', 'content': str(data)}, ensure_ascii=False)}\n\n"
                    if isinstance(data, str):
                        full_content += data

            if not full_content:
                full_content = "（内容生成异常）"

            # 安全审查与防幻觉（LLM 审查已在 coordinator Step 4 执行，这里汇总结果）
            full_content = add_hallucination_disclaimer(full_content)
            warnings = []

            safety_results = getattr(coordinator, "_safety_results", {})
            regex_result = safety_results.get("regex", check_safety(full_content))
            llm_safety = safety_results.get("llm_safety", {})
            hallucination = safety_results.get("hallucination", {})

            if not regex_result.get("safe", True):
                warnings.append(f"正则扫描: {regex_result.get('suggestion', '')}")
            if not llm_safety.get("safe", True):
                warnings.append(f"LLM审查({llm_safety.get('risk_level', '?')}): {'; '.join(llm_safety.get('issues', [])[:3])}")
            if hallucination.get("has_hallucination"):
                conf = hallucination.get("confidence", 0)
                warnings.append(f"事实核查({conf:.0%}): {'; '.join(hallucination.get('issues', [])[:3])}")

            if warnings:
                yield f"data: {json.dumps({'type': 'warning', 'content': ' | '.join(warnings)}, ensure_ascii=False)}\n\n"

            # 存储资源
            title_map = {
                "doc": "课程文档",
                "mindmap": "思维导图",
                "quiz": "练习题",
                "video": "视频脚本",
                "code": "实操案例",
            }
            async with async_session() as session:
                resource = LearningResource(
                    user_id=current_user.username,
                    resource_type=req.resource_type,
                    title=f"{title_map.get(req.resource_type, '资源')}: {req.topic}",
                    description=full_content[:200],
                    content=full_content,
                    course_chapter=req.chapter or req.topic,
                    difficulty=req.difficulty,
                )
                session.add(resource)
                await session.commit()
                rid = resource.id

            yield f"data: {json.dumps({'type': 'done', 'resource_id': rid}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get("/{resource_id}")
async def get_resource(resource_id: int):
    async with async_session() as session:
        from sqlalchemy import select
        result = await session.execute(
            select(LearningResource).where(LearningResource.id == resource_id)
        )
        resource = result.scalar_one_or_none()
        if not resource:
            raise HTTPException(status_code=404, detail="Resource not found")
        return {
            "id": resource.id,
            "type": resource.resource_type,
            "title": resource.title,
            "description": resource.description,
            "content": resource.content,
            "chapter": resource.course_chapter,
            "difficulty": resource.difficulty,
            "created_at": resource.created_at.isoformat() if resource.created_at else "",
        }
