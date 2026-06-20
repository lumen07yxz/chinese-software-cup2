# 第四章：Transformer 架构

## 4.1 从 RNN 到 Transformer——背景与动机

### 4.1.1 序列建模范式的局限

在Transformer出现之前，序列建模（语言、音频、时间序列）由RNN/LSTM/GRU统治：

**RNN的三大不可逾越障碍**：

1. **串行计算的硬约束**：每个时间步的计算依赖前一步的隐藏状态，无法并行（$T$ 长度的序列至少 $T$步串行），这严重限制了GPU利用率和训练速度。
2. **长程依赖的困难**：即使LSTM的门控机制大幅改善（细胞状态C通过遗忘门传递梯度），但$\frac{\partial C_t}{\partial C_{t-1}} \approx f_t$，实践中 $f_t$ 很难理想地保持1（遗忘门很难被训练为完美记住远距离信息），100步以上仍不可靠。
3. **计算复杂度**：RNN逐时间步计算时间维度为 $O(n \cdot d^2)$，且 $d$（隐藏维度）因 $d^2$ 项对计算量影响极大。

对于**机器翻译**这种输入序列长、需要的平行语料多的任务，RNN的训练效率已成为瓶颈。

### 4.1.2 Attention Is All You Need——变革

2017年，Google的Vaswani等人发表《Attention Is All You Need》，提出**完全舍弃RNN和CNN**的纯注意力架构Transformer：

- 一句话核心：**用Self-Attention一步到位捕获序列中任意位置的依赖关系**
- 论文标题直接点明核心信息——"注意力就是你所需要的全部"

**关键假设**：序列中任意两个位置之间的关系，可以通过注意力权重的加权求和直接建模，不需要通过隐状态逐步传递。

### 4.1.3 RNN vs Self-Attention 的复杂度对比

| 特性 | RNN/LSTM | Self-Attention (Transformer) |
|------|----------|------------------------------|
| 计算 | 串行，$O(n \cdot d^2)$ | 并行，$O(n^2 \cdot d)$ |
| 最大路径长度 | $O(n)$（长时需门控辅助） | $O(1)$（直接一步连接） |
| 参数 | $d^2$级别的权重矩阵 | $4d^2$（QKV投影+输出） |

Self-Attention的 $n^2$ 项在序列长度 $n$ 很大时（>10K）成为瓶颈，但在多数NLP任务（$n<512$）中 $n^2$ 远小于RNN的串行 $n$ 约束。Transformer用**计算量换并行度**——这是一个极为成功的设计取舍。

---

## 4.2 Self-Attention 机制

### 4.2.1 缩放点积注意力（Scaled Dot-Product Attention）

这是Transformer最核心的运算：

$$\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right)V$$

**三步过程详解**：

1. **计算相似度**：$QK^T$ —— 查询矩阵与键矩阵的点积，得到 $n \times n$ 的注意力分数矩阵。每个元素 $Q_iK_j^T$ 表示第 $i$ 个查询（当前位置）与第 $j$ 个键（被关注位置）的"匹配程度"。
2. **缩放+Softmax**：$\text{softmax}(QK^T / \sqrt{d_k})$ —— 除以 $\sqrt{d_k}$ 后应用行级Softmax，将分数归一化为概率分布（即注意力权重）。缩放的必要性见下节。
3. **加权求和**：$(\text{softmax}(QK^T / \sqrt{d_k}))V$ —— 每个位置用注意力权重对所有位置的Value进行加权平均，得到该位置的上下文表示。

### 4.2.2 为什么除以 $\sqrt{d_k}$？

这是论文中被反复问到的细节。设 $q,k \in \mathbb{R}^{d_k}$ 均为零均值、方差为1的独立分布，则：

$$\mathbb{E}[q \cdot k] = 0, \quad \text{Var}(q \cdot k) = d_k$$

点积的**方差与维度成比例**。如果 $d_k$ 很大（如GPT-2的 $d_k=64$），点积的绝对值很大，softmax的梯度进入饱和区（接近one-hot→梯度接近0）。除以 $\sqrt{d_k}$ 后方差为1，softmax梯度处于有效区域。

