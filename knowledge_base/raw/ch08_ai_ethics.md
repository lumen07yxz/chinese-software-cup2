# 第八章：AI 伦理与安全

## 8.1 AI 伦理概述

随着 AI 技术在各个领域的广泛应用，AI 伦理问题已成为学术界、产业界和政策制定者共同关注的核心议题。

### 8.1.1 核心伦理原则

| 原则 | 含义 |
|------|------|
| 公平性（Fairness）| AI 系统不应对特定群体产生歧视 |
| 透明性（Transparency）| AI 决策过程应可解释可审计 |
| 隐私保护（Privacy）| 保护个人数据的收集和使用 |
| 问责制（Accountability）| 明确 AI 决策的责任归属 |
| 安全性（Safety）| 确保 AI 系统可靠可控 |

## 8.2 算法偏见

### 8.2.1 偏见来源

- **数据偏见**：训练数据不具代表性
- **标注偏见**：人工标注引入的主观偏见
- **算法偏见**：模型放大数据中已有的偏见
- **部署偏见**：系统在不同环境中表现不一致

### 8.2.2 公平性定义

| 定义 | 数学形式 |
|------|----------|
| Demographic Parity | $P(\hat{Y}=1|A=a) = P(\hat{Y}=1|A=b)$ |
| Equalized Odds | $P(\hat{Y}=1|Y=y,A=a) = P(\hat{Y}=1|Y=y,A=b)$ |
| Equal Opportunity | $P(\hat{Y}=1|Y=1,A=a) = P(\hat{Y}=1|Y=1,A=b)$ |

### 8.2.3 缓解方法

- 数据重采样/重加权
- 对抗去偏（Adversarial Debiasing）
- 公平性约束优化
- 后处理校准

## 8.3 AI 安全

### 8.3.1 主要安全风险

- **对抗攻击（Adversarial Attack）**：微小扰动导致模型错误分类
- **数据投毒（Data Poisoning）**：污染训练数据使模型学习后门
- **模型窃取（Model Stealing）**：通过 API 查询复制模型
- **越狱攻击（Jailbreaking）**：绕过模型安全限制

### 8.3.2 防御方法

- 对抗训练（Adversarial Training）
- 差分隐私（Differential Privacy）
- 模型蒸馏（Knowledge Distillation for Defense）
- RLHF 安全对齐
- 红队测试（Red Teaming）

## 8.4 可解释性（XAI）

### 8.4.1 方法分类

- **基于归因**：Saliency Map、Grad-CAM、Integrated Gradients
- **基于示例**：影响函数、反事实解释
- **基于规则**：决策树提取、逻辑规则
- **注意力可视化**：Transformer 注意力热力图

### 8.4.2 SHAP（SHapley Additive exPlanations）

基于博弈论 Shapley 值，将预测分解为各特征的贡献：

$$\phi_i = \sum_{S \subseteq N \setminus \{i\}} \frac{|S|!(|N|-|S|-1)!}{|N|!}[f(S \cup \{i\}) - f(S)]$$

## 8.5 大模型安全

### 8.5.1 幻觉问题（Hallucination）

- **定义**：模型生成看似合理但事实错误的内容
- **缓解**：RAG 检索增强、事实核查、外部知识融合

### 8.5.2 对齐（Alignment）

对齐的三层目标：
1. **Helpful**：有用地回应用户需求
2. **Honest**：提供准确、不误导的信息
3. **Harmless**：不产生有害内容

## 8.6 法律法规

- **欧盟 AI Act**：按风险等级分类监管
- **中国《生成式人工智能服务管理暂行办法》**：2023年起施行
- **美国 AI 行政令**：安全和信任导向

## 8.7 本章小结

本章讨论了 AI 伦理与安全的核心议题：算法偏见的来源与缓解、AI 安全风险与防御、可解释性方法、大模型的幻觉与对齐问题，以及国内外 AI 监管法规。

---

> 思考题：
> 1. Demographic Parity 和 Equalized Odds 哪个更合理？为什么？
> 2. 对抗攻击为什么能在人类不可察觉的情况下欺骗 AI 模型？
> 3. RAG 如何帮助缓解大模型的幻觉问题？
