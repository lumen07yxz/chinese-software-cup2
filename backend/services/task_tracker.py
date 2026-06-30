"""后台任务追踪器 — 资源生成/路径生成/PPT 等长任务的状态管理

轻量级内存实现，不依赖外部存储。API 通过 GET /api/tasks/ 查询任务状态。
"""

import time
import uuid
import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


class TaskTracker:
    """内存任务状态追踪器"""

    def __init__(self):
        self._tasks: dict[str, dict] = {}
        self._max_age_seconds = 3600  # 1 小时后自动清理

    def create(self, kind: str, label: str, user_id: str = "", metadata: dict | None = None) -> str:
        """创建一个新任务，返回 task_id"""
        task_id = uuid.uuid4().hex[:10]
        self._tasks[task_id] = {
            "id": task_id,
            "kind": kind,
            "label": label,
            "user_id": user_id,
            "status": "running",
            "progress": 0,
            "message": "",
            "metadata": metadata or {},
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        logger.info("任务创建: %s [%s] %s", task_id, kind, label)
        self._cleanup()
        return task_id

    def update(self, task_id: str, status: str | None = None, progress: int | None = None,
               message: str | None = None):
        """更新任务状态"""
        task = self._tasks.get(task_id)
        if not task:
            return
        if status:
            task["status"] = status
        if progress is not None:
            task["progress"] = progress
        if message is not None:
            task["message"] = message
        task["updated_at"] = datetime.now(timezone.utc).isoformat()

    def complete(self, task_id: str, message: str = "完成"):
        """标记任务完成"""
        self.update(task_id, status="done", progress=100, message=message)

    def error(self, task_id: str, error_message: str = "出错"):
        """标记任务失败"""
        self.update(task_id, status="error", message=error_message)

    def get(self, task_id: str) -> dict | None:
        """获取单个任务状态"""
        return self._tasks.get(task_id)

    def get_active_tasks(self, user_id: str = "") -> list[dict]:
        """获取所有活跃任务（或指定用户的活跃任务）"""
        self._cleanup()
        if user_id:
            return [
                t for t in self._tasks.values()
                if t["status"] in ("running", "error") and t.get("user_id") == user_id
            ]
        return [t for t in self._tasks.values() if t["status"] in ("running", "error")]

    def get_all_tasks(self, user_id: str = "") -> list[dict]:
        """获取所有任务（含已完成）"""
        self._cleanup()
        if user_id:
            return [t for t in self._tasks.values() if t.get("user_id") == user_id]
        return list(self._tasks.values())

    def _cleanup(self):
        """清理过期任务"""
        now = time.time()
        expired = [
            tid for tid, t in self._tasks.items()
            if t["status"] == "done" and
            (now - datetime.fromisoformat(t["updated_at"]).timestamp()) > self._max_age_seconds
        ]
        for tid in expired:
            del self._tasks[tid]


# 单例
task_tracker = TaskTracker()