以概率视角：对于两个长度为 $d_k$ 的随机向量，点积的方差为 $d_k$，标准差为 $\sqrt{d_k}$，归一化到标准差1。

### 4.2.3 Q、K、V 的直观类比

这是最常被问模糊的问题。系统性解释：

| 角色 | 符号 | 数学含义 | 数据库类比 | 自我提问 |
|------|------|----------|-----------|----------|
| **Query（查询）** | $Q$ | 当前位置想要找到什么 | 搜索关键词 | "我想关注什么？" |
| **Key（键）** | $K$ | 所有位置能提供什么信息 | 文档标题/标签 | "我有什么可被关注的？" |
| **Value（值）** | $V$ | 实际传递的信息内容 | 文档全文 | "我实际传达的信息是什么？" |

**具体例子**：句子 "The animal **it** didn't cross the street because **it** was too tired." 中的两个 "it"。
- "it" 作为Query去匹配前面所有词的Key → "The animal" 的Key与"it"的匹配度最高
- Value 是"所有词的实际语义内容"，加权求和后形成"it"的上下文表示

### 4.2.4 多头注意力（Multi-Head Attention）

多头注意力将输入投影到 $h$ 个不同的子空间，并行计算注意力：

$$\text{MultiHead}(Q, K, V) = \text{Concat}(\text{head}_1, \ldots, \text{head}_h)W^O$$

其中 $\text{head}_i = \text{Attention}(QW_i^Q, KW_i^K, VW_i^V)$

**为什么需要多头注意力？**
- 单头注意力只能学习一种关系模式（如语法关系或语义相似性）
- 不同的头可以学习不同的关系：语法结构（主语-动词关系）、语义相似度（同义词）、远程依赖（指代消解）
- 多头注意力的总计算量与单头注意力相近（将 $d_{model}$ 维投影到 $h$ 个头，每个 $d_k = d_{model}/h$）

**典型配置**：
| 模型 | $d_{model}$ | $h$ | $d_k$ |
|------|-------------|-----|-------|
| Transformer Base | 512 | 8 | 64 |
| Transformer Big | 1024 | 16 | 64 |
| BERT Base | 768 | 12 | 64 |
| BERT Large | 1024 | 16 | 64 |
| GPT-3 | 12288 | 96 | 128 |

---

## 4.3 Transformer 完整架构

### 4.3.1 Encoder 架构

每个Encoder层包含两个子层，每个子层后：**残差连接 + LayerNorm**：

$$\text{LayerNorm}(x + \text{Sublayer}(x))$$

1. **Multi-Head Self-Attention 子层**：
   - 输入：上层的输出（或嵌入层的输入）
   - Q、K、V都来自同一个输入序列
   - 输出：位置增强的上下文表示（每个位置的表示聚合了全序列信息）

2. **Feed-Forward Network（FFN）子层**：
   - 每个位置独立的位置前馈网络（不同位置共享参数），在GPT-2中规模：

   $$\text{FFN}(x) = \max(0, xW_1 + b_1)W_2 + b_2$$

   - 将维度扩张再收缩（$d_{ff} = 4 \times d_{model}$）：
     - BERT Base：768 → 3072 → 768
     - GPT-3：12288 → 49152 → 12288
   - **SwiGLU变体**（LLaMA/GPT-4使用）：$\text{SwiGLU}(x) = \text{Swish}(xW) \odot (xV)$
     - 较ReLU稍有改进，但参数量多了2/3，通常 $d_{ff}$ 相应缩减

**各层输出公式汇总**：

$$A^{(l)} = \text{LayerNorm}(H^{(l-1)} + \text{MultiHead}(H^{(l-1)}, H^{(l-1)}, H^{(l-1)}))$$
$$H^{(l)} = \text{LayerNorm}(A^{(l)} + \text{FFN}(A^{(l)}))$$

### 4.3.2 Decoder 架构

每个Decoder层包含三个子层：

1. **Masked Multi-Head Self-Attention**：
   - 与Self-Attention相同，但使用**下三角掩码**禁止关注未来位置
   - 掩码矩阵：$M_{ij} = -\infty \cdot 1_{i<j}$（对角线允许关注自身）
   - 作用：训练时模拟自回归生成（一次只能看到之前的Token）

