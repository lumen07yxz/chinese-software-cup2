"""AI PPT 生成 API

优先使用讯飞 AI PPT WebAPI，失败时降级到本地生成（LLM + python-pptx）。
"""

import logging
import os

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from auth import get_current_user
from models import User
from services.ppt_service import ppt_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ppt", tags=["ppt"])


class PPTRequest(BaseModel):
    query: str
    language: str = "cn"
    search: int = 1


class PPTProgressRequest(BaseModel):
    sid: str


@router.post("/create")
async def create_ppt(
    req: PPTRequest,
    current_user: User = Depends(get_current_user),
):
    """发起 PPT 生成任务

    优先走讯飞 API，失败时自动降级到本地生成。
    返回：
      - 讯飞成功：{sid, code}
      - 本地降级：{local: true, taskId, code: 0}
    """
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="PPT 主题不能为空")

    # --- 尝试讯飞 API ---
    if ppt_service.available:
        try:
            result = await ppt_service.create_ppt(
                query=req.query.strip(),
                search=req.search,
            )
            logger.info("讯飞 PPT API 调用成功")
            return result
        except Exception as e:
            logger.warning("讯飞 PPT API 调用失败，降级到本地生成: %s", e)
    else:
        logger.info("讯飞 PPT API 未配置，使用本地生成")

    # --- 降级：本地生成 ---
    try:
        from services.local_ppt_service import create_local_task
        task_id = create_local_task(req.query.strip(), req.language)
        return {"sid": task_id, "code": 0, "local": True, "message": "讯飞服务不可用，使用本地 AI 生成"}
    except Exception as e:
        logger.error("本地 PPT 生成任务创建失败: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"PPT 生成失败: {e}")


@router.get("/progress")
async def query_progress(
    sid: str,
    current_user: User = Depends(get_current_user),
):
    """查询 PPT 生成进度

    支持讯飞 sid 和本地 taskId。
    """
    if not sid:
        raise HTTPException(status_code=400, detail="sid 不能为空")

    # --- 本地任务 ---
    if not sid.startswith("sid_"):
        from services.local_ppt_service import get_local_task
        task = get_local_task(sid)
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        return {
            "code": 0,
            "progress": task["progress"],
            "pptStatus": task["status"],
            "fileUrl": "",
            "local": True,
            "error": task.get("error", ""),
            "_raw": task,
        }

    # --- 讯飞 API ---
    try:
        result = await ppt_service.query_progress(sid)
        return result
    except RuntimeError as e:
        logger.error("PPT 进度查询失败: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/download/{task_id}")
async def download_local_ppt(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """下载本地生成的 PPT 文件"""
    from services.local_ppt_service import get_local_task
    task = get_local_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在或已过期")
    if task["status"] != "done":
        raise HTTPException(status_code=400, detail="文件尚未生成完成")

    filepath = task["file_path"]
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="文件不存在")

    return FileResponse(
        path=filepath,
        filename=f"AI_{task_id}.pptx",
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
    )
