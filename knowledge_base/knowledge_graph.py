"""课程知识图谱 + Kahn 拓扑排序

构建"人工智能导论"10 章的前置依赖有向图，提供拓扑排序确定学习顺序。
LLM 只负责填写节点权重和个性化建议，排序由算法保证。
"""

from __future__ import annotations
from collections import deque
from typing import Any

# ── 章节元数据 ──────────────────────────────────────────────
CHAPTERS = [
    {
        "id": "ch01", "title": "人工智能导论",
        "keywords": ["AI", "人工智能", "图灵测试"],
        "goals": "理解人工智能的定义、发展历史与基本分类（强AI vs 弱AI）",
        "key_concepts": ["图灵测试", "AI发展简史", "符号主义 vs 连接主义", "AI应用领域"],
        "difficulty": 0.2,
    },
    {
        "id": "ch02", "title": "机器学习基础",
        "keywords": ["机器学习", "监督学习", "无监督学习", "回归", "分类"],
        "goals": "掌握监督/无监督/强化学习三大范式，理解过拟合与模型评估",
        "key_concepts": ["线性回归", "逻辑回归", "决策树", "交叉验证", "偏差-方差权衡"],
        "difficulty": 0.45,
    },
    {
        "id": "ch03", "title": "深度学习基础",
        "keywords": ["深度学习", "神经网络", "反向传播", "梯度下降"],
        "goals": "理解神经网络结构、反向传播算法及常用优化器",
        "key_concepts": ["感知机", "反向传播", "ReLU/Sigmoid", "Adam优化器", "BatchNorm"],
        "difficulty": 0.55,
    },
    {
        "id": "ch04", "title": "Transformer架构",
        "keywords": ["Transformer", "注意力机制", "self-attention", "BERT", "GPT"],
        "goals": "掌握自注意力机制原理，理解 Transformer 在 NLP 和 CV 中的核心地位",
        "key_concepts": ["Multi-Head Attention", "位置编码", "Encoder-Decoder", "BERT", "GPT系列"],
        "difficulty": 0.65,
    },
    {
        "id": "ch05", "title": "自然语言处理",
        "keywords": ["NLP", "自然语言", "文本分类", "命名实体", "分词"],
        "goals": "掌握文本预处理、词嵌入及主流 NLP 任务的解决方案",
        "key_concepts": ["分词", "Word2Vec/GloVe", "文本分类", "命名实体识别", "情感分析"],
        "difficulty": 0.6,
    },
    {
        "id": "ch06", "title": "计算机视觉",
        "keywords": ["CV", "计算机视觉", "CNN", "图像识别", "目标检测"],
        "goals": "理解卷积神经网络原理，掌握图像分类和目标检测的基本方法",
        "key_concepts": ["卷积层", "池化层", "ResNet", "YOLO", "数据增强"],
        "difficulty": 0.6,
    },
    {
        "id": "ch07", "title": "强化学习",
        "keywords": ["强化学习", "RL", "Q-learning", "策略梯度"],
        "goals": "理解马尔可夫决策过程，掌握 Q-Learning 和策略梯度的基本原理",
        "key_concepts": ["MDP", "Q-Learning", "DQN", "Policy Gradient", "Reward Shaping"],
        "difficulty": 0.7,
    },
    {
        "id": "ch08", "title": "AI伦理与安全",
        "keywords": ["伦理", "安全", "偏见", "公平性", "可解释性"],
        "goals": "认识 AI 系统中的偏见、隐私和安全风险，了解可解释 AI 方法",
        "key_concepts": ["算法偏见", "差分隐私", "对抗攻击", "可解释性 (XAI)", "AI治理"],
        "difficulty": 0.3,
    },
    {
        "id": "ch09", "title": "MLOps与AI工程实践",
        "keywords": ["MLOps", "部署", "CI/CD", "模型监控", "容器化"],
        "goals": "掌握模型从训练到部署的全流程，理解 MLOps 核心实践",
        "key_concepts": ["模型版本管理", "A/B测试", "Docker/K8s", "模型监控", "特征工程Pipeline"],
        "difficulty": 0.5,
    },
    {
        "id": "ch10", "title": "前沿方向与多模态AI",
        "keywords": ["多模态", "大语言模型", "LLM", "AGI", "前沿"],
        "goals": "了解大语言模型、多模态学习和 AGI 的最新进展与趋势",
        "key_concepts": ["大语言模型 (LLM)", "多模态融合", "Prompt Engineering", "RAG", "Agent"],
        "difficulty": 0.5,
    },
]

# ── 依赖边（from → to，表示学 to 之前应先学 from）────────────
EDGES: list[dict[str, str]] = [
    {"from": "ch01", "to": "ch02", "label": "AI基础概念"},
    {"from": "ch02", "to": "ch03", "label": "ML→DL进阶"},
    {"from": "ch03", "to": "ch04", "label": "DL基础→Transformer"},
    {"from": "ch03", "to": "ch06", "label": "DL基础→CV"},
    {"from": "ch04", "to": "ch05", "label": "Transformer→NLP"},
    {"from": "ch02", "to": "ch07", "label": "ML基础→RL"},
    {"from": "ch01", "to": "ch08", "label": "AI概念→伦理"},
    {"from": "ch03", "to": "ch09", "label": "DL基础→工程实践"},
    {"from": "ch04", "to": "ch10", "label": "Transformer→前沿"},
    {"from": "ch05", "to": "ch10", "label": "NLP→多模态"},
    {"from": "ch06", "to": "ch10", "label": "CV→多模态"},
]