2. **Cross-Attention（交叉注意力）**：
   - Query来自Decoder上层的输出（当前已生成的Token序列）
   - Key和Value来自Encoder的输出（整个源序列）
   - 作用：让Decoder在生成每个Token时"参考"源句子的对应部分

3. **Feed-Forward Network**

### 4.3.3 位置编码（Positional Encoding）

Transformer的Self-Attention是**位置无序**的——如果将输入Token的顺序打乱，输出也完全一致（因为注意力只计算成对相似度，不编码位置）。所以必须有机制注入位置信息。

**Sinusoidal位置编码（原始Transformer）**：

$$PE_{(pos, 2i)} = \sin\left(\frac{pos}{10000^{2i/d_{model}}}\right)$$
$$PE_{(pos, 2i+1)} = \cos\left(\frac{pos}{10000^{2i/d_{model}}}\right)$$

**为什么正弦-余弦编码有效？**
- 每个位置的编码向量是唯一的（在 $d_{model}$ 维度空间中的正弦波叠加）
- 相对位置信息可以表示为线性变换：$PE_{pos+k}$ 可以从 $PE_{pos}$ 的线性函数得到 → 模型可以学习相对位置关系
- 可处理任意长度（理论上可以外推到训练没见过的新长度）
- 不需要可学习参数，避免长度泛化中的参数调整

**可学习位置编码（BERT等使用）**：
BERT使用可学习的绝对位置嵌入表（最多512个位置）。优点是模型可自主调整编码方式，缺点是长度受限（不能超512）。

**RoPE（Rotary Position Embedding，旋转位置编码，LLaMA/GPT-4使用）**：

RoPE通过旋转矩阵将位置信息编码到Query和Key中，是相对位置编码的一种高效形式：

$$\text{RoPE}(\mathbf{x}_m, m) = R_m \mathbf{x}_m$$

旋转矩阵（二维情形）：
$$R_m = \begin{pmatrix} \cos m\theta & -\sin m\theta \\ \sin m\theta & \cos m\theta \end{pmatrix}$$

**关键性质**：$Q_m^T K_n = (R_m \mathbf{q}_m)^T (R_n \mathbf{k}_n) = \mathbf{q}_m^T R_{n-m} \mathbf{k}_n$ → 点积只依赖于相对位置 $n-m$

- 不增加可学习参数
- 支持相对位置编码的偏置
- 理论上可外推到任意长度（虽然实践中因Attention softmax值问题有时需要调整）
- 当前大模型的标准选择

**ALiBi（Attention with Linear Biases）**：
不直接加位置编码，而是在注意力分数上加线性偏置：
$$\text{score}(i, j) = \mathbf{q}_i \cdot \mathbf{k}_j - m \cdot (i - j)$$

$m$ 是每个注意力头特定的斜率（head 1的 $m$ 最大→最关注近处，head n的 $m$ 最小→可关注远处）。简单、长度外推能力强，但参数消耗多一些。

### 4.3.4 编码器-解码器 vs Decoder-Only vs Encoder-Only 对比

| 架构 | 代表模型 | 输入-输出关系 | 擅长任务 | 推理方式 |
|------|---------|--------------|----------|----------|
| **Encoder-Only** | BERT, RoBERTa | $X \to \text{repr}$ | 分类、序列标注、NER、情感分析 | 单向（一次前向） |
| **Decoder-Only** | GPT, LLaMA, Claude | $X_{<t} \to X_t$ | 文本生成、对话、In-Context Learning | 自回归（逐Token生成） |
| **Encoder-Decoder** | T5, BART | $X \to Y$ | 翻译、摘要、文本风格转换 | 编码一次+自回归解码 |

**为什么Decoder-Only成为主流**（2023年后的大模型趋势）：
1. **统一框架**：任何NLP任务都可转化为文本生成任务（Instruction Tuning）
2. **简单**：没有Encoder-Decoder的Cross-Attention，更简洁的参数结构
3. **推理效率**：KV Cache可以增量更新，无需重新编码整个输入
4. **缩放效果好**：Scaling Laws显示Decoder-Only的缩放比Encoder-Decoder更有效

