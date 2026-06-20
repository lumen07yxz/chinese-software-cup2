"""学习评估 API"""

import logging
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from db import async_session
from models import AssessmentRecord, User
from auth import get_current_user
from services.spark_service import spark_service
from datetime import timezone, datetime
import json
import asyncio

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/assessment", tags=["assessment"])


class RecordRequest(BaseModel):
    study_time_minutes: int = 0
    topic: str = ""
    resource_type: str = ""


class AssessRequest(BaseModel):
    profile: dict = {}
    study_data: dict = {}


@router.get("/")
async def get_assessment(current_user: User = Depends(get_current_user)):
    async with async_session() as session:
        from sqlalchemy import select
        result = await session.execute(
            select(AssessmentRecord).where(AssessmentRecord.user_id == current_user.username)
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
async def record_behavior(
    req: RecordRequest,
    current_user: User = Depends(get_current_user),
):
    async with async_session() as session:
        record = AssessmentRecord(
            user_id=current_user.username,
            study_time_minutes=req.study_time_minutes,
            resource_interactions=1,
            quiz_scores=[{"topic": req.topic, "resource_type": req.resource_type}],
        )
        session.add(record)
        await session.commit()
        return {"status": "recorded"}


@router.post("/generate")
async def generate_assessment(
    req: AssessRequest,
    current_user: User = Depends(get_current_user),
):
    """流式生成学习评估报告"""
    prompt = f"""你是一位学习评估分析师。请根据以下数据生成学习效果评估报告。

用户画像：{json.dumps(req.profile, ensure_ascii=False)}
学习数据：{json.dumps(req.study_data, ensure_ascii=False)}

请生成包含以下内容的评估报告（Markdown格式）：
1. 整体学习概览（总分 + 各维度评分）
2. 各知识点的掌握程度评估
3. 薄弱环节诊断与原因分析
4. 学习策略调整建议
5. 下一步学习重点推荐"""

    async def generate():
        full_text = ""
        try:
            messages = [
                {"role": "system", "content": "你是学习评估专家，请根据用户的学习数据生成专业、具体、个性化的评估报告。"},
                {"role": "user", "content": prompt},
            ]
            async for chunk in spark_service.chat_stream(messages, temperature=0.5, max_tokens=4096):
                yield f"data: {json.dumps({'type': 'text', 'content': chunk}, ensure_ascii=False)}\n\n"
                full_text += chunk
                await asyncio.sleep(0.01)

            # 保存评估报告：创建新记录（而非只更新已有记录）
            if full_text:
                try:
                    from sqlalchemy import select, desc
                    async with async_session() as sess:
                        # 查找最近的记录，如果今天已生成过则更新，否则新建
                        result = await sess.execute(
                            select(AssessmentRecord)
                            .where(AssessmentRecord.user_id == current_user.username)
                            .order_by(desc(AssessmentRecord.created_at))
                            .limit(1)
                        )
                        latest_record = result.scalar_one_or_none()

                        # assessment_report 是 JSON 列，存入结构化对象
                        report_obj = {
                            "content": full_text,
                            "generated_at": datetime.now(timezone.utc).isoformat(),
                            "study_data": req.study_data,
                        }

                        if latest_record and latest_record.assessment_report == {}:
                            # 最近记录的报告字段为空（由 record_behavior 创建），更新它
                            latest_record.assessment_report = report_obj
                            await sess.commit()
                            logger.info("评估报告已更新到记录 %s", latest_record.id)
                        elif latest_record and latest_record.assessment_report:
                            # 已有报告，创建新记录存储新报告
                            new_record = AssessmentRecord(
                                user_id=current_user.username,
                                study_time_minutes=0,
                                resource_interactions=0,
                                quiz_scores=[],
                                assessment_report=report_obj,
                            )
                            sess.add(new_record)
                            await sess.commit()
                            logger.info("评估报告已创建新记录 %s", new_record.id)
                        else:
                            # 没有任何记录，创建新记录
                            new_record = AssessmentRecord(
                                user_id=current_user.username,
                                study_time_minutes=0,
                                resource_interactions=0,
                                quiz_scores=[],
                                assessment_report=report_obj,
                            )
                            sess.add(new_record)
                            await sess.commit()
                            logger.info("评估报告已创建首条记录 %s", new_record.id)
                except Exception as save_err:
                    logger.error("保存评估报告失败: %s", save_err, exc_info=True)

            yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"
        except Exception as e:
            logger.error("生成评估报告失败: %s", e, exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get("/trends")
async def get_study_trends(current_user: User = Depends(get_current_user)):
    """按日聚合最近 14 天的学习时长与资源交互次数，用于趋势图"""
    from sqlalchemy import select, func
    from datetime import timedelta

    since = datetime.now(timezone.utc) - timedelta(days=14)
    async with async_session() as session:
        # SQLite: 提取日期字符串聚合
        result = await session.execute(
            select(
                func.date(AssessmentRecord.created_at).label("day"),
                func.sum(AssessmentRecord.study_time_minutes).label("minutes"),
                func.sum(AssessmentRecord.resource_interactions).label("interactions"),
                func.count(AssessmentRecord.id).label("sessions"),
            )
            .where(
                AssessmentRecord.user_id == current_user.username,
                AssessmentRecord.created_at >= since,
            )
            .group_by(func.date(AssessmentRecord.created_at))
            .order_by(func.date(AssessmentRecord.created_at))
        )
        rows = result.all()

    # 补全缺失的日期（让折线图连续）
    today = datetime.now(timezone.utc).date()
    day_map = {row.day: {
        "minutes": int(row.minutes or 0),
        "interactions": int(row.interactions or 0),
        "sessions": int(row.sessions or 0),
    } for row in rows}

    trends = []
    for i in range(13, -1, -1):
        d = today - timedelta(days=i)
        key = d.isoformat()
        trends.append({
            "date": key,
            **day_map.get(key, {"minutes": 0, "interactions": 0, "sessions": 0}),
        })

    total_minutes = sum(t["minutes"] for t in trends)
    return {
        "trends": trends,
        "total_minutes": total_minutes,
        "avg_per_day": round(total_minutes / 14, 1) if trends else 0,
    }
