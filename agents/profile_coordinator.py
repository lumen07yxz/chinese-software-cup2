"""画像提取协调器 —— 对话流结束后显式提取结构化画像

导入集中 prompt 管理。
"""

import json
import re

from services.spark_service import spark_service
from prompts import EXTRACT_SYSTEM_PROMPT


class ProfileCoordinator:
    """画像提取协调器 —— 在对话流结束后调用 LLM 提取结构化 JSON。"""

    @staticmethod
    async def extract(
        user_message: str,
        conversation_history: list[dict],
        existing_profile: dict | None = None,
    ) -> dict | None:
        """从对话中提取结构化画像。

        Args:
            user_message: 用户最新消息
            conversation_history: 完整对话历史 [{"role": ..., "content": ...}, ...]
            existing_profile: 已有画像（可选）

        Returns:
            结构化画像 dict，或 None（提取失败时）
        """
        # 构建提取 prompt
        recent = conversation_history[-6:] if len(conversation_history) > 6 else conversation_history
        conversation_text = "\n".join(
            [f"{'学生' if m.get('role') == 'user' else 'AI'}：{m.get('content', '')}"
             for m in recent]
        )

        context = ""
        if existing_profile:
            context = f"\n当前已有画像：{json.dumps(existing_profile, ensure_ascii=False)}\n请基于此更新。\n"

        messages = [
            {"role": "system", "content": EXTRACT_SYSTEM_PROMPT},
            {"role": "user", "content": f"最新对话：\n学生：{user_message}\n\n{context}完整对话上下文：\n{conversation_text}\n\n请提取结构化画像（仅 JSON）。"},
        ]

        try:
            raw = await spark_service.chat(messages, temperature=0.1, max_tokens=2048)
            return ProfileCoordinator._parse_json(raw)
        except Exception:
            return None

    @staticmethod
    def _parse_json(raw: str) -> dict | None:
        """从 LLM 输出中提取 JSON 对象。"""
        # 尝试直接解析
        raw = raw.strip()

        # 尝试从 ```json ``` 代码块中提取
        if "```json" in raw:
            match = re.search(r"```json\s*([\s\S]*?)```", raw)
            if match:
                raw = match.group(1).strip()
        elif "```" in raw:
            match = re.search(r"```\s*([\s\S]*?)```", raw)
            if match:
                raw = match.group(1).strip()

        # 尝试找到第一个 { 和最后一个 }
        start = raw.find("{")
        end = raw.rfind("}")
        if start != -1 and end != -1 and end > start:
            raw = raw[start: end + 1]

        try:
            result = json.loads(raw)
            # 确保所有字段存在
            defaults = {
                "knowledge_base": {},
                "cognitive_style": "",
                "weak_points": [],
                "learning_goal": "",
                "available_time": "",
                "interests": [],
                "conversation_summary": "",
            }
            for key, default in defaults.items():
                if key not in result or result[key] is None:
                    result[key] = default
            return result
        except (json.JSONDecodeError, ValueError):
            return None
