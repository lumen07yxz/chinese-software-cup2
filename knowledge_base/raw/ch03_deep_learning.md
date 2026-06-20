# 第三章：深度学习基础

## 3.1 神经网络基础

### 3.1.1 生物神经元到人工神经元

生物神经元通过树突接收信号，在胞体中整合，通过轴突传递到突触输出。人工神经元对其进行了数学抽象：

$$y = f\left(\sum_{i=1}^{n} w_i x_i + b\right)$$

- $x_i$：输入信号（对应树突输入）
- $w_i$：突触权重（对应突触连接强度，可正可负）
- $b$：偏置（对应神经元激活阈值）
- $f$：激活函数（对应动作电位的非线性响应）

**感知机**（Frank Rosenblatt, 1958）是第一个可学习的人工神经元：

```python
def perceptron_predict(X, w, b):
    """感知机预测：阈值阶跃激活"""
    activation = np.dot(X, w) + b
    return np.where(activation >= 0, 1, 0)

def perceptron_train(X, y, lr=0.01, epochs=100):
    """感知机学习算法"""
    n_features = X.shape[1]
    w, b = np.zeros(n_features), 0
    for _ in range(epochs):
        for xi, yi in zip(X, y):
            pred = perceptron_predict(xi, w, b)
            update = lr * (yi - pred)
            w += update * xi
            b += update
    return w, b
```

感知机—多层感知机（MLP）的飞跃来自两个短板的认识：单层只能解决线性可分问题（Minsky & Papert, 1969），但引入非线性激活函数和多个隐藏层后，网络获得了逼近任意函数的能力。

### 3.1.2 激活函数详解

| 激活函数 | 公式 | 导函数 | 范围 | 特点 |
|----------|------|--------|------|------|
| Sigmoid | $\sigma(x)=\frac{1}{1+e^{-x}}$ | $\sigma(x)(1-\sigma(x))$ | (0,1) | 历史最久，梯度消失严重，输出非零中心 |
| Tanh | $\tanh(x)=\frac{e^x-e^{-x}}{e^x+e^{-x}}$ | $1-\tanh^2(x)$ | (-1,1) | 零中心化，但仍有梯度消失 |
| ReLU | $\max(0,x)$ | $1_{x>0}$ | [0,∞) | 计算快，缓解梯度消失，但神经元可能"死亡" |
| Leaky ReLU | $\max(0.01x, x)$ | $0.01_{x\leq0}+1_{x>0}$ | (-∞,∞) | 解决ReLU死亡，负区间有微小梯度 |
| PReLU | $\max(\alpha x,x)$ | $\alpha_{x\leq0}+1_{x>0}$ | (-∞,∞) | $\alpha$可学习参数量 |
| ELU | $x(x>0), \alpha(e^x-1)(x\leq0)$ | 1或$\alpha e^x$ | (-$\alpha$,∞) | 负区间平滑，接近零均值输出 |
| GELU | $x\cdot\Phi(x)$ | $\Phi(x)+x\cdot\mathcal{N}(x;0,1)$ | (-∞,∞) | Transformer默认，平滑版ReLU |
| Swish/SiLU | $x\cdot\sigma(x)$ | $\sigma(x)+x\cdot\sigma(x)(1-\sigma(x))$ | (-∞,∞) | 无界上界、有界下界、非单调 |

**梯度消失问题**：
Sigmoid/Tanh的导数在饱和区域（两端的值几乎为常数）趋近于0，深层网络反向传播时梯度连乘导致指数级衰减→前面的层几乎学不动。ReLU的梯度恒为0或1，缓解了这一问题但带来了"神经元死亡"——如果ReLU在训练中进入0侧且不再激活，其梯度永远为0。

**ReLU死亡的根本原因**：
- 初始化不佳导致大多数神经元输出为负
- 学习率太大，权重更新后永久进入负区间
- 解决方案：使用Leaky ReLU/PReLU/GELU、好的初始化方法（Kaiming Init）、合适的学习率

