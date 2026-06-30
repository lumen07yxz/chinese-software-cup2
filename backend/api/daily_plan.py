"""每日学习计划 API"""

from fastapi import APIRouter, Depends
from models import User
from auth import get_current_user
from services.daily_plan_service import daily_plan_service

router = APIRouter(prefix="/api/daily-plan", tags=["daily-plan"])


@router.get("/")
async def get_daily_plan(
    available_minutes: int | None = None,
    current_user: User = Depends(get_current_user),
):
    """获取今日学习计划"""
    plan = await daily_plan_service.generate_daily_plan(
        user_id=current_user.username,
        available_minutes=available_minutes,
    )
    return plan
