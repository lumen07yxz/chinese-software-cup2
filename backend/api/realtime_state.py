"""实时学情状态 API — 查询和持久化实时学情历史"""

from fastapi import APIRouter, Depends
from models import User, RealtimeLearningState
from auth import get_current_user
from db import async_session
from sqlalchemy import select, desc
from datetime import datetime, timezone

router = APIRouter(prefix="/api/realtime-state", tags=["realtime-state"])


@router.get("/history")
async def get_realtime_state_history(
    limit: int = 10,
    current_user: User = Depends(get_current_user),
):
    """获取最近 N 条实时学情记录"""
    async with async_session() as session:
        result = await session.execute(
            select(RealtimeLearningState)
            .where(RealtimeLearningState.user_id == current_user.username)
            .order_by(desc(RealtimeLearningState.updated_at))
            .limit(limit)
        )
        records = result.scalars().all()

    return {
        "history": [
            {
                "emotion": r.emotion,
                "confusion": r.confusion,
                "cognitive_load": r.cognitive_load,
                "confidence": r.confidence,
                "engagement": r.engagement,
                "updated_at": r.updated_at.isoformat() if r.updated_at else "",
            }
            for r in records
        ]
    }


@router.get("/current")
async def get_current_realtime_state(
    current_user: User = Depends(get_current_user),
):
    """获取最新的实时学情状态"""
    async with async_session() as session:
        result = await session.execute(
            select(RealtimeLearningState)
            .where(RealtimeLearningState.user_id == current_user.username)
            .order_by(desc(RealtimeLearningState.updated_at))
            .limit(1)
        )
        record = result.scalar_one_or_none()

    if not record:
        return {
            "emotion": "",
            "confusion": 0.0,
            "cognitive_load": 0.0,
            "confidence": 0.5,
            "engagement": 0.5,
        }

    return {
        "emotion": record.emotion,
        "confusion": record.confusion,
        "cognitive_load": record.cognitive_load,
        "confidence": record.confidence,
        "engagement": record.engagement,
        "updated_at": record.updated_at.isoformat() if record.updated_at else "",
    }
