# 第五章：自然语言处理

## 5.1 NLP 概述

自然语言处理（Natural Language Processing, NLP）是 AI 的重要分支，研究计算机与人类自然语言之间的交互。NLP 涉及理解和生成两个核心方向。

### 5.1.1 NLP 的层级

1. **词法分析**：分词、词性标注、命名实体识别
2. **句法分析**：依存句法分析、短语结构分析
3. **语义分析**：词义消歧、语义角色标注
4. **语用分析**：指代消解、意图识别、情感分析
5. **篇章分析**：文本连贯性、主题建模

## 5.2 文本预处理

### 5.2.1 分词（Tokenization）

英文分词相对简单（按空格和标点），中文分词是挑战。

**中文分词方法**：
- 基于词典：正向/逆向最大匹配
- 基于统计：HMM、CRF
- 基于深度学习：BiLSTM-CRF

**子词分词（Subword Tokenization）**：

| 方法 | 原理 | 代表模型 |
|------|------|----------|
| BPE | 迭代合并高频字符对 | GPT 系列 |
| WordPiece | 基于似然的合并 | BERT |
| SentencePiece | 语言无关的分词 | LLaMA |
| Unigram | 基于概率的删除 | T5 |

### 5.2.2 文本表示

- **One-hot**：简单但维度灾难
- **TF-IDF**：Term Frequency × Inverse Document Frequency
- **Word2Vec**：CBOW + Skip-gram，分布式表示
- **GloVe**：全局词-词共现矩阵分解
- **Contextual Embeddings**：ELMo、BERT，上下文相关

## 5.3 预训练语言模型

### 5.3.1 BERT

- **架构**：Transformer Encoder（Bidirectional）
- **预训练**：MLM (15%) + NSP
- **输入**：[CLS] + Tokens + [SEP]
- **输出**：[CLS] 表示 → 分类，Token 表示 → 序列标注

### 5.3.2 GPT 系列演进

- **GPT-1** (2018)：117M，预训练+微调范式
- **GPT-2** (2019)：1.5B，Zero-shot 能力初现
- **GPT-3** (2020)：175B，In-Context Learning
- **GPT-3.5/ChatGPT** (2022)：RLHF 对齐
- **GPT-4** (2023)：多模态、长上下文

### 5.3.3 其他重要模型

- **RoBERTa**：优化 BERT 训练策略（更大 batch、更多数据、去掉 NSP）
- **DeBERTa**：解耦注意力 + 增强掩码解码器
- **ALBERT**：参数共享降低参数量

## 5.4 核心 NLP 任务

### 5.4.1 文本分类

应用：情感分析、主题分类、垃圾邮件检测

### 5.4.2 序列标注

- 命名实体识别（NER）：识别人名、地名、机构名等
- 词性标注（POS Tagging）
- 中文分词

### 5.4.3 文本生成

- 机器翻译
- 文本摘要
- 对话系统

### 5.4.4 信息抽取

- 关系抽取（Relation Extraction）
- 事件抽取（Event Extraction）
- 知识图谱构建

## 5.5 提示工程（Prompt Engineering）

### 5.5.1 基础技巧

- **Zero-shot Prompting**：直接给任务描述
- **Few-shot Prompting**：给出几个示例
- **Chain-of-Thought (CoT)**：要求模型展示推理步骤
- **角色设定**：赋予模型特定角色

### 5.5.2 进阶技巧

- **Self-Consistency**：多次采样取多数
- **Tree-of-Thoughts (ToT)**：搜索推理树
- **ReAct**：推理 + 行动交替
- **Constitutional AI**：用原则约束输出

## 5.6 评估指标

| 指标 | 公式 | 用途 |
|------|------|------|
| Perplexity | $\exp(-\frac{1}{N}\sum\log P(w_i))$ | 语言模型困惑度 |
| BLEU | n-gram 精确率 × 长度惩罚 | 机器翻译 |
| ROUGE | n-gram 召回率 | 文本摘要 |
| BERTScore | BERT 嵌入余弦相似度 | 生成质量评估 |

## 5.7 本章小结

本章介绍了 NLP 的核心概念：文本预处理与分词、词向量表示、预训练语言模型（BERT、GPT）、核心 NLP 任务、提示工程技术及评估指标。

---

> 思考题：
> 1. BPE 和 WordPiece 分词的区别是什么？
> 2. 为什么 GPT 选择 Decoder-Only 架构？
> 3. CoT 提示如何帮助模型解决复杂推理问题？
