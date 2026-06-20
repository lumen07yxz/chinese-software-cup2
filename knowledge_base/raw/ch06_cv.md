# 第六章：计算机视觉

## 6.1 计算机视觉概述

### 6.1.1 核心任务体系

计算机视觉（Computer Vision, CV）研究如何让计算机从图像和视频中获取高层次理解。它是深度学习最早取得突破的领域之一。

| 任务 | 输入 | 输出 | 难度 | 典型应用 |
|------|------|------|------|----------|
| **图像分类** | $H \times W \times 3$ | 类别标签 | ★★☆ | 自动相册、内容审核 |
| **目标检测** | $H \times W \times 3$ | Bounding Box + 类别 | ★★★ | 自动驾驶、安防监控 |
| **语义分割** | $H \times W \times 3$ | $H \times W$ 的像素标签图 | ★★★★ | 医学影像、背景替换 |
| **实例分割** | $H \times W \times 3$ | Mask + 类别 + 实例ID | ★★★★★ | 自动驾驶场景理解 |
| **关键点检测** | $H \times W \times 3$ | 2D/3D关键点坐标 | ★★★☆ | 人体姿态估计、面部表情跟踪 |
| **图像生成** | 文本/noise | 图像 | ★★★★ | AI绘画、设计辅助 |
| **视频理解** | 视频帧序列 | 动作标签/描述 | ★★★★★ | 行为识别、视频索引 |
| **3D视觉** | 单目/多目/激光 | 3D重建/位姿 | ★★★★★ | 自动驾驶、SLAM |

### 6.1.2 视觉的独特挑战

相比于NLP，视觉领域有一些独特难度：
1. **高维输入**：一张256x256的彩色图像有 256*256*3 ≈ 20万个输入维度，全连接层在像素级上不可行（需要**卷积的先验假设**——平移等变性、局部连接、参数共享）
2. **光照与视角变化**：同一物体在不同光照、角度、尺度下的像素差异 > 不同类别的差异
3. **遮挡与背景混淆**：部分被遮挡，或物体融入杂乱背景，模型需要学习"部件推理"
4. **小样本**：对长尾物体（稀有类别）的数据特别稀缺

---

## 6.2 卷积神经网络详解

### 6.2.1 卷积操作的数学本质

离散二维卷积操作：
$$S(i,j) = (I * K)(i,j) = \sum_{m=1}^M \sum_{n=1}^N I(i+m-1, j+n-1)K(m,n)$$

**关键参数**：
- **Kernel Size（$K$）**：通常3×3。$3 \times 3$是最小能捕获"中心+邻域"的尺寸。堆叠的3×3卷积等价于更大的感受野同时参数量更少
- **Stride（$S$）**：步长，控制空间下采样倍率
- **Padding（$P$）**：补零策略，维护边缘信息的处理方式（valid与same）
- **Dilation（$D$）**：空洞卷积——卷积核元素间插入$D-1$个空格。在参数量不变的情况下指数级扩大感受野，用于DeepLab等

**输出尺寸公式**：
$$O = \left\lfloor \frac{I + 2P - D(K-1) - 1}{S} + 1 \right\rfloor$$

**参数量**：$C_{in} \times K_h \times K_w \times C_{out} + C_{out}$（偏置）

**感受野（Receptive Field）**的递推：
$$RF_i = RF_{i-1} + (K_i-1) \cdot S_{total\_prev}$$

**卷积 vs 全连接的归纳偏置**：
| 属性 | 全连接层（MLP） | 卷积层（Conv） |
|------|---------------|---------------|
| 连接 | 每个输出神经元连接到所有输入 | 每个输出神经元只连接到一个局部空间区域（局部连接性） |
| 参数 | 大（比如256×256→1024的参数是256×256×1024 = 67M） | 极小（3×3×3×64 = 1728） |
| 平移等变性 | 没有 | 有（（如果输入的物体平移了，特征图内响应也相应平移） |
| 权重共享 | 每个连接独立 | 每个位置共享同一组核（参数共享） |

### 6.2.2 经典 CNN 架构详解

**LeNet-5**（1998）：
- Conv(6@5×5) - AvgPool - Conv(16@5×5) - AvgPool - FC(120) - FC(84) - FC(10)
- 手写数字识别（MNIST），60K参数
- 首次展示梯度下降训练的卷积网络在视觉任务上的可行性

