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
from services.task_tracker import task_tracker
import json
import asyncio

router = APIRouter(prefix="/api/resources", tags=["resources"])


class GenerateRequest(BaseModel):
    resource_type: str
    topic: str
    chapter: str = ""
    difficulty: float = 0.5
    profile: dict = {}
    mode: str = "standard"  # "standard" | "two_stage"
    prefer_user_docs: bool = False  # 优先使用用户知识库


@router.get("/")
async def list_resources(
    resource_type: str | None = None,
    current_user: User = Depends(get_current_user),
):
    async with async_session() as session:
        from sqlalchemy import select
        from models import StudentProfile

        query = select(LearningResource).where(LearningResource.user_id == current_user.username)
        if resource_type:
            query = query.where(LearningResource.resource_type == resource_type)
        query = query.order_by(LearningResource.created_at.desc()).limit(50)
        result = await session.execute(query)
        resources = result.scalars().all()

        # 获取用户画像用于个性化排序
        profile_result = await session.execute(
            select(StudentProfile).where(StudentProfile.user_id == current_user.username)
        )
        student = profile_result.scalars().first()

        # 画像驱动的资源加权排序
        resources_sorted = _sort_resources_by_profile(resources, student)

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
                for r in resources_sorted
            ]
        }


def _sort_resources_by_profile(resources: list, profile) -> list:
    """根据学生画像对资源加权排序。

    - cognitive_style = visual → mindmap/video 优先
    - cognitive_style = verbal → doc 优先
    - cognitive_style = active → code/quiz 优先
    - weak_points 匹配章节关键词 → 置顶
    """
    if not profile:
        return resources

    style = getattr(profile, 'cognitive_style', '')
    weak_points = getattr(profile, 'weak_points', []) or []
    interests = getattr(profile, 'interests', []) or []
    kb = getattr(profile, 'knowledge_base', {}) or {}

    # 认知风格 → 资源类型偏好权重
    style_weights = {
        'visual': {'mindmap': 3, 'video': 3, 'doc': 1, 'code': 1, 'quiz': 1},
        'verbal': {'doc': 3, 'mindmap': 1, 'quiz': 2, 'video': 1, 'code': 1},
        'active': {'code': 3, 'quiz': 3, 'doc': 1, 'mindmap': 1, 'video': 1},
        'reflective': {'doc': 2, 'mindmap': 2, 'quiz': 2, 'code': 1, 'video': 1},
    }
    weights = style_weights.get(style, {'doc': 1, 'mindmap': 1, 'quiz': 1, 'video': 1, 'code': 1})

    scored = []
    for r in resources:
        score = 0
        rtype = getattr(r, 'resource_type', 'doc')
        chapter = getattr(r, 'course_chapter', '') or ''
        title = getattr(r, 'title', '') or ''

        # 认知风格匹配
        score += weights.get(rtype, 1)

        # 薄弱点匹配：章节/标题包含弱点的关键词
        for wp in weak_points:
            if any(kw in chapter + title for kw in (wp, wp[:2])):
                score += 5
                break

        # 兴趣匹配
        for it in interests:
            if any(kw in chapter + title for kw in (it, it[:2])):
                score += 2
                break

        # 掌握度加权：该章节掌握度低 → 排前面
        for domain, mastery in kb.items():
            if isinstance(mastery, (int, float)):
                if domain[:4] in chapter or domain[:4] in title:
                    score += max(0, (1.0 - float(mastery)) * 4)
                    break

        scored.append((r, score))

    scored.sort(key=lambda x: x[1], reverse=True)
    return [item[0] for item in scored]


