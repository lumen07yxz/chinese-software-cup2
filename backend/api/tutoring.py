"""智能辅导 API —— 多模态答疑（含来源引用、难度自适应、追问建议）"""

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from models import User, LearningResource
from auth import get_current_user
from services.spark_service import spark_service
from services.rag_service import rag_service
from services.safety_service import check_safety, add_hallucination_disclaimer
from services.web_search_service import web_search_service
from db import async_session
import json
import asyncio

router = APIRouter(prefix="/api/tutoring", tags=["tutoring"])


class TutoringRequest(BaseModel):
    question: str
    context: str = ""
    history: list[dict] = []
    profile: dict = {}


def _build_adaptive_instruction(profile: dict) -> str:
    """D24: 根据画像生成难度自适应教学指令"""
    if not profile:
        return ""

    kb = profile.get("knowledge_base", {}) or {}
    style = profile.get("cognitive_style", "")
    weak = profile.get("weak_points", []) or []
    goal = profile.get("learning_goal", "")
    interests = profile.get("interests", []) or []

    parts: list[str] = []

    # 1) 知识水平 → 调整讲解深度
    if kb:
        avg = sum(float(v) for v in kb.values()) / len(kb) if kb else 0
        if avg < 0.3:
            parts.append(
                "学生基础较弱，请用通俗易懂的语言讲解，多用比喻和生活实例，"
                "避免过多公式推导。先从最基础的概念讲起。"
            )
        elif avg < 0.6:
            parts.append(
                "学生有一定基础，讲解时适度深入，可包含关键公式推导，"
                "用对比分析帮助理解不同方法的适用场景。"
            )
        else:
            parts.append(
                "学生基础扎实，可深入讲解原理和数学推导，"
                "提供前沿扩展和相关论文方向，激发深度思考。"
            )

    # 2) 认知风格 → 调整呈现方式
    if style == "visual":
        parts.append("学生偏好视觉型学习，请多使用 Mermaid 图表、流程图、思维导图来呈现知识。")
    elif style == "verbal":
        parts.append("学生偏好言语型学习，请用清晰有条理的文字叙述，适当使用类比和故事。")
    elif style == "active":
        parts.append("学生偏好动手实践，请在解答后给出可操作的练习或代码示例。")
    elif style == "reflective":
        parts.append("学生偏好反思型学习，请给出引导性问题让学生自己思考，提供笔记要点。")

    # 3) 薄弱点 → 重点解释
    if weak:
        weak_str = "、".join(weak[:5])
        parts.append(
            f"学生的薄弱知识点包括「{weak_str}」，如涉及这些内容请放慢节奏、详细拆解。"
        )

    # 4) 学习目标与兴趣 → 关联实际
    if goal:
        parts.append(f"学生学习目标是「{goal}」，请在解答中关联该目标。")
    if interests:
        parts.append(f"学生兴趣方向是「{'、'.join(interests[:3])}」，可结合这些方向举例。")

    if not parts:
        return ""

    return "教学策略（请据此调整讲解方式）：\n" + "\n".join(f"- {p}" for p in parts)


@router.post("/ask")
async def ask_question(
    req: TutoringRequest,
    current_user: User = Depends(get_current_user),
):
    """流式智能答疑 —— 融合 RAG + Mermaid 图表 + 资源推荐 + 联网搜索 + 来源引用 + 难度自适应"""
    # RAG 检索相关课程内容（知识库 + 用户导入文档）
    results = rag_service.search(req.question, top_k=4)
    context = "\n\n".join([r["content"][:500] for r in results])

    # 构建来源引用编号（D23）
    sources: list[str] = []
    for r in results:
        ch = r.get("chapter", "")
        src = r.get("source", "")
        score = r.get("score", 0)
        if ch:
            label = f"{ch}（课程知识库）" if src == "course" else f"{ch}（用户上传）"
            sources.append(f"{label}，相关度 {score:.0%}")
    sources_text = "\n".join(
        f"[{i+1}] {s}" for i, s in enumerate(sources)
    ) if sources else "（无可用来源）"

    # 联网搜索补充（如果 RAG 结果不够充分）
    web_context = ""
    if len(context) < 200:
        try:
            web_results = await web_search_service.search(req.question, top_k=3)
            web_context = "\n\n".join([
                f"[网络搜索] {r['snippet']}" for r in web_results if r.get('snippet')
            ])[:2000]
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

    adaptive = _build_adaptive_instruction(req.profile)

    system_prompt = f"""你是一位耐心细致的 AI 导师。请融合课程知识和学生已有资源来解答问题。

{adaptive}

回答要求：
1. 先简要概括问题的核心
2. 给出清晰、准确、分步骤的解答
3. 引用课程知识库时，在句末标注来源编号（如 [1]），方便学生追溯原文
4. **在合适的地方用 Mermaid 代码块绘制图解**（流程图、架构图、关系图等）——这是关键要求
5. 最后给 2-3 个追问建议，用「」包裹每个建议（如：「你想了解卷积神经网络的具体实现吗？」），确保追问与当前回答主题相关

Mermaid 示例（请在合适时使用）：
```mermaid
flowchart TD
    A[输入数据] --> B[特征提取]
    B --> C[模型训练]
    C --> D[输出]
```

学生画像：{json.dumps(req.profile, ensure_ascii=False) if req.profile else '未知'}

课程参考内容（标注了来源编号 [N]）：
{sources_text}

{context[:2000]}

{("网络补充信息（最新）：\n" + web_context[:1500]) if web_context else ""}

学生已有资源：
{resource_text if resource_text else '暂无'}"""

    async def generate():
        full = ""
        try:
            messages = [
                {"role": "system", "content": system_prompt},
            ]
            for h in req.history:
                messages.append(h)
            messages.append({"role": "user", "content": req.question})

            async for chunk in spark_service.chat_stream(messages, temperature=0.5, max_tokens=4096):
                full += chunk
                yield f"data: {json.dumps({'type': 'text', 'content': chunk}, ensure_ascii=False)}\n\n"
                await asyncio.sleep(0.01)

            full = add_hallucination_disclaimer(full)
            safety = check_safety(full)
            if not safety["safe"]:
                flags_str = str(safety["flags"])
                yield f"data: {json.dumps({'type': 'warning', 'content': f'content flagged: {flags_str}'}, ensure_ascii=False)}\n\n"

            yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
