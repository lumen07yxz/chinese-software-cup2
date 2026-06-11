# 第七章：强化学习

## 7.1 强化学习概述

强化学习（Reinforcement Learning, RL）是机器学习的第三大范式，研究智能体如何在与环境交互中学习最优策略以最大化累积奖励。

### 7.1.1 核心要素

- **Agent（智能体）**：学习者和决策者
- **Environment（环境）**：智能体与之交互的外部世界
- **State（状态）$s_t$**：环境在时刻 t 的表示
- **Action（动作）$a_t$**：智能体在时刻 t 采取的行动
- **Reward（奖励）$r_t$**：环境对动作的即时反馈
- **Policy（策略）$\pi(a|s)$**：在状态 s 下选择动作 a 的概率
- **Value Function（价值函数）**：长期累积奖励的期望

### 7.1.2 马尔可夫决策过程（MDP）

RL 问题被形式化为 MDP，由五元组 $(S, A, P, R, \gamma)$ 定义：

- $S$：状态空间
- $A$：动作空间
- $P(s'|s, a)$：状态转移概率
- $R(s, a)$：奖励函数
- $\gamma \in [0,1]$：折扣因子

**马尔可夫性质**：下一个状态仅依赖于当前状态和动作，与历史无关。

### 7.1.3 目标函数

最大化累积折扣奖励：
$$G_t = \sum_{k=0}^{\infty} \gamma^k r_{t+k+1}$$

状态价值函数：
$$V^\pi(s) = \mathbb{E}_\pi[G_t | s_t = s]$$

动作价值函数：
$$Q^\pi(s, a) = \mathbb{E}_\pi[G_t | s_t = s, a_t = a]$$

## 7.2 基于价值的方法

### 7.2.1 Q-Learning

Q-Learning 是最经典的 off-policy TD 学习算法：

$$Q(s, a) \leftarrow Q(s, a) + \alpha[r + \gamma \max_{a'}Q(s', a') - Q(s, a)]$$

### 7.2.2 DQN（Deep Q-Network）

用神经网络近似 Q 函数。

**三大创新**：
1. **Experience Replay**：存储经验 $(s,a,r,s')$ 到回放池，随机采样训练（打破数据相关性）
2. **Target Network**：用独立的 Target Network 计算 TD target，定期同步（稳定训练）
3. **Clipping Rewards**：将奖励截断到 [-1, 1]

### 7.2.3 DQN 改进

- **Double DQN**：分离动作选择和动作评估，减少过估计
- **Dueling DQN**：将 Q 分解为 $V(s) + A(s,a)$，学习更高效
- **Prioritized Experience Replay**：按 TD-error 优先级采样

## 7.3 基于策略的方法

### 7.3.1 Policy Gradient

直接对策略参数化并优化：

$$\nabla_\theta J(\theta) = \mathbb{E}_\pi[\nabla_\theta \log \pi_\theta(a|s) \cdot Q^\pi(s,a)]$$

### 7.3.2 Actor-Critic

结合基于策略和基于价值的方法：
- **Actor（策略网络）**：决定做什么
- **Critic（价值网络）**：评估做得好不好

**A2C/A3C**：
$$\nabla_\theta J = \mathbb{E}[\nabla_\theta \log \pi_\theta(a|s) \cdot A(s,a)]$$
其中 $A(s,a) = Q(s,a) - V(s)$ 为优势函数

### 7.3.3 PPO（Proximal Policy Optimization）

目前最广泛使用的 RL 算法，通过裁剪（Clipping）约束策略更新幅度：

$$L^{CLIP}(\theta) = \mathbb{E}_t[\min(r_t(\theta)A_t, \text{clip}(r_t(\theta), 1-\epsilon, 1+\epsilon)A_t)]$$

## 7.4 深度强化学习里程碑

- **2013**：DQN 玩 Atari 游戏达到人类水平
- **2016**：AlphaGo 击败围棋冠军李世石
- **2017**：AlphaZero 零知识自学超越 AlphaGo
- **2019**：OpenAI Five 击败 Dota 2 世界冠军
- **2020-2025**：RLHF 用于语言模型对齐、具身智能

## 7.5 RLHF 详解

### 7.5.1 三步流程

1. **收集偏好数据**：人类标注者对同一 prompt 的多个模型输出排序
2. **训练奖励模型**：用偏好数据训练一个能预测人类偏好的奖励模型
3. **PPO 微调**：用奖励模型作为奖励信号，PPO 微调语言模型

### 7.5.2 数学形式

Reward Model（Bradley-Terry 模型）：
$$P(y_w \succ y_l | x) = \frac{\exp(r_\phi(x, y_w))}{\exp(r_\phi(x, y_w)) + \exp(r_\phi(x, y_l))}$$

PPO with KL penalty：
$$\max_\theta \mathbb{E}[r_\phi(x, y) - \beta \cdot \text{KL}(\pi_\theta \| \pi_{ref})]$$

## 7.6 本章小结

本章介绍了强化学习的核心概念（MDP、Policy、Value）、基于价值的方法（Q-Learning、DQN）、基于策略的方法（Policy Gradient、Actor-Critic、PPO），以及深度强化学习的重要里程碑和 RLHF 在语言模型对齐中的应用。

---

> 思考题：
> 1. On-policy 和 Off-policy 学习的区别是什么？
> 2. 为什么 PPO 要使用 Clipping 约束策略更新？
> 3. RLHF 中的 KL 惩罚项起到什么作用？