@router.post("/generate")
async def generate_resource_stream(
    req: GenerateRequest,
    current_user: User = Depends(get_current_user),
):
    """多智能体协作生成资源（SSE 流式）

    编排流程：
      检索助手 (RAG) → 资源设计总监 (Orchestrator) → 专业 Agent → 安全审查员

    mode="two_stage" 时使用两阶段管线：
      Stage 1: 大纲生成（outline JSON）
      Stage 2: 逐段内容生成（section_start / section_end）
    """
    coordinator = ResourceCoordinator(
        resource_type=req.resource_type,
        topic=req.topic,
        chapter=req.chapter,
        difficulty=req.difficulty,
        profile=req.profile,
        prefer_user_docs=req.prefer_user_docs,
        user_id=current_user.username,
    )

    # 创建任务追踪
    title_map = {"doc": "文档", "mindmap": "思维导图", "quiz": "练习题", "video": "视频", "code": "代码案例"}
    task_label = f"生成{title_map.get(req.resource_type, '资源')}: {req.topic}"
    task_id = task_tracker.create(
        kind="resource_generation",
        label=task_label,
        user_id=current_user.username,
        metadata={"resource_type": req.resource_type, "topic": req.topic, "mode": req.mode},
    )

    use_two_stage = req.mode == "two_stage"

    async def generate():
        full_content = ""
        try:
            generator = coordinator.generate_two_stage() if use_two_stage else coordinator.generate()
            async for event_str in generator:
                try:
                    data = json.loads(event_str)
                except json.JSONDecodeError:
                    if not full_content:
                        full_content = event_str
                    continue

                # 所有结构化事件原样透传
                event_type = data.get("type", "") if isinstance(data, dict) else ""
                if event_type in (
                    "agent_status", "text", "outline", "section_start", "section_end"
                ):
                    yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
                    await asyncio.sleep(0.01)
                    if event_type == "text":
                        full_content += data.get("content", "")
                    if event_type == "agent_status":
                        # 更新任务进度
                        status_data = data.get("data", {})
                        task_tracker.update(
                            task_id,
                            status="running" if status_data.get("status") == "working" else "running",
                            message=status_data.get("message", ""),
                        )
                elif isinstance(data, str):
                    if not full_content:
                        full_content = data
                else:
                    yield f"data: {json.dumps({'type': 'text', 'content': str(data)}, ensure_ascii=False)}\n\n"
                    if isinstance(data, str):
                        full_content += data

            if not full_content:
                full_content = "（内容生成异常）"

            # 安全审查与防幻觉
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

            task_tracker.complete(task_id, f"资源 #{rid} 生成完成")
            yield f"data: {json.dumps({'type': 'done', 'resource_id': rid}, ensure_ascii=False)}\n\n"
        except Exception as e:
            task_tracker.error(task_id, str(e)[:100])
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get("/{resource_id}")
async def get_resource(
    resource_id: int,
    current_user: User = Depends(get_current_user),
):
    async with async_session() as session:
        from sqlalchemy import select
        result = await session.execute(
            select(LearningResource).where(LearningResource.id == resource_id)
        )
        resource = result.scalar_one_or_none()
        if not resource:
            raise HTTPException(status_code=404, detail="Resource not found")
        if resource.user_id != current_user.username:
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


class ResourceUpdateRequest(BaseModel):
    title: str | None = None
    content: str | None = None
    description: str | None = None


@router.put("/{resource_id}")
async def update_resource(
    resource_id: int,
    req: ResourceUpdateRequest,
    current_user: User = Depends(get_current_user),
):
    """更新资源内容（F32 资源编辑）"""
    async with async_session() as session:
        from sqlalchemy import select
        result = await session.execute(
            select(LearningResource).where(LearningResource.id == resource_id)
        )
        resource = result.scalar_one_or_none()
        if not resource or resource.user_id != current_user.username:
            raise HTTPException(status_code=404, detail="Resource not found")

        if req.title is not None:
            resource.title = req.title
        if req.content is not None:
            resource.content = req.content
        if req.description is not None:
            resource.description = req.description

        await session.commit()
        return {"status": "updated", "id": resource_id}


@router.delete("/{resource_id}")
async def delete_resource(
    resource_id: int,
    current_user: User = Depends(get_current_user),
):
    """删除学习资源"""
    async with async_session() as session:
        from sqlalchemy import select
        result = await session.execute(
            select(LearningResource).where(LearningResource.id == resource_id)
        )
        resource = result.scalar_one_or_none()
        if not resource or resource.user_id != current_user.username:
            raise HTTPException(status_code=404, detail="Resource not found")
        await session.delete(resource)
        await session.commit()
    return {"status": "deleted"}
