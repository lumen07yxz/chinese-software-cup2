# 第七章：强化学习

## 7.1 强化学习概述

### 7.1.1 核心要素

强化学习（Reinforcement Learning, RL）是机器学习的第三大范式，研究智能体如何在与环境交互中学习最优策略以最大化累积奖励。

**核心要素**：
- **Agent（智能体）**：学习者和决策者
- **Environment（环境）**：智能体与之交互的外部世界
- **State（状态$s_t$）**：环境在时刻t的表示
- **Action（动作$a_t$）**：智能体在时刻t采取的行动
- **Reward（奖励$r_t$）**：环境对动作的即时反馈
- **Policy（策略$\pi(a|s)$）**：在状态s下选择动作a的概率分布
- **Value Function（价值函数）**：长期累积奖励的期望

### 7.1.2 马尔可夫决策过程（MDP）

任何RL问题形式化为MDP，由五元组 $(S, A, P, R, \gamma)$ 定义：
- $S$：状态空间（连续或离散）
- $A$：动作空间
- $P(s'|s, a)$：状态转移概率（MDP的核心——马尔可夫性质保证当前状态已包含决策所需的一切历史信息）
- $R(s, a)$：奖励函数
- $\gamma \in [0,1]$：折扣因子

**目标**：最大化累积折扣奖励：
$$G_t = \sum_{k=0}^{\infty} \gamma^k r_{t+k+1}$$

$\gamma$ 越小，智能体越"短视"（只看近期奖励）；$\gamma$ 越接近1，智能体越"远视"（看重长期回报）。

**价值函数**：
- **状态价值函数**：$V^\pi(s) = \mathbb{E}_\pi[G_t | s_t = s]$（在策略$\pi$下，从状态s开始的期望回报）
- **动作价值函数**：$Q^\pi(s, a) = \mathbb{E}_\pi[G_t | s_t = s, a_t = a]$（从状态s采取动作a，后续遵循策略$\pi$的期望回报）

**Bellman方程**——RL的基石：
$$V^\pi(s) = \sum_a \pi(a|s) \sum_{s', r} P(s', r|s, a)[r + \gamma V^\pi(s')]$$
$$Q^\pi(s, a) = \sum_{s', r} P(s', r|s, a)[r + \gamma \sum_{a'} \pi(a'|s')Q^\pi(s', a')]$$

---

## 7.2 基于价值的算法

### 7.2.1 Q-Learning（Watkins, 1989）

Off-policy TD学习算法的经典代表。Q-Learning直接用最优$Q$值的估计来更新当前Q值：

$$Q(s, a) \leftarrow Q(s, a) + \alpha[r + \gamma \max_{a'}Q(s', a') - Q(s, a)]$$

TD Target $r + \gamma \max_{a'} Q(s', a')$ 使用下一状态最大Q值，但当前策略$\epsilon$-greedy的行为不一定对应这个"最优动作"——这正是off-policy的含义。

### 7.2.2 DQN（Deep Q-Network, Mnih et al., 2013）

用深度神经网络近似Q函数 $Q(s, a; \theta)$。在Atari游戏上达到人类水平。

**三大创新**：
1. **Experience Replay**：存储经验$(s, a, r, s')$到回放缓冲区 → 随机采样训练。打破时间相邻样本之间的相关性，使数据满足i.i.d.假设
2. **Target Network**：用独立的$\theta^-$计算TD target，每隔$C$步同步。减少自举（bootstrapping）导致的目标移动
3. **Reward Clipping**：将奖励截断到[-1, 1]范围，防止梯度爆炸

**损失函数**：
$$L(\theta) = \mathbb{E}_{(s,a,r,s')\sim D}\left[\left(r + \gamma \max_{a'} Q(s', a'; \theta^-) - Q(s, a; \theta)\right)^2\right]$$

### 7.2.3 DQN改进

- **Double DQN**（2015）：使用$\theta$选动作$(\arg\max_{a'}Q(s', a';\theta))$，用$\theta^-$计算Q值→减少Q值过高估计
- **Dueling DQN**（2016）：将Q拆分为$V(s) + A(s,a)$。状态价值网络$V$+优势函数网络$A$→大幅提升学习效率
- **Prioritized Experience Replay**（2016）：按TD-error的绝对值作为采样权重（$p \propto |\delta|^\alpha$），结合重要性采样校正

---

## 7.3 基于策略的算法

### 7.3.1 Policy Gradient（REINFORCE）

直接优化策略参数$\theta$：
$$\nabla_\theta J(\theta) = \mathbb{E}_\pi[\nabla_\theta \log \pi_\theta(a|s) \cdot G_t]$$

**REINFORCE算法**：
```python
def reinforce(env, policy_net, lr=0.001):
    for episode in range(MAX_EPISODES):
        states, actions, rewards = [], [], []
        state = env.reset()
        done = False
        # 采样完整轨迹
        while not done:
            action = sample_action(policy_net(state))
            next_state, reward, done = env.step(action)
            states.append(state); actions.append(action); rewards.append(reward)
            state = next_state
        # 计算折扣回报
        G = 0
        for t in reversed(range(len(rewards))):
            G = rewards[t] + gamma * G
            # 策略梯度更新
            loss = -log_prob(policy_net(states[t]), actions[t]) * G
            optimizer.zero_grad(); loss.backward(); optimizer.step()
```

**REINFORCE的缺陷**：高方差，收敛慢。原因——每个episode的轨迹$G_t$在不同条件下方差巨大（控制vs随机性），导致梯度信号占主导的是噪声而非策略改进方向。

### 7.3.2 Actor-Critic

Actor-Critic通过引入一个Critic（价值函数$V(s)$）来减少方差：
- **Actor（策略网络$\pi_\theta$）**：决定做什么
- **Critic（价值网络$V_\phi(s)$）**：评估做得好不好

**优势函数（Advantage Function）**：
$$A(s, a) = Q(s, a) - V(s)$$

优势函数衡量当前动作相对于"平均水平"的好坏，直观理解成——$A>0$优于平均，应增加动作概率；$A<0$劣于平均，应减少概率。

**A2C/A3C算法梯度**：
$$\nabla_\theta J = \mathbb{E}[\nabla_\theta \log \pi_\theta(a|s) \cdot A(s, a)]$$

A3C（Asynchronous Advantage Actor-Critic, 2016）：多worker异步执行，共享梯度→稳定训练。A2C（Synchronous）：各worker同步更新，更优。

### 7.3.3 PPO（Proximal Policy Optimization, Schulman et al., 2017）

PPO是目前最广泛使用的RL算法，在TRPO（Trust Region Policy Optimization，用KL散度约束每步更新幅度）基础上简化和改进

**PPO的核心——防止一次更新太大导致训练崩溃**：

$$\mathcal{L}^{CLIP}(\theta) = \mathbb{E}_t[\min(r_t(\theta)A_t, \text{clip}(r_t(\theta), 1-\epsilon, 1+\epsilon)A_t)]$$

其中 $r_t(\theta) = \frac{\pi_\theta(a_t|s_t)}{\pi_{\theta_{old}}(a_t|s_t)}$ 是新旧策略的比率。

- 当 $A_t > 0$（好动作）：鼓励 $r_t$ 增大（增加该动作概率），但截断到不超过 $1+\epsilon$
- 当 $A_t < 0$（坏动作）：鼓励 $r_t$ 减小（降低该动作概率），但截断到不低于 $1-\epsilon$

$\epsilon$ 通常为0.2，这个阈值是经验上非常稳健的。

**PPO完整损失函数**：
$$L^{CLIP+VF+S}(\theta) = \mathbb{E}_t[L_t^{CLIP}(\theta) - c_1 L_t^{VF}(\theta) + c_2 S[\pi_\theta](s_t)]$$

其中 $L_t^{VF}$ 是价值函数的MSE损失，$S[\pi_\theta]$ 是策略熵奖赏促进探索。

---

## 7.4 深度强化学习里程碑

| 年份 | 突破 | 方法 | 意义 |
|------|------|------|------|
| 2013 | DQN玩Atari游戏 | Deep Q-Network | DRL首次在纯视觉任务中达到人类水平 |
| 2016 | **AlphaGo击败李世石** | DNN + MCTS + RL | 在围棋这一公认的"AI终极挑战"领域实现历史突破 |
| 2017 | **AlphaGo Zero** | 纯自我对弈 + 零人类知识 | 不依赖人类棋谱，3天超越历代版本 |
| 2017 | **AlphaZero** | AlphaGo Zero推广到棋类 | 单一算法同时下围棋、象棋、将棋，通用性 |
| 2017 | **PPO** | Proximal Policy Optimization | 稳定且通用的策略优化算法，成为RLHF的骨干 |
| 2019 | OpenAI Five击败Dota 2冠军 | 多智能体并行RL | 在长时域协作任务中超越职业队 |
| 2020 | **RLHF** | RL用于语言模型对齐 | 将RL与NLP结合，ChatGPT的核心技术 |
| 2022 | **Gato**（DeepMind） | 单一模型玩604个游戏 | 通用智能体的尝试 |

---

## 7.5 RLHF（基于人类反馈的强化学习）

### 7.5.1 三步流程

**第一步：收集偏好数据**——人类标注者对同一prompt的多个模型回复排序（如：同一个prompt送进SFT模型生成4条回复，标注员按质量排出顺序）。

**第二步：训练奖励模型**——用偏好数据训练一个能预测人类偏好的奖励模型$R_\phi(x, y)$：

**Bradley-Terry模型**：
$$P(y_w \succ y_l | x) = \frac{\exp(R_\phi(x, y_w))}{\exp(R_\phi(x, y_w)) + \exp(R_\phi(x, y_l))}$$

损失函数（最大化正样本对的似然）：
$$L_R = -\mathbb{E}_{(x, y_w, y_l)\sim D}[\log \sigma(R_\phi(x, y_w) - R_\phi(x, y_l))]$$

**第三步：PPO微调**——用奖励模型作为奖励信号，PPO微调语言模型：

$$R(x, y) = R_\phi(x, y) - \beta \cdot \text{KL}(\pi_\theta(y|x) \| \pi_{ref}(y|x))$$

KL惩罚项防止模型在追求高奖励时偏离参考策略太远（确保不丢失语言能力）。

### 7.5.2 优化形式

RLHF的PPO优化目标：
$$\max_\theta \mathbb{E}_{x\sim D, y\sim \pi_\theta(y|x)}[R_\phi(x, y)] - \beta \cdot \text{KL}(\pi_\theta \| \pi_{ref})$$

### 7.5.3 DPO（Direct Preference Optimization，2023）

DPO将RLHF的奖励建模和策略优化整合为一步：

$$L_{DPO}(\pi_\theta; \pi_{ref}) = -\mathbb{E}_{(x, y_w, y_l)}\left[\log \sigma\left(\beta \log\frac{\pi_\theta(y_w|x)}{\pi_{ref}(y_w|x)} - \beta \log\frac{\pi_\theta(y_l|x)}{\pi_{ref}(y_l|x)}\right)\right]$$

**对比**：
| 特性 | RLHF | DPO |
|------|------|-----|
| 组件 | 4个模型（策略、参考、奖励、价值） | 2个模型（策略、参考） |
| 训练复杂度 | 高（PPO多步、需要采样、奖励模型更新） | 低（单步优化） |
| 超参数 | 多个（KL系数、PPO-clip等） | 较少（只需$\beta$） |
| 经验效果 | 更好的"探索"性质（训练中主动生成并评判新回复） | 只在静态偏好数据集上优化，缺乏在线探索 |

---

## 7.6 探索 vs 利用（Exploration vs Exploitation）

RL的根本困境——去探索未知获取更高回报，还是利用已知获取确定回报？

| 方法 | 描述 | 特点 |
|------|------|------|
| $\epsilon$-greedy | 以概率$\epsilon$随机动作 | 简单但盲目 |
| Boltzmann探索 | 以Q值的softmax概率选择动作 | 自适应探索 |
| **UCB** | 选择置信上界最高的动作 | 考虑不确定性 |
| **Thompson Sampling** | 从参数后验采样再选最优动作 | 贝叶斯最优探索 |
| **好奇心驱动** | 以预测误差作为内禀奖励 | 鼓励探索新奇状态 |

---

## 7.7 多智能体强化学习

- **完全合作**（e.g., 多机器人协作搬运）：共享奖励
- **完全竞争**（e.g., 两个Agent的零和博弈）：一方奖励=另一方负奖励
- **混合协作-竞争**（e.g., MOBA游戏中5v5团队战）：共享团队奖励+相互竞争

**典型算法**：
- **MADDPG**：每个Agent的Critic使用全局信息（所有Agent的动作），Actor使用局部观测
- **QMIX**：将联合Q函数分解为各Agent Q函数的单调组合

---

## 7.8 本章小结

本章介绍了强化学习的完整体系：

1. MDP（马尔可夫决策过程）的形式化 + Bellman方程
2. 基于价值方法：Q-Learning → DQN → Double/Dueling/Prioritized
3. 基于策略方法：Policy Gradient（REINFORCE）→ Actor-Critic → PPO
4. 深度强化学习里程碑与重要应用
5. RLHF的偏好收集→奖励模型→PPO微调全流程
6. 探索-利用困境、多智能体RL

---

> **思考题：**
>
> 1. On-policy（如SARSA）和Off-policy（如Q-Learning）的区别是什么？为什么PPO是on-policy但Q-Learning却是off-policy？
> 2. 为什么DQN需要Experience Replay和Target Network？直接用一个网络在线更新会有什么问题？
> 3. PPO使用Clipping机制而不是TRPO的KL散度约束，它的计算优势在哪？Clip值$\epsilon$太大或太小分别会导致什么问题？
> 4. RLHF中，奖励模型的训练基于Bradley-Terry模型——请问同一prompt的多条回复如何配对，为什么排序数据可以产出标量奖励函数？
> 5. DPO消除了RLHF中奖励模型这一环节，它的理论推导关键步骤是什么？为什么DPO在实践中通常比RLHF简单但效果稍差？
> 6. 探索-利用困境在RL中为何如此根本？如果环境模型是确定的（deterministic transition）而Agent已执行了足够长时间——此时应继续探索还是完全利用？