---

## 4.4 训练细节与关键技巧

### 4.4.1 预训练—微调范式

**预训练阶段**——大规模无监督/自监督数据上的通用表示学习：

| 模型 | 预训练方式 | 训练数据规模 | 优化目标 |
|------|-----------|-------------|----------|
| BERT | Masked LM + NSP | BookCorpus 800M + Wikipedia 2500M词 | 15%掩码预测 + 句子关系判断 |
| RoBERTa | Masked LM（无NSP，动态掩码） | 160GB（BNB+Wikipedia+CC+Story） | 仅MLM，静态→动态掩码策略 |
| GPT-3 | Autoregressive LM | 570GB（Common Crawl + WebText + Books + Wikipedia） | 标准自回归LM损失 |
| LLaMA 2 | Autoregressive LM | 2T tokens | 自回归LM + 分组查询注意力 |

**数据清洗的极端重要性**：
- 去重（Deduplication）——大规模数据集中的重复样板会误导模型记忆而非学习
- 质量过滤——按PPL/Heuristic比例过滤低质量网页
- 毒性过滤——去除仇恨言论和色情内容
- Tokenizer训练——BPE/SentencePiece合并次数、词汇表大小的选择

**微调阶段**——在特定任务上的适配：

1. **全参数微调**：更新所有参数（昂贵但效果最好）
2. **指令微调（Instruction Tuning）**：用{指令, 回复}对微调，使模型学会遵循指令
3. **参数高效微调（PEFT）**：
   - **LoRA**（Low-Rank Adaptation）：$W = W_0 + BA$，$A \in \mathbb{R}^{r \times d}$，$B \in \mathbb{R}^{d \times r}$，$r << d$
     - 冻结原始权重，只学习低秩分解的 $A$ 和 $B$
     - 推理时可将 $BA$ 合并到 $W_0$ → 无额外推理开销
   - **QLoRA**：对基模型做4-bit量化 + LoRA微调可在单卡24GB上微调33B模型
   - **Adapter**：在每层插入small bottleneck网络
   - **Prefix Tuning**：在输入前添加可学习的虚Token

**典型LoRA配置**：
```python
from peft import LoraConfig

lora_config = LoraConfig(
    r=16,           # 秩（rank），越大越强但越贵
    lora_alpha=32,  # 缩放因子，实际学习率 = lora_alpha/r * LR
    target_modules=["q_proj", "v_proj"],  # 通常作用于Q和V投影
    lora_dropout=0.05,  # 微调时使用dropout防止过拟合
    bias="none"
)
```

### 4.4.2 训练技巧合集

- **混合精度训练（Mixed Precision）**：使用fp16或bf16 + fp32主权重副本
  - bf16（bfloat16）没有浮点精度问题（8位指数同fp32），适合大模型训练
  - bf16 vs fp16：bf16的8位指数范围更宽，不怕梯度爆炸；fp16的10位尾数精度更高
- **梯度累积（Gradient Accumulation）**：多个mini-batch梯度累积后统一更新，模拟大batch
- **ZeRO优化（Zero Redundancy Optimizer）**：分布式训练时分割存储优化器状态、梯度和参数，将显存负担从单GPU分散到所有GPU
- **Flash Attention**：通过分块运算（tiling）+ 重计算避免存储 $O(n^2)$ 的注意力分数矩阵，训练吞吐提升2-4倍，可获得8倍+的速度提升。支持 $O(n\log n)$ 复杂度。实现见Tri Dao (2022, 2023)

### 4.4.3 KV Cache（推理加速机制）

解码时，每个新Token的计算需要之前所有Token的Key和Value。如果不复用，每步要重新计算。KV Cache将之前的K、V缓存起来，每步只需计算新Token的Query、Key、Value，然后拼接缓存。

```python
# 伪代码：Decoder-Only推理（GPT风格）
def generate_token(model, input_ids, past_key_values):
    # past_key_values: 缓存之前所有步的[K, V]
    logits, new_past_key_values = model(input_ids, past_key_values=past_key_values)
    next_token = sample(logits[:, -1, :])
    return next_token, new_past_key_values
```