def build_adjacency(
    edges: list[dict[str, str]],
) -> tuple[dict[str, list[str]], dict[str, int]]:
    """构建邻接表 + 入度表。

    Returns:
        adj: {node: [successors]}
        in_degree: {node: count}
    """
    nodes: set[str] = set()
    for e in edges:
        nodes.add(e["from"])
        nodes.add(e["to"])

    adj: dict[str, list[str]] = {n: [] for n in nodes}
    in_degree: dict[str, int] = {n: 0 for n in nodes}

    for e in edges:
        adj[e["from"]].append(e["to"])
        in_degree[e["to"]] += 1

    return adj, in_degree


def topo_sort_kahn(
    edges: list[dict[str, str]],
    node_weights: dict[str, float] | None = None,
) -> list[str]:
    """Kahn 拓扑排序。

    当存在多个入度为 0 的节点时，按 node_weights 降序排列
    （权重高的优先，表示更紧急/更薄弱）。

    Args:
        edges: 依赖边列表
        node_weights: 可选的节点权重 {node_id: weight}，用于同层排序

    Returns:
        排序后的节点 ID 列表
    """
    adj, in_degree = build_adjacency(edges)
    queue = deque()

    for node, deg in in_degree.items():
        if deg == 0:
            queue.append(node)

    # 同层按权重降序
    if node_weights:
        queue = deque(sorted(queue, key=lambda n: node_weights.get(n, 0), reverse=True))

    result: list[str] = []
    while queue:
        node = queue.popleft()
        result.append(node)

        next_zero: list[str] = []
        for succ in adj[node]:
            in_degree[succ] -= 1
            if in_degree[succ] == 0:
                next_zero.append(succ)

        if node_weights:
            next_zero.sort(key=lambda n: node_weights.get(n, 0), reverse=True)
        queue.extend(next_zero)

    return result


def compute_chapter_weights(profile: dict[str, Any]) -> dict[str, float]:
    """根据学生画像计算章节权重。

    权重越高 = 越需要优先学习（薄弱环节）。

    计算规则：
    - knowledge_base 中掌握度低的章节 → 高权重
    - weak_points 匹配关键词的章节 → 额外加权
    - interests 匹配关键词的章节 → 适度加权
    """
    weights: dict[str, float] = {}
    kb = profile.get("knowledge_base", {})
    weak_points = profile.get("weak_points", [])
    interests = profile.get("interests", [])

    for ch in CHAPTERS:
        ch_id = ch["id"]
        title = ch["title"]
        keywords = ch["keywords"]

        # 基础权重：掌握度越低，权重越高
        mastery = kb.get(title, kb.get(ch_id, 0.5))
        base = 1.0 - mastery  # 0.0 ~ 1.0

        # 薄弱环节加权
        weak_bonus = 0.0
        for wp in weak_points:
            if any(kw in wp for kw in keywords):
                weak_bonus += 0.3
                break

        # 兴趣加权（感兴趣的内容略提高优先级）
        interest_bonus = 0.0
        for it in interests:
            if any(kw in it for kw in keywords):
                interest_bonus += 0.1
                break

        weights[ch_id] = min(base + weak_bonus + interest_bonus, 2.0)

    return weights


def generate_path_data(profile: dict[str, Any] | None = None) -> dict[str, Any]:
    """生成完整的学习路径数据（nodes + edges + suggestions）。

    返回供前端直接使用的 PathData 结构。
    """
    profile = profile or {}
    weights = compute_chapter_weights(profile)
    order = topo_sort_kahn(EDGES, weights)

    nodes = []
    for ch_id in order:
        ch = next(c for c in CHAPTERS if c["id"] == ch_id)
        w = weights.get(ch_id, 0.5)
        # 权重 → 优先级 (1-10)
        priority = max(1, min(10, round(w * 5 + 1)))
        # 权重 → 建议时长
        if w > 1.0:
            duration = "2-3周"
        elif w > 0.5:
            duration = "1-2周"
        else:
            duration = "3-5天"

        nodes.append({
            "id": ch_id,
            "title": ch["title"],
            "duration": duration,
            "priority": priority,
            "description": ch.get("goals", f"学习{ch['title']}"),
            "goals": ch.get("goals", ""),
            "key_concepts": ch.get("key_concepts", []),
            "difficulty": ch.get("difficulty", 0.5),
        })

    # 个性化建议
    suggestions = _generate_suggestions(profile, weights)

    return {
        "nodes": nodes,
        "edges": EDGES,
        "suggestions": suggestions,
    }


def _generate_suggestions(profile: dict, weights: dict[str, float]) -> list[str]:
    """基于画像和权重生成学习建议。"""
    suggestions = []
    kb = profile.get("knowledge_base", {})
    weak = profile.get("weak_points", [])
    style = profile.get("cognitive_style", "")

    # 找最薄弱的 2 个章节
    sorted_weights = sorted(weights.items(), key=lambda x: x[1], reverse=True)
    for ch_id, w in sorted_weights[:2]:
        ch = next(c for c in CHAPTERS if c["id"] == ch_id)
        if w > 0.5:
            suggestions.append(f"重点加强「{ch['title']}」，当前掌握度较低，建议分配更多学习时间")

    # 认知风格建议
    if style == "visual":
        suggestions.append("你是视觉型学习者，建议多使用思维导图和视频脚本类资源")
    elif style == "verbal":
        suggestions.append("你是文字型学习者，建议多阅读课程文档类资源")
    elif style == "active":
        suggestions.append("你是动手型学习者，建议多使用实操案例和练习题")

    if weak:
        suggestions.append(f"你的易错点: {', '.join(weak[:3])}，学习时注意针对性练习")

    return suggestions[:5]