### 3.1.3 多层感知机（MLP）

MLP由输入层、$L$个隐藏层和输出层组成，相邻层之间全连接：

$$\mathbf{h}^{(1)} = f^{(1)}(\mathbf{W}^{(1)}\mathbf{x} + \mathbf{b}^{(1)})$$
$$\mathbf{h}^{(l)} = f^{(l)}(\mathbf{W}^{(l)}\mathbf{h}^{(l-1)} + \mathbf{b}^{(l)}) \quad \text{for } l=2,\ldots,L$$
$$\hat{\mathbf{y}} = g^{(L+1)}(\mathbf{W}^{(L+1)}\mathbf{h}^{(L)} + \mathbf{b}^{(L+1)})$$

隐藏层使用Sigmoid/Tanh/ReLU/GELU等非线性激活；输出层使用线性回归（MSE）/Softmax（交叉熵）/Sigmoid（二类交叉熵）等。

**通用近似定理**（Universal Approximation Theorem）：
> 具有至少一个隐藏层和足够多神经元（可任意多）的前馈神经网络，可以逼近任意Borel可测连续函数到任意精度。

这个定理说明了存在性，但不告诉你要多少神经元、怎么找到权重。而且宽的浅层网络需要的神经元指数级增长，而用"窄但深"的网络效率高得多。

**深度 vs 宽度的理论**：
- 深度网络层次化提取特征：低级特征→中级特征→高级语义
- 理论结果：某些函数用3层可高效表示，2层需要指数级节点
- 实践中：3-100层的深度比10000个宽一层效果好得多

---

## 3.2 反向传播算法

### 3.2.1 链式法则

对于损失 $L$ 关于参数 $w$ 的梯度，复合函数的链式法则：
$$\frac{\partial L}{\partial w} = \frac{\partial L}{\partial \hat{y}} \cdot \frac{\partial \hat{y}}{\partial z} \cdot \frac{\partial z}{\partial w}$$

其中 $\hat{y}=f(z)$，$z=wx+b$。反向传播从输出层向输入层逐层计算梯度。

### 3.2.2 计算图与自动微分

以两层MLP为例的计算图：

```
x → [W1,b1] → z1 → [ReLU] → h1 → [W2,b2] → z2 → [MSE] → L
                                  ↑ 反向传播从L开始反推
```

**前向传播**：输入→输出，计算并缓存每层输出 $h^{(l)}$ 和 $z^{(l)}$。

**反向传播**：

对于三层网络 $f(x) = W_3 \cdot \text{ReLU}(W_2 \cdot \text{ReLU}(W_1 x + b_1) + b_2) + b_3$：

1. 输出层梯度（MSE）：$\delta^{(3)} = \frac{\partial L}{\partial \hat{y}} \odot f'_3(z^{(3)}) = 2(\hat{y}-y) \cdot 1$（线性输出）或 $\hat{y}-y$（交叉熵+Softmax简化）
2. 梯度传播到隐藏层3：$\delta^{(2)} = (W_3^T \delta^{(3)}) \odot \text{ReLU}'(z^{(2)})$
3. 梯度传播到隐藏层2：$\delta^{(1)} = (W_2^T \delta^{(2)}) \odot \text{ReLU}'(z^{(1)})$

参数梯度：
$$\frac{\partial L}{\partial W^{(l)}} = \delta^{(l)} (h^{(l-1)})^T, \quad \frac{\partial L}{\partial b^{(l)}} = \delta^{(l)}$$

### 3.2.3 梯度消失与爆炸的数学机理

梯度消失在深层网络中普遍存在。以一个 $L$ 层的线性网络为例，输出是输入的线性变换链：

假设各层权重矩阵为 $\{W^{(1)},\ldots,W^{(L)}\}$，ReLU激活函数简化忽略：
$$\frac{\partial L}{\partial W^{(1)}} \propto (W^{(L)} \cdots W^{(2)})^T \cdot \frac{\partial L}{\partial \hat{y}}$$

