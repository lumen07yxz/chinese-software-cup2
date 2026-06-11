# 第三章：深度学习基础

## 3.1 神经网络基础

### 3.1.1 人工神经元模型

人工神经元是神经网络的基本单元，模拟生物神经元的信息处理机制：

$$y = f\left(\sum_{i=1}^{n} w_i x_i + b\right)$$

其中 $x_i$ 为输入，$w_i$ 为权重，$b$ 为偏置，$f$ 为激活函数。

### 3.1.2 常见激活函数

| 激活函数 | 公式 | 优点 | 缺点 |
|----------|------|------|------|
| Sigmoid | $\sigma(x) = \frac{1}{1+e^{-x}}$ | 平滑，输出在 (0,1) | 梯度消失，输出非零中心 |
| Tanh | $\tanh(x) = \frac{e^x-e^{-x}}{e^x+e^{-x}}$ | 零中心，输出在 (-1,1) | 仍有梯度消失 |
| ReLU | $\max(0, x)$ | 计算快，缓解梯度消失 | 神经元可能"死亡" |
| Leaky ReLU | $\max(0.01x, x)$ | 解决 ReLU 死亡问题 | 负区间斜率需手工设定 |
| GELU | $x \cdot \Phi(x)$ | Transformer 默认 | 计算稍贵 |

### 3.1.3 多层感知机（MLP）

MLP 由输入层、若干隐藏层和输出层组成，层与层之间全连接：

$$\mathbf{h}^{(l)} = f^{(l)}(\mathbf{W}^{(l)}\mathbf{h}^{(l-1)} + \mathbf{b}^{(l)})$$

**通用近似定理**：具有至少一个隐藏层和足够多神经元的 MLP 可以逼近任何连续函数。

## 3.2 反向传播算法

反向传播（Backpropagation）是训练神经网络的核心算法，通过链式法则计算损失函数对各层参数的梯度。

### 3.2.1 计算过程

1. **前向传播**：输入数据逐层向前计算，得到预测输出
2. **计算损失**：将预测输出与真实标签比较
3. **反向传播**：从输出层开始，逐层向前计算梯度
4. **参数更新**：使用优化器更新权重

### 3.2.2 链式法则

对于复合函数 $L = L(y, \hat{y})$，其中 $\hat{y} = g(f(x))$：
$$\frac{\partial L}{\partial x} = \frac{\partial L}{\partial \hat{y}} \cdot \frac{\partial \hat{y}}{\partial g} \cdot \frac{\partial g}{\partial f} \cdot \frac{\partial f}{\partial x}$$

## 3.3 优化算法

### 3.3.1 基础优化器

- **SGD（随机梯度下降）**：$w_{t+1} = w_t - \eta \nabla L(w_t)$
- **Momentum**：引入动量项加速收敛：
  $$v_{t+1} = \beta v_t + (1-\beta)\nabla L(w_t)$$
  $$w_{t+1} = w_t - \eta v_{t+1}$$

### 3.3.2 自适应学习率优化器

- **AdaGrad**：为每个参数分配不同的学习率，适合稀疏数据
- **RMSProp**：使用指数移动平均来缩放学习率
- **Adam**：结合 Momentum 和 RMSProp，目前最常用的优化器：
  $$m_t = \beta_1 m_{t-1} + (1-\beta_1)g_t$$
  $$v_t = \beta_2 v_{t-1} + (1-\beta_2)g_t^2$$
  $$\hat{m}_t = \frac{m_t}{1-\beta_1^t}, \quad \hat{v}_t = \frac{v_t}{1-\beta_2^t}$$
  $$w_{t+1} = w_t - \eta \frac{\hat{m}_t}{\sqrt{\hat{v}_t} + \epsilon}$$

- **AdamW**：Adam + 解耦权重衰减，目前大型模型训练的首选

## 3.4 卷积神经网络（CNN）

CNN 专为处理网格化数据（如图像）设计。

### 3.4.1 核心组件

- **卷积层（Convolutional Layer）**：使用可学习的滤波器（卷积核）在输入上滑动，提取局部特征
- **池化层（Pooling Layer）**：下采样操作，减少空间维度
  - 最大池化（Max Pooling）
  - 平均池化（Average Pooling）
- **全连接层（Fully Connected Layer）**：最终的分类/回归头

### 3.4.2 经典 CNN 架构

- **LeNet-5**（1998）：手写数字识别，7层
- **AlexNet**（2012）：ImageNet 冠军，引入 ReLU + Dropout
- **VGG**（2014）：3x3 小卷积核堆叠，16-19层
- **GoogLeNet/Inception**（2014）：Inception 模块，多尺度并行
- **ResNet**（2015）：残差连接解决深层网络退化问题
- **DenseNet**（2017）：密集连接

### 3.4.3 残差网络（ResNet）

核心创新——残差块（Residual Block）：
$$\mathbf{y} = \mathcal{F}(\mathbf{x}, \{W_i\}) + \mathbf{x}$$

跳跃连接（Skip Connection）使梯度能直接反传，解决了深层网络的梯度消失问题，使训练 152 层甚至更深的网络成为可能。

## 3.5 循环神经网络（RNN）

RNN 处理序列数据，通过隐藏状态在时间步之间传递信息。

$$h_t = \tanh(W_{hh}h_{t-1} + W_{xh}x_t + b)$$

### 3.5.1 LSTM（长短期记忆网络）

通过门控机制解决长序列梯度消失问题：

- **遗忘门**：$f_t = \sigma(W_f \cdot [h_{t-1}, x_t] + b_f)$
- **输入门**：$i_t = \sigma(W_i \cdot [h_{t-1}, x_t] + b_i)$
- **输出门**：$o_t = \sigma(W_o \cdot [h_{t-1}, x_t] + b_o)$
- **细胞状态更新**：$C_t = f_t \odot C_{t-1} + i_t \odot \tilde{C}_t$

### 3.5.2 GRU（门控循环单元）

简化的 LSTM，合并遗忘门和输入门为更新门，参数更少效果相近。

## 3.6 正则化与归一化

### 3.6.1 Dropout

训练时以概率 $p$ 随机丢弃神经元，测试时乘以 $(1-p)$：

- 防止神经元间的共适应
- 相当于集成了多个子网络的预测
- 常用 $p = 0.5$（隐藏层）、$p = 0.2$（输入层）

### 3.6.2 Batch Normalization

对每个 mini-batch 进行标准化：
$$\hat{x} = \frac{x - \mu_B}{\sqrt{\sigma_B^2 + \epsilon}}$$
$$y = \gamma \hat{x} + \beta$$

- 加速训练收敛
- 缓解梯度消失/爆炸
- 有一定的正则化效果

### 3.6.3 Layer Normalization

对每个样本的特征维度进行标准化，常用于 RNN 和 Transformer。

## 3.7 本章小结

本章介绍了深度学习的基础组件：神经元与激活函数、MLP、反向传播、优化器（SGD/Momentum/Adam/AdamW）、CNN（ResNet）、RNN（LSTM/GRU）以及正则化技术（Dropout、Batch/Layer Normalization）。

---

> 思考题：
> 1. 为什么 ReLU 比 Sigmoid 更常用于深层网络？
> 2. ResNet 的跳跃连接解决了什么根本问题？
> 3. Batch Normalization 在训练和测试时的行为有何不同？
