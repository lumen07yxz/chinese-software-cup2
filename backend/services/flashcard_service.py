"""概念闪卡生成与间隔复习服务

每节课后 AI 自动生成概念闪卡，加入 SM-2 间隔复习队列。
"""

import json
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from db import async_session
from models import User
from services.spark_service import spark_service
from prompts import FLASHCARD_GENERATION_PROMPT

logger = logging.getLogger(__name__)


class FlashcardService:
    """概念闪卡 + SM-2 间隔复习服务"""

    # SM-2 算法参数
    MIN_EASE_FACTOR = 1.3
    INITIAL_EASE = 2.5
    INTERVAL_MODIFIER = 1.0

    @staticmethod
    def _utcnow():
        return datetime.now(timezone.utc)

    async def generate_flashcards(
        self,
        user_id: str,
        topic: str,
        content: str,
        count: int = 5,
    ) -> list[dict]:
        """从学习内容中提取核心概念生成 Q&A 闪卡。

        Args:
            user_id: 用户 ID
            topic: 主题
            content: 学习内容文本
            count: 生成闪卡数量

        Returns:
            [{card_id, front, back, concept_id}, ...]
        """
        prompt = FLASHCARD_GENERATION_PROMPT.format(content=content, count=count)

        try:
            raw = await spark_service.chat(
                messages=[
                    {"role": "system", "content": "你是一个知识卡片生成专家，严格输出 JSON 数组。"},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.5,
                max_tokens=2048,
            )
            cards_data = self._parse_json_from_llm(raw)
        except Exception as e:
            logger.warning("闪卡 LLM 生成失败: %s", e)
            return []

        if not isinstance(cards_data, list):
            return []

        # 写入 DB
        created_cards = []
        from models import Flashcard  # type: ignore[attr-defined]

        async with async_session() as session:
            for card in cards_data:
                if not isinstance(card, dict):
                    continue
                front = card.get("front", "")
                back = card.get("back", "")
                concept_id = card.get("concept_id", "")

                fc = Flashcard(
                    user_id=user_id,
                    concept_id=concept_id,
                    front=front,
                    back=back,
                    source_type="auto_generated",
                    topic=topic,
                    ease_factor=self.INITIAL_EASE,
                    interval_days=1,
                    next_review_at=self._utcnow(),
                    review_count=0,
                )
                session.add(fc)
                await session.flush()
                created_cards.append({
                    "card_id": fc.id,
                    "front": front,
                    "back": back,
                    "concept_id": concept_id,
                })

            await session.commit()

        return created_cards

    async def get_all_cards(self, user_id: str) -> list[dict]:
        """获取用户所有已保存的闪卡"""
        from models import Flashcard  # type: ignore[attr-defined]

        async with async_session() as session:
            result = await session.execute(
                select(Flashcard)
                .where(Flashcard.user_id == user_id)
                .order_by(Flashcard.created_at.desc())
            )
            cards = result.scalars().all()

        now = self._utcnow()
        return [
            {
                "card_id": c.id,
                "front": c.front,
                "back": c.back,
                "concept_id": c.concept_id,
                "topic": c.topic,
                "ease_factor": c.ease_factor,
                "interval_days": c.interval_days,
                "review_count": c.review_count,
                "next_review_at": c.next_review_at.isoformat() if c.next_review_at else "",
                "is_due": bool(c.next_review_at and c.next_review_at.replace(tzinfo=timezone.utc) <= now),
            }
            for c in cards
        ]

    async def get_due_reviews(self, user_id: str) -> list[dict]:
        """获取到期复习的闪卡列表"""
        from models import Flashcard  # type: ignore[attr-defined]

        now = self._utcnow()
        async with async_session() as session:
            result = await session.execute(
                select(Flashcard)
                .where(Flashcard.user_id == user_id)
                .order_by(Flashcard.next_review_at)
                .limit(30)
            )
            cards = result.scalars().all()

        # 过滤到期的（处理时区：SQLite 存的是 naive datetime，统一补 UTC）
        due = [
            c for c in cards
            if c.next_review_at and c.next_review_at.replace(tzinfo=timezone.utc) <= now
        ]

        return [
            {
                "card_id": c.id,
                "front": c.front,
                "back": c.back,
                "concept_id": c.concept_id,
                "ease_factor": c.ease_factor,
                "interval_days": c.interval_days,
                "review_count": c.review_count,
            }
            for c in due
        ]

    async def review_card(self, user_id: str, card_id: int, quality: int) -> dict:
        """SM-2 算法：提交复习结果并更新间隔。

        Args:
            user_id: 用户 ID
            card_id: 闪卡 ID
            quality: 自评质量 0-5
              0 - 完全忘了
              1 - 有印象但错误
              2 - 略有印象
              3 - 模糊但正确
              4 - 记得，有些犹豫
              5 - 完美回忆
        """
        from models import Flashcard  # type: ignore[attr-defined]

        async with async_session() as session:
            result = await session.execute(
                select(Flashcard).where(
                    Flashcard.id == card_id,
                    Flashcard.user_id == user_id,
                )
            )
            card = result.scalar_one_or_none()
            if not card:
                return {"error": "Flashcard not found"}

            # SM-2 算法核心
            if quality < 3:
                # 遗忘：重置间隔
                card.interval_days = 1
                card.review_count = 0
            else:
                # 记忆：计算新间隔
                if card.review_count == 0:
                    card.interval_days = 1
                elif card.review_count == 1:
                    card.interval_days = 6
                else:
                    card.interval_days = round(card.interval_days * card.ease_factor)

                card.review_count += 1

            # 更新 ease_factor
            card.ease_factor = max(
                self.MIN_EASE_FACTOR,
                card.ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
            )

            # 下一个复习日期
            from datetime import timedelta
            card.next_review_at = self._utcnow() + timedelta(days=max(1, card.interval_days))

            await session.commit()

        return {
            "card_id": card_id,
            "next_interval": card.interval_days,
            "ease_factor": round(card.ease_factor, 2),
            "next_review_at": card.next_review_at.isoformat() if card.next_review_at else "",
        }

    async def get_stats(self, user_id: str) -> dict:
        """获取复习统计"""
        from models import Flashcard  # type: ignore[attr-defined]

        async with async_session() as session:
            result = await session.execute(
                select(Flashcard).where(Flashcard.user_id == user_id)
            )
            cards = result.scalars().all()

        total = len(cards)
        now = self._utcnow()
        due = sum(1 for c in cards if c.next_review_at and c.next_review_at.replace(tzinfo=timezone.utc) <= now)
        avg_ease = sum(c.ease_factor for c in cards) / max(total, 1)
        total_reviews = sum(c.review_count for c in cards)

        return {
            "total_cards": total,
            "due_reviews": due,
            "avg_ease_factor": round(avg_ease, 2),
            "total_reviews": total_reviews,
            "estimated_minutes": round(due * 0.5, 1),  # 30 秒/张
        }

    @staticmethod
    def _parse_json_from_llm(raw: str) -> list | dict | None:
        """从 LLM 输出中提取 JSON"""
        import re
        raw = raw.strip()

        m = re.search(r'```(?:json)?\s*\n([\s\S]*?)```', raw)
        if m:
            raw = m.group(1).strip()
        elif raw.startswith("```"):
            lines = raw.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            raw = "\n".join(lines).strip()

        # 找到第一个 JSON 边界
        start = raw.find("[")
        if start == -1:
            start = raw.find("{")
        end = max(raw.rfind("]"), raw.rfind("}"))
        if start != -1 and end != -1:
            try:
                return json.loads(raw[start:end + 1])
            except json.JSONDecodeError:
                pass

        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return None


# 单例
flashcard_service = FlashcardService()