如果各层权重矩阵的特征值小于1，长期乘积分母指数减→梯度消失；
如果各层权重矩阵的特征值大于1，长期乘积分子指数增→梯度爆炸。

**缓解策略**：
- 合理的权重初始化（Xavier/Glorot、Kaiming/He初始化）
- Batch Normalization
- 残差连接（ResNet：梯度通过跳跃连接"短路"到前面层）
- LSTM的门控机制（选择性遗忘）
- 梯度裁剪（Gradient Clipping：按范数截断梯度，防止爆炸）

**权重初始化方法详细比较**：

| 方法 | 适用激活 | 初始化分布（均匀） | 原理 |
|------|----------|-------------------|------|
| Xavier/Glorot | Tanh, Sigmoid | $\mathcal{U}\left(-\sqrt{\frac{6}{n_{in}+n_{out}}}, \sqrt{\frac{6}{n_{in}+n_{out}}}\right)$ | 保持各层输出方差一致 |
| He/Kaiming | ReLU, PReLU | $\mathcal{U}\left(-\sqrt{\frac{6}{n_{in}}}, \sqrt{\frac{6}{n_{in}}}\right)$ | ReLU不对称→调整因子 |
| LeCun | Sigmoid | $\mathcal{U}\left(-\sqrt{\frac{3}{n_{in}}}, \sqrt{\frac{3}{n_{in}}}\right)$ | 保持响应标准差为1 |

---

## 3.3 优化算法

### 3.3.1 基础 SGD 的问题

标准SGD：$w_{t+1} = w_t - \eta \nabla L(w_t)$

**退化的三点**：
1. **方向摇摆**：鞍点处不同方向的梯度曲率差异大，SGD在陡峭方向来回震荡，平缓方向推进慢
2. **固定的学习率**：所有参数用同一个LR → 稀疏特征（出现次数少）的更新应该更激进，高频特征应该更保守
3. **噪声大**：随机采样的Mini-batch梯度不等于全批量梯度，方差大

### 3.3.2 动量法（Momentum）

引入历史梯度信息来"冲过"鞍点和平面区：

$$v_{t+1} = \beta v_t + (1-\beta)\nabla L(w_t)$$
$$w_{t+1} = w_t - \eta v_{t+1}$$

- $\beta \approx 0.9$：可理解为"摩擦系数"或衰减率
- 当梯度方向一致时，动量加速；方向振荡时，动量抵消杂波
- 类似于物理中一个小球滚下山坡，惯性能帮助小球冲过局部鞍点

**Nesterov加速梯度（NAG）**：
先沿动量方向"看"一步，再看梯度，更精确：
$$v_{t+1} = \beta v_t + (1-\beta)\nabla L(w_t - \beta v_t)$$
$$w_{t+1} = w_t - \eta v_{t+1}$$

### 3.3.3 AdaGrad（自适应梯度）

为每个参数分配不同的学习率——出现越多的特征学习率衰减越快：
$$w_{t+1} = w_t - \frac{\eta}{\sqrt{G_t + \epsilon}} \odot g_t$$

其中 $G_t = \sum_{\tau=1}^t g_\tau^2$ 是历史梯度平方和的累积向量，$\epsilon \approx 1 \times 10^{-8}$ 防止除零。

**问题**：$G_t$ 单调递增 → 学习率最终变成几乎0 → 提前停止学习。

### 3.3.4 RMSProp（Hinton, 2012）

用指数移动平均替代累积和，解决了AdaGrad学习率归零的问题：

$$E[g^2]_t = \beta E[g^2]_{t-1} + (1-\beta)g_t^2$$
$$w_{t+1} = w_t - \frac{\eta}{\sqrt{E[g^2]_t + \epsilon}} g_t$$

- $\beta \approx 0.9$：最近更多的梯度贡献更大
- 有效"刹车"在振荡方向，加速在平坦方向

