"""诊断 API — 错误诊断和补救策略"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from models import User
from auth import get_current_user
from services.diagnostic_service import diagnostic_service

router = APIRouter(prefix="/api/diagnose", tags=["diagnose"])


class DiagnoseErrorRequest(BaseModel):
    question: str
    correct_answer: str
    student_answer: str
    concept: str = ""


@router.post("/")
async def diagnose_error(
    req: DiagnoseErrorRequest,
    current_user: User = Depends(get_current_user),
):
    """诊断错误类型并生成补救策略"""
    result = await diagnostic_service.diagnose(
        question=req.question,
        correct_answer=req.correct_answer,
        student_answer=req.student_answer,
        concept=req.concept,
    )
    return result
