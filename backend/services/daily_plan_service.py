"""每日学习计划自动生成服务

综合多数据源生成个性化每日学习计划：
- 学习路径位置 → 确定今天该学哪个节点
- 概念掌握度 → 确定什么需要复习
- 遗忘曲线（SM-2） → 确定复习优先级
- 画像可用时间 → 确定学习量

加载策略：首次请求返回规则引擎计划（<200ms），后台静默调 LLM 生成个性化计划，
下次请求时命中缓存直接返回 LLM 结果。
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from db import async_session
from models import LearningPath, AssessmentRecord, StudentProfile
from services.mastery_service import mastery_service
from services.spark_service import spark_service
from prompts import DAILY_PLAN_SYSTEM, DAILY_PLAN_PROMPT

logger = logging.getLogger(__name__)


class DailyPlanService:
    """每日学习计划生成服务"""

    def __init__(self):
        # 天级内存缓存：{(user_id, date_str): plan_dict}
        self._cache: dict[tuple[str, str], dict] = {}
        # 正在后台生成中的 task，防止重复触发
        self._pending: set[str] = set()

    async def generate_daily_plan(
        self,
        user_id: str,
        available_minutes: int | None = None,
        *,
        preloaded: dict | None = None,
    ) -> dict:
        """生成今日学习计划 — 快速返回，后台静默升级。

        首次请求：返回规则引擎计划（毫秒级），同时在后台调 LLM 生成个性化计划并缓存。
        同一天再次请求：直接返回缓存中的 LLM 计划。
        """
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        cache_key = (user_id, today_str)

        # 命中缓存 → 直接返回
        if cache_key in self._cache:
            return self._cache[cache_key]

        # 没有缓存 → 先用规则引擎生成，立即返回
        preloaded = preloaded or {}
        rule_plan = await self._build_rule_plan(user_id, available_minutes, preloaded)
        rule_plan["generated_at"] = datetime.now(timezone.utc).isoformat()
        rule_plan["available_minutes"] = rule_plan.get("available_minutes", 45)
        self._cache[cache_key] = rule_plan

        # 后台静默调 LLM 升级计划（不阻塞当前请求）
        if user_id not in self._pending:
            asyncio.create_task(self._bg_llm_upgrade(user_id, cache_key, preloaded))

        return rule_plan

    async def _bg_llm_upgrade(self, user_id: str, cache_key: tuple, preloaded: dict):
        """后台任务：调 LLM 生成个性化计划并更新缓存"""
        self._pending.add(user_id)
        try:
            llm_plan = await self._generate_with_llm(user_id, preloaded)
            if llm_plan:
                llm_plan["generated_at"] = datetime.now(timezone.utc).isoformat()
                self._cache[cache_key] = llm_plan
                logger.info("LLM 每日计划已缓存 user=%s", user_id)
        except Exception as e:
            logger.warning("后台 LLM 每日计划生成失败: %s", e)
        finally:
            self._pending.discard(user_id)

    async def _build_rule_plan(
        self, user_id: str, available_minutes: int | None, preloaded: dict
    ) -> dict:
        """用规则引擎生成计划（毫秒级，无 LLM 调用）"""

        # 画像
        profile_dict: dict[str, Any] = preloaded.get("profile_dict")
        if profile_dict is None:
            try:
                async with async_session() as session:
                    result = await session.execute(
                        select(StudentProfile).where(StudentProfile.user_id == user_id)
                    )
                    profile = result.scalar_one_or_none()
                if profile:
                    profile_dict = {
                        "knowledge_base": profile.knowledge_base,
                        "cognitive_style": profile.cognitive_style,
                        "weak_points": profile.weak_points,
                        "learning_goal": profile.learning_goal,
                        "available_time": profile.available_time,
                        "interests": profile.interests,
                    }
            except Exception:
                profile_dict = {}
        profile_dict = profile_dict or {}

        # 可用时间
        if available_minutes is None:
            available_minutes = self._parse_minutes(profile_dict.get("available_time", ""))
        available_minutes = max(15, min(available_minutes or 45, 240))

        # 薄弱概念
        weak_names = preloaded.get("weak_names")
        if weak_names is None:
            try:
                weak_concepts = await mastery_service.get_weak_concepts(user_id, 0.4)
                weak_names = [w["title"] for w in weak_concepts[:5]]
            except Exception:
                weak_names = []

        # 当前节点
        current_node = preloaded.get("current_node", "未设定")
        if current_node == "未设定":
            try:
                async with async_session() as session:
                    result = await session.execute(
                        select(LearningPath).where(LearningPath.user_id == user_id)
                        .order_by(LearningPath.updated_at.desc())
                    )
                    path = result.scalars().first()
                if path and path.path_data:
                    nodes = path.path_data.get("nodes", [])
                    completed = set(path.completed_nodes or [])
                    for node in nodes:
                        if node.get("id") not in completed:
                            current_node = node.get("title", "未知节点")
                            break
            except Exception:
                pass

        return self._rule_based_plan(available_minutes, weak_names, current_node)

    async def _generate_with_llm(self, user_id: str, preloaded: dict) -> dict | None:
        """调 LLM 生成个性化计划（耗时 3-10 秒，仅后台调用）"""
        profile_dict: dict[str, Any] = preloaded.get("profile_dict")
        if profile_dict is None:
            try:
                async with async_session() as session:
                    result = await session.execute(
                        select(StudentProfile).where(StudentProfile.user_id == user_id)
                    )
                    profile = result.scalar_one_or_none()
                if profile:
                    profile_dict = {
                        "learning_goal": profile.learning_goal,
                        "cognitive_style": profile.cognitive_style,
                    }
            except Exception:
                profile_dict = {}
        profile_dict = profile_dict or {}

        weak_names = preloaded.get("weak_names", [])
        current_node = preloaded.get("current_node", "未设定")
        available_minutes = self._parse_minutes(profile_dict.get("available_time", ""))
        available_minutes = max(15, min(available_minutes, 240))

        try:
            prompt = DAILY_PLAN_PROMPT.format(
                goal=profile_dict.get("learning_goal", "") or "未指定",
                available_time=available_minutes,
                weak_concepts=json.dumps(weak_names, ensure_ascii=False),
                due_flashcards=0,
                current_node=current_node,
                cognitive_style=profile_dict.get("cognitive_style", "") or "未指定",
            )
            raw = await spark_service.chat(
                messages=[
                    {"role": "system", "content": DAILY_PLAN_SYSTEM},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.7,
                max_tokens=1024,
            )
            plan = self._parse_json_from_llm(raw)
            plan["available_minutes"] = available_minutes
            return plan
        except Exception as e:
            logger.warning("LLM 每日计划生成失败: %s", e)
            return None

    def _rule_based_plan(
        self,
        available_minutes: int,
        weak_names: list[str],
        current_node: str,
    ) -> dict:
        """规则引擎生成每日计划（毫秒级）"""
        tasks = []

        review_time = max(5, int(available_minutes * 0.2))
        if weak_names:
            tasks.append({
                "type": "review",
                "title": f"复习薄弱概念：{weak_names[0]}",
                "estimated_minutes": min(review_time, 10),
                "reason": f"掌握度较低，需要巩固（{', '.join(weak_names[:2])}）",
            })

        learn_time = max(10, int(available_minutes * 0.5))
        if current_node != "未设定":
            tasks.append({
                "type": "learn",
                "title": f"学习：{current_node}",
                "estimated_minutes": learn_time,
                "reason": "按照学习路径，这是下一个推荐节点",
            })

        practice_time = max(5, int(available_minutes * 0.2))
        tasks.append({
            "type": "practice",
            "title": "完成 3-5 道相关练习题",
            "estimated_minutes": practice_time,
            "reason": "通过练习巩固所学知识",
        })

        tasks.append({
            "type": "reflect",
            "title": "用自己的话总结今天学到的概念",
            "estimated_minutes": max(3, int(available_minutes * 0.1)),
            "reason": "费曼学习法：输出是最好的输入",
        })

        hour = datetime.now(timezone.utc).hour + 8  # UTC+8
        if hour < 12:
            greeting = "早上好！新的一天，新的知识等着你 🙌"
        elif hour < 18:
            greeting = "下午好！午后的时光最适合深度学习 🎯"
        else:
            greeting = "晚上好！安静的夜晚是思考的好时光 🌙"

        return {
            "greeting": greeting,
            "today_tasks": tasks,
            "yesterday_summary": "",
            "motivation": "每天进步一点点，坚持就会带来改变 💪",
            "available_minutes": available_minutes,
        }

    async def _get_yesterday_summary(self, user_id: str) -> str:
        """获取昨日学习简要总结"""
        try:
            from datetime import timedelta
            yesterday = datetime.now(timezone.utc) - timedelta(days=1)
            async with async_session() as session:
                result = await session.execute(
                    select(AssessmentRecord)
                    .where(AssessmentRecord.user_id == user_id)
                    .order_by(AssessmentRecord.created_at.desc())
                    .limit(5)
                )
                records = result.scalars().all()
            yesterday_records = [
                r for r in records
                if r.created_at and r.created_at.date() == yesterday.date()
            ]
            if not yesterday_records:
                return ""
            total_minutes = sum(r.study_time_minutes for r in yesterday_records)
            total_interactions = sum(r.resource_interactions for r in yesterday_records)
            return f"昨日学习 {total_minutes} 分钟，{total_interactions} 次互动"
        except Exception:
            return ""

    @staticmethod
    def _parse_minutes(available_time: str) -> int:
        """从画像 available_time 字符串估算每日可用分钟数"""
        import re
        if not available_time:
            return 45
        text = available_time.strip()
        nums = re.findall(r'(\d+(?:\.\d+)?)', text)
        if not nums:
            return 45
        num = float(nums[0])
        if '周' in text:
            return round(num / 7 * 60)
        elif '月' in text:
            return round(num / 30 * 60)
        elif '小时' in text or 'h' in text.lower():
            return round(num * 60)
        elif '分钟' in text:
            return round(num)
        else:
            return round(num * 60)

    @staticmethod
    def _parse_json_from_llm(raw: str) -> dict:
        """从 LLM 输出中提取 JSON 对象"""
        import re
        raw = raw.strip()
        m = re.search(r'```(?:json)?\s*\n([\s\S]*?)```', raw)
        if m:
            raw = m.group(1).strip()
        elif raw.startswith("```"):
            lines = raw.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            raw = "\n".join(lines).strip()
        start = raw.find("{")
        end = raw.rfind("}")
        if start != -1 and end != -1:
            try:
                return json.loads(raw[start:end + 1])
            except json.JSONDecodeError:
                pass
        logger.warning("无法解析 LLM 计划 JSON")
        return {
            "greeting": "今天也是充满可能的一天！",
            "today_tasks": [
                {"type": "learn", "title": "继续学习", "estimated_minutes": 30, "reason": "按照学习路径推进"},
                {"type": "practice", "title": "做几道练习题", "estimated_minutes": 15, "reason": "巩固知识"},
            ],
            "yesterday_summary": "",
            "motivation": "日拱一卒，功不唐捐 💪",
        }


# 单例
daily_plan_service = DailyPlanService()