### 3.3.5 Adam（Kingma & Ba, 2015）

Adam（Adaptive Moment Estimation）是目前最广泛使用的优化器，同时结合了Momentum和一阶矩估计，以及RMSProp的二阶矩估计：

$$m_t = \beta_1 m_{t-1} + (1-\beta_1)g_t \quad \text{(一阶矩估计，带偏置)}$$
$$v_t = \beta_2 v_{t-1} + (1-\beta_2)g_t^2 \quad \text{(二阶矩估计)}$$

在训练初期，$m_t$ 和 $v_t$ 偏置接近于0，需做偏置校正：
$$\hat{m}_t = \frac{m_t}{1-\beta_1^t}, \quad \hat{v}_t = \frac{v_t}{1-\beta_2^t}$$

最终更新：
$$w_{t+1} = w_t - \eta \frac{\hat{m}_t}{\sqrt{\hat{v}_t} + \epsilon}$$

- $\beta_1 = 0.9$，$\beta_2 = 0.999$，$\epsilon = 1 \times 10^{-8}$（默认值）
- $\hat{m}_t$ 是梯度的一阶矩（方向），$\hat{v}_t$ 是梯度的二阶矩（步长缩放）
- 每步有效LR ≈ $\eta / \sqrt{v_t}$，平稳区域较大、$v$小处步长大，陡峭区域较小、$v$大处步长短

### 3.3.6 AdamW（解耦权重衰减）

Loshchilov & Hutter (2017) 指出Adam+L2正则化中的问题——权重衰减和自适应学习率耦合效果不好。**AdamW** 在每个optimizer step中对权重直接做衰减，独立于梯度自适应更新：

$$w_{t+1} = w_t - \eta \left( \frac{\hat{m}_t}{\sqrt{\hat{v}_t} + \epsilon} + \lambda w_t \right)$$

- 权重在SGD中L2正则化 = 权重衰减，但对Adam两者不等价
- AdamW权重直接在更新步中对参数做固定比率衰减
- 目前几乎所有大模型（LLaMA、GPT等）训练的首选

### 3.3.7 学习率调度策略

| 策略 | 实现 | 特点 |
|------|------|------|
| **固定LR** | $\eta$ = 常数 | 方便但容易卡住或振荡 |
| **Step Decay** | 每K步$\times$0.1 | 简单，需调K |
| **余弦退火** | $\eta_t = \frac{1}{2}\eta_0(1+\cos(\frac{t\pi}{T}))$ | 平滑下降，配合warmup效果好 |
| **线性Warmup** | 前W步从0线性增到$\eta_0$ | 避免初始大更新破坏预训练权重 |
| **Cosine + Linear Cooldown** | 余弦下降后线性衰减 | 大模型训练标配 |
| **ReduceLROnPlateau** | 验证损失停滞时$\times$0.1 | 自动适应训练过程 |
| **OneCycleLR** | LR先升后降，一个cycle | 可在1/2-1/3的步数达相似精度 |

**Warmup的必要性**：
- 训练初期模型权重是随机或预训练值，此时大学习率会导致灾难性的参数偏移
- 小学习率先让参数稳定下来，再逐渐增大（用于快速推进）→更大更有效

---

## 3.4 卷积神经网络（CNN）

### 3.4.1 卷积操作的数学本质

离散二维卷积操作：
$$S(i,j) = (I * K)(i,j) = \sum_{m=1}^M \sum_{n=1}^N I(i+m-1, j+n-1)K(m,n)$$

**关键参数**：
- **Kernel Size $K$**：$3 \times 3$ 是最有效的感受野组合（效率 vs 容量的权衡）
- **Stride $S$**：卷积核每次滑动的步长，控制输出特征图的空间尺寸
- **Padding $P$**：边缘补零（valid = 不补 / same = 补到输出空间尺寸不变）
- **Dilation $D$**：卷积核元素之间插入 $D-1$ 个空格，扩大感受野不增加参数

