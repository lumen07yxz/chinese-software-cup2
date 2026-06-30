"""实时学情分析服务 —— 基于规则的消息级状态感知

借鉴 LearnPath 的 realtime_state_service，实现轻量级关键词分析，
不依赖 LLM，可即时返回学生当前情绪、困惑度、认知负荷、信心和投入度。
"""

import re
from typing import Dict, Any

# 情绪关键词映射（简单版）
EMOTION_KEYWORDS: Dict[str, str] = {
    "崩溃": "frustrated",
    "烦": "frustrated",
    "难": "confused",
    "不懂": "confused",
    "不明白": "confused",
    "奇怪": "confused",
    "无聊": "bored",
    "累": "tired",
    "困": "tired",
    "开心": "happy",
    "高兴": "happy",
    "明白": "confident",
    "懂了": "confident",
    "会了": "confident",
    "清楚": "confident",
}

# 困惑度关键词
CONFUSION_KEYWORDS = ["不懂", "不明白", "怎么", "为什么", "？", "?", "？", "难以理解", "搞不清"]

# 认知负荷关键词
COGNITIVE_LOAD_KEYWORDS = ["抽象", "公式", "推导", "太多", "复杂", "难懂", "烧脑"]

# 信心关键词
CONFIDENCE_KEYWORDS_POSITIVE = ["懂了", "会了", "明白", "清楚", "简单"]
CONFIDENCE_KEYWORDS_NEGATIVE = ["不会", "完全不会", "懵", "毫无头绪"]

# 投入度关键词（正面）
ENGAGEMENT_KEYWORDS_POSITIVE = ["有趣", "想学", "继续", "深入", "探索"]
ENGAGEMENT_KEYWORDS_NEGATIVE = ["无聊", "不想学", "放弃", "太难"]

def analyze_message(message: str) -> Dict[str, Any]:
    """分析单条用户消息，返回实时学情状态"""
    msg = message.strip()
    lower_msg = msg.lower()
    
    # 情绪检测
    emotion = ""
    for kw, emo in EMOTION_KEYWORDS.items():
        if kw in lower_msg:
            emotion = emo
            break
    
    # 困惑度：基于关键词 + 问号数量
    confusion_score = 0.0
    for kw in CONFUSION_KEYWORDS:
        if kw in lower_msg:
            confusion_score += 0.3
    question_marks = msg.count('?') + msg.count('？')
    confusion_score += question_marks * 0.2
    confusion_score = min(confusion_score, 1.0)
    
    # 认知负荷
    cognitive_load = 0.0
    for kw in COGNITIVE_LOAD_KEYWORDS:
        if kw in lower_msg:
            cognitive_load += 0.3
    cognitive_load = min(cognitive_load, 1.0)
    
    # 信心
    confidence = 0.5  # 中性
    for kw in CONFIDENCE_KEYWORDS_POSITIVE:
        if kw in lower_msg:
            confidence += 0.2
    for kw in CONFIDENCE_KEYWORDS_NEGATIVE:
        if kw in lower_msg:
            confidence -= 0.2
    confidence = max(0.0, min(confidence, 1.0))
    
    # 投入度
    engagement = 0.5
    for kw in ENGAGEMENT_KEYWORDS_POSITIVE:
        if kw in lower_msg:
            engagement += 0.2
    for kw in ENGAGEMENT_KEYWORDS_NEGATIVE:
        if kw in lower_msg:
            engagement -= 0.2
    engagement = max(0.0, min(engagement, 1.0))
    
    return {
        "emotion": emotion,
        "confusion": round(confusion_score, 2),
        "cognitive_load": round(cognitive_load, 2),
        "confidence": round(confidence, 2),
        "engagement": round(engagement, 2),
    }


