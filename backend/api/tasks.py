"""后台任务追踪 API"""

from fastapi import APIRouter, Depends
from models import User
from auth import get_current_user
from services.task_tracker import task_tracker

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("/")
async def get_active_tasks(current_user: User = Depends(get_current_user)):
    """获取当前用户的活跃任务列表"""
    tasks = task_tracker.get_active_tasks(user_id=current_user.username)
    return {"tasks": tasks, "total": len(tasks)}


@router.get("/all")
async def get_all_tasks(current_user: User = Depends(get_current_user)):
    """获取当前用户的所有任务（含已完成）"""
    tasks = task_tracker.get_all_tasks(user_id=current_user.username)
    return {"tasks": tasks, "total": len(tasks)}