**推理性能**：第 $t$ 步的K缓存长度为 $t-1$ → 第 $t$ 步的总计算量（Attention部分）= $O(t \cdot d)$ vs 不加缓存的 $O(t^2 \cdot d)$

---

## 4.5 Scaling Laws（规模定律）

### 4.5.1 Kaplan Scaling Laws（2020）

OpenAI团队发现了Transformer性能与三个关键资源之间的**幂律关系**：

$$L(N, D, C) \propto \frac{a}{N^\alpha} + \frac{b}{D^\beta} + \frac{c}{C^\gamma}$$

- $N$：参数量
- $D$：训练Token数
- $C$：计算量（FLOPs）
- 当两个资源不受限时，增加第三个资源→性能可预测改善

**核心主张**：
1. **参数量的幂律**：性能随参数量增加而提升（在给定计算力下），无"拐点"出现
2. **数据规模的幂律**：性能随数据量增加而提升，不要因为参数增大了就去减少数据量
3. **计算量的幂律**：最优分配是同时增加参数和数据，保持约6:1的Token:参数比例（此时计算量最优）

### 4.5.2 Chinchilla 定律（DeepMind, 2022）

这可能是比Kaplan更有实际影响的Scaling结果：

**核心发现**：多数模型的"数据不足"——应该用更小的模型训练在更多的Token上。

| 模型 | 参数量 | 训练Token数 | 理论最优Token/参数比 |
|------|--------|------------|-------------------|
| Kaplan的GPT-3 | 175B | 300B | ~6.7:1 |
| **Chinchilla** | **70B** | **1.4T** | **~20:1** |

70B的Chinchilla在各种基准测试上超越了175B的GPT-3，训练计算量还少了30%。这个发现意味着：**在给定计算预算下，更大的模型不如更多数据的模型**。

### 4.5.3 涌现能力（Emergent Abilities）

2022年Wei等人系统性研究了只在大规模模型中出现的能力：

| 能力 | 描述 | 出现阈值（大致） | 为什么小模型没有？ |
|------|------|-----------------|-----------------|
| **In-Context Learning** | 提供few-shot示例即可执行新任务 | >10B | 小模型无法在参数空间中学习"通过注意力从示例中泛化的通用机制" |
| **Chain-of-Thought** | 展示中间推理步骤 | >100B | 需要足够的容量存储推理路径的长期依赖 |
| **Zero-shot多语言翻译** | 在不经过特定语言微调时即具有翻译能力 | >10B | 需要参数中存储"语言无关的表征" |
| **算术推理** | 多位数加减乘除 | >100B | 需要多个计算步骤在注意力中"展开" |

涌现能力是否存在？2024年的研究（如Schaeffer等人）提出了不同观点，认为涌现能力的"突然性"源于评估指标的粗粒度（如准确率0→100是阶跃性，但如果使用连续评估指标（如PPL）则平滑变化）。

---

## 4.6 大语言模型（LLM）的关键概念

### 4.6.1 训练流程

1. **预训练（Pre-training）**：海量无监督语料上训练基础模型（计算最昂贵阶段，1.5T tokens × 几十到几百B参数需要的计算量是数千到数万GPU-天）

2. **监督微调（SFT, Supervised Fine-Tuning）**：在有限的（通常10万～100万条）高质量指令-回答数据上微调，使模型学会遵循指令

3. **偏好对齐（Alignment）**：
   - **RLHF**：训练奖励模型 → PPO优化。本质：用人类反馈优化模型策略
   - **DPO**（Direct Preference Optimization）：直接从偏好对中优化，不需要显式奖励模型。推导核心：
     $$L_{DPO}(\pi_\theta; \pi_{ref}) = -\mathbb{E}_{(x,y_w,y_l)}\left[ \log \sigma\left(\beta \log\frac{\pi_\theta(y_w|x)}{\pi_{ref}(y_w|x)} - \beta \log\frac{\pi_\theta(y_l|x)}{\pi_{ref}(y_l|x)}\right) \right]$$
   - DPO的优势：训练更简单（不需要奖励模型，只有一个策略优化步骤），但RLHF在某些项目中经验上更好（可以迭代地优化奖励模型）

