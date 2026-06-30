"""学习旅程 API — 聚合时间线、今日计划、进度概览和统计数据"""

import logging
from fastapi import APIRouter, Depends
from models import User, LearningPath, AssessmentRecord
from auth import get_current_user
from db import async_session
from services.mastery_service import mastery_service
from services.daily_plan_service import daily_plan_service
from sqlalchemy import select, func
from datetime import datetime, timezone, timedelta

router = APIRouter(prefix="/api/learning-journey", tags=["learning-journey"])
logger = logging.getLogger(__name__)


@router.get("/")
async def get_learning_journey(current_user: User = Depends(get_current_user)):
    """聚合学习旅程概览数据"""
    user_id = current_user.username

    # 1) 学习路径进度
    try:
        async with async_session() as session:
            result = await session.execute(
                select(LearningPath)
                .where(LearningPath.user_id == user_id)
                .order_by(LearningPath.updated_at.desc())
            )
            path = result.scalars().first()
    except Exception as e:
        logger.warning("查询学习路径失败: %s", e)
        path = None

    path_data = None
    completed_nodes = []
    progress = 0.0
    current_node = "未设定"
    if path:
        path_data = path.path_data
        completed_nodes = path.completed_nodes or []
        total = len(path_data.get("nodes", [])) if path_data else 1
        progress = len(completed_nodes) / total if total > 0 else 0.0
        for node in (path_data.get("nodes", []) if path_data else []):
            if node.get("id") not in completed_nodes:
                current_node = node.get("title", "未知节点")
                break

    timeline = []
    if path_data:
        for node in path_data.get("nodes", []):
            nid = node.get("id", "")
            timeline.append({
                "id": nid,
                "title": node.get("title", ""),
                "description": node.get("description", "")[:100],
                "difficulty": node.get("difficulty", 0.5),
                "estimated_hours": node.get("estimated_hours", 0),
                "status": "completed" if nid in completed_nodes else "pending",
                "mastery": node.get("mastery", 0),
            })

    # 2) 本周学习统计
    try:
        now = datetime.now(timezone.utc)
        week_start = now - timedelta(days=now.weekday())
        async with async_session() as session:
            result = await session.execute(
                select(
                    func.sum(AssessmentRecord.study_time_minutes).label("minutes"),
                    func.count(AssessmentRecord.id).label("sessions"),
                )
                .where(
                    AssessmentRecord.user_id == user_id,
                    AssessmentRecord.created_at >= week_start,
                )
            )
            week_stats = result.one_or_none()
    except Exception as e:
        logger.warning("查询本周统计失败: %s", e)
        week_stats = None

    week_minutes = int(week_stats.minutes or 0) if week_stats else 0
    week_sessions = int(week_stats.sessions or 0) if week_stats else 0

    # 3) 总览统计
    try:
        async with async_session() as session:
            result = await session.execute(
                select(
                    func.sum(AssessmentRecord.study_time_minutes).label("total_minutes"),
                    func.count(AssessmentRecord.id).label("total_sessions"),
                )
                .where(AssessmentRecord.user_id == user_id)
            )
            total_stats = result.one_or_none()
    except Exception as e:
        logger.warning("查询总统计失败: %s", e)
        total_stats = None

    total_minutes = int(total_stats.total_minutes or 0) if total_stats else 0
    total_sessions = int(total_stats.total_sessions or 0) if total_stats else 0

    # 4) 最近活动
    try:
        async with async_session() as session:
            result = await session.execute(
                select(AssessmentRecord)
                .where(AssessmentRecord.user_id == user_id)
                .order_by(AssessmentRecord.created_at.desc())
                .limit(10)
            )
            recent_records = result.scalars().all()
    except Exception as e:
        logger.warning("查询最近活动失败: %s", e)
        recent_records = []

    recent_activity = []
    for r in recent_records:
        recent_activity.append({
            "type": "study" if r.study_time_minutes > 0 else "quiz",
            "minutes": r.study_time_minutes,
            "date": r.created_at.isoformat() if r.created_at else "",
        })

    # 5) 概念掌握度概览
    try:
        all_mastery = await mastery_service.get_all_mastery(user_id)
    except Exception as e:
        logger.warning("查询掌握度失败: %s", e)
        all_mastery = []

    weak_concepts = [m for m in all_mastery if m.get("mastery_score", 1) < 0.4]
    strong_concepts = [m for m in all_mastery if m.get("mastery_score", 0) >= 0.7]
    avg_mastery = round(
        sum(m.get("mastery_score", 0) for m in all_mastery) / max(len(all_mastery), 1), 2
    )

    # 6) 今日计划（有天级缓存，同一天不重复调 LLM）
    try:
        daily_plan = await daily_plan_service.generate_daily_plan(
            user_id,
            preloaded={
                "weak_names": [w["title"] for w in weak_concepts[:5]],
                "current_node": current_node,
            },
        )
    except Exception as e:
        logger.warning("每日计划生成失败: %s", e)
        daily_plan = {
            "greeting": "继续加油！",
            "today_tasks": [],
            "motivation": "",
        }

    return {
        "path": {
            "progress": round(progress, 2),
            "completed_count": len(completed_nodes),
            "total_count": len(timeline),
            "timeline": timeline,
        },
        "mastery": {
            "avg_mastery": avg_mastery,
            "weak_count": len(weak_concepts),
            "strong_count": len(strong_concepts),
            "weak_concepts": weak_concepts[:5],
            "strong_concepts": strong_concepts[:5],
        },
        "stats": {
            "total_minutes": total_minutes,
            "total_sessions": total_sessions,
            "week_minutes": week_minutes,
            "week_sessions": week_sessions,
            "recent_activity": recent_activity,
        },
        "daily_plan": daily_plan,
    }
