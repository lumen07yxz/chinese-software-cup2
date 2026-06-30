"""概念本体 — 形式化的概念层级结构与依赖关系

从 knowledge_base/knowledge_graph.py 的 10 章中提取 30+ 核心概念，
每个概念有 title、prerequisites、related、difficulty、keywords 和所属章节。

用途：
- 精确的掌握度追踪（粒度为概念而非章节）
- 先修知识验证（Gatekeeper）
- 自适应路径生成
- 错误分析（错误回答 → 追溯到哪个概念薄弱）
"""

CONCEPTS = {
    # ── ch01 人工智能导论 ──
    "ai_definition": {
        "title": "AI 定义与范畴",
        "prerequisites": [],
        "related": ["strong_weak_ai", "turing_test"],
        "difficulty": 0.1,
        "estimated_minutes": 20,
        "chapter": "ch01",
        "keywords": ["AI", "人工智能", "Narrow AI", "General AI"],
    },
    "strong_weak_ai": {
        "title": "强AI与弱AI",
        "prerequisites": ["ai_definition"],
        "related": ["turing_test", "ai_history"],
        "difficulty": 0.15,
        "estimated_minutes": 15,
        "chapter": "ch01",
        "keywords": ["强AI", "弱AI", "AGI", "Narrow AI"],
    },
    "turing_test": {
        "title": "图灵测试",
        "prerequisites": ["ai_definition"],
        "related": ["ai_history"],
        "difficulty": 0.1,
        "estimated_minutes": 15,
        "chapter": "ch01",
        "keywords": ["图灵测试", "Turing Test", "中文屋"],
    },
    "ai_history": {
        "title": "AI 发展简史",
        "prerequisites": ["ai_definition"],
        "related": ["turing_test", "ai_schools"],
        "difficulty": 0.15,
        "estimated_minutes": 25,
        "chapter": "ch01",
        "keywords": ["AI寒冬", "达特茅斯", "深度学习复兴", "GPT"],
    },
    "ai_schools": {
        "title": "AI 技术流派",
        "prerequisites": ["ai_definition"],
        "related": ["expert_systems", "neural_networks_basics", "reinforcement_learning"],
        "difficulty": 0.2,
        "estimated_minutes": 20,
        "chapter": "ch01",
        "keywords": ["符号主义", "连接主义", "行为主义", "专家系统"],
    },

    # ── ch02 机器学习基础 ──
    "ml_paradigms": {
        "title": "三大机器学习范式",
        "prerequisites": ["ai_definition"],
        "related": ["supervised_learning", "unsupervised_learning", "reinforcement_learning"],
        "difficulty": 0.3,
        "estimated_minutes": 25,
        "chapter": "ch02",
        "keywords": ["监督学习", "无监督学习", "强化学习", "范式"],
    },
    "supervised_learning": {
        "title": "监督学习",
        "prerequisites": ["ml_paradigms"],
        "related": ["linear_regression", "logistic_regression", "decision_tree"],
        "difficulty": 0.35,
        "estimated_minutes": 30,
        "chapter": "ch02",
        "keywords": ["标签", "分类", "回归", "监督"],
    },
    "linear_regression": {
        "title": "线性回归",
        "prerequisites": ["supervised_learning"],
        "related": ["gradient_descent", "loss_function", "logistic_regression"],
        "difficulty": 0.35,
        "estimated_minutes": 30,
        "chapter": "ch02",
        "keywords": ["最小二乘", "回归", "线性模型", "MSE"],
    },
    "logistic_regression": {
        "title": "逻辑回归",
        "prerequisites": ["linear_regression"],
        "related": ["sigmoid", "cross_entropy", "classification"],
        "difficulty": 0.4,
        "estimated_minutes": 25,
        "chapter": "ch02",
        "keywords": ["Sigmoid", "分类", "交叉熵", "逻辑回归"],
    },
    "decision_tree": {
        "title": "决策树与集成方法",
        "prerequisites": ["supervised_learning"],
        "related": ["random_forest", "xgboost", "overfitting"],
        "difficulty": 0.45,
        "estimated_minutes": 35,
        "chapter": "ch02",
        "keywords": ["信息增益", "基尼系数", "随机森林", "XGBoost"],
    },
    "loss_function": {
        "title": "损失函数",
        "prerequisites": ["linear_regression"],
        "related": ["gradient_descent", "cross_entropy"],
        "difficulty": 0.4,
        "estimated_minutes": 20,
        "chapter": "ch02",
        "keywords": ["MSE", "MAE", "交叉熵", "Hinge Loss"],
    },
    "gradient_descent": {
        "title": "梯度下降",
        "prerequisites": ["loss_function"],
        "related": ["backpropagation", "learning_rate", "optimizers"],
        "difficulty": 0.5,
        "estimated_minutes": 30,
        "chapter": "ch02",
        "keywords": ["SGD", "优化器", "收敛", "学习率"],
    },
    "overfitting": {
        "title": "过拟合与欠拟合",
        "prerequisites": ["supervised_learning"],
        "related": ["regularization", "cross_validation", "bias_variance"],
        "difficulty": 0.45,
        "estimated_minutes": 25,
        "chapter": "ch02",
        "keywords": ["过拟合", "欠拟合", "偏差", "方差"],
    },
    "cross_validation": {
        "title": "交叉验证与模型评估",
        "prerequisites": ["overfitting"],
        "related": ["regularization", "confusion_matrix"],
        "difficulty": 0.4,
        "estimated_minutes": 20,
        "chapter": "ch02",
        "keywords": ["K折", "ROC", "AUC", "混淆矩阵"],
    },

    # ── ch03 深度学习基础 ──
    "neural_networks_basics": {
        "title": "神经网络基本结构",
        "prerequisites": ["gradient_descent"],
        "related": ["perceptron", "activation_functions", "backpropagation"],
        "difficulty": 0.5,
        "estimated_minutes": 30,
        "chapter": "ch03",
        "keywords": ["感知机", "多层网络", "万能近似", "隐藏层"],
    },
    "activation_functions": {
        "title": "激活函数",
        "prerequisites": ["neural_networks_basics"],
        "related": ["relu", "sigmoid", "tanh", "gradient_vanishing"],
        "difficulty": 0.45,
        "estimated_minutes": 25,
        "chapter": "ch03",
        "keywords": ["ReLU", "Sigmoid", "Tanh", "Softmax"],
    },
    "backpropagation": {
        "title": "反向传播算法",
        "prerequisites": ["neural_networks_basics", "gradient_descent"],
        "related": ["chain_rule", "computational_graph", "autograd"],
        "difficulty": 0.65,
        "estimated_minutes": 40,
        "chapter": "ch03",
        "keywords": ["链式法则", "计算图", "梯度", "BP"],
    },
    "gradient_vanishing": {
        "title": "梯度消失与爆炸",
        "prerequisites": ["backpropagation", "activation_functions"],
        "related": ["relu", "batchnorm", "resnet"],
        "difficulty": 0.6,
        "estimated_minutes": 25,
        "chapter": "ch03",
        "keywords": ["梯度消失", "梯度爆炸", "数值稳定性"],
    },
    "optimizers": {
        "title": "优化器",
        "prerequisites": ["gradient_descent", "backpropagation"],
        "related": ["adam", "sgd_momentum", "learning_rate_schedule"],
        "difficulty": 0.55,
        "estimated_minutes": 30,
        "chapter": "ch03",
        "keywords": ["SGD", "Adam", "Momentum", "学习率衰减"],
    },
    "regularization": {
        "title": "正则化与泛化",
        "prerequisites": ["overfitting", "neural_networks_basics"],
        "related": ["dropout", "batchnorm", "data_augmentation", "early_stopping"],
        "difficulty": 0.5,
        "estimated_minutes": 25,
        "chapter": "ch03",
        "keywords": ["Dropout", "BatchNorm", "数据增强", "早停"],
    },

    # ── ch04 Transformer 架构 ──
    "attention_mechanism": {
        "title": "注意力机制",
        "prerequisites": ["neural_networks_basics"],
        "related": ["self_attention", "transformer", "qkv"],
        "difficulty": 0.6,
        "estimated_minutes": 35,
        "chapter": "ch04",
        "keywords": ["注意力", "QKV", "缩放点积", "Bahdanau"],
    },
    "self_attention": {
        "title": "自注意力机制",
        "prerequisites": ["attention_mechanism"],
        "related": ["multi_head_attention", "transformer", "positional_encoding"],
        "difficulty": 0.65,
        "estimated_minutes": 35,
        "chapter": "ch04",
        "keywords": ["Self-Attention", "QKV矩阵", "注意力权重"],
    },
    "multi_head_attention": {
        "title": "多头注意力",
        "prerequisites": ["self_attention"],
        "related": ["transformer", "positional_encoding"],
        "difficulty": 0.65,
        "estimated_minutes": 25,
        "chapter": "ch04",
        "keywords": ["多头", "并行", "子空间"],
    },
    "positional_encoding": {
        "title": "位置编码",
        "prerequisites": ["self_attention"],
        "related": ["multi_head_attention", "transformer", "rope"],
        "difficulty": 0.55,
        "estimated_minutes": 20,
        "chapter": "ch04",
        "keywords": ["正弦编码", "RoPE", "相对位置", "绝对位置"],
    },
    "transformer_architecture": {
        "title": "Transformer 完整架构",
        "prerequisites": ["multi_head_attention", "positional_encoding"],
        "related": ["bert", "gpt", "encoder_decoder"],
        "difficulty": 0.7,
        "estimated_minutes": 40,
        "chapter": "ch04",
        "keywords": ["Encoder", "Decoder", "残差", "LayerNorm", "FFN"],
    },

    # ── ch05 自然语言处理 ──
    "text_preprocessing": {
        "title": "文本预处理",
        "prerequisites": [],
        "related": ["word_embedding", "tokenization"],
        "difficulty": 0.3,
        "estimated_minutes": 20,
        "chapter": "ch05",
        "keywords": ["分词", "BPE", "WordPiece", "停用词"],
    },
    "word_embedding": {
        "title": "词嵌入技术",
        "prerequisites": ["text_preprocessing"],
        "related": ["word2vec", "glove", "contextual_embedding"],
        "difficulty": 0.5,
        "estimated_minutes": 30,
        "chapter": "ch05",
        "keywords": ["Word2Vec", "GloVe", "词向量", "CBOW", "Skip-gram"],
    },
    "bert": {
        "title": "BERT 预训练模型",
        "prerequisites": ["transformer_architecture", "word_embedding"],
        "related": ["gpt", "finetuning", "mlm"],
        "difficulty": 0.65,
        "estimated_minutes": 35,
        "chapter": "ch05",
        "keywords": ["BERT", "MLM", "NSP", "微调"],
    },
    "gpt": {
        "title": "GPT 系列模型",
        "prerequisites": ["transformer_architecture"],
        "related": ["bert", "llm", "prompt_engineering"],
        "difficulty": 0.6,
        "estimated_minutes": 30,
        "chapter": "ch05",
        "keywords": ["GPT", "自回归", "Few-shot", "In-context Learning"],
    },

    # ── ch06 计算机视觉 ──
    "cnn_basics": {
        "title": "卷积神经网络基础",
        "prerequisites": ["neural_networks_basics"],
        "related": ["pooling", "resnet", "cnn_architectures"],
        "difficulty": 0.55,
        "estimated_minutes": 35,
        "chapter": "ch06",
        "keywords": ["卷积", "池化", "感受野", "参数共享"],
    },
    "cnn_architectures": {
        "title": "经典 CNN 架构",
        "prerequisites": ["cnn_basics"],
        "related": ["resnet", "object_detection"],
        "difficulty": 0.6,
        "estimated_minutes": 30,
        "chapter": "ch06",
        "keywords": ["LeNet", "AlexNet", "VGG", "ResNet"],
    },
    "object_detection": {
        "title": "目标检测与分割",
        "prerequisites": ["cnn_basics"],
        "related": ["yolo", "rcnn", "semantic_segmentation"],
        "difficulty": 0.65,
        "estimated_minutes": 35,
        "chapter": "ch06",
        "keywords": ["YOLO", "R-CNN", "U-Net", "Mask R-CNN"],
    },

    # ── ch07 强化学习 ──
    "rl_framework": {
        "title": "强化学习基本框架",
        "prerequisites": ["ml_paradigms"],
        "related": ["mdp", "q_learning", "policy_gradient"],
        "difficulty": 0.6,
        "estimated_minutes": 30,
        "chapter": "ch07",
        "keywords": ["Agent", "Environment", "MDP", "Bellman"],
    },
    "q_learning": {
        "title": "Q-Learning 与 DQN",
        "prerequisites": ["rl_framework"],
        "related": ["policy_gradient", "mdp"],
        "difficulty": 0.65,
        "estimated_minutes": 35,
        "chapter": "ch07",
        "keywords": ["Q表", "时序差分", "Experience Replay", "DQN"],
    },
    "policy_gradient": {
        "title": "策略梯度方法",
        "prerequisites": ["rl_framework"],
        "related": ["q_learning", "actor_critic", "ppo"],
        "difficulty": 0.7,
        "estimated_minutes": 35,
        "chapter": "ch07",
        "keywords": ["REINFORCE", "Actor-Critic", "PPO", "优势函数"],
    },

    # ── ch08 AI 伦理与安全 ──
    "ai_bias": {
        "title": "AI 偏见与公平性",
        "prerequisites": ["ai_definition"],
        "related": ["xai", "ai_governance"],
        "difficulty": 0.25,
        "estimated_minutes": 20,
        "chapter": "ch08",
        "keywords": ["算法偏见", "公平性", "去偏见"],
    },
    "xai": {
        "title": "可解释 AI",
        "prerequisites": ["neural_networks_basics"],
        "related": ["ai_bias", "adversarial_attack"],
        "difficulty": 0.4,
        "estimated_minutes": 25,
        "chapter": "ch08",
        "keywords": ["SHAP", "LIME", "注意力可视化", "XAI"],
    },
    "adversarial_attack": {
        "title": "对抗攻击与防御",
        "prerequisites": ["neural_networks_basics"],
        "related": ["xai", "model_robustness"],
        "difficulty": 0.55,
        "estimated_minutes": 30,
        "chapter": "ch08",
        "keywords": ["FGSM", "PGD", "对抗训练", "鲁棒性"],
    },

    # ── ch09 MLOps ──
    "model_deployment": {
        "title": "模型部署与服务化",
        "prerequisites": ["neural_networks_basics"],
        "related": ["docker", "mlops_pipeline"],
        "difficulty": 0.45,
        "estimated_minutes": 25,
        "chapter": "ch09",
        "keywords": ["REST API", "ONNX", "TensorRT", "量化"],
    },
    "mlops_pipeline": {
        "title": "MLOps 工程实践",
        "prerequisites": ["model_deployment"],
        "related": ["docker", "ci_cd", "model_monitoring"],
        "difficulty": 0.5,
        "estimated_minutes": 30,
        "chapter": "ch09",
        "keywords": ["MLflow", "CI/CD", "数据漂移", "A/B测试"],
    },

    # ── ch10 前沿方向 ──
    "llm": {
        "title": "大语言模型 (LLM)",
        "prerequisites": ["transformer_architecture", "gpt"],
        "related": ["prompt_engineering", "rag", "agent"],
        "difficulty": 0.55,
        "estimated_minutes": 30,
        "chapter": "ch10",
        "keywords": ["LLM", "预训练", "涌现能力", "Scaling Law"],
    },
    "prompt_engineering": {
        "title": "提示工程",
        "prerequisites": ["llm"],
        "related": ["rag", "chain_of_thought"],
        "difficulty": 0.35,
        "estimated_minutes": 20,
        "chapter": "ch10",
        "keywords": ["Prompt", "Chain-of-Thought", "Few-shot"],
    },
    "rag": {
        "title": "检索增强生成 (RAG)",
        "prerequisites": ["llm", "word_embedding"],
        "related": ["prompt_engineering", "vector_db"],
        "difficulty": 0.5,
        "estimated_minutes": 25,
        "chapter": "ch10",
        "keywords": ["向量检索", "知识库", "幻觉", "RAG"],
    },
    "multimodal_ai": {
        "title": "多模态 AI",
        "prerequisites": ["transformer_architecture", "cnn_basics"],
        "related": ["clip", "llava", "gpt4v"],
        "difficulty": 0.55,
        "estimated_minutes": 25,
        "chapter": "ch10",
        "keywords": ["CLIP", "LLaVA", "GPT-4V", "跨模态"],
    },
}


