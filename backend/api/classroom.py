"""AI 课堂 API — 沉浸式分阶段教学

课堂状态机：warmup → lecture → practice → assess → review → complete
每个阶段对应不同的教学内容生成。
"""

import json
import asyncio
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from models import User
from auth import get_current_user
from services.spark_service import spark_service
from services.rag_service import rag_service
from services.mastery_service import mastery_service
from db import async_session
from sqlalchemy import select
from models import LearningPath
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))
from knowledge_base.knowledge_graph import CHAPTERS
from prompts import PERSONA_PREFIX, FEYNMAN_SYSTEM, FEYNMAN_INIT_PROMPT

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/classroom", tags=["classroom"])


class StartClassRequest(BaseModel):
    node_id: str = ""
    chapter: str = ""
    topic: str = ""
    lesson_title: str = ""
    lesson_description: str = ""


class OutlineRequest(BaseModel):
    topic: str
    description: str = ""


# ── 各阶段 prompt ──────────────────────────────────────────────

WARMUP_PROMPT = """{persona}课堂导入导师。学生即将学习「{topic}」。
请设计一个 3-5 分钟的课堂导入（Hook），包含：
1. 一个引发好奇心的开场问题或现实场景（50-80 字）
2. 简要回顾前置知识（为什么学这个之前需要了解什么，100 字）
3. 明确本节课要解决的 2-3 个核心问题
4. 本节课的学习目标清单（3-4 条）

用 Markdown 输出（300-500 字）。""".replace("{persona}", PERSONA_PREFIX)


LECTURE_PROMPT = """{persona}资深讲师。请为学生详细讲解「{topic}」的核心内容。

学生认知风格：{style}
学生薄弱点：{weak}

课程参考内容：
{context}

要求输出 **1500-3000 字** 的结构化分段讲解（Markdown），必须包含：

1. **核心概念讲解**（分 3-5 个小节，每节用 ### 标题，每节 300-600 字）：
   - 每个概念先用直觉解释（类比/例子），再给出形式化定义
   - 涉及数学公式时，逐步推导（$$...$$ LaTeX），每步都有文字说明
   - 每个小节末尾加一个「💡 思考题」引导学生主动思考

2. **图解与可视化**（至少 2 个 Mermaid 图表）：
   - 至少 1 个流程图/架构图展示核心流程
   - 至少 1 个对比表格或关系图

3. **实际案例**（至少 2 个具体例子）：
   - 1 个贴近生活的直觉类比
   - 1 个真实的技术/科学应用场景

4. **易错点提醒**（至少 2 条）：
   - 初学者最常犯的错误
   - 正确思路与错误思路的对比

讲解要有"上课"的节奏感，像老师在对学生说话。不要只写提纲，要有完整的段落。""".replace("{persona}", PERSONA_PREFIX)


PRACTICE_PROMPT = """{persona}练习设计专家。请为「{topic}」生成 **5-6 道** 课堂练习题。

要求严格输出 JSON 数组（不要 markdown 代码块）：
[
  {{
    "type": "choice|fill|short",
    "question": "题干",
    "options": ["A...", "B...", "C...", "D..."],  // choice 才有
    "answer": "正确答案",
    "explanation": "解析",
    "concept_id": "概念ID（如 gradient_descent）"
  }}
]

题型混合：2 道选择 + 1 道填空 + 2 道简答。""".replace("{persona}", PERSONA_PREFIX)


REVIEW_PROMPT = """{persona}课堂总结导师。请为「{topic}」生成本节课的结构化总结。

用 Markdown 输出（400-800 字）：
1. **核心要点回顾**（5-8 条，每条 2-3 句话，不只是标题，要有简要解释）
2. **易错点与常见误区**（3-4 条，说明错误原因和正确思路）
3. **公式/方法速查**（列出本节课涉及的关键公式或操作步骤清单）
4. **记忆口诀**（AI 根据内容生成一个助记法，帮助记忆核心概念）
5. **下节预告**（2-3 句话引出后续内容，说明与本节的关联）""".replace("{persona}", PERSONA_PREFIX)


