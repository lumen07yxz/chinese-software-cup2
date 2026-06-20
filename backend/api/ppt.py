"""AI PPT 生成 API —— 基于讯飞 AI PPT WebAPI"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user
from models import User
from services.ppt_service import ppt_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ppt", tags=["ppt"])


class PPTRequest(BaseModel):
    query: str           # PPT 主题描述
    file_prefix: str = "智学PPT"
    is_card: int = 0     # 是否生成卡片
    language: str = "cn" # cn / en
    search: int = 1      # 是否联网搜索
    author: str = "智学AI"


@router.post("/create")
async def create_ppt(
    req: PPTRequest,
    current_user: User = Depends(get_current_user),
):
    """发起 PPT 生成任务，返回 sid（供前端轮询进度）"""
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="PPT 主题不能为空")
    if not ppt_service.available:
        raise HTTPException(status_code=503, detail="PPT 服务未配置，请联系管理员设置 PPT_APP_ID/PPT_API_SECRET")

    try:
        result = await ppt_service.create_ppt(
            query=req.query.strip(),
            file_prefix=req.file_prefix,
            is_card=req.is_card,
            language=req.language,
            search=req.search,
            author=req.author,
        )
        return result
    except RuntimeError as e:
        logger.error("PPT 生成失败: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/progress")
async def query_progress(
    sid: str,
    current_user: User = Depends(get_current_user),
):
    """查询 PPT 生成进度"""
    if not sid:
        raise HTTPException(status_code=400, detail="sid 不能为空")
    try:
        result = await ppt_service.query_progress(sid)
        return result
    except RuntimeError as e:
        logger.error("PPT 进度查询失败: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate")
async def generate_and_wait(
    req: PPTRequest,
    current_user: User = Depends(get_current_user),
):
    """一步生成 PPT（后端轮询直到完成，返回 fileUrl）"""
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="PPT 主题不能为空")
    if not ppt_service.available:
        raise HTTPException(status_code=503, detail="PPT 服务未配置")

    try:
        result = await ppt_service.generate_and_wait(
            query=req.query.strip(),
            file_prefix=req.file_prefix,
            is_card=req.is_card,
            language=req.language,
            search=req.search,
            author=req.author,
        )
        return result
    except RuntimeError as e:
        logger.error("PPT 一步生成失败: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