# ── 辅助查询函数 ──

def get_concept(concept_id: str) -> dict | None:
    """获取单个概念的定义"""
    return CONCEPTS.get(concept_id)


def get_concepts_by_chapter(chapter: str) -> list[dict]:
    """获取某章节的所有概念"""
    return [
        {"id": cid, **c}
        for cid, c in CONCEPTS.items()
        if c["chapter"] == chapter
    ]


def get_prerequisites(concept_id: str) -> list[str]:
    """获取某概念的所有前置概念 ID 列表（含间接前置）"""
    concept = CONCEPTS.get(concept_id)
    if not concept:
        return []
    result = set()
    queue = list(concept.get("prerequisites", []))
    while queue:
        pre_id = queue.pop(0)
        if pre_id in result:
            continue
        result.add(pre_id)
        pre = CONCEPTS.get(pre_id)
        if pre:
            queue.extend(pre.get("prerequisites", []))
    return sorted(result)


def get_all_prerequisites(concept_ids: list[str]) -> list[str]:
    """获取多个概念的所有前置概念并集"""
    result = set()
    for cid in concept_ids:
        result.update(get_prerequisites(cid))
    return sorted(result)


def get_direct_prerequisites(concept_id: str) -> list[str]:
    """获取某概念的直接前置概念"""
    concept = CONCEPTS.get(concept_id)
    if not concept:
        return []
    return concept.get("prerequisites", [])


def get_all_concept_ids() -> list[str]:
    """获取所有概念 ID"""
    return list(CONCEPTS.keys())


def match_concept_from_text(text: str) -> str | None:
    """从文本中关键词匹配概念 ID"""
    text_lower = text.lower()
    best_id = None
    best_score = 0
    for cid, concept in CONCEPTS.items():
        score = 0
        for kw in concept.get("keywords", []):
            if kw.lower() in text_lower:
                score += 1
        if score > best_score:
            best_score = score
            best_id = cid
    return best_id if best_score >= 2 else None
