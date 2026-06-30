"""概念掌握度追踪引擎 (Mastery Engine)

精确的数学算法追踪每个概念的掌握度，替代 LLM 的模糊估算。

核心算法：
- 正确回答: mastery = min(1.0, mastery + 0.15 * (1 - mastery))
- 错误回答: mastery = max(0.0, mastery - 0.20 * mastery)
- 遗忘衰减: mastery *= (1 - forgetting_factor * elapsed_days)
- 置信度: 基于评估次数，评估越多置信度越高
"""

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from db import async_session
from models import ConceptMastery
from concept_ontology import (
    CONCEPTS,
    get_prerequisites,
    get_direct_prerequisites,
    match_concept_from_text,
)

logger = logging.getLogger(__name__)


class MasteryService:
    """概念掌握度追踪服务"""

    # 算法参数
    CORRECT_GAIN = 0.15       # 正确回答的增长系数
    WRONG_PENALTY = 0.20      # 错误回答的衰减系数
    MIN_FORGETTING = 0.02     # 最小遗忘系数
    DEFAULT_FORGETTING = 0.10 # 默认遗忘系数
    MAX_FORGETTING = 0.30     # 最大遗忘系数（高频遗忘概念）

    async def get_all_mastery(self, user_id: str) -> list[dict]:
        """获取用户所有概念的掌握度"""
        async with async_session() as session:
            result = await session.execute(
                select(ConceptMastery).where(ConceptMastery.user_id == user_id)
            )
            records = result.scalars().all()

        mastery_map = {r.concept_id: r for r in records}
        output = []
        for cid, concept in CONCEPTS.items():
            record = mastery_map.get(cid)
            output.append({
                "concept_id": cid,
                "title": concept["title"],
                "chapter": concept["chapter"],
                "difficulty": concept["difficulty"],
                "mastery_score": round(record.mastery_score, 2) if record else 0.0,
                "confidence": round(record.confidence, 2) if record else 0.0,
                "assessment_count": record.assessment_count if record else 0,
                "prerequisites": concept["prerequisites"],
            })
        return output

    async def get_mastery_by_chapter(self, user_id: str, chapter: str) -> list[dict]:
        """获取某章节的概念掌握度"""
        all_mastery = await self.get_all_mastery(user_id)
        return [m for m in all_mastery if m["chapter"] == chapter]

    async def get_weak_concepts(
        self, user_id: str, threshold: float = 0.4
    ) -> list[dict]:
        """获取薄弱概念（掌握度低于阈值）"""
        all_mastery = await self.get_all_mastery(user_id)
        weak = [m for m in all_mastery if m["mastery_score"] < threshold]
        weak.sort(key=lambda x: x["mastery_score"])
        return weak

    async def get_concept_mastery(self, user_id: str, concept_id: str) -> dict | None:
        """获取单个概念的掌握度"""
        all_mastery = await self.get_all_mastery(user_id)
        for m in all_mastery:
            if m["concept_id"] == concept_id:
                return m
        return None

    async def update_mastery(
        self,
        user_id: str,
        concept_id: str,
        outcome: str,  # 'correct' | 'wrong' | 'partial' | 'reviewed'
        quality: float = 0.5,
    ) -> dict:
        """基于交互结果更新掌握度。

        Args:
            user_id: 用户 ID
            concept_id: 概念 ID
            outcome: 结果 ('correct' / 'wrong' / 'partial' / 'reviewed')
            quality: 回答质量 0-1（仅对 correct 细分使用）

        Returns:
            更新后的掌握度状态
        """
        async with async_session() as session:
            result = await session.execute(
                select(ConceptMastery).where(
                    ConceptMastery.user_id == user_id,
                    ConceptMastery.concept_id == concept_id,
                )
            )
            record = result.scalar_one_or_none()

            if not record:
                record = ConceptMastery(
                    user_id=user_id,
                    concept_id=concept_id,
                    mastery_score=0.0,
                    confidence=0.0,
                    assessment_count=0,
                    forgetting_factor=self.DEFAULT_FORGETTING,
                )
                session.add(record)

            # 先应用遗忘衰减
            now = datetime.now(timezone.utc)
            if record.last_assessed_at:
                elapsed = (now - record.last_assessed_at).total_seconds() / 86400.0
                if elapsed > 1:  # 超过 1 天才开始衰减
                    record.mastery_score *= max(
                        0.0, 1.0 - record.forgetting_factor * elapsed
                    )

            # 基于结果更新
            if outcome == "correct":
                gain = self.CORRECT_GAIN * quality
                record.mastery_score = min(1.0, record.mastery_score + gain * (1.0 - record.mastery_score))
                # 降低遗忘系数（掌握更牢）
                record.forgetting_factor = max(
                    self.MIN_FORGETTING,
                    record.forgetting_factor * 0.9,
                )
            elif outcome == "wrong":
                record.mastery_score = max(0.0, record.mastery_score - self.WRONG_PENALTY * record.mastery_score)
                # 提高遗忘系数（需要更频繁复习）
                record.forgetting_factor = min(
                    self.MAX_FORGETTING,
                    record.forgetting_factor * 1.2,
                )
            elif outcome == "partial":
                gain = self.CORRECT_GAIN * 0.5 * quality
                record.mastery_score = min(1.0, record.mastery_score + gain * (1.0 - record.mastery_score))
            elif outcome == "reviewed":
                # 复习：小幅度提升
                record.mastery_score = min(1.0, record.mastery_score + 0.05 * (1.0 - record.mastery_score))

            record.mastery_score = round(record.mastery_score, 4)
            record.assessment_count += 1
            record.confidence = min(1.0, 0.3 + record.assessment_count * 0.05)
            record.last_assessed_at = now

            await session.commit()
            await session.refresh(record)

        concept = CONCEPTS.get(concept_id, {})
        return {
            "concept_id": concept_id,
            "title": concept.get("title", concept_id),
            "mastery_score": round(record.mastery_score, 2),
            "confidence": round(record.confidence, 2),
            "assessment_count": record.assessment_count,
            "outcome": outcome,
        }

    async def diagnose_from_quiz(
        self,
        user_id: str,
        quiz_results: list[dict],
    ) -> list[dict]:
        """从测验结果批量诊断并更新掌握度。

        Args:
            quiz_results: [{
                "concept_id": "...",
                "outcome": "correct" | "wrong",
                "quality": 0.5,
            }, ...]

        Returns:
            更新后的薄弱概念列表
        """
        for qr in quiz_results:
            concept_id = qr.get("concept_id", "")
            if not concept_id:
                # 尝试从问题文本匹配概念
                question = qr.get("question", "")
                concept_id = match_concept_from_text(question) or ""
            if concept_id:
                await self.update_mastery(
                    user_id=user_id,
                    concept_id=concept_id,
                    outcome=qr.get("outcome", "wrong"),
                    quality=qr.get("quality", 0.5),
                )

        return await self.get_weak_concepts(user_id)

    async def check_prerequisites(
        self, user_id: str, concept_id: str, threshold: float = 0.4
    ) -> dict:
        """Gatekeeper：检查前置概念掌握度是否足够。

        Returns:
            {can_proceed: bool, blocking_concepts: [...], suggested_minilesson: bool}
        """
        prereqs = get_direct_prerequisites(concept_id)
        if not prereqs:
            return {"can_proceed": True, "blocking_concepts": [], "suggested_minilesson": False}

        all_mastery = await self.get_all_mastery(user_id)
        mastery_map = {m["concept_id"]: m["mastery_score"] for m in all_mastery}

        blocking = []
        for pre_id in prereqs:
            score = mastery_map.get(pre_id, 0.0)
            if score < threshold:
                concept = CONCEPTS.get(pre_id, {})
                blocking.append({
                    "concept_id": pre_id,
                    "title": concept.get("title", pre_id),
                    "mastery_score": score,
                    "required": threshold,
                })

        return {
            "can_proceed": len(blocking) == 0,
            "blocking_concepts": blocking,
            "suggested_minilesson": len(blocking) > 0,
        }

    async def get_chapter_readiness(self, user_id: str, chapter: str) -> dict:
        """检查某章节的整体准备度（所有概念的前置满足情况）"""
        concepts_in_chapter = [
            cid for cid, c in CONCEPTS.items() if c["chapter"] == chapter
        ]

        all_prereqs_met = True
        details = []
        for cid in concepts_in_chapter:
            check = await self.check_prerequisites(user_id, cid)
            if not check["can_proceed"]:
                all_prereqs_met = False
            details.append({
                "concept_id": cid,
                "title": CONCEPTS[cid]["title"],
                "can_proceed": check["can_proceed"],
                "blocking": check["blocking_concepts"],
            })

        return {
            "chapter": chapter,
            "ready": all_prereqs_met,
            "concepts": details,
        }


# 单例
mastery_service = MasteryService()