**AlexNet**（2012）：
- Conv(11×11, s4, 96) - MaxPool - Conv(5×5, 256) - MaxPool - Conv(3×3, 384) - Conv(3×3, 384) - Conv(3×3, 256) - MaxPool - FC(4096) - FC(4096) - FC(1000)
- 60M参数，5个卷积层+3个全连接层
- 用两块GTX 580 GPU训练6天
- ReLU激活函数（收敛速度比Tanh快约6倍）：$\max(0, x)$
- Dropout（0.5）防止过拟合
- 数据增强：随机裁剪（224×224）、水平翻转、PCA颜色抖动

**VGG**（2014）：
- 26M(A) ~ 138M(E)参数
- 全部使用3×3卷积，堆叠：Conv(3×3, 64)×2 → MaxPool → Conv(3×3, 128)×2 → MaxPool → Conv(3×3, 256)×3 → MaxPool → Conv(3×3, 512)×3 → MaxPool → Conv(3×3, 512)×3 → MaxPool → FC(4096, 4096, 1000)
- 两个3×3 = 一个5×5的感受野（但参数量更少）；三个3×3 = 一个7×7的感受野（参数减少约50%且引入了更多非线性——三次ReLU而非一次）

**GoogLeNet / Inception v1**（2014）：
- Inception模块：1×1、3×3、5×5、3×3 MaxPool四个并行分支 → 拼接
- 1×1卷积的关键作用：在3×3/5×5卷积前降维（bottleneck），大幅降低计算量
- 全连接层替换为**全局平均池化**（GAP），大幅减少参数量至约1/12（百万 vs 千万级）
- 辅助分类器（在中间层也输入损失，减轻梯度消失）
- 22层但仅5M参数

**ResNet**（2015）：
- 残差学习：$y = F(x, W) + x$。如果不作残差（$y=F(x)$），深层网络会退化（深的版本训练误差反而更高）。这一观察引出了跳跃连接思想
- Bottleneck（瓶颈结构）：1×1核数$C/4$ → 3×3核数$C/4$ → 1×1核数$C$，三层组成一个块，参数量比两个3×3通道数C的块少约4倍（大ResNet系列全靠Bottleneck）
- **为什么残差有效**：给梯度提供了"高速公路"
  - 标准堆叠：$\frac{\partial L}{\partial x_1} = \frac{\partial L}{\partial x_L} \prod_{i=1}^{L-1} \frac{\partial f_i(x_i)}{\partial x_i}$ → 连乘积导致指数衰减
  - 残差块：$\frac{\partial L}{\partial x_1} = \frac{\partial L}{\partial x_L} \sum_{paths}$ → 其中一条路径的梯度全程为1

**ResNet各变体配置**：
| 变体 | Conv层数 | 参数量 | ImageNet Top-1错误率 |
|------|---------|--------|-------------------|
| ResNet-18 | 18 | 11M | 29.5% |
| ResNet-34 | 34 | 21M | 26.7% |
| ResNet-50 | 50 | 25M | 24.6% |
| ResNet-101 | 101 | 44M | 23.4% |
| ResNet-152 | 152 | 60M | 23.0% |

**DenseNet**（2017）：
- 每层输入是前所有层输出的拼接
- $L$层的DenseNet有 $L(L+1)/2$ 个连接
- 梯度有更多条"小路"传递到前面层
- 参数效率极高——在ImageNet上以更少参数达到与ResNet相当的效果

**EfficientNet**（2019）：
- 系统性网络缩放：同时放大深度（depth）、宽度（width）和输入分辨率（resolution）
- 从网络架构搜索（NAS）中获得基线网络
- 复合缩放系数 $\phi$ 统一控制三个维度：$\alpha\phi, \beta\phi, \gamma\phi$
- 在相似FLOPS下比GPipe稳定2-5x

---

## 6.3 目标检测

### 6.3.1 Two-Stage 系列

**R-CNN**（Girshick et al., 2014）：
1. Selective Search提取约2000个候选区域（region proposals）
2. 将每个候选区域缩放到固定大小，送入CNN提取特征
3. 每个候选区域的特征送入SVM分类器
4. 对检测框进行NMS（非极大值抑制）和回归精修

**痛点**：每个候选区域独立进CNN → 约2000次前向 → 极慢（每张图约40-50s）