**输出尺寸公式**：
$$O = \left\lfloor \frac{I + 2P - D(K-1) - 1}{S} + 1 \right\rfloor$$

**参数量**：$C_{in} \times K_h \times K_w \times C_{out} + C_{out}$（偏置）

**感受野（Receptive Field）**：输出特征图中一个神经元对应的输入像素区域大小。
$$RF_i = RF_{i-1} + (K_i-1) \cdot \text{stride}_{i-1}$$
其中 $\text{stride}_i = \prod_{j=1}^{i-1} S_j$，表示第i层之后的总下采样倍数。

### 3.4.2 池化层

池化是对每个子区域做下采样：

| 类型 | 操作 | 特点 | 梯度传播 |
|------|------|------|----------|
| **Max Pooling** | 取最大值 | 保留最显著特征，平移不变性 | 最大值位置传1，其他0 |
| **Average Pooling** | 取平均值 | 保留平均响应，更平滑 | 均匀分配梯度 |
| **Global Avg Pooling** | 全图平均 | 替代全连接层，减少参数量 | 同上 |

### 3.4.3 经典 CNN 架构演进

**LeNet-5 (LeCun, 1998)**：
```
Input (32x32) → Conv(6@5x5) → AvgPool → Conv(16@5x5) → AvgPool → FC(120) → FC(84) → FC(10)
```
- 手写数字识别，7层，6万参数
- 奠定了CNN的基本设计模式

**AlexNet (Krizhevsky, 2012)**：
```
Conv(11x11, s4) → MaxPool → Conv(5x5) → MaxPool → Conv(3x3) × 3 → MaxPool → FC(4096)× 2 → FC(1000)
```
- 5个卷积层 + 3个全连接层，60M参数
- **三个革命性创新**：ReLU激活（收敛加速6倍）、Dropout（减少过拟合）、数据增强（随机裁剪+颜色抖动）
- ImageNet top-5 error 15.3% vs 第二名26.2%，深度学习的标志性突破

**VGG-16 (Simonyan & Zisserman, 2014)**：
```
13个Conv(3x3) + 5个MaxPool + 3个FC
```
- 仅仅使用 $3 \times 3$ 卷积堆叠：两个 $3 \times 3$ 等价于 $5 \times 5$（感受野），三个 $3 \times 3$ 等价于 $7 \times 7$ 但参数量少（$3\times 3\times 3 = 27$ vs $7\times 7 = 49$）且引入了更多非线性
- 证明了"更深更好"（16-19层），但参数量大（138M），内存占用高

**Inception v1 (GoogLeNet, Szegedy, 2014)**：
- **Inception模块**：四个分支并行处理 → 拼接 → 多尺度特征提取
  - $1 \times 1$ 卷积（降维减少计算量）
  - $3 \times 3$ 卷积
  - $5 \times 5$ 卷积
  - $3 \times 3$ MaxPool → $1 \times 1$ 卷积
- **1x1卷积**作为通道投影：瓶颈结构（先降维再卷积再升维）
- 使用全局均值池化替代全连接层（大幅减少参数量）
- 22层深度，但只有5M参数

**ResNet (He et al., 2015)**：

残差学习的核心：让层学习输入与输出之间的残差 $\mathcal{F}(x) = H(x) - x$ 而非直接学习 $H(x)$：
$$\mathbf{y} = \mathcal{F}(\mathbf{x}, \{W_i\}) + \mathbf{x_a}$$

- **Bottleneck Block**：$1 \times 1 \rightarrow 3 \times 3 \rightarrow 1 \times 1$（降 → 卷积 → 升）
- 各版本层数：ResNet-18/34/50/101/152
- ImageNet top-5 error 3.57%，首次超过人类水平（约5.1%）
- 跳跃连接为何有效：梯度通过"shortcut"直接反传，缓解了深层网络的退化（**梯度直达**）

