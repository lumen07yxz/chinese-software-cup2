# 第六章：计算机视觉

## 6.1 计算机视觉概述

计算机视觉（Computer Vision, CV）研究如何让计算机从图像和视频中获取高层次理解。它是深度学习最早取得突破的领域之一。

### 6.1.1 核心任务

| 任务 | 描述 | 输出 |
|------|------|------|
| 图像分类 | 判断图像属于哪个类别 | 类别标签 |
| 目标检测 | 定位并分类图像中的物体 | Bounding Box + 类别 |
| 语义分割 | 将每个像素分类 | Pixel-wise 标签 |
| 实例分割 | 区分同类不同个体 | Mask + 类别 + ID |
| 图像生成 | 从噪声或文本生成图像 | 图像 |

## 6.2 卷积神经网络详解

### 6.2.1 卷积操作

$$S(i,j) = (I * K)(i,j) = \sum_m \sum_n I(i+m, j+n)K(m,n)$$

**关键参数**：
- **Kernel Size**：卷积核大小（通常 3×3）
- **Stride**：滑动步长
- **Padding**：边缘填充方式（valid / same）
- **Dilation**：空洞卷积，扩大感受野

### 6.2.2 经典结构

- **AlexNet**：5 Conv + 3 FC，ReLU + Dropout + Data Augmentation
- **VGG-16**：13 Conv (3×3) + 3 FC，简洁统一
- **Inception v3**：多分支并行 + 1×1 降维
- **ResNet-50**：Bottleneck 残差块（1×1→3×3→1×1）

## 6.3 目标检测

### 6.3.1 Two-Stage 检测器

- **R-CNN**：Selective Search 提取候选框 → CNN 提取特征 → SVM 分类
- **Fast R-CNN**：RoI Pooling 共享特征图
- **Faster R-CNN**：RPN（Region Proposal Network）端到端训练

### 6.3.2 One-Stage 检测器

- **YOLO**：将检测视为回归问题，单次推理输出 bounding box 和类别
- **SSD**：多尺度特征图检测
- **RetinaNet**：Focal Loss 解决正负样本不平衡

### 6.3.3 评估指标

- **IoU (Intersection over Union)**：预测框与真实框的交并比
- **mAP (mean Average Precision)**：各类别 AP 的均值
- **AP@0.5, AP@0.75**：不同 IoU 阈值下的准确率

## 6.4 图像分割

### 6.4.1 语义分割

- **FCN**：全卷积网络，端到端像素级预测
- **U-Net**：对称 Encoder-Decoder + Skip Connection，适合医学影像
- **DeepLab**：空洞卷积 + ASPP（多尺度池化）

### 6.4.2 实例分割

- **Mask R-CNN**：Faster R-CNN + 分割分支，RoI Align

## 6.5 生成模型

### 6.5.1 GAN（生成对抗网络）

$$\min_G \max_D V(D,G) = \mathbb{E}_{x\sim p_{data}}[\log D(x)] + \mathbb{E}_{z\sim p_z}[\log(1 - D(G(z)))]$$

- Generator 生成假样本，Discriminator 判別真伪
- 训练不稳定，易 mode collapse

### 6.5.2 扩散模型（Diffusion Models）

1. **前向过程**：逐步给图像加高斯噪声直到纯噪声
2. **反向过程**：训练 U-Net 学习去噪，从噪声还原图像
3. **采样**：从随机噪声开始逐步去噪生成图像

代表：DDPM、DDIM、Stable Diffusion

## 6.6 Vision Transformer（ViT）

将图像分割为固定大小的 Patches（如 16×16），将 Patches 视为 Token 序列，直接使用 Transformer Encoder。

**核心公式**：
$$\mathbf{z}_0 = [\mathbf{x}_{class}; \mathbf{x}_p^1\mathbf{E}; \mathbf{x}_p^2\mathbf{E}; \cdots; \mathbf{x}_p^N\mathbf{E}] + \mathbf{E}_{pos}$$

ViT 在大数据集上预训练后效果优异，证明了 Transformer 在视觉领域的通用性。

## 6.7 本章小结

本章介绍了计算机视觉的核心方向：CNN 经典架构（AlexNet → ResNet）、目标检测（Faster R-CNN / YOLO）、图像分割（U-Net / Mask R-CNN）、生成模型（GAN / Diffusion）和 Vision Transformer。

---

> 思考题：
> 1. 为什么 3×3 小卷积核堆叠优于一个大卷积核？
> 2. YOLO 和 Faster R-CNN 的核心设计哲学差异是什么？
> 3. 扩散模型相比 GAN 有哪些优势？
