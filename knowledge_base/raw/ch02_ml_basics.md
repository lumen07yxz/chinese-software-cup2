# 第二章：机器学习基础

## 2.1 机器学习概述

### 2.1.1 机器学习的定义与本质

机器学习（Machine Learning, ML）是人工智能的核心子领域，研究如何让计算机系统利用数据自动改善性能。Arthur Samuel 在1959年将其定义为"使计算机无需明确编程即可学习的研究领域"——他开发的跳棋程序通过自对弈不断改进，最终击败了人类州冠军。

Tom Mitchell 在1997年给出了更严格的形式化定义：

> **对于某类任务 T 和性能度量 P，一个计算机程序被认为能从经验 E 中学习，如果它在任务 T 中的性能（由 P 衡量）随着经验 E 的增加而提高。**

这个定义将机器学习操作化为三个明确组件：
- **任务 T（Task）**：模型要解决的问题（分类、回归、聚类等）
- **经验 E（Experience）**：模型学习的数据（训练样本）
- **性能度量 P（Performance）**：衡量模型好坏的指标（准确率、F1等）

### 2.1.2 机器学习的数学本质

从数学角度看，监督学习是在假设空间 $\mathcal{H}$ 中寻找一个函数 $h: \mathcal{X} \to \mathcal{Y}$，使期望风险最小化：

$$h^* = \arg\min_{h \in \mathcal{H}} R(h) = \arg\min_{h \in \mathcal{H}} \mathbb{E}_{(x,y) \sim P}[\mathcal{L}(h(x), y)]$$

由于真实数据分布 $P$ 未知，我们用经验风险进行近似：

$$\hat{h} = \arg\min_{h \in \mathcal{H}} \hat{R}(h) = \arg\min_{h \in \mathcal{H}} \frac{1}{n}\sum_{i=1}^n \mathcal{L}(h(x_i), y_i)$$

**泛化误差** = 近似误差 + 估计误差：
- **近似误差**：最优假设和假设空间中最优假设的差距（模型容量不足）
- **估计误差**：有限样本导致的经验风险与期望风险的差距（数据不足或过拟合）

### 2.1.3 机器学习的三大范式