**DenseNet (Huang et al., 2017)**：
每个层输入是前所有层输出的拼接：
$$x_l = H_l([x_0, x_1, \ldots, x_{l-1}])$$
- 梯度有超多条通路传送
- 参数效率极高（隐式深度监督）
- $L$ 层的DenseNet有 $O(L^2/2)$ 个连接

**EfficientNet (Tan & Le, 2019)**：
组合网络缩放方法（深度×宽度×分辨率复合缩放）：
$$\text{目标：最大化Accuracy}(\phi) \quad \text{s.t. Memory} \leq \text{目标}$$

用神经架构搜索（NAS）找到最优复合缩放系数 $\phi$，是精度-效率Pareto前沿上的最优系列。

### 3.4.4 深度可分离卷积

标准卷积：$C_{in} \times K \times K \times C_{out}$

深度可分离卷积 = Depthwise卷积 + Pointwise卷积：
- **Depthwise**：每个通道一个独立的 $K \times K$ 卷积 → $C_{in} \times K \times K \times 1$
- **Pointwise**：$1 \times 1$ 卷积融合通道信息 → $C_{in} \times 1 \times 1 \times C_{out}$

**计算量对比**：
- 标准卷积：$K^2 \times C_{in} \times C_{out} \times H \times W$
- 深度可分离：$K^2 \times C_{in} \times H \times W + C_{in} \times C_{out} \times H \times W$

**比例**：$\frac{1}{C_{out}} + \frac{1}{K^2}$，当 $C_{out}=256, K=3$ 时约为 **$1/8$**

广泛应用在MobileNet（移动端）、Xception（Inception变体）、EfficientNet中。

---

## 3.5 循环神经网络（RNN）

### 3.5.1 RNN 的基本形式

RNN通过隐藏状态在时间步之间传递信息：
$$h_t = \tanh(W_{hh}h_{t-1} + W_{xh}x_t + b_h)$$
$$\hat{y}_t = W_{hy}h_t + b_y$$

**输入的三种形式**（根据输入和输出的序列结构）：
1. **Many-to-One**（情感分类）：序列→标签
2. **One-to-Many**（图像描述）：图像→描述序列
3. **Many-to-Many**（机器翻译）：序列→序列

**梯度爆炸/消失的详细分析**：

在时间维度上展开RNN，梯度反传涉及跨时间步矩阵连乘：
$$\frac{\partial L}{\partial W} = \sum_{t=1}^T \frac{\partial L_t}{\partial y_t} \cdot \frac{\partial y_t}{\partial H_t} \cdot \prod_{k=K+1}^t \frac{\partial h_k}{\partial h_{k-1}} \cdot \frac{\partial h_K}{\partial W}$$