def get_strategy(profile: Dict[str, Any], realtime_state: Dict[str, Any]) -> Dict[str, Any]:
    """根据长期画像和实时学情生成个性化教学策略"""
    if not profile:
        profile = {}
    
    # 提取画像信息
    kb = profile.get("knowledge_base", {}) or {}
    weak_points = profile.get("weak_points", []) or []
    style = profile.get("cognitive_style", "")
    goal = profile.get("learning_goal", "")
    available_time = profile.get("available_time", "")
    
    # 基于实时状态选择教学模式
    emotion = realtime_state.get("emotion", "")
    confusion = realtime_state.get("confusion", 0.0)
    cognitive_load = realtime_state.get("cognitive_load", 0.0)
    confidence = realtime_state.get("confidence", 0.5)
    engagement = realtime_state.get("engagement", 0.5)
    
    teaching_mode = "routine"
    tone = "温和、清晰、鼓励"
    difficulty = "maintain"
    pacing = "normal"
    explanation_depth = "standard"
    response_plan = []
    must_do = []
    avoid = []
    preferred_resource_types = []
    assessment_style = "检查理解"
    
    # 决策逻辑（参考借鉴.md 3.2）
    if emotion in ("frustrated", "confused") and confusion >= 0.65:
        teaching_mode = "unblock"
        tone = "温和、耐心、鼓励"
        difficulty = "lower"
        pacing = "slow"
        explanation_depth = "deep"
        response_plan.append("先确认卡点位置，用类比解释")
        must_do.append("先安抚情绪，再解决问题")
        avoid.append("同时引入新概念")
    elif emotion == "anxious":
        teaching_mode = "stabilize"
        tone = "稳定、支持"
        pacing = "slow"
        must_do.append("提供安全感，强调进步")
    elif emotion == "tired" or engagement < 0.4:
        teaching_mode = "focus"
        tone = "简洁、高效"
        pacing = "fast"
        explanation_depth = "brief"
        avoid.append("冗长的解释")
    elif cognitive_load > 0.7:
        teaching_mode = "simplify"
        tone = "简化、清晰"
        difficulty = "lower"
        pacing = "slow"
        explanation_depth = "deep"
        response_plan.append("分解复杂概念，用图表辅助")
    elif emotion == "excited" or (engagement > 0.7 and confidence > 0.6):
        teaching_mode = "explore"
        tone = "激发、鼓励探索"
        difficulty = "raise"
        pacing = "fast"
        explanation_depth = "deep"
        preferred_resource_types.extend(["拓展阅读", "论文", "项目"])
    elif engagement > 0.7 and confidence > 0.5:
        teaching_mode = "challenge"
        tone = "挑战、激励"
        difficulty = "raise"
        pacing = "fast"
        explanation_depth = "standard"
    else:
        teaching_mode = "routine"
    
    # 根据长期画像调整
    if weak_points:
        must_do.append(f"重点讲解薄弱点：{', '.join(weak_points[:3])}")
    if goal:
        must_do.append(f"围绕学习目标：{goal}")
    if style:
        if style == "visual":
            preferred_resource_types.extend(["图表", "思维导图", "视频"])
        elif style == "verbal":
            preferred_resource_types.extend(["文档", "解释"])
        elif style == "active":
            preferred_resource_types.extend(["代码", "练习"])
        elif style == "reflective":
            preferred_resource_types.extend(["总结", "反思问题"])
    
    # 如果没有特别指令，添加默认
    if not response_plan:
        response_plan.append("根据学生状态调整讲解")
    if not must_do:
        must_do.append("确保学生理解")
    if not avoid:
        avoid.append("过度复杂化")
    
    return {
        "teaching_mode": teaching_mode,
        "tone": tone,
        "difficulty": difficulty,
        "pacing": pacing,
        "explanation_depth": explanation_depth,
        "response_plan": response_plan,
        "must_do": must_do,
        "avoid": avoid,
        "preferred_resource_types": preferred_resource_types,
        "assessment_style": assessment_style,
    }


def format_strategy_for_prompt(strategy: Dict[str, Any]) -> str:
    """将策略格式化为可注入 system prompt 的隐藏文本块"""
    lines = ["[内部教学策略 — 仅用于调整回答方式，禁止向用户展示]"]
    lines.append(f"教学模式：{strategy['teaching_mode']}")
    lines.append(f"语气：{strategy['tone']}")
    lines.append(f"难度：{strategy['difficulty']}")
    lines.append(f"节奏：{strategy['pacing']}")
    lines.append(f"讲解深度：{strategy['explanation_depth']}")
    if strategy.get("response_plan"):
        lines.append("回答计划：\n" + "\n".join(f"- {p}" for p in strategy["response_plan"]))
    if strategy.get("must_do"):
        lines.append("必须做：\n" + "\n".join(f"- {m}" for m in strategy["must_do"]))
    if strategy.get("avoid"):
        lines.append("避免：\n" + "\n".join(f"- {a}" for a in strategy["avoid"]))
    if strategy.get("preferred_resource_types"):
        lines.append(f"偏好资源类型：{', '.join(strategy['preferred_resource_types'])}")
    lines.append(f"检查方式：{strategy['assessment_style']}")
    return "\n".join(lines)


# 单例
realtime_state_service = type("RealtimeStateService", (), {
    "analyze_message": staticmethod(analyze_message),
    "get_strategy": staticmethod(get_strategy),
    "format_strategy_for_prompt": staticmethod(format_strategy_for_prompt),
})()
