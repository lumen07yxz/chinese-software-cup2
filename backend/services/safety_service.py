"""内容安全过滤服务"""

import re

# 基础敏感词列表（可扩展）
SENSITIVE_PATTERNS = [
    r"(暴力|恐怖|色情|赌博|毒品|诈骗|邪教)",
    r"(杀|死|枪|炸弹|毒药)",
]

# 常见幻觉标记检测
HALLUCINATION_MARKERS = [
    r"(根据我的训练数据|我无法确认|请以官方资料为准|建议查阅原文|具体信息请参考)",
]


def check_safety(text: str) -> dict:
    """检查内容安全性。
    Returns: {"safe": bool, "flags": list[str], "suggestion": str}
    """
    flags = []
    for pattern in SENSITIVE_PATTERNS:
        matches = re.findall(pattern, text)
        if matches:
            flags.extend(matches)

    return {
        "safe": len(flags) == 0,
        "flags": flags,
        "suggestion": "内容包含敏感信息，已标记" if flags else "",
    }


def add_hallucination_disclaimer(text: str) -> str:
    """在生成内容末尾添加防幻觉提示"""
    disclaimer = (
        "\n\n---\n"
        "> 以上内容由 AI 生成，仅供参考学习。"
        "如有事实性疑问，请查阅教材或咨询授课教师。"
    )
    return text + disclaimer