其中 $\frac{\partial h_k}{\partial h_{k-1}} = \text{diag}(\sigma'(h_k))W_{hh}$

如果 $W_{hh}$ 的特征值 $\lambda > 1$ → 短期项指数增长（爆炸）；如果 $\lambda < 1$ → 长期项接近0（消失）。实践中梯度消失远更常见。

### 3.5.2 LSTM（长短期记忆网络）

LSTM通过精密的门控机制解决了长序列的记忆问题。

**细胞状态（Cell State）** 是LSTM的核心——一条信息高速公路，上面只有少量线性运算（加和乘），梯度在细胞状态上可以无损传递很长距离。

**遗忘门**：决定丢弃细胞状态的哪些信息
$$f_t = \sigma(W_f \cdot [h_{t-1}, x_t] + b_f)$$

**输入门**：决定哪些新信息被存入细胞状态
$$i_t = \sigma(W_i \cdot [h_{t-1}, x_t] + b_i)$$
$$\tilde{C}_t = \tanh(W_C \cdot [h_{t-1}, x_t] + b_C)$$

**细胞状态更新**：
$$C_t = f_t \odot C_{t-1} + i_t \odot \tilde{C}_t$$

**输出门**：基于细胞状态决定输出哪些信息到隐藏状态
$$o_t = \sigma(W_o \cdot [h_{t-1}, x_t] + b_o)$$
$$h_t = o_t \odot \tanh(C_t)$$

**梯度高速公路**：$C_t = f_t \odot C_{t-1} + \cdots$ → $\frac{\partial C_t}{\partial C_{t-1}} \approx f_t$。如果遗忘门接近1，梯度几乎可以无损反传很多步。

**LSTM变体**：
- **Peephole Connections**：门的输入还包括 $C_{t-1}$
- **Coupled Forget-Input Gate**：$f_t = 1-i_t$（减少参数量）
- **GRU**（下文详述）

### 3.5.3 GRU（门控循环单元）

GRU是LSTM的简化版本，合并遗忘门和输入门为更新门，合并细胞状态和隐藏状态：

**重置门**：决定忽略多少过去信息
$$r_t = \sigma(W_r \cdot [h_{t-1}, x_t])$$

**更新门**：决定保留多少过去信息、加入多少新信息
$$z_t = \sigma(W_z \cdot [h_{t-1}, x_t])$$

**候选隐藏状态**：
$$\tilde{h}_t = \tanh(W_h \cdot [r_t \odot h_{t-1}, x_t])$$

**隐藏状态更新**：
$$h_t = (1 - z_t) \odot h_{t-1} + z_t \odot \tilde{h}_t$$

- 参数量约LSTM的75%
- 许多任务上效果与LSTM接近
- 训练更快，过拟合风险更低

### 3.5.4 RNN的其他关键挑战

1. **无法并行**：每个时间步依赖前一个时间步，难以利用GPU进行大规模并行加速
2. **长程依赖仍然受限**：虽然LSTM/GRU极大改善，但实际有效上下文仍有几百步的上限
3. **这些限制直接催生了 Transformer 架构**（详见第4章）

---

## 3.6 归一化与正则化

### 3.6.1 Batch Normalization（Ioffe & Szegedy, 2015）

BN对每个mini-batch沿着通道维度做标准化：

$$\mu_B = \frac{1}{m}\sum_{i=1}^m x_i, \quad \sigma_B^2 = \frac{1}{m}\sum_{i=1}^m (x_i - \mu_B)^2$$
$$\hat{x}_i = \frac{x_i - \mu_B}{\sqrt{\sigma_B^2 + \epsilon}}, \quad y_i = \gamma \hat{x}_i + \beta$$

**训练和测试差异**：
- 训练时：基于当前batch计算 $\mu_B, \sigma_B^2$
- 测试时：使用训练过程维护的滑动平均 $\mu_{running}, \sigma_{running}^2$

**为什么有效**（虽然至今仍无统一理论，但主流观点包括）：
1. **减少内部协变量偏移（ICS）**：使每层输入分布更稳定
2. **平滑损失景观**：使梯度更"友好"，允许更大的学习率
3. **轻微正则化**：batch中样本之间存在依赖，类似于Dropout的随机性
4. **减少对初始化的依赖**

**BN的局限**：
- 小batch size时不稳定（<16时影响大）
- RNN和Transformer中效果不如LayerNorm（序列长度变化，batch间统计不稳定）
- 训练和测试行为不一致（依赖滑动平均）

### 3.6.2 Layer Normalization（Ba et al., 2016）

LN对每个样本跨越所有特征维度做标准化（而非跨batch）：

$$\mu_l = \frac{1}{H}\sum_{i=1}^H x_{li}, \quad \sigma_l^2 = \frac{1}{H}\sum_{i=1}^H (x_{li} - \mu_l)^2$$
$$\hat{x}_l = \frac{x_l - \mu_l}{\sqrt{\sigma_l^2 + \epsilon}}, \quad y_l = \gamma \hat{x}_l + \beta$$

**LN vs BN**：
| 特性 | BatchNorm | LayerNorm |
|------|-----------|-----------|
| 标准化维度 | 跨batch × 同通道 | 跨特征 × 同样本 |
| batch size敏感性 | 敏感（小batch不稳定） | 不敏感 |
| 训练/测试一致性 | 不一致 | 一致 |
| RNN/Transformer | ❌ 效果差 | ✅ 标准选择 |
| CV | ✅ 效果好 | ❌ 效果差 |

### 3.6.3 Instance Norm & Group Norm

- **Instance Norm**：单样本单通道的独立标准化（风格迁移任务的核心）
- **Group Norm**：将通道分组后独立标准化，中间体——batch size为0时（如大图像分割任务）替代BN

### 3.6.4 Dropout（Srivastava et al., 2014）

训练时以概率 $p$ 随机将神经元输出置0：

```python
def dropout_forward(x, p=0.5, training=True):
    """p=0.5 表示50%的神经元被置零"""
    if training:
        mask = np.random.binomial(1, 1-p, size=x.shape) / (1-p)
        return x * mask
    else:
        return x  # 测试时不做dropout，但输出被"固定"为期望值
```

**注意缩放**：训练时除以 $(1-p)$ 保持期望值一致（Inverted Dropout法，这是实际主流实现）。

**为什么Dropout有效**：
- **防止共适应（Co-adaptation）**：任何神经元都不能依赖于某个特定的神经元存在，必须学习鲁棒的特征
- **隐式模型集成**：不同dropout mask对应不同子网络的投票平均
- 类似bagging，但参数共享（高效模型集成）

### 3.6.5 其他正则化技术

**数据增强**：通过变换产生新的训练样本
- CV：随机翻转、旋转、裁剪、颜色抖动、mixup、CutMix、RandAugment
- NLP：回译（back-translation）、EDA（同义词替换/随机插入/交换/删除）

**标签平滑（Label Smoothing）**：
$$q'(k|x) = (1-\epsilon) q(k|x) + \frac{\epsilon}{K}$$
- 减少模型过度自信（softmax输出趋于极端0/1）
- 降低过拟合风险，提高泛化能力

**早停（Early Stopping）**：验证损失在K个epoch内无改善时停止训练

**梯度裁剪（Gradient Clipping）**：全局梯度范数超过阈值时缩放到阈值水平：
$$\text{if } \|\mathbf{g}\|_2 > c: \mathbf{g} \gets \frac{c}{\|\mathbf{g}\|_2} \cdot \mathbf{g}$$

---

## 3.7 梯度消失问题的现代解决方案

自从2015年以来，以下三项核心技术创新彻底缓解了深层网络的训练困难：

1. **残差连接（ResNet）**：梯度绕过非线性变换直达前面层，$y = x + f(x)$
2. **Batch/Layer/Normalization**：防止激活值进入饱和区，保持训练数值稳定
3. **GELU/Swish等平滑激活函数**：
   - GELU结合了Dropout、ZoneOut和ReLU的优点
   - 非单调性：在原点附近有负值，可推权重往正方向调整

这三项组合使训练1000层以上网络变得可行。

---

> **思考题：**
>
> 1. 为什么ReLU比Sigmoid更常用于深层网络？请从梯度消失和计算效率两个角度分析。
> 2. ResNet的跳跃连接（Skip Connection）解决了根本问题？请从梯度传播角度（梯度通过短路反传的路径有什么特殊性）分析。
> 3. Batch Normalization在训练和测试时的计算和行为有何不同？为什么这种差异在某些领域（如RNN、小batch）是个问题？
> 4. AdamW相比Adam有什么根本性的改进？为什么"解耦权重衰减"在大模型训练中变得重要？
> 5. 深度可分离卷积相比于标准卷积，在计算量和参数量上有何优势？计算比例公式是怎样的？
> 6. 为什么Transformer用了LayerNorm而不是BatchNorm？请从序列长度可变、训练batch特性两个角度解释。
