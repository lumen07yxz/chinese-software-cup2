"""内容安全过滤服务 — 正则 + LLM-as-judge 双层检测"""

import json
import logging
import re
from typing import Optional

from services.spark_service import spark_service

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════
# 第一层：正则快速过滤（扩展敏感词库）
# ═══════════════════════════════════════════════════════════════════════

SENSITIVE_PATTERNS: list[tuple[str, str]] = [
    # (分类标签, 正则)
    ("暴力恐怖", r"(暴力|恐怖|恐怖主义|袭击|屠杀|自爆|人肉炸弹)"),
    ("武器弹药", r"(枪支|枪械|炸弹|炸药|毒药|生化武器|核武器|管制刀具)"),
    ("违法犯罪", r"(赌博|毒品|贩卖|走私|诈骗|传销|邪教|洗钱|非法集资)"),
    ("人身伤害", r"(自杀|自残|安乐死|活埋|酷刑|绑架|拘禁)"),
    ("歧视侮辱", r"(歧视|侮辱|诽谤|种族主义|仇恨言论|人身攻击)"),
    ("色情低俗", r"(色情|淫秽|裸聊|约炮|招嫖|卖淫)"),
    ("政治敏感", r"(颠覆|分裂国家|煽动|非法组织|上访|维权)"),
    ("个人信息泄露", r"(\b\d{17}[\dXx]\b|\b\d{15}\b)"),  # 身份证号
    ("医疗误导", r"(包治百病|祖传秘方|特效药|万能药)"),
    ("金融诈骗", r"(稳赚不赔|高额回报|躺赚|刷单返利|杀猪盘)"),
]

HALLUCINATION_MARKERS = [
    r"(根据我的训练数据|我无法确认|请以官方资料为准|建议查阅原文|具体信息请参考)",
    r"(我不确定|可能不准确|仅供参考|以实际为准)",
    r"(as an ai|as a language model|i don't have access)",
]


def check_safety(text: str) -> dict:
    """正则层快速内容安全检查。
    Returns: {"safe": bool, "flags": list[dict], "suggestion": str}
    """
    flags: list[dict] = []
    for category, pattern in SENSITIVE_PATTERNS:
        matches = re.findall(pattern, text, re.IGNORECASE)
        if matches:
            for m in matches:
                flags.append({"category": category, "match": m})

    # 幻觉标记检测
    hallucination_hits: list[str] = []
    for pattern in HALLUCINATION_MARKERS:
        matches = re.findall(pattern, text, re.IGNORECASE)
        hallucination_hits.extend(matches)

    return {
        "safe": len(flags) == 0,
        "flags": flags,
        "hallucination_markers": hallucination_hits,
        "suggestion": (
            "内容包含敏感信息，已标记分类：" + "、".join(f["category"] for f in flags)
            if flags
            else ""
        ),
    }


def add_hallucination_disclaimer(text: str) -> str:
    """在生成内容末尾添加防幻觉提示"""
    disclaimer = (
        "\n\n---\n"
        "> 以上内容由 AI 生成，仅供参考学习。"
        "如有事实性疑问，请查阅教材或咨询授课教师。"
    )
    return text + disclaimer


# ═══════════════════════════════════════════════════════════════════════
# 第二层：LLM-as-judge 深度审查（异步，按需调用）
# ═══════════════════════════════════════════════════════════════════════

_SAFETY_JUDGE_PROMPT = """\
你是内容安全审查专家。请判断以下 AI 生成的教学内容是否安全，输出 JSON。

审查维度：
1. **敏感内容**：是否包含暴力、违法、歧视、色情、政治敏感等不当内容
2. **事实准确性**：是否包含明显的事实性错误或误导信息（尤其涉及 AI/计算机科学领域）
3. **版权合规**：是否大段复制受版权保护的内容
4. **教学适宜性**：内容是否适合高等教育场景

请严格输出以下 JSON 格式（不要输出其他内容）：
{
  "safe": true/false,
  "risk_level": "low" | "medium" | "high" | "critical",
  "issues": ["问题描述1", "问题描述2"],
  "suggestion": "修改建议（如 safe=true 则为空字符串）"
}

--- 待审查内容 ---
{text}
--- 内容结束 ---
"""

_HALLUCINATION_JUDGE_PROMPT = """\
你是事实核查专家。请判断以下 AI 生成内容是否存在"幻觉"（即编造、无中生有的信息）。

判断标准：
1. 内容中的概念、定义、人名、论文名、年份等是否准确
2. 是否存在"听起来合理但实际错误"的信息
3. 是否有过度泛化或无依据的断言

参考知识库上下文（可能为空）：
{context}

请严格输出以下 JSON 格式（不要输出其他内容）：
{
  "has_hallucination": true/false,
  "confidence": 0.0-1.0,
  "issues": ["幻觉描述1", "幻觉描述2"],
  "suggestion": "修正建议"
}

--- 待审查内容 ---
{text}
--- 内容结束 ---
"""


async def llm_safety_check(text: str) -> dict:
    """LLM-as-judge 内容安全审查。
    Returns: {"safe": bool, "risk_level": str, "issues": list[str], "suggestion": str}
    """
    prompt = _SAFETY_JUDGE_PROMPT.format(text=text[:3000])
    try:
        raw = await spark_service.chat(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=1024,
        )
        result = _parse_json_from_llm(raw)
        return {
            "safe": result.get("safe", True),
            "risk_level": result.get("risk_level", "low"),
            "issues": result.get("issues", []),
            "suggestion": result.get("suggestion", ""),
        }
    except Exception as e:
        logger.warning("LLM 安全审查失败，默认放行: %s", e)
        return {
            "safe": True,
            "risk_level": "low",
            "issues": [],
            "suggestion": "",
        }


async def llm_hallucination_check(text: str, context: str = "") -> dict:
    """LLM-as-judge 幻觉检测。
    Returns: {"has_hallucination": bool, "confidence": float, "issues": list[str], "suggestion": str}
    """
    prompt = _HALLUCINATION_JUDGE_PROMPT.format(text=text[:3000], context=context[:2000])
    try:
        raw = await spark_service.chat(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=1024,
        )
        result = _parse_json_from_llm(raw)
        return {
            "has_hallucination": result.get("has_hallucination", False),
            "confidence": result.get("confidence", 0.5),
            "issues": result.get("issues", []),
            "suggestion": result.get("suggestion", ""),
        }
    except Exception as e:
        logger.warning("LLM 幻觉检测失败，默认放行: %s", e)
        return {
            "has_hallucination": False,
            "confidence": 0.0,
            "issues": [],
            "suggestion": "",
        }


# ── 工具函数 ──────────────────────────────────────────────────────────


def _parse_json_from_llm(raw: str) -> dict:
    """从 LLM 输出中提取 JSON 对象，容忍 markdown 代码块包裹"""
    text = raw.strip()
    # 去掉 ```json ... ``` 包裹
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # 尝试找到第一个 { 到最后一个 }
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                pass
        logger.warning("无法解析 LLM 安全审查 JSON: %s", raw[:200])
        return {}
