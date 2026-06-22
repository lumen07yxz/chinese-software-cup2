"""学习画像 API"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from db import async_session
from models import StudentProfile, User
from auth import get_current_user

router = APIRouter(prefix="/api/profile", tags=["profile"])


class ProfileUpdateRequest(BaseModel):
    knowledge_base: dict | None = None
    cognitive_style: str | None = None
    weak_points: list[str] | None = None
    learning_goal: str | None = None
    available_time: str | None = None
    interests: list[str] | None = None


@router.get("/")
async def get_profile(current_user: User = Depends(get_current_user)):
    """获取当前用户学习画像"""
    async with async_session() as session:
        from sqlalchemy import select
        result = await session.execute(
            select(StudentProfile).where(StudentProfile.user_id == current_user.username)
        )
        profile = result.scalar_one_or_none()
        if not profile:
            return {"profile": None}
        return {
            "profile": {
                "knowledge_base": profile.knowledge_base,
                "cognitive_style": profile.cognitive_style,
                "weak_points": profile.weak_points,
                "learning_goal": profile.learning_goal,
                "available_time": profile.available_time,
                "interests": profile.interests,
                "conversation_summary": profile.conversation_summary,
            }
        }


@router.post("/update")
async def update_profile(
    req: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
):
    """创建或更新学习画像"""
    user_id = current_user.username
    async with async_session() as session:
        from sqlalchemy import select
        result = await session.execute(
            select(StudentProfile).where(StudentProfile.user_id == user_id)
        )
        profile = result.scalar_one_or_none()

        if not profile:
            profile = StudentProfile(user_id=user_id)
            session.add(profile)

        if req.knowledge_base is not None:
            profile.knowledge_base = req.knowledge_base
        if req.cognitive_style is not None:
            profile.cognitive_style = req.cognitive_style
        if req.weak_points is not None:
            profile.weak_points = req.weak_points
        if req.learning_goal is not None:
            profile.learning_goal = req.learning_goal
        if req.available_time is not None:
            profile.available_time = req.available_time
        if req.interests is not None:
            profile.interests = req.interests

        await session.commit()
        return {"status": "updated"}