**Fast R-CNN**（2015）：关键改进——全图卷积一次，RoI Pooling从特征图上提取候选框对应特征

**Faster R-CNN**（2016，One-stage from Two-stage理念）：
- **RPN（Region Proposal Network）**：在特征图的每个位置预置k个anchor（锚框，不同尺寸和长宽比），判断每个anchor是前景还是背景，同时回归微调anchor的偏移量
- 共享全图的特征提取卷积 → RPN在多任务损失下（分类+回归）联合训练
- 端到端训练，大幅提升速度到~100ms/图

### 6.3.2 One-Stage 系列

**YOLO（You Only Look Once）系列**：

| 版本 | 年份 | 核心贡献 | mAP (COCO) | 速度 (FPS) |
|------|------|---------|------------|-----------|
| YOLOv1 | 2015 | 目标检测视作端到端回归问题 | 63.4 | 45 |
| YOLOv2 | 2016 | Anchor Box + 批归一化 + 多尺度训练 | 78.6 | 67 |
| YOLOv3 | 2018 | 多尺度预测 + Darknet-53 | 33.0 (AP50: 57.9) | 78 |
| YOLOv4 | 2020 | Mosaic增强 + CSP + PAN + CIoU | 43.5 | 65 |
| YOLOv5 | 2020 | PyTorch重写 + 自适应Anchor | 50.7 | 125 |
| YOLOv8 | 2023 | Anchor-Free + 任务解耦头 | 53.9 | 280 |
| YOLOv10 | 2024 | NMS-Free + 效率提升 | 54.4 | 320+ |

YOLO的核心思想：将检测定义为"一个端到端的回归问题"。单次卷积推理直接输出 $S \times S \times (B \times 5 + C)$ 的张量，其中 $S \times S$ 网格、$B$个边界框（每个框：x, y, w, h, confidence）、$C$个类别的分类概率。

**SSD（Single Shot MultiBox Detector，2016）**：多尺度特征图上检测
**RetinaNet**（Lin et al., 2017）：提出**Focal Loss** —— 解决正负样本（前景vs背景）极度不平衡问题：
$$FL(p_t) = -\alpha_t (1-p_t)^\gamma \log(p_t)$$

焦点权重 $(1-p_t)^\gamma$ 让模型更多地关注那些**困难可分**的负样本——它们是有信息的。$\gamma=2$ 效果最好。

### 6.3.3 Transformer 时代的检测器

**DETR（Detection Transformer，2020）**：
- 将检测视为"集合预测"（set prediction）问题，不使用anchor和NMS
- Transformer Encoder(DETR的backbone输出的特征 → 序列化后进Encoder编码) + Decoder（Object queries——类似anchor的可学习嵌入，每个query去匹配一个目标） → set of 固定长度N（N通常>最大目标数）的预测
- 二部图匹配（匈牙利算法）将预测与真值配对

**DETR的优点与局限**：对象查询数量N太少则漏检，N太多则冗余预测仍需后处理。在小物体和稠密场景下仍不如定制的CNN检测器速度快。

**RT-DETR**（2023）：实时DETR，结合了YOLO的速度和DETR的端到端优势。成为最新视觉模型的基础范式之一。

---

## 6.4 图像分割

### 6.4.1 语义分割

**FCN（Fully Convolutional Network，2015）**：
- 用卷积层替代全连接层，使输出为完整的 $H \times W$ 尺寸
- 跳跃连接：融合低层高分辨率特征和高层语义特征
- 为端到端语义分割打下基础

**U-Net**（Ronneberger et al., 2015）：
- 对称 Encoder-Decoder 的"U"形结构
- 跳跃连接将编码阶段的高分辨率特征图直接传递给解码阶段的相应层（逐层传递，而非像FCN那样从最后一层上采样）
- 专门为**小数据量**的医学影像设计（数据增强极其重要，通常一次随机变形、旋转、弹性变换的增强数量远大于原始数据）
- U-Net++、Attention U-Net等变体进一步细化了跳跃连接的形式

**DeepLab**（v1, 2016; v3+, 2018）：
- **空洞卷积（Atrous Convolution）**：在保持在较大特征图尺寸的同时扩大感受野
- **ASPP（Atrous Spatial Pyramid Pooling）**：以不同空洞率的空洞卷积并行的多尺度池化——同时捕获全局上下文+局部细节
- 用于自动驾驶街景解析、遥感图像等复杂场景

