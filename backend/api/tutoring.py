"""智能辅导 API —— 多模态答疑"""

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from services.spark_service import spark_service
from services.rag_service import rag_service
from services.safety_service import check_safety, add_hallucination_disclaimer
import json
import asyncio

router = APIRouter(prefix="/api/tutoring", tags=["tutoring"])


class TutoringRequest(BaseModel):
    user_id: str = "default"
    question: str
    context: str = ""
    history: list[dict] = []
    profile: dict = {}


@router.post("/ask")
async def ask_question(req: TutoringRequest):
    """流式智能答疑"""
    # RAG 检索相关课程内容
    results = rag_service.search(req.question, top_k=4)
    context = "\n\n".join([r["content"][:500] for r in results])

    system_prompt = f"""你是一位耐心细致的 AI 导师。请根据以下课程参考内容，帮学生解答问题。

回答要求：
1. 先简要概括问题的核心
2. 给出清晰、准确、分步骤的解答
3. 尽量包含图解说明（使用 Mermaid 图表或 ASCII 示意图）
4. 提供相关知识点链接
5. 最后给出 1-2 个追问引导，鼓励学生深入思考

学生画像：{json.dumps(req.profile, ensure_ascii=False) if req.profile else '未知'}

课程参考内容：
{context[:2500]}"""

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
