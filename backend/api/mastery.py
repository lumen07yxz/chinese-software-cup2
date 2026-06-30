"""概念掌握度 API"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from models import User
from auth import get_current_user
from services.mastery_service import mastery_service

router = APIRouter(prefix="/api/mastery", tags=["mastery"])


class UpdateMasteryRequest(BaseModel):
    concept_id: str
    outcome: str  # 'correct' | 'wrong' | 'partial' | 'reviewed'
    quality: float = 0.5


class DiagnoseRequest(BaseModel):
    quiz_results: list[dict] = []


@router.get("/")
async def get_all_mastery(current_user: User = Depends(get_current_user)):
    """获取用户所有概念掌握度"""
    return {"mastery": await mastery_service.get_all_mastery(current_user.username)}


@router.get("/weak")
async def get_weak_concepts(
    threshold: float = 0.4,
    current_user: User = Depends(get_current_user),
):
    """获取薄弱概念列表"""
    return {"weak_concepts": await mastery_service.get_weak_concepts(current_user.username, threshold)}


@router.get("/chapter/{chapter}")
async def get_chapter_mastery(
    chapter: str,
    current_user: User = Depends(get_current_user),
):
    """获取某章节的概念掌握度"""
    return {"mastery": await mastery_service.get_mastery_by_chapter(current_user.username, chapter)}


@router.post("/update")
async def update_mastery(
    req: UpdateMasteryRequest,
    current_user: User = Depends(get_current_user),
):
    """更新单个概念的掌握度"""
    result = await mastery_service.update_mastery(
        user_id=current_user.username,
        concept_id=req.concept_id,
        outcome=req.outcome,
        quality=req.quality,
    )
    return result


@router.post("/diagnose")
async def diagnose_from_quiz(
    req: DiagnoseRequest,
    current_user: User = Depends(get_current_user),
):
    """从测验结果批量诊断并更新掌握度"""
    weak = await mastery_service.diagnose_from_quiz(
        user_id=current_user.username,
        quiz_results=req.quiz_results,
    )
    return {"weak_concepts": weak}


@router.get("/check-prerequisite/{concept_id}")
async def check_prerequisites(
    concept_id: str,
    threshold: float = 0.4,
    current_user: User = Depends(get_current_user),
):
    """Gatekeeper: 检查概念的前置掌握度"""
    return await mastery_service.check_prerequisites(
        user_id=current_user.username,
        concept_id=concept_id,
        threshold=threshold,
    )


@router.get("/chapter-readiness/{chapter}")
async def get_chapter_readiness(
    chapter: str,
    current_user: User = Depends(get_current_user),
):
    """检查某章节的整体准备度"""
    return await mastery_service.get_chapter_readiness(
        user_id=current_user.username,
        chapter=chapter,
    )