**Vision Transformer分割模型**：
- **SETR**：ViT作为编码器，渐进式上采样
- **SegFormer**：分层Transformer编码器+轻量MLP解码器，全MLP无需卷积
- **SAM（Segment Anything Model，2023）**：点/框/文本提示的分割基础模型。在S×A-1B（1100万张图, 10亿Mask）上训练的promptable分割模型。**零样本泛化到新数据集的任何分割任务**——分割领域的"GPT-3时刻"

### 6.4.2 实例分割

**Mask R-CNN**（He et al., 2017）：
- Faster R-CNN + 多一个分割分支（**RoI Align**解决RoI Pooling中量化的特征错位）
- 多任务训练：分类损失 + 检测框回归损失 + 分割掩码"逐像素"的二元交叉熵损失（每个RoI的mask分支输出K×m×m→第k个通道表示第k类别的二进制掩码）
- COCO 2016冠军

**YOLACT**（2019）：
- 实时实例分割——将实例分割拆分成两条并行路径：Protonet生成全局原型掩码 + 每个检测框预测一组线性组合系数 → 线性组合后裁剪/阈值化
- 实现实时推理（~30FPS），以牺牲少量mask精度换速度

---

## 6.5 生成模型

### 6.5.1 生成对抗网络（GAN）

**核心对抗博弈**：
$$\min_G \max_D V(D,G) = \mathbb{E}_{x\sim p_{data}}[\log D(x)] + \mathbb{E}_{z\sim p_z}[\log(1 - D(G(z)))]$$

- 生成器G将随机噪声z映射到数据空间，试图"骗过"判别器D
- 判别器D区分真实样本（标签1）和生成样本（标签0）
- 理论上达到纳什均衡：D输出为1/2，G的生成完全匹配真实分布

**GAN训练不稳定的原因**：
1. **模式坍塌（Mode Collapse）**：G找到了一些能欺骗D的特定输出，不再生产多样性训练样本
2. **收敛困难**：D和G的优化目标在零和博弈中并非严格凸，梯度下降不能保证全局纳什均衡
3. **梯度消失**：D太强时，G的梯度被抑制

**GAN的重要变体**：

| 模型 | 年份 | 核心改进 |
|------|------|---------|
| DCGAN | 2015 | 用Conv代替全连接，BN稳定训练，确立了GAN网络的架构规范 |
| **WGAN** | 2017 | Wasserstein距离（地球移动距离）替代JS散度 + 权重裁剪 → 训练更加稳定、有明确的loss指标 |
| WGAN-GP | 2017 | 用梯度惩罚替代权重裁剪 →
  smoother gradients |
| **StyleGAN** | 2019 | 解耦特征映射的"风格"控制层（样式混合+风格注入） |
| **CycleGAN** | 2017 | 未配对双域翻译，使用循环一致性损失 |

### 6.5.2 扩散模型（Diffusion Models，2020）

**前向过程**：向图像逐步加噪（T步，通常1000步），逐渐变成纯高斯噪声：
$$q(x_t|x_{t-1}) = \mathcal{N}(x_t; \sqrt{1-\beta_t}x_{t-1}, \beta_tI)$$

在任意时间步直接采样 $x_t$：
$$x_t = \sqrt{\bar{\alpha}_t}x_0 + \sqrt{1-\bar{\alpha}_t}\epsilon, \quad \epsilon \sim \mathcal{N}(0, I)$$

**反向过程**：学习去噪网络 $\epsilon_\theta(x_t, t)$ 预测噪声 $\epsilon$，从纯噪声逐步恢复图像。

目标函数（简化的变分下界）：
$$L_{simple} = \mathbb{E}_{x_0, t, \epsilon}[\|\epsilon - \epsilon_\theta(x_t, t)\|^2]$$

**为什么扩散模型优于GAN？**
| 特性 | GAN | Diffusion |
|------|-----|-----------|
| 训练稳定性 | 不稳定，需精心调参 | 稳定，训练loss明确下降 |
| 多样性 | 模式坍塌风险 | 高（完全捕获真实分布可能的变异性） |
| 生成质量（早期） | 高 | 低于GAN |
| 采样速度 | 快（单步前向） | 慢（100-1000步去噪） |
| 多样性-保真度平衡 | 难以兼顾 | 可调（控制guidance scale） |