| 范式 | 数据形式 | 学习目标 | 典型算法 | 典型应用 |
|------|----------|----------|----------|----------|
| **监督学习** | $(x, y)$ 成对数据 | 学习 $P(y|x)$ 或 $f: x \to y$ | 线性回归、逻辑回归、决策树、SVM、神经网络 | 分类、回归、序列标注 |
| **无监督学习** | 只有 $x$，无 $y$ | 发现数据内在结构 $P(x)$ | K-Means、PCA、GMM、DBSCAN、AutoEncoder | 聚类、降维、密度估计、异常检测 |
| **强化学习** | $(s, a, r, s')$ 序列 | 学习策略 $\pi(a|s)$ 最大化累积奖励 | Q-Learning、DQN、PPO、A2C | 游戏、机器人、推荐系统 |

**额外范式：**

- **半监督学习（Semi-Supervised Learning）**：大量无标签数据 + 少量有标签数据。利用无标签数据学习数据分布，提升监督学习性能。方法包括自训练（self-training）、协同训练（co-training）、一致性正则化、伪标签（pseudo-labeling）等。
- **自监督学习（Self-Supervised Learning）**：从数据本身构造监督信号，无需人工标注。典型的预训练任务包括掩码语言建模（MLM）、掩码图像建模（MAE）、对比学习（SimCLR、MoCo）等。SSL是大模型预训练的核心技术。
- **迁移学习（Transfer Learning）**：将源领域学到的知识应用到目标领域。包括微调（fine-tuning）、特征提取、领域自适应等。
- **元学习（Meta-Learning / Learning to Learn）**：学习"如何学习"——在多个任务上训练一个模型，使其能快速适应新任务。方法包括MAML、Prototypical Networks、Reptile等。

### 2.1.4 偏差-方差权衡的深入理解

这是机器学习中最核心的概念之一。对给定测试点 $x_0$，期望预测误差可分解为：

$$\mathbb{E}_{\mathcal{D}}[(y_0 - \hat{f}(x_0))^2] = \underbrace{(\mathbb{E}[\hat{f}(x_0)] - f(x_0))^2}_{\text{Bias}^2} + \underbrace{\mathbb{E}[(\hat{f}(x_0) - \mathbb{E}[\hat{f}(x_0)])^2]}_{\text{Variance}} + \underbrace{\sigma^2}_{\text{Irreducible Error}}$$

- **偏差（Bias）**：学习算法的期望预测与真实值的偏离程度。高偏差→欠拟合，模型过于简单。
- **方差（Variance）**：对不同训练集的预测变化程度。高方差→过拟合，模型对训练数据波动太敏感。
- **不可约误差（$\sigma^2$）**：数据本身的噪声，任何模型都无法消除。

**偏差-方差权衡**：模型复杂度增加→偏差降低但方差升高。最优复杂度在二者之和达到最小时。这解释了为什么模型选择不能仅看训练误差。

---

## 2.2 监督学习——详细算法

### 2.2.1 线性回归

线性回归假设目标值与特征之间存在线性关系：

$$\hat{y} = \mathbf{w}^T\mathbf{x} + b = \sum_{j=1}^d w_j x_j + b$$

**最小二乘估计（OLS）**：

目标是最小化残差平方和（RSS）：
$$L(\mathbf{w}, b) = \frac{1}{n}\sum_{i=1}^{n}(y_i - \mathbf{w}^T\mathbf{x}_i - b)^2 = \frac{1}{n}\|\mathbf{y} - X\mathbf{w} - b\mathbf{1}\|^2$$

**解析解——正规方程（Normal Equation）**：

将偏置 $b$ 吸收到权重向量中（令 $x_0 = 1$），有：

$$\hat{\mathbf{w}} = (X^TX)^{-1}X^T\mathbf{y}$$

计算复杂度为 $O(d^3 + nd^2)$，$d$ 为特征维度。当 $d$ 很大（>10^4）时不可行。

**数值解——梯度下降**：

$$\mathbf{w}^{(t+1)} = \mathbf{w}^{(t)} - \eta \nabla L(\mathbf{w}^{(t)}) = \mathbf{w}^{(t)} + \frac{2\eta}{n}X^T(\mathbf{y} - X\mathbf{w}^{(t)})$$

三种变体：
- **批量梯度下降（BGD）**：每次使用全部 $n$ 个样本 → 稳定但慢
- **随机梯度下降（SGD）**：每次使用1个样本 → 噪声大但快，天然噪声有助于逃离局部最优
- **小批量梯度下降（Mini-batch GD）**：每次使用 $m$ 个样本（$m$ 通常为32/64/128）→ 折中实用

**线性回归的关键假设**：
1. **线性性**：$y$ 是 $\mathbf{x}$ 的线性函数
2. **独立性**：样本之间相互独立
3. **同方差性**：误差方差与 $\mathbf{x}$ 无关
4. **正态性**：误差服从正态分布（用于假设检验和置信区间，预测本身不需要）

**正则化线性回归**：

- **岭回归（Ridge / L2）**：$L = \|y - Xw\|^2 + \lambda\|w\|_2^2$，收缩系数但不稀疏
- **Lasso（L1）**：$L = \|y - Xw\|^2 + \lambda\|w\|_1$，产生稀疏解，自动特征选择
- **弹性网络（Elastic Net）**：$L = \|y - Xw\|^2 + \lambda_1\|w\|_1 + \lambda_2\|w\|_2^2$，兼顾两者

**贝叶斯视角**：
- 岭回归 = 权重服从高斯先验的MAP估计
- Lasso = 权重服从拉普拉斯先验的MAP估计

### 2.2.2 逻辑回归

逻辑回归是经典的二分类模型，核心是 Sigmoid 函数将线性输出映射为概率：

$$\sigma(z) = \frac{1}{1 + e^{-z}}, \quad \sigma'(z) = \sigma(z)(1 - \sigma(z))$$

$$P(y=1|\mathbf{x}) = \sigma(\mathbf{w}^T\mathbf{x} + b) = \frac{1}{1 + e^{-(\mathbf{w}^T\mathbf{x} + b)}}$$

**决策边界**：$\mathbf{w}^T\mathbf{x} + b = 0$，当 $\sigma > 0.5$ 时预测为正类。

**从概率角度的推导**（极大似然估计）：

$$P(y|\mathbf{x}; \mathbf{w}) = \sigma(\mathbf{w}^T\mathbf{x})^y (1-\sigma(\mathbf{w}^T\mathbf{x}))^{1-y}$$

对数似然（等价于交叉熵损失的负值）：

$$\ell(\mathbf{w}) = \sum_{i=1}^n [y_i \log \sigma(\mathbf{w}^T\mathbf{x}_i) + (1-y_i)\log(1-\sigma(\mathbf{w}^T\mathbf{x}_i))]$$

**损失函数——交叉熵（Binary Cross-Entropy）**：

$$\mathcal{L}(\mathbf{w}) = -\frac{1}{n}\sum_{i=1}^n [y_i\log(\hat{y}_i) + (1-y_i)\log(1-\hat{y}_i)]$$

梯度简洁优美：

$$\nabla_{\mathbf{w}}\mathcal{L} = \frac{1}{n}\sum_{i=1}^n (\hat{y}_i - y_i)\mathbf{x}_i = \frac{1}{n}X^T(\hat{\mathbf{y}} - \mathbf{y})$$

与线性回归的梯度形式一致——这正是使用交叉熵损失的动机之一。

**多分类推广——Softmax回归**：

$$P(y=k|\mathbf{x}) = \frac{\exp(\mathbf{w}_k^T\mathbf{x} + b_k)}{\sum_{j=1}^K \exp(\mathbf{w}_j^T\mathbf{x} + b_j)}$$

损失函数为多类交叉熵：$\mathcal{L} = -\frac{1}{n}\sum_{i=1}^n \sum_{k=1}^K y_{ik}\log\hat{y}_{ik}$

### 2.2.3 决策树与集成方法

#### 决策树

决策树通过递归地选择最优特征进行分裂，构建树形决策结构。在每个节点选择能使"不纯度"下降最多的特征分裂。

**三种分裂准则**：

- **信息增益（ID3使用）**：$IG(D, A) = H(D) - \sum_{v \in \text{Values}(A)} \frac{|D_v|}{|D|}H(D_v)$
  其中信息熵 $H(D) = -\sum_{k=1}^K p_k\log_2 p_k$

- **信息增益比（C4.5使用）**：$IGR(D, A) = IG(D, A) / H_A(D)$，修正信息增益偏向多值特征的倾向

- **基尼指数（CART使用）**：$Gini(D) = 1 - \sum_{k=1}^K p_k^2 = \sum_{k \neq k'} p_k p_{k'}$，衡量随机选两个样本类别不一致的概率

**剪枝策略**：
- **预剪枝（Pre-pruning）**：早停——当分裂带来的收益小于阈值时停止
- **后剪枝（Post-pruning）**：先生成完整树，再自底向上剪枝。CART使用代价复杂度剪枝：$R_\alpha(T) = R(T) + \alpha|T|$

**决策树的优缺点**：
- ✅ 可解释性强，可视化直观；无需特征归一化；自然处理缺失值；天然多分类
- ❌ 容易过拟合（需要剪枝）；对数据微小变化敏感（方差大）；难以捕捉线性关系；贪心分裂不一定全局最优

#### 随机森林（Random Forest）

Bagging（Bootstrap Aggregating）+ 随机特征选择的组合：

$$f_{RF}(\mathbf{x}) = \frac{1}{B}\sum_{b=1}^B T_b(\mathbf{x}; \mathcal{D}_b, \Theta_b)$$

关键随机性来源：
1. **Bootstrap采样**：每个树使用原始数据的有放回采样（约63.2%的样本被选中，未选中的为OOB样本用于评估）
2. **特征随机选择**：每次分裂时仅考虑 $m = \sqrt{d}$（分类）或 $m = d/3$（回归）个随机特征子集

**OOB误差（Out-of-Bag Error）**：使用未被Bootstrap选中的样本评估，无需额外验证集——接近交叉验证但免费。

**特征重要性**：基于OOB样本特征打乱后的性能下降量，或基于分裂时的基尼/信息增益降低量。

#### 提升方法（Boosting）

Boosting的思想是：加权组合弱学习器（只比随机猜测好一点的模型），逐步纠正前序模型的错误。

**AdaBoost**：
- 初始化样本权重 $w_i = 1/n$
- 每轮：用当前权重训练弱学习器 $G_t$ → 计算加权错误率 → 计算模型权重 $\alpha_t = \frac{1}{2}\ln\frac{1-\epsilon_t}{\epsilon_t}$ → 更新样本权重（错误样本权重增加）
- 最终模型：$f(x) = \sum_{t=1}^T \alpha_t G_t(x)$

**Gradient Boosting**（通用框架）：
将Boosting视为函数空间的梯度下降。每轮学习的目标是前序模型损失函数的负梯度（残差近似）：
$$r_{it} = -\left[\frac{\partial L(y_i, f(x_i))}{\partial f(x_i)}\right]_{f=f_{t-1}}$$

然后用一个基学习器拟合这些残差。

**XGBoost**（eXtreme Gradient Boosting）：
- 对损失函数做二阶泰勒展开，同时使用一阶和二阶梯度
- 引入正则化项（叶子数 + 叶子权重L2范数）
- 内置缺失值处理、特征重要性评估、列采样
- 支持分布式训练和GPU加速
- 使用近似贪心算法寻找最佳分裂点（分位数sketch）

**LightGBM**：
- 基于直方图的决策树算法（连续特征分桶，大幅降低计算量）
- 使用Gradient-based One-Side Sampling（GOSS）保留大梯度样本+随机采样小梯度
- Leaf-wise生长策略（找分裂增益最大的叶子分裂）vs XGBoost的Level-wise
- 训练速度通常是XGBoost的3-10倍

**CatBoost**：
- 使用Ordered Target Statistics处理类别特征，无偏估计训练统计量
- Ordered Boosting减少预测偏移
- 对类别特征的开箱即用支持

### 2.2.4 支持向量机（SVM）

SVM的核心思想：找到使分类间隔（margin）最大化的分离超平面。间隔最大的超平面对未见数据的泛化能力最强（结构风险最小化原理）。

**硬间隔SVM**（线性可分情况）：

最大化间隔 $\gamma = \frac{2}{\|\mathbf{w}\|}$ 等价于最小化 $\frac{1}{2}\|\mathbf{w}\|^2$：

$$\min_{\mathbf{w},b} \frac{1}{2}\|\mathbf{w}\|^2 \quad \text{s.t. } y_i(\mathbf{w}^T\mathbf{x}_i + b) \geq 1, \forall i$$

**对偶形式推导**：

引入拉格朗日乘子 $\alpha_i \geq 0$，得到对偶问题：

$$\max_{\alpha} \sum_{i=1}^n \alpha_i - \frac{1}{2}\sum_{i=1}^n\sum_{j=1}^n \alpha_i\alpha_j y_i y_j \mathbf{x}_i^T\mathbf{x}_j$$

$$\text{s.t. } \sum_{i=1}^n \alpha_i y_i = 0, \quad \alpha_i \geq 0$$

**KKT条件**表明只有支持向量（$0 < \alpha_i$）对决策边界有贡献：
$$\mathbf{w} = \sum_{i=1}^n \alpha_i y_i \mathbf{x}_i$$

决策函数：$f(\mathbf{x}) = \text{sign}\left(\sum_{i \in SV} \alpha_i y_i \mathbf{x}_i^T \mathbf{x} + b\right)$

**软间隔SVM**（线性不可分情况）：

引入松弛变量 $\xi_i \geq 0$ 允许部分样本在间隔内或错误侧：

$$\min_{\mathbf{w},b,\xi} \frac{1}{2}\|\mathbf{w}\|^2 + C\sum_{i=1}^n \xi_i \quad \text{s.t. } y_i(\mathbf{w}^T\mathbf{x}_i + b) \geq 1-\xi_i$$

$C$ 是惩罚参数，平衡间隔最大化和错误容忍：
- $C$ 大 → 硬度大，少量错误 → 可能过拟合
- $C$ 小 → 容忍多错误 → 间隔宽 → 泛化好但可能欠拟合

**核技巧（Kernel Trick）**：

核函数隐式地将数据映射到高维空间而不显式计算映射，使SVM能够处理非线性问题。任何满足Mercer条件的正定函数都可以作为核。

常见核函数：

| 核函数 | 公式 | 参数 | 特点 |
|--------|------|------|------|
| 线性核 | $K(\mathbf{x}, \mathbf{x}') = \mathbf{x}^T\mathbf{x}'$ | 无 | 原始空间，适合高维稀疏特征 |
| 多项式核 | $K(\mathbf{x}, \mathbf{x}') = (\gamma\mathbf{x}^T\mathbf{x}' + r)^d$ | $\gamma, r, d$ | 捕捉多项式决策边界 |
| RBF核 | $K(\mathbf{x}, \mathbf{x}') = \exp(-\gamma\|\mathbf{x} - \mathbf{x}'\|^2)$ | $\gamma$ | 最常用，无限维映射 |
| Sigmoid核 | $K(\mathbf{x}, \mathbf{x}') = \tanh(\gamma\mathbf{x}^T\mathbf{x}' + r)$ | $\gamma, r$ | 类似两层神经网络 |

**SVR（支持向量回归）**：
使用 $\epsilon$-不敏感损失函数——落在管道内的预测不计误差，管道外的误差受惩罚。实现了稀疏回归解。

---

## 2.3 无监督学习——详细算法

### 2.3.1 K-Means 聚类

K-Means是最经典、最广泛使用的聚类算法。

**算法步骤**：
1. 随机选择 $K$ 个初始聚类中心 $\mu_1, \ldots, \mu_K$
2. **分配步骤**：将每个样本分配到最近的中心 → $c_i = \arg\min_k \|\mathbf{x}_i - \mu_k\|^2$
3. **更新步骤**：重新计算每个聚类的中心 → $\mu_k = \frac{1}{|C_k|}\sum_{i \in C_k} \mathbf{x}_i$
4. 重复步骤2-3直到收敛（中心不再变化或达到最大迭代次数）

**目标函数**——最小化簇内平方和（Inertia）：
$$\text{WCSS} = \sum_{k=1}^K \sum_{\mathbf{x}_i \in C_k} \|\mathbf{x}_i - \mu_k\|^2$$

**收敛性**：K-Means保证收敛到局部最优（每步都使WCSS单调递减，且有限种分配方式），但不保证全局最优。

**关键问题**：

1. **K值选择**：
   - **肘部法则（Elbow Method）**：画WCSS-K曲线，找拐点
   - **轮廓系数（Silhouette Score）**：$s = (b - a)/\max(a, b)$，$a$为簇内平均距离，$b$为最近簇平均距离。取值范围[-1,1]，越大越好
   - **Gap统计量**：比较WCSS与随机数据的参考分布

2. **初始化敏感性**：
   - **K-Means++**：选择初始中心时，以与已选中心的平方距离为概率，确保中心分散
   - 多次随机初始化取最佳结果

3. **聚类的局限性**：
   - 假设簇是球形的、大小相似 → DBSCAN和谱聚类可处理任意形状
   - 对异常值敏感 → K-Medoids使用实际数据点作为中心

### 2.3.2 DBSCAN（基于密度的聚类）

DBSCAN通过数据点的密度连接来定义簇，能发现任意形状的簇并自动识别噪声点。

**核心概念**：
- **$\epsilon$-邻域**：以点 $p$ 为圆心、$\epsilon$ 为半径的区域
- **核心点（Core Point）**：$\epsilon$-邻域内至少有 MinPts 个样本
- **密度可达**：存在一条核心点链连接两点
- **密度相连**：两个点通过一个核心点密度可达

**参数选择**：
- **MinPts**：通常是数据维度的2倍，最小为3
- **$\epsilon$**：使用K-距离图（K-distance plot）选择拐点

**优缺点**：
- ✅ 发现任意形状的簇；自动标记噪声；无需指定簇数
- ❌ 对参数敏感；密度差异大的数据集效果差；高维数据中"维度灾难"使距离失去意义

### 2.3.3 主成分分析（PCA）

PCA是最经典的线性降维方法，目标是找到使投影数据方差最大的低维子空间。

**算法步骤**：
1. 数据中心化：$\mathbf{x}_i \gets \mathbf{x}_i - \bar{\mathbf{x}}$
2. 计算协方差矩阵：$C = \frac{1}{n-1}X^TX$（$d \times d$矩阵）
3. 特征值分解：$C = V\Lambda V^T$，特征值从大到小排列
4. 取前 $k$ 个特征向量：$W = [\mathbf{v}_1, \mathbf{v}_2, \ldots, \mathbf{v}_k]$（$d \times k$）
5. 投影：$Z = XW$（$n \times k$）

**等价的SVD推导**：
对 $X = U\Sigma V^T$，$V$ 的前 $k$ 列即为 PCA 的投影矩阵。SVD数值更稳定。

**方差解释率**：
$$\text{Explained Variance Ratio} = \frac{\sum_{i=1}^k \lambda_i}{\sum_{i=1}^d \lambda_i}$$

通常选 $k$ 使得累积方差解释率达到85%-95%。

**PCA的局限性**：
- 线性降维（核PCA可处理非线性）
- 最大化方差不一定保留分类区分度（LDA考虑标签）
- 主成分的可解释性差

### 2.3.4 t-SNE 与 UMAP

**t-SNE**（t-distributed Stochastic Neighbor Embedding）：
- 在高维空间用高斯分布建模相似度概率
- 在低维空间用t分布（重尾，防止拥挤问题）建模相似度概率
- 最小化两个分布间的KL散度
- 适合可视化（2D/3D），但不保留全局结构，不可用于新数据推广

**UMAP**（Uniform Manifold Approximation and Projection）：
- 基于黎曼几何和代数拓扑的数学框架
- 比t-SNE更快，保留更多全局结构
- 可在新数据上使用（参数化UMAP）
- 降维质量的数学保证

---

## 2.4 模型评估与选择

### 2.4.1 分类评估指标详解

**混淆矩阵（Confusion Matrix）**：

| | 预测正类 | 预测负类 |
|---|---|---|
| 实际正类 | TP（True Positive） | FN（False Negative） |
| 实际负类 | FP（False Positive） | TN（True Negative） |

**核心指标族**：

| 指标 | 公式 | 侧重 | 适用场景 |
|------|------|------|----------|
| 准确率（Accuracy） | $\frac{TP+TN}{TP+TN+FP+FN}$ | 整体正确率 | 类别均衡 |
| 精确率（Precision） | $\frac{TP}{TP+FP}$ | 预测正类的准确性 | 假阳性代价高（如垃圾邮件） |
| 召回率（Recall/Sensitivity） | $\frac{TP}{TP+FN}$ | 对正类的覆盖度 | 假阴性代价高（如疾病筛查） |
| 特异度（Specificity） | $\frac{TN}{TN+FP}$ | 对负类的识别能力 | 假阳性代价高的场景 |
| F1-Score | $2 \cdot \frac{P \cdot R}{P + R}$ | P和R的调和平均 | 类别不均衡的通用指标 |
| F$\beta$-Score | $(1+\beta^2)\frac{P \cdot R}{\beta^2 P + R}$ | $\beta<1$重P，$\beta>1$重R | 灵活调整P/R权重 |
| AUC-ROC | ROC曲线下面积 | 整体排序能力 | 类别不均衡，关注排序 |

**ROC曲线与AUC**：

- **ROC曲线**：横轴FPR（1-Specificity），纵轴TPR（Recall）
- **AUC = 1**：完美分类器
- **AUC = 0.5**：随机猜测
- **AUC < 0.5**：比随机猜测还差
- AUC的直观解释：随机选一个正样本和一个负样本，正样本的预测分数高于负样本的概率

**PR曲线**（Precision-Recall Curve）：
类别极不均衡时（正类<<负类），PR曲线比ROC更能反映模型真实性能。ROC可能因TN太多而虚高，PR曲线关注少数类的预测表现。

### 2.4.2 回归评估指标详解

| 指标 | 公式 | 特点 |
|------|------|------|
| MAE | $\frac{1}{n}\sum\|y_i - \hat{y}_i\|$ | 对异常值鲁棒，不可导 |
| MSE | $\frac{1}{n}\sum(y_i - \hat{y}_i)^2$ | 对异常值敏感（平方放大），可导 |
| RMSE | $\sqrt{\frac{1}{n}\sum(y_i - \hat{y}_i)^2}$ | 与因变量同量纲，解释性强 |
| MAPE | $\frac{1}{n}\sum\|\frac{y_i-\hat{y}_i}{y_i}\| \times 100\%$ | 百分比误差，直观但 $y_i=0$ 时无效 |
| $R^2$ | $1 - \frac{SS_{res}}{SS_{tot}} = 1 - \frac{\sum(y_i-\hat{y}_i)^2}{\sum(y_i-\bar{y})^2}$ | 解释方差比例，0-1之间，越大越好 |
| Adjusted $R^2$ | $1 - \frac{(1-R^2)(n-1)}{n-p-1}$ | 惩罚多余特征，用于模型比较 |

### 2.4.3 交叉验证策略

| 方法 | 做法 | 优缺点 |
|------|------|--------|
| **Holdout** | 随机划分训练/验证/测试（如70/15/15） | 简单但有高方差的风险 |
| **K-Fold CV** | 均分为K份，轮转验证 | 充分利用数据，K=5或10最常用 |
| **Stratified K-Fold** | 保持每折类别分布一致 | 类别不均衡时的首选 |
| **Group K-Fold** | 同一组数据不出现在不同折 | 有组结构时使用（如按用户分） |
| **LOOCV**（留一法） | K=n | 几乎无偏但方差大、计算贵 |
| **时序CV** | 按时间顺序划分 | 时间序列预测必须使用 |

**数据泄露（Data Leakage）**的关键防范：
- 在交叉验证中，特征工程/标准化等预处理必须在每折内部独立完成
- 信息不能从验证折叠泄露到训练折叠
- 常见的泄露：对整个数据集做特征选择再分割、对整个数据集归一化

### 2.4.4 过拟合的诊断与解决方案

**诊断方法**：
- **学习曲线**：训练误差下降、验证误差先降后升 → 过拟合
- **偏差-方差分析**：训练误差和验证误差都高 → 高偏差（欠拟合）；训练误差低但验证误差高 → 高方差（过拟合）
- **复杂度诊断**：增加模型复杂度 → 训练误差持续下降，验证误差先降后升

**解决方案汇总**：

| 方法 | 作用机制 | 效果 |
|------|----------|------|
| **增加训练数据** | 减少估计误差 | 最有效但最贵 |
| **降低模型复杂度** | 缩小假设空间 | 直接但可能引入偏差 |
| **L1正则化（Lasso）** | 稀疏解，自动特征选择 | 高维特征效果好 |
| **L2正则化（Ridge）** | 权重衰减，平滑解 | 最常用 |
| **Elastic Net** | L1+L2结合 | 有组相关的特征效果好 |
| **Dropout**（神经网络） | 训练中随机丢弃神经元 | 神经网络的标配 |
| **早停**（Early Stopping） | 验证性能不再提升时停止 | 简单有效 |
| **数据增强** | 增加有效数据量 | CV/NLP中极其重要 |
| **Batch Normalization** | 稳定训练，轻微正则化 | 深层网络必备 |
| **集成方法** | 多个模型平均 | 降低方差，提升泛化 |

---

## 2.5 特征工程

### 2.5.1 数据预处理

- **缺失值处理**：删除（缺失率>60%时）、均值/中位数/众数填充、模型预测填充（KNN填充、MissForest）
- **异常值处理**：IQR法（Q1-1.5IQR, Q3+1.5IQR）、Z-score法（$\|z\| > 3$为异常）、孤立森林自动检测
- **数据标准化**：
  - **Z-score标准化**：$(x - \mu) / \sigma$，适合假设数据服从正态分布的算法（线性回归、逻辑回归、SVM、神经网络）
  - **Min-Max归一化**：$(x - x_{\min}) / (x_{\max} - x_{\min})$，适合需要固定范围的算法（神经网络输入）
  - **Robust Scaling**：$(x - \text{median}) / \text{IQR}$，对异常值鲁棒项

### 2.5.2 特征编码

- **One-Hot编码**：每个类别变为一个二进制列，适合低基数类别
- **Label Encoding**：类别映射为整数，适合有序类别或树模型
- **Target Encoding**：用目标变量的均值编码类别，适合高基数类别（注意防过拟合——使用交叉验证）
- **Embedding**：神经网络中学习的稠密向量表示，适合高基数类别

### 2.5.3 特征选择

- **Filter方法**：卡方检验、互信息、相关系数、方差阈值——计算快但忽略特征交互
- **Wrapper方法**：递归特征消除（RFE）、前向/后向选择——考虑特征交互但计算贵
- **Embedded方法**：Lasso（L1正则化自动选择）、树模型的特征重要性、排列重要性

---

## 2.6 本章小结

本章系统介绍了机器学习的核心体系：

1. **三大学习范式**：监督学习（分类/回归）、无监督学习（聚类/降维）、强化学习，以及新兴的半监督/自监督/迁移学习
2. **偏差-方差权衡**：过拟合（高方差）与欠拟合（高偏差）的诊断和解决策略
3. **经典算法详解**：线性/逻辑回归的数学推导和梯度计算、决策树与集成方法（随机森林、GBDT、XGBoost、LightGBM）、SVM的对偶理论和核技巧、K-Means/DBSCAN/PCA的算法流程
4. **模型评估体系**：分类评估（混淆矩阵、F1、AUC-ROC、PR曲线）、回归评估（MAE/MSE/RMSE/R²）、交叉验证策略
5. **特征工程**：数据预处理、特征编码、特征选择的方法和适用场景
6. **正则化方法**：L1/L2/Elastic Net/Dropout/早停/数据增强及其原理

---

> **思考题：**
>
> 1. 在什么场景下逻辑回归优于XGBoost，又在什么场景下XGBoost远远胜过逻辑回归？请从数据量、特征类型、可解释性需求等角度分析。
> 2. SVM的RBF核中 $\gamma$ 参数增大意味着什么？$C$ 参数增大意味着什么？它们与过拟合的关系是什么？
> 3. 为什么随机森林的OOB误差可以替代交叉验证？OOB误差相比K折交叉验证的优缺点是什么？
> 4. PCA和t-SNE的核心区别是什么？为什么t-SNE不能用于新数据的降维？
> 5. 在严重类别不均衡（正类1%）的场景下，为什么准确率是一个糟糕的指标？应该使用哪些指标？