def _parse_json_from_llm(raw: str):
    """从 LLM 输出提取 JSON"""
    import re
    raw = raw.strip()
    m = re.search(r'```(?:json)?\s*\n([\s\S]*?)```', raw)
    if m:
        raw = m.group(1).strip()
    elif raw.startswith("```"):
        lines = raw.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        raw = "\n".join(lines).strip()
    start = raw.find("[")
    if start == -1:
        start = raw.find("{")
    end = max(raw.rfind("]"), raw.rfind("}"))
    if start != -1 and end != -1:
        try:
            return json.loads(raw[start:end + 1])
        except json.JSONDecodeError:
            pass
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


OUTLINE_PROMPT = """{persona}课程设计专家。请为以下主题设计一个完整的课程大纲。

主题：{topic}
{desc_line}

要求：
1. 设计 5-8 节课，由浅入深，每节课有明确主题
2. 每节课标注难度（⭐/⭐⭐/⭐⭐⭐）和预计时长
3. 课程之间有逻辑递进关系

严格返回 JSON 数组，不要加 markdown 代码块标记：
[
  {{
    "title": "课程标题（简短有力，10字以内）",
    "description": "一句话简介（30-50字，说明这节课学什么、为什么重要）",
    "difficulty": "⭐",
    "duration_min": 20,
    "key_concepts": ["概念1", "概念2"]
  }}
]

只返回 JSON 数组。""".replace("{persona}", PERSONA_PREFIX)


@router.post("/outline")
async def generate_outline(
    req: OutlineRequest,
    current_user: User = Depends(get_current_user),
):
    """为任意主题生成课程大纲"""
    desc_line = f"补充说明：{req.description}" if req.description else ""
    prompt = OUTLINE_PROMPT.format(topic=req.topic, desc_line=desc_line)

    raw = await spark_service.chat(
        messages=[
            {"role": "system", "content": "你是课程设计专家，严格输出 JSON 数组。"},
            {"role": "user", "content": prompt},
        ],
        temperature=0.7,
        max_tokens=2048,
    )

    outline = _parse_json_from_llm(raw)
    if not isinstance(outline, list):
        # 降级：返回一个默认大纲
        outline = [
            {"title": f"{req.topic}基础入门", "description": f"了解{req.topic}的基本概念和核心原理", "difficulty": "⭐", "duration_min": 20, "key_concepts": []},
            {"title": f"{req.topic}核心原理", "description": f"深入学习{req.topic}的核心工作机制", "difficulty": "⭐⭐", "duration_min": 25, "key_concepts": []},
            {"title": f"{req.topic}实践应用", "description": f"动手实践{req.topic}的实际应用场景", "difficulty": "⭐⭐", "duration_min": 25, "key_concepts": []},
        ]

    return {"topic": req.topic, "outline": outline, "total": len(outline)}