### 4.6.2 采样策略

| 方法 | 原理 | 特点 |
|------|------|------|
| **Greedy Decoding** | 每步选概率最高的Token | 确定性强，但质量通常最差（重复、机械） |
| **Beam Search** | 每一步保留概率最大的K个候选 | 适合翻译、摘要等确定性输出任务 |
| **Top-K Sampling** | 从概率最高的K个Token中采样 | 可控但K固定对分布不确定的情况不灵活 |
| **Top-P (Nucleus) Sampling** | 从累积概率达到P的最小Token集中采样 | 自适应，是目前的主流 |
| **Temperature Scaling** | $p'(x) = p(x)^{1/T} / \sum p(x')^{1/T}$ | $T<1$：锐化，$T>1$：平滑，$T=1$不变 |
| **Mirostat** | 动态调整，使下一个Token的熵接近目标 | 防止"dull"采样的新方法 |

**Temperature-Top-P配合使用**：大多数LLM推理使用 $T=0.7-0.9$ + $P=0.9-0.95$ 的组合

### 4.6.3 长上下文扩展

从GPT-3的2K → GPT-4的128K → Claude 3的200K → Gemini 1.5 Pro的1M → GPT-4 Turbo的128K → Claude 3.5的200K：

1. **RoPE扩展**（YaRN, NTK-aware Scaling）：
   - 改变RoPE的频率基值，使位置编码适应更长范围而保持相对关系
   - NTK（Neural Tangent Kernel）感知缩放：通过调整RoPE的 $\theta$ 值改变频谱以适应长序列

2. **Flash Attention级别扩展**：
   - 分块处理注意力（不必一次性加载全部 $n^2$ 矩阵到GPU SRAM）

3. **位置插值（Position Interpolation）**：
   - 将更长的位置映射到RoPE训练时的位置范围：$PE'_{pos} = PE_{pos \cdot L_{train}/L_{infer}}$

4. **Ring Attention**（2023）：
   - 顺序（序列维度）切片分发到多个GPU，每个GPU计算注意力块 → AllReduce汇合

5. **StreamingLLM**（2023）：
   - 仅保留最近Token + 初始Token（"注意力漏斗"），不需要完整的KV Cache即可处理无限流

---

## 4.7 本章小结

本章深入讲解了Transformer架构：

1. **从RNN到Transformer的动机**——串行 vs 并行、长程依赖、计算效率
2. **Self-Attention机制**——缩放点积注意力的数学推导、除以 $\sqrt{d_k}$ 的原因、QKV的语义解释
3. **多头注意力**——多子空间并行关注不同关系模式
4. **完整架构**——Encoder（Self-Attention → FFN）、Decoder（Masked Self-Attention → Cross-Attention → FFN）、位置编码（Sinusoidal / RoPE / ALiBi）
5. **预训练-微调范式**——从自监督到指令微调，LoRA/QLoRA等PEFT方法
6. **Scaling Laws**——Kaplan幂律、Chinchilla最优分配、涌现能力的阈值效应
7. **训练细节**——KV Cache、Flash Attention、混合精度训练、ZeRO优化
8. **LLM要点**——SFT、RLHF/DPO、采样策略、长上下文扩展技术

---

> **思考题：**
>
> 1. Self-Attention中除以 $\sqrt{d_k}$ 的必要性——如果不做缩放，$d_k=512$ 时点积的方差和softmax梯度会怎样？
> 2. 为什么Decoder中的"Masked Self-Attention"和Encoder的"Self-Attention"不同？没有Mask会怎样？
> 3. RoPE相比绝对位置编码的优势在哪些方面？为什么它成了当前大模型的标准选择？
> 4. Flash Attention的核心优化思想是什么？它是如何避免存储 $O(n^2)$ 的注意力分数矩阵的？
> 5. Scaling Laws的工程含义——给定固定的计算预算，你有100B参数和300B tokens，还是70B参数和1.4T tokens？根据Kaplan和Chinchilla的结论分别是什么？
> 6. RLHF和DPO的核心区别是什么？为什么DPO提出后，许多实际项目中RLHF仍然是主要选择？
