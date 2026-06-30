"""诊断性错误分析服务

批改不仅告诉对错，而是诊断错误类型并给出针对性补救策略。
"""

import json
import logging
from typing import Any

from services.spark_service import spark_service
from prompts import DIAGNOSTIC_SYSTEM, DIAGNOSTIC_PROMPT

logger = logging.getLogger(__name__)


class DiagnosticService:
    """错误诊断服务"""

    ERROR_TYPES = {
        "concept_confusion": {
            "label": "概念混淆",
            "description": "选了相近但错误的概念",
            "strategy": "对比讲解两个概念的关键区别，帮助建立清晰的边界",
        },
        "knowledge_gap": {
            "label": "知识遗漏",
            "description": "没学过或遗忘了这个概念",
            "strategy": "回溯到前置知识点，从基础重新建立理解，再回到当前概念",
        },
        "careless_mistake": {
            "label": "粗心失误",
            "description": "其他都对，就这题错",
            "strategy": "轻松提醒，指出具体的粗心点，鼓励学生在关键步骤稍作停顿检查",
        },
        "reasoning_bias": {
            "label": "推理偏差",
            "description": "思路方向对但细节错",
            "strategy": "先肯定正确的思路方向，再引导式追问让学生自己发现细节错误",
        },
    }

    async def diagnose(
        self,
        question: str,
        correct_answer: str,
        student_answer: str,
        concept: str = "",
    ) -> dict:
        """诊断错误类型并生成补救策略。

        Returns:
            {error_type, confidence, analysis, remediation_plan, followup_question,
             error_label, error_description}
        """
        # 先尝试规则诊断
        rule_diagnosis = self._rule_diagnose(
            question, correct_answer, student_answer
        )
        if rule_diagnosis.get("confidence", 0) >= 0.7:
            return {
                **rule_diagnosis,
                "method": "rule",
            }

        # LLM 增强诊断
        try:
            llm_diag = await self._llm_diagnose(
                question=question,
                correct_answer=correct_answer,
                student_answer=student_answer,
                concept=concept,
            )
            error_type = llm_diag.get("error_type", "knowledge_gap")
            return {
                "error_type": error_type,
                "error_label": self.ERROR_TYPES.get(error_type, {}).get("label", "未知"),
                "error_description": self.ERROR_TYPES.get(error_type, {}).get("description", ""),
                "confidence": llm_diag.get("confidence", 0.5),
                "analysis": llm_diag.get("analysis", ""),
                "remediation_plan": llm_diag.get("remediation_plan", ""),
                "followup_question": llm_diag.get("followup_question", ""),
                "method": "llm",
            }
        except Exception as e:
            logger.warning("LLM 错误诊断失败，使用规则兜底: %s", e)
            return {
                **rule_diagnosis,
                "method": "rule_fallback",
            }

    def _rule_diagnose(
        self,
        question: str,
        correct_answer: str,
        student_answer: str,
    ) -> dict:
        """基于规则的快速错误诊断"""
        ca_lower = correct_answer.strip().lower()
        sa_lower = student_answer.strip().lower()

        # 1) 完全一致 → 不应诊断（调用方应先判断是否正确）
        if ca_lower == sa_lower:
            return {
                "error_type": "careless_mistake",
                "error_label": "粗心失误",
                "confidence": 0.3,
                "analysis": "答案似乎正确",
                "remediation_plan": "",
                "followup_question": "",
            }

        # 2) 关键词部分匹配 → 概念混淆
        ca_keywords = set(ca_lower.split()[:5])
        sa_keywords = set(sa_lower.split()[:5])
        overlap = len(ca_keywords & sa_keywords)
        if overlap > 0 and len(student_answer) < 10:
            return {
                "error_type": "concept_confusion",
                "error_label": "概念混淆",
                "error_description": "选了相近但错误的概念",
                "confidence": 0.5,
                "analysis": f"学生的回答包含部分正确关键词({overlap}个)，但整体错误。可能是概念混淆。",
                "remediation_plan": "对比分析这两个易混淆概念的关键区别",
                "followup_question": f"你认为 '{student_answer[:30]}' 和正确答案之间最本质的区别是什么？",
            }

        # 3) 回答为空或非常短 → 知识遗漏
        if len(sa_lower) < 5:
            return {
                "error_type": "knowledge_gap",
                "error_label": "知识遗漏",
                "error_description": "没学过或遗忘了这个概念",
                "confidence": 0.6,
                "analysis": "学生回答过于简短或无实质内容，可能缺乏相关知识。",
                "remediation_plan": "从基础概念重新讲解，确保理解前置知识",
                "followup_question": f"你需要我先解释一下 {correct_answer[:30]} 的基本概念吗？",
            }

        # 4) 长回答但错误 → 推理偏差
        if len(sa_lower) > 20:
            return {
                "error_type": "reasoning_bias",
                "error_label": "推理偏差",
                "error_description": "思路方向对但细节错",
                "confidence": 0.5,
                "analysis": "学生给出了较详细的回答但结果不对，可能是推理过程中某一步出现偏差。",
                "remediation_plan": "先肯定思路，再指出具体偏差点",
                "followup_question": f"你的思路方向有一定道理，但能否重新检查一下关键步骤？",
            }

        # 5) 默认 → 概念混淆
        return {
            "error_type": "concept_confusion",
            "error_label": "概念混淆",
            "error_description": "选了相近但错误的概念",
            "confidence": 0.4,
            "analysis": "学生选择了错误选项，可能与正确概念混淆。",
            "remediation_plan": "对比分析相关概念的区别",
            "followup_question": f"能否说说你选择这个答案时是怎么考虑的？",
        }

    async def _llm_diagnose(
        self,
        question: str,
        correct_answer: str,
        student_answer: str,
        concept: str,
    ) -> dict:
        """LLM 增强错误诊断"""
        prompt = DIAGNOSTIC_PROMPT.format(
            question=question,
            correct_answer=correct_answer,
            student_answer=student_answer,
            concept=concept or "未指定",
        )

        raw = await spark_service.chat(
            messages=[
                {"role": "system", "content": DIAGNOSTIC_SYSTEM},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
            max_tokens=512,
        )

        return self._parse_json_from_llm(raw)

    @staticmethod
    def _parse_json_from_llm(raw: str) -> dict:
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

        start = raw.find("{")
        end = raw.rfind("}")
        if start != -1 and end != -1:
            try:
                return json.loads(raw[start:end + 1])
            except json.JSONDecodeError:
                pass

        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {
                "error_type": "knowledge_gap",
                "confidence": 0.3,
                "analysis": "无法解析诊断结果",
                "remediation_plan": "建议从基础重新学习",
                "followup_question": "需要我重新解释这个概念吗？",
            }


# 单例
diagnostic_service = DiagnosticService()
