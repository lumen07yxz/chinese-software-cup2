"""课程知识图谱 + Kahn 拓扑排序

构建"人工智能导论"10 章的前置依赖有向图，提供拓扑排序确定学习顺序。
LLM 只负责填写节点权重和个性化建议，排序由算法保证。
"""

from __future__ import annotations
from collections import deque
from typing import Any

# ── 章节元数据（丰富版：含子主题、预估学时、学习方法、里程碑）───
CHAPTERS = [
    {
        "id": "ch01", "title": "人工智能导论",
        "keywords": ["AI", "人工智能", "图灵测试"],
        "goals": "理解人工智能的定义、发展历史与基本分类（强AI vs 弱AI）",
        "description": "从 AI 的起源到现代应用全景式入门，建立对人工智能领域的整体认知框架",
        "key_concepts": ["图灵测试", "AI发展简史", "符号主义 vs 连接主义", "AI应用领域"],
        "difficulty": 0.2,
        "estimated_hours": 8,
        "sub_topics": [
            {"title": "AI 的定义与范畴", "description": "什么是人工智能、强AI与弱AI的区别、AI的主要研究方向", "key_points": ["图灵测试", "强AI/弱AI", "Narrow AI vs General AI"]},
            {"title": "AI 发展简史", "description": "从1943年McCulloch-Pitts神经元到2020年代大语言模型的演进", "key_points": ["达特茅斯会议", "两次AI寒冬", "深度学习复兴", "GPT时代"]},
            {"title": "AI 技术流派", "description": "符号主义、连接主义、行为主义三大流派的对比与融合", "key_points": ["专家系统", "神经网络", "强化学习"]},
            {"title": "AI 应用领域", "description": "计算机视觉、自然语言处理、语音识别、自动驾驶等典型场景", "key_points": ["图像识别", "机器翻译", "语音助手", "推荐系统"]},
        ],
        "learning_methods": ["📖 阅读AI发展时间线", "🎬 观看AI科普视频", "💭 讨论AI对未来社会的影响"],
        "milestones": ["能区分强AI与弱AI", "能列举AI发展的3个关键节点", "能说出至少5个AI应用领域"],
        "resources_hint": ["科普文章", "纪录片", "时间线图"],
    },
    {
        "id": "ch02", "title": "机器学习基础",
        "keywords": ["机器学习", "监督学习", "无监督学习", "回归", "分类"],
        "goals": "掌握监督/无监督/强化学习三大范式，理解过拟合与模型评估",
        "description": "机器学习是AI的核心引擎，本章从数学直觉出发理解三大范式及其评估方法",
        "key_concepts": ["线性回归", "逻辑回归", "决策树", "交叉验证", "偏差-方差权衡"],
        "difficulty": 0.45,
        "estimated_hours": 15,
        "sub_topics": [
            {"title": "三大机器学习范式", "description": "监督学习、无监督学习、强化学习的基本思想和适用场景", "key_points": ["标签数据", "聚类", "奖励信号", "范式对比"]},
            {"title": "线性回归与逻辑回归", "description": "从最小二乘到Sigmoid函数，理解回归与分类的数学基础", "key_points": ["损失函数", "梯度下降", "Sigmoid", "交叉熵"]},
            {"title": "决策树与集成方法", "description": "信息增益、基尼系数、随机森林与梯度提升", "key_points": ["信息增益", "随机森林", "XGBoost", "Bagging vs Boosting"]},
            {"title": "模型评估与选择", "description": "过拟合/欠拟合、交叉验证、偏差-方差权衡、正则化", "key_points": ["K折交叉验证", "L1/L2正则化", "ROC-AUC", "混淆矩阵"]},
        ],
        "learning_methods": ["💻 动手实现线性回归", "📊 用Scikit-learn跑分类实验", "📝 做模型评估对比表格"],
        "milestones": ["能解释监督/无监督/强化学习的区别", "能手动推导线性回归损失函数", "能用交叉验证评估模型"],
        "resources_hint": ["代码实践", "数学推导笔记", "模型对比图表"],
    },
    {
        "id": "ch03", "title": "深度学习基础",
        "keywords": ["深度学习", "神经网络", "反向传播", "梯度下降"],
        "goals": "理解神经网络结构、反向传播算法及常用优化器",
        "description": "深入神经网络的内部机制，从感知机到现代深度网络的优化技术",
        "key_concepts": ["感知机", "反向传播", "ReLU/Sigmoid", "Adam优化器", "BatchNorm"],
        "difficulty": 0.55,
        "estimated_hours": 18,
        "sub_topics": [
            {"title": "神经网络基本结构", "description": "感知机、多层网络、前向传播的数学表达", "key_points": ["单层感知机", "多层感知机", "万能近似定理", "激活函数"]},
            {"title": "反向传播算法", "description": "链式法则、计算图、梯度的反向流动", "key_points": ["链式法则", "计算图", "梯度消失/爆炸", "数值稳定性"]},
            {"title": "优化器与训练技巧", "description": "SGD、Momentum、Adam等优化器对比，学习率调度策略", "key_points": ["SGD+Momentum", "Adam", "学习率衰减", "Warmup"]},
            {"title": "正则化与泛化", "description": "Dropout、BatchNorm、数据增强等防止过拟合的技术", "key_points": ["Dropout", "BatchNorm", "数据增强", "早停法"]},
        ],
        "learning_methods": ["🔧 用NumPy实现反向传播", "🔬 可视化激活函数梯度", "🧪 对比不同优化器收敛速度"],
        "milestones": ["能画出反向传播的计算图", "能解释梯度消失的原因", "能说出Adam优化器的核心思想"],
        "resources_hint": ["交互式可视化", "代码练习", "3Blue1Brown视频"],
    },
    {
        "id": "ch04", "title": "Transformer架构",
        "keywords": ["Transformer", "注意力机制", "self-attention", "BERT", "GPT"],
        "goals": "掌握自注意力机制原理，理解 Transformer 在 NLP 和 CV 中的核心地位",
        "description": "Transformer是当代AI的基石架构，理解它就理解了GPT、BERT等大模型的核心",
        "key_concepts": ["Multi-Head Attention", "位置编码", "Encoder-Decoder", "BERT", "GPT系列"],
        "difficulty": 0.65,
        "estimated_hours": 20,
        "sub_topics": [
            {"title": "注意力机制原理", "description": "从Bahdanau注意力到Self-Attention，理解Query-Key-Value范式", "key_points": ["Q/K/V矩阵", "缩放点积注意力", "注意力权重可视化", "复杂度分析"]},
            {"title": "多头注意力与位置编码", "description": "多头并行捕获不同子空间信息，位置编码赋予序列位置感知", "key_points": ["多头并行", "正弦位置编码", "RoPE", "相对位置编码"]},
            {"title": "Transformer完整架构", "description": "Encoder-Decoder结构、残差连接、LayerNorm、FFN", "key_points": ["Encoder", "Decoder", "残差连接", "LayerNorm", "前馈网络"]},
            {"title": "BERT与GPT家族", "description": "预训练-微调范式：BERT的MLM+NSP vs GPT的自回归建模", "key_points": ["MLM预训练", "自回归生成", "Few-shot", "In-context Learning"]},
        ],
        "learning_methods": ["📐 手算注意力矩阵", "🎨 可视化注意力权重", "💻 用Hugging Face加载BERT"],
        "milestones": ["能写出Self-Attention的计算公式", "能解释Multi-Head的作用", "能区分Encoder-only/Decoder-only/Encoder-Decoder"],
        "resources_hint": ["论文精读", "注意力可视化工具", "Hugging Face教程"],
    },
    {
        "id": "ch05", "title": "自然语言处理",
        "keywords": ["NLP", "自然语言", "文本分类", "命名实体", "分词"],
        "goals": "掌握文本预处理、词嵌入及主流 NLP 任务的解决方案",
        "description": "从文本预处理到高级语义理解，掌握NLP全链路技术栈",
        "key_concepts": ["分词", "Word2Vec/GloVe", "文本分类", "命名实体识别", "情感分析"],
        "difficulty": 0.6,
        "estimated_hours": 16,
        "sub_topics": [
            {"title": "文本预处理", "description": "分词、去停用词、词干化/词形还原，中文分词特殊性", "key_points": ["jieba分词", "BPE", "WordPiece", "停用词"]},
            {"title": "词嵌入技术", "description": "从One-hot到Word2Vec、GloVe，再到上下文相关的ELMo/BERT嵌入", "key_points": ["Word2Vec(CBOW/Skip-gram)", "GloVe", "上下文嵌入", "词向量相似度"]},
            {"title": "经典NLP任务", "description": "文本分类、命名实体识别、情感分析、问答系统的主流方法", "key_points": ["TextCNN", "BiLSTM-CRF", "BERT微调", "Seq2Seq"]},
            {"title": "大模型时代的NLP", "description": "Prompt Engineering、指令微调、RLHF如何改变NLP范式", "key_points": ["Prompt", "指令微调", "RLHF", "Chain-of-Thought"]},
        ],
        "learning_methods": ["💻 用jieba做中文分词实验", "🔍 可视化词向量相似度", "🧪 微调BERT做文本分类"],
        "milestones": ["能描述Word2Vec的训练过程", "能用BERT微调完成文本分类", "能解释Prompt Engineering的基本策略"],
        "resources_hint": ["NLP实战项目", "词向量可视化", "Hugging Face课程"],
    },
    {
        "id": "ch06", "title": "计算机视觉",
        "keywords": ["CV", "计算机视觉", "CNN", "图像识别", "目标检测"],
        "goals": "理解卷积神经网络原理，掌握图像分类和目标检测的基本方法",
        "description": "从卷积操作的数学原理到目标检测的工程实践，构建完整的CV知识体系",
        "key_concepts": ["卷积层", "池化层", "ResNet", "YOLO", "数据增强"],
        "difficulty": 0.6,
        "estimated_hours": 16,
        "sub_topics": [
            {"title": "卷积神经网络基础", "description": "卷积操作、池化操作、感受野计算、参数共享的直觉理解", "key_points": ["卷积核", "步幅/填充", "池化", "参数共享", "感受野"]},
            {"title": "经典CNN架构演进", "description": "从LeNet到ResNet再到EfficientNet的架构设计思想变迁", "key_points": ["LeNet", "AlexNet", "VGG", "ResNet(残差连接)", "EfficientNet"]},
            {"title": "目标检测与分割", "description": "两阶段/单阶段检测器、语义分割、实例分割的基本框架", "key_points": ["R-CNN系列", "YOLO系列", "U-Net", "Mask R-CNN"]},
            {"title": "CV前沿：ViT与多模态", "description": "Vision Transformer、CLIP、SAM等跨模态视觉模型", "key_points": ["ViT", "CLIP", "SAM", "DINO"]},
        ],
        "learning_methods": ["🖼️ 用CNN做图像分类实践", "🔍 可视化卷积核特征图", "📊 对比不同检测模型性能"],
        "milestones": ["能解释卷积操作的计算过程", "能说明ResNet残差连接的作用", "能对比YOLO和Faster R-CNN的区别"],
        "resources_hint": ["CS231n课程", "PyTorch视觉教程", "论文阅读"],
    },
    {
        "id": "ch07", "title": "强化学习",
        "keywords": ["强化学习", "RL", "Q-learning", "策略梯度"],
        "goals": "理解马尔可夫决策过程，掌握 Q-Learning 和策略梯度的基本原理",
        "description": "从Agent-Environment交互框架出发，理解智能体如何通过试错学习最优策略",
        "key_concepts": ["MDP", "Q-Learning", "DQN", "Policy Gradient", "Reward Shaping"],
        "difficulty": 0.7,
        "estimated_hours": 16,
        "sub_topics": [
            {"title": "强化学习基本框架", "description": "Agent-Environment交互、状态/动作/奖励、探索与利用的权衡", "key_points": ["MDP", "回报Discount", "策略", "价值函数", "Bellman方程"]},
            {"title": "基于价值的方法", "description": "Q-Learning、SARSA、DQN及其改进（Double DQN、Dueling DQN）", "key_points": ["Q表", "时序差分", "Experience Replay", "Target Network"]},
            {"title": "基于策略的方法", "description": "REINFORCE、Actor-Critic、A2C/A3C的基本思想", "key_points": ["策略梯度定理", "基线减少方差", "Actor-Critic", "优势函数"]},
            {"title": "RL前沿与应用", "description": "PPO、SAC、多智能体RL、RLHF在大模型训练中的应用", "key_points": ["PPO", "RLHF", "多智能体", "Reward Hacking"]},
        ],
        "learning_methods": ["🎮 用Gym环境做实验", "📊 可视化Q值收敛过程", "📝 推导策略梯度定理"],
        "milestones": ["能写出Q-Learning的更新公式", "能解释exploration vs exploitation", "能说明PPO为何在RLHF中被广泛使用"],
        "resources_hint": ["Sutton经典教材", "OpenAI Spinning Up", "Gymnasium教程"],
    },
    {
        "id": "ch08", "title": "AI伦理与安全",
        "keywords": ["伦理", "安全", "偏见", "公平性", "可解释性"],
        "goals": "认识 AI 系统中的偏见、隐私和安全风险，了解可解释 AI 方法",
        "description": "技术能力之外，理解AI的社会影响和安全风险同样重要",
        "key_concepts": ["算法偏见", "差分隐私", "对抗攻击", "可解释性 (XAI)", "AI治理"],
        "difficulty": 0.3,
        "estimated_hours": 8,
        "sub_topics": [
            {"title": "AI偏见与公平性", "description": "数据偏见、算法偏见、社会偏见的来源和缓解策略", "key_points": ["数据偏差", "公平性指标", "去偏见方法", "代表性不足"]},
            {"title": "隐私保护", "description": "差分隐私、联邦学习、数据脱敏等隐私保护技术", "key_points": ["差分隐私", "联邦学习", "k-匿名", "GDPR"]},
            {"title": "AI安全与对抗", "description": "对抗样本攻击、模型鲁棒性、后门攻击与防御", "key_points": ["FGSM", "PGD", "对抗训练", "后门攻击"]},
            {"title": "可解释AI与治理", "description": "XAI方法（SHAP/LIME）、AI伦理准则、法律法规", "key_points": ["SHAP", "LIME", "注意力可视化", "AI伦理框架"]},
        ],
        "learning_methods": ["📰 阅读AI伦理案例", "🤔 辩论AI隐私与便利的平衡", "🔬 复现简单对抗攻击"],
        "milestones": ["能举出2个AI偏见的真实案例", "能解释差分隐私的基本思想", "能说出XAI的2种方法"],
        "resources_hint": ["AI伦理案例集", "SHAP教程", "对抗攻击博客"],
    },
    {
        "id": "ch09", "title": "MLOps与AI工程实践",
        "keywords": ["MLOps", "部署", "CI/CD", "模型监控", "容器化"],
        "goals": "掌握模型从训练到部署的全流程，理解 MLOps 核心实践",
        "description": "从实验室到生产环境，掌握AI工程化部署的完整链路",
        "key_concepts": ["模型版本管理", "A/B测试", "Docker/K8s", "模型监控", "特征工程Pipeline"],
        "difficulty": 0.5,
        "estimated_hours": 12,
        "sub_topics": [
            {"title": "模型版本管理与实验追踪", "description": "MLflow、Weights & Biases等实验管理工具的使用", "key_points": ["MLflow", "W&B", "实验对比", "模型注册"]},
            {"title": "模型部署与服务化", "description": "REST API服务、模型格式转换、ONNX、TensorRT加速", "key_points": ["FastAPI部署", "ONNX", "TensorRT", "量化压缩"]},
            {"title": "容器化与编排", "description": "Docker打包、Kubernetes编排、GPU资源管理", "key_points": ["Dockerfile", "K8s Pod", "GPU调度", "弹性伸缩"]},
            {"title": "CI/CD与模型监控", "description": "自动化测试、数据漂移检测、模型性能监控", "key_points": ["CI/CD Pipeline", "数据漂移", "模型退化", "A/B测试"]},
        ],
        "learning_methods": ["🐳 用Docker部署模型API", "📊 搭建简易MLflow追踪", "🔧 编写CI/CD配置文件"],
        "milestones": ["能写出模型服务的Dockerfile", "能描述MLOps生命周期", "能解释数据漂移的概念"],
        "resources_hint": ["Docker官方教程", "MLOps实战指南", "K8s文档"],
    },
    {
        "id": "ch10", "title": "前沿方向与多模态AI",
        "keywords": ["多模态", "大语言模型", "LLM", "AGI", "前沿"],
        "goals": "了解大语言模型、多模态学习和 AGI 的最新进展与趋势",
        "description": "站在AI发展最前沿，了解改变世界的大模型技术和多模态融合趋势",
        "key_concepts": ["大语言模型 (LLM)", "多模态融合", "Prompt Engineering", "RAG", "Agent"],
        "difficulty": 0.5,
        "estimated_hours": 12,
        "sub_topics": [
            {"title": "大语言模型（LLM）", "description": "GPT、Claude、LLaMA等大模型的训练方法、涌现能力、 Scaling Law", "key_points": ["预训练", "微调", "涌现能力", "Scaling Law", "上下文窗口"]},
            {"title": "多模态学习", "description": "视觉-语言模型、跨模态对齐、多模态生成", "key_points": ["CLIP", "LLaVA", "GPT-4V", "跨模态对齐"]},
            {"title": "RAG与Agent", "description": "检索增强生成解决幻觉问题，AI Agent实现工具调用和自主决策", "key_points": ["向量检索", "知识库增强", "ReAct", "Function Calling"]},
            {"title": "AGI展望与挑战", "description": "通向AGI的技术路径、当前瓶颈、安全与对齐问题", "key_points": ["世界模型", "规划能力", "对齐问题", "可控性"]},
        ],
        "learning_methods": ["🔧 动手搭建RAG系统", "💬 体验不同大模型的能力", "📄 阅读前沿论文摘要"],
        "milestones": ["能描述LLM的基本训练流程", "能解释RAG如何减少幻觉", "能说出多模态融合的2种方式"],
        "resources_hint": ["arXiv论文", "大模型体验平台", "开源项目实战"],
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


def _parse_available_hours(available_time: str) -> float:
    """从用户 available_time 字符串估算每日可用学习小时数。

    支持格式："每天1-2小时"、"每周5小时"、"每天2小时"、"3小时/天" 等
    """
    import re
    if not available_time:
        return 1.5  # 默认每日1.5小时

    text = available_time.strip()

    # 尝试提取数字
    nums = re.findall(r'(\d+(?:\.\d+)?)', text)
    if not nums:
        return 1.5
    num = float(nums[0])

    if '周' in text:
        return round(num / 7, 1)
    elif '月' in text:
        return round(num / 30, 1)
    elif '小时' in text or 'h' in text.lower():
        return num
    else:
        return num


def _compute_mastery_for_chapter(ch: dict, profile: dict) -> float:
    """获取用户对某章节的掌握度（0-1）"""
    kb = profile.get("knowledge_base", {})
    ch_id = ch["id"]
    title = ch["title"]
    return kb.get(title, kb.get(ch_id, 0.5))


def _get_learning_method_for_style(base_methods: list[str], style: str) -> list[str]:
    """根据认知风格为学习方法增加个性化建议"""
    extra = []
    if style == "visual":
        extra = ["🎨 绘制本章思维导图", "📊 用图表整理概念关系"]
    elif style == "verbal":
        extra = ["📖 撰写本章学习笔记", "🗣️ 用自己的话复述核心概念"]
    elif style == "active":
        extra = ["动手实现核心算法", "🔧 参与开源项目实践"]
    elif style == "reflective":
        extra = ["📝 写学习反思日志", "🤔 对比不同方法的优劣"]

    # 合并去重
    combined = base_methods.copy()
    for m in extra:
        if m not in combined:
            combined.append(m)
    return combined[:5]  # 最多5个


def generate_path_data(profile: dict[str, Any] | None = None) -> dict[str, Any]:
    """生成完整的学习路径数据（nodes + edges + suggestions）。

    返回供前端直接使用的 PathData 结构。
    现在包含丰富的子主题、学习方法、里程碑、预估学时等信息。
    """
    profile = profile or {}
    weights = compute_chapter_weights(profile)
    order = topo_sort_kahn(EDGES, weights)

    # 计算用户每日可用学习时间
    daily_hours = _parse_available_hours(profile.get("available_time", ""))
    cognitive_style = profile.get("cognitive_style", "")

    # 预先构建前置关系映射
    prereq_map: dict[str, list[str]] = {ch["id"]: [] for ch in CHAPTERS}
    for e in EDGES:
        prereq_map[e["to"]].append(e["from"])

    total_estimated_hours = 0
    nodes = []
    for ch_id in order:
        ch = next(c for c in CHAPTERS if c["id"] == ch_id)
        w = weights.get(ch_id, 0.5)

        # 权重 → 优先级 (1-10)
        priority = max(1, min(10, round(w * 5 + 1)))

        # 基于章节复杂度和用户掌握度精确计算预估学时
        mastery = _compute_mastery_for_chapter(ch, profile)
        base_hours = ch.get("estimated_hours", 12)
        # 掌握度低 → 需要更多时间；掌握度高 → 可加速
        adjusted_hours = max(2, round(base_hours * (0.4 + 0.6 * (1.0 - mastery))))
        total_estimated_hours += adjusted_hours

        # 换算为天数（基于用户每日可用时间）
        if daily_hours > 0:
            estimated_days = max(1, round(adjusted_hours / daily_hours))
        else:
            estimated_days = max(3, round(adjusted_hours / 1.5))

        # 生成可读时长描述
        if estimated_days <= 3:
            duration = f"{estimated_days}天"
        elif estimated_days <= 7:
            duration = f"{estimated_days}天（约1周）"
        elif estimated_days <= 14:
            weeks = estimated_days / 7
            duration = f"约{round(weeks, 1)}周"
        else:
            weeks = estimated_days / 7
            duration = f"约{round(weeks, 1)}周"

        # 根据认知风格个性化学习方法
        learning_methods = _get_learning_method_for_style(
            ch.get("learning_methods", []), cognitive_style
        )

        # 生成丰富的描述（不再简单复制 goals）
        description = ch.get("description", ch.get("goals", f"学习{ch['title']}"))

        nodes.append({
            "id": ch_id,
            "title": ch["title"],
            "duration": duration,
            "estimated_hours": adjusted_hours,
            "estimated_days": estimated_days,
            "priority": priority,
            "description": description,
            "goals": ch.get("goals", ""),
            "key_concepts": ch.get("key_concepts", []),
            "difficulty": ch.get("difficulty", 0.5),
            "mastery": mastery,
            "sub_topics": ch.get("sub_topics", []),
            "learning_methods": learning_methods,
            "milestones": ch.get("milestones", []),
            "prerequisites": prereq_map.get(ch_id, []),
            "resources_hint": ch.get("resources_hint", []),
        })

    # 个性化建议（更丰富）
    suggestions = _generate_suggestions(profile, weights, daily_hours, total_estimated_hours)

    # 统计摘要
    summary = {
        "total_chapters": len(nodes),
        "total_hours": total_estimated_hours,
        "total_days": round(total_estimated_hours / daily_hours) if daily_hours > 0 else 0,
        "daily_hours": daily_hours,
        "hard_chapters": sum(1 for n in nodes if n["difficulty"] >= 0.6),
        "avg_difficulty": round(sum(n["difficulty"] for n in nodes) / len(nodes), 2) if nodes else 0,
    }

    return {
        "nodes": nodes,
        "edges": EDGES,
        "suggestions": suggestions,
        "summary": summary,
    }


def enrich_llm_nodes(llm_json: dict, profile: dict[str, Any] | None = None) -> dict[str, Any]:
    """补全 LLM 生成的稀疏节点数据，填充前端所需的全部字段。

    LLM 输出通常只有 id/title/description/key_concepts/difficulty 等基础字段，
    此函数补全 duration、estimated_hours、priority、sub_topics、learning_methods、
    milestones 等前端渲染必须的字段，以及 summary 和 suggestions。
    """
    profile = profile or {}
    nodes_in = llm_json.get("nodes", [])
    edges_in = llm_json.get("edges", [])

    if not nodes_in:
        raise ValueError("LLM 生成的节点列表为空")

    daily_hours = _parse_available_hours(profile.get("available_time", ""))
    cognitive_style = profile.get("cognitive_style", "")
    kb = profile.get("knowledge_base", {})

    # 校验节点 ID 唯一性
    ids = set()
    for n in nodes_in:
        nid = n.get("id", "")
        if not nid or nid in ids:
            raise ValueError(f"节点 ID 重复或为空: {nid}")
        ids.add(nid)

    # 校验边引用
    for e in edges_in:
        if e["from"] not in ids or e["to"] not in ids:
            raise ValueError(f"边引用不存在的节点: {e['from']}→{e['to']}")

    total_hours = 0
    nodes_out = []
    for n in nodes_in:
        base_hours = n.get("estimated_hours", 8)
        mastery = kb.get(n["title"], n.get("mastery", 0.5))
        adjusted_hours = max(2, round(base_hours * (0.4 + 0.6 * (1.0 - mastery))))
        total_hours += adjusted_hours

        if daily_hours > 0:
            estimated_days = max(1, round(adjusted_hours / daily_hours))
        else:
            estimated_days = max(3, round(adjusted_hours / 1.5))

        if estimated_days <= 3:
            duration = f"{estimated_days}天"
        elif estimated_days <= 7:
            duration = f"{estimated_days}天（约1周）"
        else:
            duration = f"约{round(estimated_days / 7, 1)}周"

        priority = max(1, min(10, round((1.0 - mastery) * 5 + (n.get("difficulty", 0.5) * 3) + 1)))

        learning_methods = _get_learning_method_for_style(
            n.get("learning_methods", ["阅读教材", "观看视频教程", "动手实践"]), cognitive_style
        )

        nodes_out.append({
            "id": n["id"],
            "title": n["title"],
            "duration": duration,
            "estimated_hours": adjusted_hours,
            "estimated_days": estimated_days,
            "priority": priority,
            "description": n.get("description", f"学习{n['title']}"),
            "goals": n.get("goals", f"掌握{n['title']}的核心概念与方法"),
            "key_concepts": n.get("key_concepts", []),
            "difficulty": n.get("difficulty", 0.5),
            "mastery": mastery,
            "sub_topics": n.get("sub_topics", [
                {"title": f"{n['title']}基础概念", "description": "核心概念与基本原理",
                 "key_points": ["基本定义", "发展历程", "应用场景"]},
            ]),
            "learning_methods": learning_methods,
            "milestones": n.get("milestones", [f"完成{n['title']}学习"]),
            "prerequisites": n.get("prerequisites", []),
            "resources_hint": n.get("resources_hint", []),
        })

    suggestions = _generate_suggestions(
        profile,
        {n["id"]: 1.0 - n["mastery"] for n in nodes_out},
        daily_hours, total_hours,
    )

    summary = {
        "total_chapters": len(nodes_out),
        "total_hours": total_hours,
        "total_days": round(total_hours / daily_hours) if daily_hours > 0 else 0,
        "daily_hours": daily_hours,
        "hard_chapters": sum(1 for n in nodes_out if n["difficulty"] >= 0.6),
        "avg_difficulty": round(sum(n["difficulty"] for n in nodes_out) / len(nodes_out), 2) if nodes_out else 0,
    }

    return {
        "nodes": nodes_out,
        "edges": edges_in,
        "suggestions": suggestions,
        "summary": summary,
    }


def _generate_suggestions(
    profile: dict, weights: dict[str, float],
    daily_hours: float, total_hours: float,
) -> list[str]:
    """基于画像和权重生成个性化学习建议。"""
    suggestions = []
    kb = profile.get("knowledge_base", {})
    weak = profile.get("weak_points", [])
    style = profile.get("cognitive_style", "")
    goal = profile.get("learning_goal", "")
    interests = profile.get("interests", [])

    # 学习节奏建议
    if daily_hours >= 3:
        suggestions.append(f"每天{daily_hours}小时的学习时间很充裕！总计约{total_hours}小时的课程预计可在{round(total_hours/daily_hours/7, 1)}周内完成")
    elif daily_hours >= 1:
        suggestions.append(f"按每天{daily_hours}小时计算，完成全部课程约需{round(total_hours/daily_hours)}天，建议保持稳定的学习节奏")
    else:
        suggestions.append(f"每天学习时间较少，建议优先学习高优先级章节，总计约{total_hours}学时的内容需要长期坚持")

    # 找最薄弱的章节
    sorted_weights = sorted(weights.items(), key=lambda x: x[1], reverse=True)
    weak_chapters = []
    for ch_id, w in sorted_weights[:3]:
        ch = next(c for c in CHAPTERS if c["id"] == ch_id)
        if w > 0.5:
            weak_chapters.append(ch["title"])
    if weak_chapters:
        suggestions.append(f"薄弱章节重点突破：{'、'.join(weak_chapters)}，建议在这些章节投入额外的练习时间")

    # 认知风格 + 学习方法建议
    style_map = {
        "visual": "视觉型学习者，建议充分利用思维导图、视频和图表类资源，每章学完后尝试绘制知识图谱",
        "verbal": "文字型学习者，建议多阅读课程文档和论文，通过撰写学习笔记加深理解",
        "active": "动手型学习者，建议每学完一个知识点就通过编程实践巩固，参与项目实战",
        "reflective": "反思型学习者，建议定期回顾学习内容，对比不同方法的优劣，撰写总结",
    }
    if style in style_map:
        suggestions.append(f"你是{style_map[style]}")

    # 学习目标关联
    if goal:
        suggestions.append(f"你的学习目标「{goal}」与本课程高度相关，建议在学习过程中不断回顾目标，保持方向感")

    # 易错点提醒
    if weak:
        suggestions.append(f"已记录的易错点：{'、'.join(weak[:3])}，学习时注意针对性练习和复习")

    # 兴趣导向
    if interests:
        interest_chapters = []
        for ch in CHAPTERS:
            if any(kw in it for kw in ch["keywords"] for it in interests):
                interest_chapters.append(ch["title"])
        if interest_chapters:
            suggestions.append(f"根据你的兴趣方向「{'、'.join(interests[:2])}」，推荐特别关注：{'、'.join(interest_chapters[:3])}")

    return suggestions[:7]  # 最多7条建议
