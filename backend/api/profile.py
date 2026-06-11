"""学习画像 API"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from db import async_session
from models import StudentProfile

router = APIRouter(prefix="/api/profile", tags=["profile"])


class ProfileUpdateRequest(BaseModel):
    user_id: str
    knowledge_base: dict | None = None
    cognitive_style: str | None = None
    weak_points: list[str] | None = None
    learning_goal: str | None = None
    available_time: str | None = None
    interests: list[str] | None = None


@router.get("/{user_id}")
async def get_profile(user_id: str):
    """获取用户学习画像"""
    async with async_session() as session:
        from sqlalchemy import select
        result = await session.execute(
            select(StudentProfile).where(StudentProfile.user_id == user_id)
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
            }
        }


@router.post("/update")
async def update_profile(req: ProfileUpdateRequest):
    """创建或更新学习画像"""
    async with async_session() as session:
        from sqlalchemy import select
        result = await session.execute(
            select(StudentProfile).where(StudentProfile.user_id == req.user_id)
        )
        profile = result.scalar_one_or_none()

        if not profile:
            profile = StudentProfile(user_id=req.user_id)
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
        return {"status": "updated", "user_id": req.user_id}
