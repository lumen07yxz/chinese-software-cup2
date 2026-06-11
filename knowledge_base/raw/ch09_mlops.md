# 第九章：MLOps 与 AI 工程实践

## 9.1 MLOps 概述

MLOps（Machine Learning Operations）是 ML 与 DevOps 的交叉学科，旨在统一 ML 系统的开发和运维，使机器学习项目能够可靠、高效地投入生产。

### 9.1.1 为什么需要 MLOps

- 传统软件工程和 ML 开发存在根本差异
- ML 系统的技术债务累积更快
- 模型性能会随数据和环境变化而退化
- 需要可复现、可审计的训练和部署流程

### 9.1.2 MLOps 成熟度

| 级别 | 特征 |
|------|------|
| Level 0 | 手动流程，无自动化 |
| Level 1 | CI/CD 自动化训练和部署 |
| Level 2 | 全自动 CI/CD/CT 流水线 |

## 9.2 ML 项目生命周期

### 9.2.1 数据管理

- **数据版本控制**：DVC、LakeFS、Delta Lake
- **特征存储（Feature Store）**：Feast、Tecton
- **数据质量监控**：Schema 验证、分布漂移检测

### 9.2.2 实验追踪

- **工具**：MLflow、Weights & Biases、TensorBoard、Aim
- **追踪内容**：超参数、代码版本、数据集、评估指标、模型文件

### 9.2.3 模型注册与版本管理

MLflow Model Registry 工作流：
1. 注册模型
2. 设置阶段（Staging / Production / Archived）
3. 版本管理
4. 部署审批

## 9.3 模型部署

### 9.3.1 部署模式

| 模式 | 描述 | 适用场景 |
|------|------|----------|
| 批处理 | 离线批量预测 | 推荐系统、风控 |
| 实时服务 | REST/gRPC API | 在线推理 |
| 边缘部署 | 设备端推理 | IoT、移动端 |
| 流处理 | 实时数据流推理 | 异常检测 |

### 9.3.2 模型服务框架

- **Triton Inference Server**：NVIDIA 多框架推理服务器
- **TorchServe**：PyTorch 原生模型服务
- **vLLM**：大语言模型高性能推理
- **Ray Serve**：分布式模型服务

### 9.3.3 模型优化

- **量化（Quantization）**：INT8/INT4 降低精度加速推理
- **剪枝（Pruning）**：移除不重要的权重
- **蒸馏（Distillation）**：小模型学习大模型的输出
- **TensorRT/ONNX**：计算图优化

## 9.4 模型监控

### 9.4.1 监控指标

- **数据漂移（Data Drift）**：输入数据分布变化
- **概念漂移（Concept Drift）**：输入-输出关系变化
- **模型性能退化**：准确率、召回率等下降
- **服务延迟和吞吐量**

### 9.4.2 监控工具

- Evidently AI
- WhyLabs
- Arize AI
- Grafana + Prometheus

## 9.5 CI/CD for ML

### 9.5.1 持续集成（CI）

- 代码格式检查与单元测试
- 数据验证
- 模型训练测试
- 模型评估

### 9.5.2 持续部署（CD）

- 模型 A/B 测试
- 金丝雀部署（Canary Deployment）
- 蓝绿部署（Blue-Green Deployment）
- 自动回滚

## 9.6 大模型的工程挑战

- **推理成本**：KV Cache 优化、投机解码（Speculative Decoding）
- **长上下文**：Ring Attention、StreamingLLM
- **并发服务**：Continuous Batching、PagedAttention（vLLM）
- **微调效率**：LoRA、QLoRA、Prefix Tuning

## 9.7 本章小结

本章介绍了 MLOps 的核心理念和 AI 工程实践：ML 项目生命周期管理、实验追踪与模型注册、模型部署模式与优化技术、模型监控、CI/CD for ML，以及大模型的工程优化技术。

---

> 思考题：
> 1. 与传统软件系统相比，ML 系统在监控方面有什么特殊挑战？
> 2. LoRA 微调为什么能显著降低大模型微调的成本？
> 3. 数据漂移和概念漂移有什么区别？
