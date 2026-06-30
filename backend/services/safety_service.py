"""内容安全过滤服务 — 正则 + LLM-as-judge 双层检测"""

import json
import logging
import re
from typing import Optional

from services.spark_service import spark_service
from prompts import SAFETY_JUDGE_PROMPT, HALLUCINATION_JUDGE_PROMPT

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

    # 外部图片链接检测（防止 LLM 生成不可访问的外部图片 URL）
    external_image_hits: list[str] = []
    for match in re.finditer(r'!\[.*?\]\((https?://[^\)]+)\)', text):
        url = match.group(1)
        # 只允许相对路径和 data: URI
        if not url.startswith(('data:', '/')):
            external_image_hits.append(url)

    return {
        "safe": len(flags) == 0,
        "flags": flags,
        "hallucination_markers": hallucination_hits,
        "external_images": external_image_hits,
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


async def llm_safety_check(text: str) -> dict:
    """LLM-as-judge 内容安全审查。
    Returns: {"safe": bool, "risk_level": str, "issues": list[str], "suggestion": str}
    """
    prompt = SAFETY_JUDGE_PROMPT.format(text=text[:3000])
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
        logger.error("LLM 安全审查失败，默认拒绝: %s", e)
        return {
            "safe": False,
            "risk_level": "unknown",
            "issues": [f"安全审查服务异常: {str(e)[:100]}"],
            "suggestion": "内容安全审查暂时不可用，请稍后重试",
        }


async def llm_hallucination_check(text: str, context: str = "") -> dict:
    """LLM-as-judge 幻觉检测。
    Returns: {"has_hallucination": bool, "confidence": float, "issues": list[str], "suggestion": str}
    """
    prompt = HALLUCINATION_JUDGE_PROMPT.format(text=text[:3000], context=context[:2000])
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
        logger.error("LLM 幻觉检测失败，默认标记为可能幻觉: %s", e)
        return {
            "has_hallucination": True,
            "confidence": 0.5,
            "issues": [f"幻觉检测服务异常: {str(e)[:100]}"],
            "suggestion": "事实核查暂时不可用，请人工确认内容准确性",
        }


# ── 工具函数 ──────────────────────────────────────────────────────────


def _parse_json_from_llm(raw: str) -> dict:
    """从 LLM 输出中提取 JSON 对象，容忍 markdown 代码块包裹"""
    text = raw.strip()
    # 去掉 ```json ... ``` 包裹
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()
    try:
        result = json.loads(text)
        # 确保返回的是 dict 类型（json.loads 可能返回 str 如 "safe"）
        if isinstance(result, dict):
            return result
    except json.JSONDecodeError:
        pass
    # 尝试找到第一个 { 到最后一个 }
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1:
        try:
            result = json.loads(text[start : end + 1])
            if isinstance(result, dict):
                return result
        except json.JSONDecodeError:
            pass
    logger.warning("无法解析 LLM 安全审查 JSON: %s", raw[:200])
    return {}