@router.post("/start")
async def start_classroom(
    req: StartClassRequest,
    current_user: User = Depends(get_current_user),
):
    """流式启动一节 AI 课堂 —— 依次生成 warmup → lecture → practice → review"""
    # 确定主题 — 优先使用 lesson_title（来自大纲选课）
    topic = req.topic
    lesson_title = req.lesson_title
    lesson_desc = req.lesson_description
    chapter_id = req.chapter

    # 如果指定了课程标题，用它作为教学主题
    if lesson_title:
        topic = lesson_title
    elif not topic and chapter_id:
        ch = next((c for c in CHAPTERS if c["id"] == chapter_id), None)
        if ch:
            topic = ch["title"]
    if not topic and req.node_id:
        # 从学习路径查节点标题
        async with async_session() as session:
            result = await session.execute(
                select(LearningPath).where(LearningPath.user_id == current_user.username)
                .order_by(LearningPath.updated_at.desc())
            )
            path = result.scalars().first()
            if path and path.path_data:
                for node in path.path_data.get("nodes", []):
                    if node.get("id") == req.node_id:
                        topic = node.get("title", "")
                        break
    if not topic:
        topic = "人工智能导论"

    # 加载画像
    from models import StudentProfile
    async with async_session() as session:
        result = await session.execute(
            select(StudentProfile).where(StudentProfile.user_id == current_user.username)
        )
        profile = result.scalar_one_or_none()

    style = profile.cognitive_style if profile else ""
    weak = "、".join((profile.weak_points or [])[:3]) if profile else "暂无"

    # RAG 检索课程内容
    try:
        results = rag_service.search(topic, top_k=6)
        context = "\n\n".join([r["content"][:600] for r in results])[:3000]
    except Exception:
        context = ""

    async def generate():
        try:
            # 阶段 1: Warmup
            yield f"data: {json.dumps({'type': 'phase', 'phase': 'warmup', 'topic': topic}, ensure_ascii=False)}\n\n"
            warmup_prompt = WARMUP_PROMPT.format(topic=topic)
            warmup_text = ""
            async for chunk in spark_service.chat_stream(
                [{"role": "user", "content": warmup_prompt}], temperature=0.7, max_tokens=768
            ):
                warmup_text += chunk
                yield f"data: {json.dumps({'type': 'text', 'phase': 'warmup', 'content': chunk}, ensure_ascii=False)}\n\n"
                await asyncio.sleep(0.01)
            yield f"data: {json.dumps({'type': 'phase_end', 'phase': 'warmup'}, ensure_ascii=False)}\n\n"

            # 阶段 2: Lecture
            yield f"data: {json.dumps({'type': 'phase', 'phase': 'lecture'}, ensure_ascii=False)}\n\n"
            # 如果有课程描述，补充到上下文中让讲解更聚焦
            extra_context = f"\n本节课程简介：{lesson_desc}\n" if lesson_desc else ""
            lecture_prompt = LECTURE_PROMPT.format(
                topic=topic, style=style or "未指定", weak=weak, context=(context or "暂无") + extra_context
            )
            async for chunk in spark_service.chat_stream(
                [{"role": "user", "content": lecture_prompt}], temperature=0.6, max_tokens=6144
            ):
                yield f"data: {json.dumps({'type': 'text', 'phase': 'lecture', 'content': chunk}, ensure_ascii=False)}\n\n"
                await asyncio.sleep(0.01)
            yield f"data: {json.dumps({'type': 'phase_end', 'phase': 'lecture'}, ensure_ascii=False)}\n\n"

            # 阶段 3: Practice
            yield f"data: {json.dumps({'type': 'phase', 'phase': 'practice'}, ensure_ascii=False)}\n\n"
            practice_prompt = PRACTICE_PROMPT.format(topic=topic)
            practice_raw = ""
            async for chunk in spark_service.chat_stream(
                [{"role": "user", "content": practice_prompt}], temperature=0.4, max_tokens=2048
            ):
                practice_raw += chunk
                yield f"data: {json.dumps({'type': 'text', 'phase': 'practice', 'content': chunk}, ensure_ascii=False)}\n\n"
                await asyncio.sleep(0.01)
            # 尝试解析为题目
            questions = _parse_json_from_llm(practice_raw)
            if isinstance(questions, list):
                yield f"data: {json.dumps({'type': 'questions', 'questions': questions}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'type': 'phase_end', 'phase': 'practice'}, ensure_ascii=False)}\n\n"

            # 阶段 4: Review
            yield f"data: {json.dumps({'type': 'phase', 'phase': 'review'}, ensure_ascii=False)}\n\n"
            review_prompt = REVIEW_PROMPT.format(topic=topic)
            async for chunk in spark_service.chat_stream(
                [{"role": "user", "content": review_prompt}], temperature=0.5, max_tokens=1536
            ):
                yield f"data: {json.dumps({'type': 'text', 'phase': 'review', 'content': chunk}, ensure_ascii=False)}\n\n"
                await asyncio.sleep(0.01)
            yield f"data: {json.dumps({'type': 'phase_end', 'phase': 'review'}, ensure_ascii=False)}\n\n"

            yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"
        except Exception as e:
            logger.error("课堂生成失败: %s", e, exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/submit-practice")
async def submit_practice(
    req: dict,
    current_user: User = Depends(get_current_user),
):
    """提交课堂练习结果，更新概念掌握度"""
    results = req.get("results", [])
    quiz_results = []
    for r in results:
        quiz_results.append({
            "concept_id": r.get("concept_id", ""),
            "outcome": "correct" if r.get("correct") else "wrong",
            "quality": 0.8 if r.get("correct") else 0.3,
            "question": r.get("question", ""),
        })
    weak = await mastery_service.diagnose_from_quiz(
        user_id=current_user.username,
        quiz_results=quiz_results,
    )
    return {"weak_concepts": weak, "submitted": len(quiz_results)}


# ── 课程保存/加载 API ─────────────────────────────────────────

class SaveCourseRequest(BaseModel):
    topic: str
    description: str = ""
    outline: list[dict]


class CompleteLessonRequest(BaseModel):
    course_id: int
    lesson_title: str


@router.post("/save")
async def save_course(
    req: SaveCourseRequest,
    current_user: User = Depends(get_current_user),
):
    """保存课程大纲"""
    from models import SavedCourse

    async with async_session() as session:
        # 检查是否已有同主题课程，有则更新
        result = await session.execute(
            select(SavedCourse).where(
                SavedCourse.user_id == current_user.username,
                SavedCourse.topic == req.topic,
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            existing.outline = req.outline
            existing.description = req.description
            existing.updated_at = datetime.now(timezone.utc)
            course_id = existing.id
        else:
            course = SavedCourse(
                user_id=current_user.username,
                topic=req.topic,
                description=req.description,
                outline=req.outline,
                completed_lessons=[],
            )
            session.add(course)
            await session.flush()
            course_id = course.id

        await session.commit()

    return {"course_id": course_id, "saved": True}


@router.get("/courses")
async def list_courses(current_user: User = Depends(get_current_user)):
    """获取所有已保存的课程"""
    from models import SavedCourse

    async with async_session() as session:
        result = await session.execute(
            select(SavedCourse)
            .where(SavedCourse.user_id == current_user.username)
            .order_by(SavedCourse.updated_at.desc())
        )
        courses = result.scalars().all()

    return {
        "courses": [
            {
                "id": c.id,
                "topic": c.topic,
                "description": c.description,
                "outline": c.outline or [],
                "completed_lessons": c.completed_lessons or [],
                "total": len(c.outline or []),
                "completed_count": len(c.completed_lessons or []),
                "created_at": c.created_at.isoformat() if c.created_at else "",
                "updated_at": c.updated_at.isoformat() if c.updated_at else "",
            }
            for c in courses
        ]
    }


@router.post("/complete-lesson")
async def complete_lesson(
    req: CompleteLessonRequest,
    current_user: User = Depends(get_current_user),
):
    """标记课程中的某节课为已完成"""
    from models import SavedCourse

    async with async_session() as session:
        result = await session.execute(
            select(SavedCourse).where(
                SavedCourse.id == req.course_id,
                SavedCourse.user_id == current_user.username,
            )
        )
        course = result.scalar_one_or_none()
        if not course:
            return {"error": "Course not found"}

        completed = course.completed_lessons or []
        if req.lesson_title not in completed:
            completed.append(req.lesson_title)
            course.completed_lessons = completed
            course.updated_at = datetime.now(timezone.utc)
            await session.commit()

    return {
        "completed_lessons": completed,
        "completed_count": len(completed),
        "total": len(course.outline or []),
    }


@router.delete("/courses/{course_id}")
async def delete_course(
    course_id: int,
    current_user: User = Depends(get_current_user),
):
    """删除已保存的课程"""
    from models import SavedCourse

    async with async_session() as session:
        result = await session.execute(
            select(SavedCourse).where(
                SavedCourse.id == course_id,
                SavedCourse.user_id == current_user.username,
            )
        )
        course = result.scalar_one_or_none()
        if course:
            await session.delete(course)
            await session.commit()

    return {"deleted": True}


# ── 费曼学习法 API ─────────────────────────────────────────────

class FeynmanStartRequest(BaseModel):
    concept: str
    topic: str
    course_id: int = 0


class FeynmanMessageRequest(BaseModel):
    concept: str
    topic: str
    user_message: str
    history: list[dict] = []
    course_id: int = 0


@router.post("/feynman/start")
async def feynman_start(
    req: FeynmanStartRequest,
    current_user: User = Depends(get_current_user),
):
    """费曼学习法：获取 AI 开场白"""
    prompt = FEYNMAN_INIT_PROMPT.format(topic=req.topic, concept=req.concept)

    try:
        raw = await spark_service.chat(
            messages=[
                {"role": "system", "content": FEYNMAN_SYSTEM},
                {"role": "user", "content": prompt},
            ],
            temperature=0.8,
            max_tokens=512,
        )
        result = _parse_json_from_llm(raw)
        if isinstance(result, dict) and "opening" in result:
            opening = result["opening"]
        else:
            opening = f"嗨！我刚学完{req.topic}，但对「{req.concept}」还是有点迷糊。你能用自己的话给我讲讲这是什么意思吗？"
    except Exception as e:
        logger.warning("费曼开场白生成失败: %s", e)
        opening = f"嗨！我刚学完{req.topic}，但对「{req.concept}」还是有点迷糊。你能用自己的话给我讲讲这是什么意思吗？"

    return {"opening": opening, "concept": req.concept}


@router.post("/feynman/message")
async def feynman_message(
    req: FeynmanMessageRequest,
    current_user: User = Depends(get_current_user),
):
    """费曼学习法：流式对话 — AI 评估理解度并追问"""

    # 构建对话历史
    messages = [{"role": "system", "content": FEYNMAN_SYSTEM}]

    # 加入对话上下文
    for h in req.history[-6:]:  # 只取最近 6 轮
        role = "assistant" if h.get("role") == "ai" else "user"
        messages.append({"role": role, "content": h.get("content", "")})

    # 加入当前用户消息
    messages.append({"role": "user", "content": req.user_message})

    async def generate():
        full_text = ""
        try:
            async for chunk in spark_service.chat_stream(messages, temperature=0.7, max_tokens=1024):
                full_text += chunk
                yield f"data: {json.dumps({'type': 'text', 'content': chunk}, ensure_ascii=False)}\n\n"
                await asyncio.sleep(0.01)

            # 解析结构化结果
            result = _parse_json_from_llm(full_text)
            if isinstance(result, dict):
                understanding = float(result.get("understanding", 0.5))
                stage = result.get("stage", "partial")
                feedback = result.get("feedback", full_text)
            else:
                # 降级：无法解析时给默认值
                understanding = 0.5
                stage = "partial"
                feedback = full_text

            yield f"data: {json.dumps({'type': 'result', 'understanding': understanding, 'stage': stage, 'feedback': feedback}, ensure_ascii=False)}\n\n"

            # 保存费曼记录
            try:
                from models import FeynmanRecord
                async with async_session() as session:
                    record = FeynmanRecord(
                        user_id=current_user.username,
                        course_id=req.course_id,
                        concept=req.concept,
                        final_understanding=understanding,
                        turns=len(req.history) // 2 + 1,
                        dialogue=req.history + [
                            {"role": "user", "content": req.user_message},
                            {"role": "ai", "content": feedback},
                        ],
                    )
                    session.add(record)
                    await session.commit()
            except Exception as e:
                logger.warning("费曼记录保存失败: %s", e)

        except Exception as e:
            logger.error("费曼对话失败: %s", e, exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)}, ensure_ascii=False)}\n\n"

        yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get("/feynman/stats")
async def feynman_stats(current_user: User = Depends(get_current_user)):
    """获取费曼学习统计"""
    from models import FeynmanRecord

    async with async_session() as session:
        result = await session.execute(
            select(FeynmanRecord).where(FeynmanRecord.user_id == current_user.username)
        )
        records = result.scalars().all()

    total = len(records)
    avg_understanding = sum(r.final_understanding for r in records) / max(total, 1)
    concepts_covered = list(set(r.concept for r in records))
    mastery_count = sum(1 for r in records if r.final_understanding >= 0.8)

    return {
        "total_sessions": total,
        "avg_understanding": round(avg_understanding, 2),
        "concepts_covered": concepts_covered,
        "mastery_count": mastery_count,
    }
