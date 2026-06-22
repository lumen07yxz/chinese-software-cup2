"""语音听写 API — 浏览器麦克风音频 → 讯飞 IAT → 文本"""
import base64
import logging

from fastapi import APIRouter, Depends, UploadFile, File
from pydantic import BaseModel

from auth import get_current_user
from models import User
from services.iat_service import ias_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/voice", tags=["voice"])


class TranscribeResponse(BaseModel):
    text: str
    success: bool


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_audio(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """上传 PCM 音频 → 讯飞语音听写 → 返回文本"""
    if not ias_service.available:
        return TranscribeResponse(text="", success=False)

    try:
        content = await file.read()
        # 按 40ms chunk 分割（640 samples @ 16kHz = 1280 bytes）
        chunk_size = 1280
        chunks = [content[i:i + chunk_size] for i in range(0, len(content), chunk_size)]
        if not chunks:
            return TranscribeResponse(text="", success=True)

        text = await ias_service.transcribe(chunks)
        return TranscribeResponse(text=text, success=True)
    except Exception as e:
        logger.error("Transcribe error: %s", e)
        return TranscribeResponse(text="", success=False)
