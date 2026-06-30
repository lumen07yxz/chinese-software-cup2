"""闪卡 API"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from models import User
from auth import get_current_user
from services.flashcard_service import flashcard_service

router = APIRouter(prefix="/api/flashcards", tags=["flashcards"])


class GenerateFlashcardsRequest(BaseModel):
    topic: str
    content: str
    count: int = 5


class ReviewCardRequest(BaseModel):
    card_id: int
    quality: int  # 0-5


@router.get("/due")
async def get_due_reviews(current_user: User = Depends(get_current_user)):
    """获取到期复习的闪卡"""
    cards = await flashcard_service.get_due_reviews(current_user.username)
    return {"cards": cards, "total": len(cards)}


@router.get("/list")
async def list_all_cards(current_user: User = Depends(get_current_user)):
    """获取所有已保存的闪卡"""
    cards = await flashcard_service.get_all_cards(current_user.username)
    return {"cards": cards, "total": len(cards)}


@router.post("/generate")
async def generate_flashcards(
    req: GenerateFlashcardsRequest,
    current_user: User = Depends(get_current_user),
):
    """从学习内容生成闪卡"""
    cards = await flashcard_service.generate_flashcards(
        user_id=current_user.username,
        topic=req.topic,
        content=req.content,
        count=req.count,
    )
    return {"cards": cards, "total": len(cards)}


@router.post("/review")
async def review_card(
    req: ReviewCardRequest,
    current_user: User = Depends(get_current_user),
):
    """提交闪卡复习结果"""
    return await flashcard_service.review_card(
        user_id=current_user.username,
        card_id=req.card_id,
        quality=req.quality,
    )


@router.get("/stats")
async def get_flashcard_stats(current_user: User = Depends(get_current_user)):
    """获取复习统计"""
    return await flashcard_service.get_stats(current_user.username)
