# 第四章：Transformer 架构

## 4.1 从 RNN 到 Transformer

### 4.1.1 RNN 的局限性

- **串行计算**：时间步之间存在依赖，无法并行化训练
- **长程依赖问题**：即使 LSTM/GRU 缓解了梯度消失，长序列效果仍有限
- **计算复杂度**：$O(n \cdot d^2)$

### 4.1.2 Self-Attention 的动机

Self-Attention 机制允许每个位置直接关注序列中的所有其他位置，打破了 RNN 的串行限制。

## 4.2 Self-Attention 机制

### 4.2.1 缩放点积注意力（Scaled Dot-Product Attention）

$$\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right)V$$

**三步过程**：
1. 计算 Query 和 Key 的点积相似度
2. 除以 $\sqrt{d_k}$ 进行缩放（防止点积过大导致 softmax 梯度饱和）
3. 对 Value 进行加权求和

### 4.2.2 多头注意力（Multi-Head Attention）

$$\text{MultiHead}(Q, K, V) = \text{Concat}(\text{head}_1, \ldots, \text{head}_h)W^O$$

其中 $\text{head}_i = \text{Attention}(QW_i^Q, KW_i^K, VW_i^V)$

**好处**：不同头关注不同子空间，捕捉多样的关系模式。

### 4.2.3 Q、K、V 的直观理解

| 角色 | 含义 | 类比 |
|------|------|------|
| Query（查询）| 当前位置想要查找什么 | 搜索关键词 |
| Key（键）| 所有位置能提供什么信息 | 文章标题 |
| Value（值）| 实际传递的信息内容 | 文章正文 |

## 4.3 Transformer 完整架构

Transformer 采用 Encoder-Decoder 结构：

### 4.3.1 Encoder 层

每个 Encoder 层包含两个子层：
1. **Multi-Head Self-Attention**：捕捉序列内部的依赖关系
2. **Feed-Forward Network（FFN）**：位置独立的全连接层

每个子层后有 **残差连接 + Layer Normalization**：

$$\text{LayerNorm}(x + \text{Sublayer}(x))$$

FFN 结构：
$$\text{FFN}(x) = \max(0, xW_1 + b_1)W_2 + b_2$$

### 4.3.2 Decoder 层

每个 Decoder 层包含三个子层：
1. **Masked Multi-Head Self-Attention**：防止关注未来位置（自回归生成）
2. **Cross-Attention**：关注 Encoder 的输出
3. **Feed-Forward Network**

### 4.3.3 位置编码（Positional Encoding）

Transformer 本身没有序列顺序概念，需要显式注入位置信息：

$$PE_{(pos, 2i)} = \sin\left(\frac{pos}{10000^{2i/d_{model}}}\right)$$
$$PE_{(pos, 2i+1)} = \cos\left(\frac{pos}{10000^{2i/d_{model}}}\right)$$

## 4.4 预训练范式

### 4.4.1 Encoder-Only（BERT 类）

- **预训练任务**：MLM（Masked Language Modeling）+ NSP（Next Sentence Prediction）
- **特点**：双向上下文理解，擅长 NLU 任务
- **调优**：微调（Fine-tuning）在下游任务上

### 4.4.2 Decoder-Only（GPT 类）

- **预训练任务**：自回归语言建模（预测下一个 Token）
- **特点**：单向生成能力强，适合 NLG 任务
- **代表**：GPT-3、GPT-4、LLaMA、Claude

### 4.4.3 Encoder-Decoder（T5/BART 类）

- **预训练任务**：文本到文本（Text-to-Text）
- **特点**：统一的框架处理所有 NLP 任务

## 4.5 大语言模型（LLM）

### 4.5.1 Scaling Laws

- **Kaplan 等人（2020）**：模型性能与模型大小、数据集大小、计算量呈幂律关系
- **Chinchilla 定律（2022）**：对于给定的计算预算，最佳模型大小和训练 Token 数应大致相等（~20 tokens/parameter）

### 4.5.2 涌现能力（Emergent Abilities）

大规模语言模型展现出小模型没有的能力：
- In-Context Learning（上下文学习）
- Chain-of-Thought Reasoning（思维链推理）
- Zero-shot Generalization（零样本泛化）

### 4.5.3 训练流程

1. **预训练（Pre-training）**：海量无监督语料上训练基础模型
2. **监督微调（SFT）**：高质量指令-回答数据微调
3. **RLHF（RL from Human Feedback）**：基于人类偏好的强化学习对齐
4. **DPO（Direct Preference Optimization）**：直接偏好优化，简化 RLHF 流程

## 4.6 本章小结

本章深入讲解了 Transformer 架构的核心组件：Self-Attention、Multi-Head Attention、位置编码、Encoder-Decoder 结构，以及三大预训练范式（BERT、GPT、T5）。最后介绍了大语言模型的 Scaling Laws、涌现能力和训练流程。

---

> 思考题：
> 1. 为什么 Scaled Dot-Product Attention 中要除以 $\sqrt{d_k}$？
> 2. Decoder 中的 Masked Self-Attention 和 Cross-Attention 分别起什么作用？
> 3. RLHF 和 DPO 的区别和各自优缺点是什么？