**Latent Diffusion（Rombach et al., 2022）——Stable Diffusion的核心**：
- 在潜在空间（VQ-VAE编码后的低维隐空间：$H \times W$ 的~1/48维度）中执行扩散过程
- 比像素空间扩散快几十倍
- 支持文本条件控制：通过Cross-Attention将文本嵌入注入去噪U-Net
- **Stable Diffusion**：开源、高效（消费级GPU可运行）、大量社区衍生模型

**DDPM → DDIM**（加速采样）：DDIM用确定性采样替代DDPM的随机马尔可夫链，1000步降为50-100步而保真度基本不变。

---

## 6.6 Vision Transformer（ViT）

### 6.6.1 将 Transformer 用于视觉

标准ViT（Dosovitskiy et al., 2020）：

$$z_0 = [\mathbf{x}_{class}; \mathbf{x}_p^1\mathbf{E}; \mathbf{x}_p^2\mathbf{E}; \cdots; \mathbf{x}_p^N\mathbf{E}] + \mathbf{E}_{pos}$$

- 图像分成16×16的patch（$P=16$）→ 展平为序列
- 每个patch线性投影（Embedding $E$）→ 可学习位置编码加和
- 标准的Transformer Encoder（L=12, d=768, h=12）

**CNN vs ViT 对比**：

| 特性 | CNN | ViT |
|------|-----|-----|
| **归纳偏置** | 强（局部性、权重共享、平移等变性） | 弱（几乎全靠大学习数据） |
| **感受野** | 局部到全局逐步扩展 | 第一层就是全局（所有patch直接自注意力） |
| **数据需求** | 小数据集也可工作 | 需大规模数据集（ImageNet22K/JFT-300M等） |
| **理论参数效率** | 高 | 低 |
| **空间建模** | 局限于局部卷积的"缓慢增长"感受野 | 全局建模，但对小patch内的局部信息提取不够 |

**ViT何时胜过CNN？**：预训练数据极大（JFT-300M=3亿样本）时ViT表现最好。中等数据（ImageNet-1K）下，CNN（EfficientNet等）在小样本数据更有效。

### 6.6.2 ViT的改进变体

- **DeiT**（Data-efficient Image Transformer）：引入知识蒸馏（教师CNN → 学生ViT），训练数据量减至ImageNet-1K
- **Swin Transformer**：分层结构 + 移动窗口注意力（shifted window attention），限制自注意力到局部窗口内，跨窗口信息通过窗口移动传递。在处理高分辨率图像与分割/检测任务的层级适配方面优于ViT
- **MAE**（Masked Autoencoders，2021）：随机掩盖75%的patch，仅解码可见patch → 用自监督方式学习视觉表示，媲美甚至超越有监督预训练的ViT

---

## 6.7 多模态视觉模型

- **CLIP**（OpenAI, 2021）：4亿个（图像，文本）对上的对比预训练。学习联合嵌入，能零样本迁移到下游视觉任务（不需要分类头的额外训练数据）
- **BLIP-2**（2023）：用Q-Former作为视觉编码器和LLM之间的模态对齐器
- **SAM**（Segment Anything, 2023）：1100万张图、10亿掩码的分割基础模型
- **Florence-2**（2023）：多任务统一模型（分类/检测/分割/描述/OCR），预训练中同时学习多个视觉任务

---

> **思考题：**
>
> 1. 为什么3×3卷积核堆叠优于一个大的7×7卷积核？从参数量和可表达性两方面分析。
> 2. YOLO系列（One-Stage）和Faster R-CNN系列（Two-Stage）的核心设计哲学差异是什么？各自的优点和缺点是什么？
> 3. 扩散模型相比GAN有哪些理论上的优势？Latent Diffusion的"潜在空间"手段为什么能同时提高效率和质量？
> 4. ViT为什么在大数据集上表现出色但在小数据集上不如CNN？它的"弱归纳偏置"到底是缺点还是优点？
> 5. Focal Loss"公式中 $(1-p_t)^\gamma$ 起到什么作用？为什么 $\gamma=2$ 比 $\gamma=0$（即交叉熵）对解决正负样本不平衡更有效？
> 6. SAM（Segment Anything）为什么被称为分割领域的"基础模型"？它和传统分割模型（如Mask R-CNN）的核心区别是什么？
