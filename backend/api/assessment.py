"""学习评估 API"""

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from db import async_session
from models import AssessmentRecord
from services.spark_service import spark_service
import json
import asyncio

router = APIRouter(prefix="/api/assessment", tags=["assessment"])


class RecordRequest(BaseModel):
    user_id: str = "default"
    study_time_minutes: int = 0
    topic: str = ""
    resource_type: str = ""


class AssessRequest(BaseModel):
    user_id: str = "default"
    profile: dict = {}
    study_data: dict = {}


@router.get("/")
async def get_assessment(user_id: str = "default"):
    async with async_session() as session:
        from sqlalchemy import select
        result = await session.execute(
            select(AssessmentRecord).where(AssessmentRecord.user_id == user_id)
            .order_by(AssessmentRecord.created_at.desc()).limit(10)
        )
        records = result.scalars().all()
        latest = records[0] if records else None
        return {
            "records": [
                {
                    "id": r.id,
                    "study_time_minutes": r.study_time_minutes,
                    "quiz_scores": r.quiz_scores,
                    "resource_interactions": r.resource_interactions,
                    "report": r.assessment_report,
                    "created_at": r.created_at.isoformat() if r.created_at else "",
                }
                for r in records
            ],
            "latest_report": latest.assessment_report if latest else None,
        }


@router.post("/record")
async def record_behavior(req: RecordRequest):
    async with async_session() as session:
        record = AssessmentRecord(
            user_id=req.user_id,
            study_time_minutes=req.study_time_minutes,
            resource_interactions=1,
        )
        session.add(record)
        await session.commit()
        return {"status": "recorded"}


@router.post("/generate")
async def generate_assessment(req: AssessRequest):
    """流式生成学习评估报告"""
    prompt = f"""你是一位学习评估分析师。请根据以下数据生成学习效果评估报告。

用户画像：{json.dumps(req.profile, ensure_ascii=False)}
学习数���：{json.dumps(req.study_data, ensure_ascii=False)}

请生成包含以下内容的评估报告（Markdown格式）：
1. 整体学习概览（总分 + 各维度评分）
2. 各知识点的掌握程度评估
3. 薄弱环节诊断与原因分析
4. 学习策略调整建议
5. 下一步学习重点推荐"""

    async def generate():
        try:
            messages = [
                {"role": "system", "content": "你是学习评估专家。"},
                {"role": "user", "content": prompt},
            ]
            async for chunk in spark_service.chat_stream(messages, temperature=0.5, max_tokens=4096):
                yield f"data: {json.dumps({'type': 'text', 'content': chunk}, ensure_ascii=False)}\n\n"
                await asyncio.sleep(0.01)
            yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
