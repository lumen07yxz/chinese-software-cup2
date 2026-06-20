# 智学 — AI 个性化学习系统

---

## 一、赛题背景与目标

### 1.1 赛题简介

在数字化与智能化深度融合的时代，高等教育的个性化变革成为核心发展方向。不同学生在知识基础、学习能力、兴趣方向上的显著差异，使得标准化教学难以满足个性化学习需求。本赛题旨在借助大模型技术体系（通用大模型、多模态生成、AI 辅助编程工具等），构建高等教育个性化学习资源体系，开发智能学习智能体系统，实现"因材施教"的数字化落地。

### 1.2 赛题业务场景

学生面临学习资源繁杂无序、难以精准匹配自身需求、缺乏智能化个性化指导等核心问题。本赛题要求以某一具体专业课程（本系统选择 **"人工智能导论"**）为切入点，构建多智能体系统，实现个性化资源的自动化生成与建设，提供定制化、多模态的学习内容。

### 1.3 核心功能需求（赛题要求 vs 本系统实现）

| 赛题要求 | 本系统实现 | 状态 |
|----------|------------|------|
| **对话式学习画像自主构建**（≥6 维度，动态更新） | 6 维画像（知识基础/认知风格/易错点/学习目标/可用时间/兴趣）+ SSE 实时推送 + 随学随新 | ✅ 已实现 |
| **多智能体协同资源生成**（≥5 种类型，不同角色协作） | ResourceCoordinator 编排 4 Agent（RAG 检索→Orchestrator→专业 Agent→安全审查），生成 doc/mindmap/quiz/video/code 5 类资源 | ✅ 已实现 |
| **个性化学习路径规划与资源推送** | Kahn 拓扑排序 + 画像权重 + 知识图谱，时间线 + 依赖图可视化 + hover 高亮 + 缩放拖拽 + 节点详情面板 | ✅ 已实现 |
| **智能辅导（加分项）** | RAG + SSE 流式答疑 + Mermaid 图解 + 来源引用 [1][2] + 画像自适应难度 + 追问建议「」按钮 | ✅ 已实现 |
| **学习效果评估（加分项）** | 五维雷达图 + AI 评估报告 + 学习行为记录 + 14天时间趋势折线图 | ✅ 已实现 |

### 1.4 非功能性需求

| 需求 | 本系统实现 | 状态 |
|------|------------|------|
| 界面美观、交互清晰（流式输出/Markdown/多模态卡片） | React + Tailwind + SSE 流式 + Markdown + KaTeX + Mermaid + Prism | ✅ |
| 防幻觉 + 内容安全过滤 | 10 类正则模式 + LLM-as-judge 双层审查 | ✅ |
| 响应效率（生成进度追踪/流式呈现） | 全部生成接口 SSE 流式 + Agent 状态面板 | ✅ |
| 开源工具标注 | 使用的开源工具需在文档中标注 | ✅ 见下方开源工具清单 |

### 1.5 评分维度与重点

| 维度 | 占比 | 本系统策略 |
|------|------|------------|
| 创新价值与实用性 | 35% | 多智能体协作 + 知识图谱拓扑排序 + 6 维动态画像 |
| 功能实现及技术要求 | 45% | 补齐缺失功能，修复已知 Bug，优化交互体验 |
| 配套文档 | 10% | 开发说明书 + 测试说明书（docs/ 下 .docx 文件） | ✅ |
| 演示视频/PPT | 10% | 7 分钟演示脚本（docs/演示脚本.docx） | ✅ |

---

## 二、技术架构

### 2.1 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Vite 8 + Tailwind CSS 4 + Zustand 5 + React Router 7 |
| 后端 | Python FastAPI + SQLAlchemy (async) + SQLite + ChromaDB |
| LLM 服务 | 科大讯飞星火大模型（spark-x）+ 星火 Embedding API（embedding-2, 1024 维） |
| 认证 | JWT（python-jose + bcrypt） |
| 渲染 | Markdown (react-markdown) + KaTeX (数学公式) + Mermaid (图表) + Prism.js (代码高亮) |

### 2.2 多智能体架构

```
用户请求
  ↓
ResourceCoordinator（资源生成编排器）
  ├── Step 1: RAG 检索助手（rag_service）→ 课程知识库检索
  ├── Step 2: Orchestrator Agent → 需求分析 + 资源规划
  ├── Step 3: 专业 Agent（doc/mindmap/quiz/video/code）→ 内容生成
  └── Step 4: 安全审查 Agent（regex + LLM-as-judge）→ 双层安全审查
  ↓
流式输出到前端（SSE + Agent 状态面板）

ProfileCoordinator（画像提取编排器）
  └── 每轮对话后调用 LLM 结构化提取 6 维画像 → 写入 DB + SSE 推送

KnowledgeGraph（知识图谱引擎）
  ├── 10 章 DAG 拓扑排序（Kahn 算法）
  └── 画像权重驱动个性化排序
```

### 2.3 课程知识库

以"人工智能导论"为内容，10 章完整知识体系：

| 章节 | 主题 | 难度 |
|------|------|------|
| ch01 | 人工智能导论 | 0.20 |
| ch02 | 机器学习基础 | 0.45 |
| ch03 | 深度学习基础 | 0.55 |
| ch04 | Transformer 架构 | 0.65 |
| ch05 | 自然语言处理 | 0.60 |
| ch06 | 计算机视觉 | 0.60 |
| ch07 | 强化学习 | 0.70 |
| ch08 | AI 伦理与安全 | 0.30 |
| ch09 | MLOps 与 AI 工程实践 | 0.50 |
| ch10 | 前沿方向与多模态 AI | 0.50 |

---

## 三、数据模型（SQLAlchemy）

### StudentProfile（学生画像）
| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | String(64) | 用户标识，唯一索引 |
| knowledge_base | JSON | 知识基础（dict of 子领域→掌握度0-1） |
| cognitive_style | String(32) | 认知风格（visual/verbal/active/reflective） |
| weak_points | JSON | 易错点（list of string） |
| learning_goal | Text | 学习目标 |
| available_time | String(32) | 可用时间 |
| interests | JSON | 兴趣方向（list of string） |
| conversation_summary | Text | 对话摘要 |

### User（用户账号）
| 字段 | 类型 | 说明 |
|------|------|------|
| username | String(64) | 用户名，唯一索引 |
| hashed_password | String(256) | bcrypt 密码哈希 |
| nickname | String(64) | 显示昵称 |

### Conversation（对话会话）
| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | String(64) | 所属用户 |
| title | String(256) | 对话标题（首条消息自动生成） |

### ConversationMessage（对话消息）
| 字段 | 类型 | 说明 |
|------|------|------|
| conversation_id | Integer | 所属对话 ID |
| role | String(16) | user / assistant / system |
| content | Text | 消息内容 |

### LearningResource（学习资源）
| 字段 | 类型 | 说明 |
|------|------|------|
| resource_type | String(32) | 类型：doc/mindmap/quiz/video/code |
| content | Text | 完整内容（Markdown） |
| course_chapter | String(64) | 所属章节 |
| difficulty | Float | 难度 0-1 |

### LearningPath（学习路径）
| 字段 | 类型 | 说明 |
|------|------|------|
| path_data | JSON | 路径数据（nodes + edges） |
| current_node | String(64) | 当前节点 |
| progress | Float | 进度 0-1 |

### AssessmentRecord（学习评估记录）
| 字段 | 类型 | 说明 |
|------|------|------|
| study_time_minutes | Integer | 学习时长 |
| quiz_scores | JSON | 测试成绩 |
| resource_interactions | Integer | 资源交互次数 |
| assessment_report | JSON | 评估报告 |

---

## 四、API 接口规范

### SSE 流式接口规范

所有流式端点返回 `text/event-stream`，事件格式：
```
data: {"type": "text", "content": "..."}\n\n
data: {"type": "agent_status", "data": {"agent": "rag", "label": "检索助手", "icon": "📖", "status": "working|done|error", "message": "..."}}\n\n  ← 资源生成专用
data: {"type": "profile_update", "data": {"knowledge_base": {...}, ...}}\n\n  ← 对话画像专用
data: {"type": "done"}\n\n
data: {"type": "error", "content": "..."}\n\n
data: {"type": "warning", "content": "..."}\n\n
```

| 端点 | 方法 | 用途 | 认证 |
|------|------|------|------|
| `/api/auth/register` | POST | 用户注册 | 无需 |
| `/api/auth/login` | POST | 用户登录 | 无需 |
| `/api/auth/me` | GET | 当前用户信息 | ✅ Bearer |
| `/api/chat/stream` | POST | 对话画像流式接口 | ✅ Bearer |
| `/api/conversations/` | GET | 对话列表 | ✅ Bearer |
| `/api/conversations/` | POST | 创建对话 | ✅ Bearer |
| `/api/conversations/{id}/messages` | GET | 获取消息 | ✅ Bearer |
| `/api/conversations/{id}` | DELETE | 删除对话 | ✅ Bearer |
| `/api/resources/generate` | POST | 资源生成流式接口 | ✅ Bearer |
| `/api/resources/` | GET | 资源列表 | ✅ Bearer |
| `/api/resources/{id}` | GET | 资源详情 | ❌ 缺认证 |
| `/api/learning-path/generate` | POST | 学习路径生成流式接口 | ✅ Bearer |
| `/api/learning-path/` | GET | 获取路径 | ✅ Bearer |
| `/api/assessment/generate` | POST | 评估报告生成流式接口 | ✅ Bearer |
| `/api/assessment/` | GET | 获取评估记录 | ✅ Bearer |
| `/api/assessment/record` | POST | 记录学习行为 | ✅ Bearer |
| `/api/tutoring/ask` | POST | 智能辅导流式接口 | ✅ Bearer |
| `/api/profile/` | GET | 获取画像 | ✅ Bearer |
| `/api/profile/update` | POST | 更新画像 | ✅ Bearer |

**认证方式**：`Authorization: Bearer <token>`，token 通过登录/注册返回，JWT 解析当前用户。

---

## 五、当前进度与已完成修复

### ✅ 核心功能已完成

| 模块 | 状态 | 说明 |
|------|------|------|
| 对话式画像构建 | ✅ | SSE 流式对话 + ProfileCoordinator 结构化提取 + 自动写入 DB |
| 多智能体资源生成 | ✅ | 4 Agent 协作 + 5 类资源 + 前端 Agent 状态面板 |
| 学习路径规划 | ✅ | Kahn 拓扑排序 + 画像权重 + 时间线 + SVG 图谱 |
| 学习评估 | ✅ | 统计看板 + SVG 雷达图 + AI 报告 + 历史记录 |
| 课程知识库 | ✅ | 10 章 ChromaDB 向量库 |
| 智能辅导 | ✅ | RAG + SSE 流式答疑 + Mermaid 图解 |
| JWT 认证体系 | ✅ | 注册/登录/路由守卫/退出 |
| 安全过滤 | ✅ | 10 类正则 + LLM-as-judge 双层审查 |
| 自适应难度 | ✅ | coordinator.py 动态难度计算 |
| 资源个性化排序 | ✅ | resources.py 画像驱动排序 |
| 学习行为采集 | ✅ | useAutoTracker + useScrollTracker |
| Dashboard 总览页 | ✅ | 统计卡片 / 知识掌握度 / 快捷操作 / 最近动态 |
| 在线练习 | ✅ | 章节选择 + 自动批改 + 得分统计 |
| 错题本 | ✅ | 自动收录 + 复习模式 + 标记已掌握 |
| 首次登录引导 | ✅ | 4 步向导（目标/风格/兴趣/时间）→ 自动写入画像 |
| 画像手动编辑 | ✅ | Profile 页面内联编辑学习目标/认知风格/时间/兴趣 |
| 建议回复按钮 | ✅ | AI 回复自动提取「」内推荐追问，显示为可点击按钮 |
| 响应式适配 | ✅ | Sidebar 汉堡菜单 + 页面 max-w 限制 + 移动端滑入动画 + 图表自适应 + flex-wrap 换行 |

### ✅ 已完成修复（共 20+ 项）

| 优先级 | 问题 | 修复方式 |
|--------|------|----------|
| P0 | 多智能体协同名实不符 | ResourceCoordinator 4 Agent 协作编排 |
| P0 | 无登录/登出系统 | JWT 认证全链路 |
| P0 | AI 重复提问（无记忆） | Conversation + ConversationMessage 持久化 |
| P0 | 画像不记忆 | 自动写入 StudentProfile + localStorage 缓存 |
| P0 | 切换账号数据污染 | profileStore 按 username 隔离 |
| P0 | LaTeX / 代码高亮 / Mermaid | remark-math + Prism.js + mermaid |
| P0 | Mermaid SVG 坐标 NaN | sanitizeSvg() 正则清理 |
| P0 | 评估报告生成后消失 | justGenerated 状态保留 |
| P0 | Chat 流式对话不输出内容 | chat.py generate() 中补全 spark_service.chat_stream() 调用 |
| P1 | 画像 JSON 客户端正则提取 | ProfileCoordinator 后端 LLM 提取 |
| P1 | Embedding n-gram 哈希 | 星火 Embedding API + n-gram 降级兜底 |
| P1 | 安全过滤仅 3 条正则 | 10 类正则 + LLM-as-judge |
| P1 | 知识图谱拓扑排序缺失 | knowledge_graph.py Kahn 算法 |
| P1 | 图谱节点信息太少 / 被遮挡 | 扩展 CHAPTERS + 可折叠 streamText + 标题移入圆内 + V_GAP 160 |
| P1 | 图谱圆圈遮挡下方文字 | 标题移入圆内显示，CIRCLE_R 计算边界，viewBox 适配 |
| P1 | ChromaDB 嵌入维度不匹配 (256 vs 1024) | RAG 服务启动时自动检测并重建集合，运行时惰性修复 |
| P1 | AI 画像推荐内容固定相同 | build_system_prompt 注入完整画像 + 要求个性化 + 前端根据画像生成差异化提示按钮
| P0 | JWT 密钥默认值不安全 | .env 设置随机强密钥 + main.py 启动 fail-closed 校验（拒绝默认值启动） | ✅ |
| P2 | 前端 12 处类型错误阻断 `npm run build` | 删除 Onboarding 死代码（onSkip/StepProps）+ Dashboard studyMinutes 未用状态 + Quiz 6 处未用变量/死代码 + Profile 类型强转改 `as unknown as` | ✅ |

---

## 六、待解决 — Bug 与问题清单

> ✅ **Phase 0 P0 全部已解决**（2026-06-17 核实）：
> - 安全 #1 `.env` 已 gitignore 且未跟踪；#2 资源接口已加认证+所有权校验（resources.py:231-245）；#3 JWT 已设真实密钥 + main.py fail-closed 校验
> - 功能 #4 conversation_summary 已注入（chat.py:83）；#5 SSE onDone 已加 doneCalled 标志（api.ts:245）；#6 评估报告已持久化（assessment.py:104-109）；#7 conversationId 已用 `!= null`（api.ts:93）
> - 以下 P0 表保留作历史记录，均已完成

### 🔴 P0 — 安全漏洞

| # | 问题 | 文件 | 修复方案 |
|---|------|------|----------|
| 1 | **`.env` 密钥泄露到 Git** | `backend/.env` | 加入 `.gitignore`，轮换已泄露密钥，从 Git 历史清除 |
| 2 | **资源详情接口无认证** | `resources.py:226-245` | 加 `get_current_user` + 所有权校验 |
| 3 | **JWT 密钥默认值不安全** | `config.py:25` | 启动时校验 JWT_SECRET_KEY 非默认值，否则拒绝启动 |

### 🔴 P0 — 功能性 Bug

| # | 问题 | 文件 | 修复方案 |
|---|------|------|----------|
| 4 | **`conversationSummary` 未注入上下文** | `chat.py:70-83` | `existing_profile` dict 加入 `conversation_summary` |
| 5 | **SSE 流 `onDone()` 双重调用** | `api.ts:217-251` | `readSSEStream` 加 `done` 标志位 |
| 6 | **评估报告不保存到 DB** | `assessment.py:69-100` | generate 端点结束后写入 `assessment_report` |
| 7 | **`conversationId: 0` 被 falsy 丢弃** | `api.ts:95` | 改为 `if (conversationId != null)` |

### 🟡 P1 — 中优先级 Bug

| # | 问题 | 文件 | 修复方案 |
|---|------|------|----------|
| 8 | 安全检查 LLM 异常时默认放行 | `safety_service.py:145-180` | fail-closed + ERROR 日志 |
| 9 | `datetime.utcnow()` 已弃用 | 多处 | 替换为 `datetime.now(timezone.utc)` |
| 10 | Embedding 维度不一致 (1024 vs 256) | `embedding_service.py` | fallback 时 pad/truncate 到 1024 |
| 11 | 画像提取每次对话都触发 | `chat.py:122-133` | 节流：每 3-5 轮一次 | ✅ D48 动态节流 |
| 12 | `record_behavior` 不存储 topic/type | `assessment.py:53-66` | 存入完整字段 | ✅ 已存入 quiz_scores JSON |
| 13 | 聊天每次消息开 3 个 DB Session | `chat.py:97-220` | 合并为单 session | ✅ 合并为 2 个（读+写） |
| 14 | sync httpx.Client 阻塞事件循环 | `embedding_service.py:86` | 改用 `httpx.AsyncClient` |

### 🟢 P2 — 代码质量 / 显示问题

| # | 问题 | 修复方案 |
|---|------|----------|
| 15 | `CodeBlock` 组件重复 4 次 | 提取为 `components/CodeBlock.tsx` | ✅ |
| 16 | SSE 解析逻辑重复 3 处 | 统一用 `readSSEStream`（4 处引用） | ✅ |
| 17 | `LoadingSkeleton` 从未使用 | 删除或实际使用 | ✅ |
| 18 | 未使用的 API 函数 (3 个) | 删除（已删除 generateResources/generateLearningPath/createConversation） | ✅ |
| 19 | 多个 API 未检查 resp.ok | 添加状态码检查 | ✅ |
| 20 | `console.log` 遗留（密码泄露风险） | 全部删除 | ✅ |
| 21 | `useAutoTracker` 跨页面计时互斥 | 按页面维度去重 | ✅ 改为全局累计+每天单次记录 |
| 22 | `useScrollTracker` 硬编码 5 分钟 | 改为实际阅读时长 | ✅ |
| 23 | AppInitializer 每次清空画像致闪烁 | 优化加载顺序 | ✅ 仅用户切换时清空 |
| 24 | **知识图谱标题截断**（"人工智能…"） | DependencyGraph + dagLayout 已重做 | ✅ |
| 25 | **知识图谱文字遮挡**（节点/标签重叠） | NodeDetailPanel 点击展开详情 | ✅ |
| 26 | **图谱不可交互**（无点击/hover/缩放） | DependencyGraph 交互 + NodeDetailPanel 详情面板 | ✅ |
| 27 | **图谱圆形布局看不出层次** | dagLayout.ts 分层 DAG 布局 | ✅ |
| 28 | **时长 badge 遮挡标题** | 移到节点卡片内部或 hover 浮层 | ✅ |

### ⚪ P3 — 依赖与配置

| # | 问题 | 修复方案 |
|---|------|----------|
| 29 | 10 个未使用 Python 依赖 | 清理 requirements.txt |
| 30 | `.env.example` 与 `.env` DB 不一致 | 统一为 SQLite |
| 31 | CORS 硬编码 localhost | 从 `.env` 读取 | ✅ |
| 32 | 注册/登录无后端输入校验 | Pydantic 约束 | ✅ |
| 33 | 无 token 过期/刷新机制 | 添加静默刷新或到期提醒 |

---

## 七、后续功能目标（按比赛评分维度对齐）

### 🔧 A. 登录体验完善（影响第一印象）

> ✅ **Phase 1 A1-A7 全部已完成**（2026-06-17 核实）：
> - A1 前端实时校验+提示（Login/Register `onUsernameChange`/`onPasswordChange`）；A2 后端 Pydantic 校验（auth.py `RegisterRequest` field_validator，用户名正则+密码 4-20）
> - A3 Caps Lock 提示（`handleCapsLock` + `getModifierState`）；A4 密码强度条（`getPasswordStrength` 三段式弱/中/强）
> - A5 401 过期提示（api.ts `handle401` 设 `auth_expired` 标志 → Login 黄色 banner）；A6 删除 console（前端已无 console 语句）；A7 fade-in 动画（`animate-[fadeIn_0.3s_ease-out]`）

| 序号 | 功能 | 说明 |
|------|------|------|
| 1 | 前端输入校验 + 实时提示 | 用户名 2-20 位字母数字，密码 4-20 位 |
| 2 | 后端 Pydantic 输入校验 | `min_length`/`max_length`/`pattern` |
| 3 | Caps Lock 提示 | 密码框检测大写锁定并显示提示 |
| 4 | 密码强度条 | 基于长度+字符类型的弱/中/强反馈 |
| 5 | 401 过期提示 | 跳转登录页时显示"登录已过期"黄色提示 |
| 6 | 删除 console.log | 消除密码信息泄露风险 |
| 7 | 页面过渡动画 | 登录/注册页 fade-in 效果 |

### 🧠 B. 知识图谱与学习路径重做（核心交互）

| 序号 | 功能 | 说明 |
|------|------|------|
| 8 | **分层 DAG 布局** | 替换圆形布局，自上而下分层，直观展示前置依赖 |
| 9 | **节点详情面板** | 点击节点弹出面板：goals、key_concepts、难度、推荐资源、预估时长 |
| 10 | **交互式图谱** | hover 高亮关联节点 + 鼠标滚轮缩放 + 拖拽平移 |
| 11 | **边标签优化** | 默认隐藏，hover 时显示；或改为 tooltip |
| 12 | **节点状态标识** | 🔴 待学（推荐）/ ⚪ 未开始 / ✅ 已完成 / ⏭ 可跳过 |
| 13 | **路径进度持久化** | completedNodes 存后端 DB 而非仅 localStorage | ✅ |
| 14 | **路径动态调整** | 根据测评结果自动调整后续路径权重 |

### 📝 C. 赛题核心功能补齐（45% 评分权重）

| 序号 | 功能 | 说明 | 对应赛题要求 |
|------|------|------|-------------|
| 15 | **首次登录引导向导** | 新用户 3 步向导：选目标→填时间→快速摸底测试，自动构建初始画像 | 画像构建增强 |
| 16 | **画像手动编辑** | 用户可直接修改画像各字段 | 画像"随学随新" |
| 17 | **画像变化历史** | 展示知识掌握度提升曲线（profileStore 快照 + Dashboard 多知识点折线图，≥2条快照自动显示） | 画像动态可视化 | ✅ |
| 18 | **在线做题与自动批改** | 前端 quiz 答题界面 + 即时反馈对错解析 | 资源类型丰富度 |
| 19 | **错题本** | 自动收录错题，支持重做 | 学习效果追踪 |
| 20 | **薄弱点自动诊断** | 根据做题记录自动更新 `weak_points`（Quiz 完成后自动调用 `diagnoseWeakPoints`，错误率>50%的章节写入画像） | 画像动态更新 | ✅ |
| 21 | **练习题按章节+难度生成** | 独立的练习入口（章节选择+难度过滤+AI搜索出题+自动批改） | 多模态资源生成 | ✅ |
| 22 | **Dashboard 总览页** | 登录后首页：今日任务、统计概览、待复习提醒、最近活动 | 个性化入口 |

### 💡 D. 智能辅导增强（加分项，10% 评分）

| 序号 | 功能 | 说明 |
|------|------|------|
| 23 | **辅导来源引用** | 回答中标注信息来源（章节+文档片段） |
| 24 | **难度自适应** | 根据画像水平调整回答深度 |
| 25 | **追问建议** | 回答后推荐 2-3 个相关追问方向 |

### 📊 E. 学习评估增强（加分项，10% 评分）

| 序号 | 功能 | 说明 |
|------|------|------|
| 26 | **学习时间趋势图** | 按日/周/月展示学习时长折线图 | ✅ |
| 27 | **知识点掌握热力图** | 可视化各知识点掌握程度（Assessment 页热力网格，薄弱点红框高亮） | ✅ |
| 28 | **阶段性章节测评** | 学完一章自动触发测评，决定能否进入下一章（节点详情面板"章节测评"按钮 → 跳转 Quiz 预选章节 → 间隔重复自动调度） | ✅ |
| 29 | **评估报告导出** | 导出为 PDF 分享（报告区「导出 PDF」按钮，复用 window.print() + print-area CSS） | ✅ |

### 🎯 F. 资源体验优化

| 序号 | 功能 | 说明 |
|------|------|------|
| 30 | **资源收藏/标记** | 收藏重要资源，标记"已读"/"待读"（⭐收藏按钮 + 收藏筛选标签） | ✅ |
| 31 | **资源评分反馈** | 👍/👎 评分，反馈用于优化后续生成（详情面板工具栏按钮，存 localStorage） | ✅ |
| 32 | **资源编辑** | 修改 AI 生成内容中的错误（详情面板工具栏"编辑"按钮 → textarea → PUT 保存到 DB） | ✅ |
| 33 | **资源导出** | Markdown 下载 + PDF 打印 + 学习路径大纲导出 | ✅ |
| 34 | **资源搜索** | 全文搜索已生成的资源（标题+描述+章节实时过滤） | ✅ |
| 35 | **关联资源推荐** | 查看资源时推荐同章节其他类型资源（详情面板底部"同章节相关资源"） | ✅ |

### 🧠 D. 画像与对话体验优化（赛题核心 — 个性化）

| 序号 | 功能 | 说明 |
|------|------|------|
| 46 | **AI 推荐回复根据画像差异化** | system prompt 已注入完整画像引导 AI 个性化推荐，但 AI 仍然可能给出通用推荐。需要进一步调优 prompt 或对推荐结果做后处理去重 | ✅ |
| 47 | **对话初始提示按钮个性化** | 前端已根据 `profile.knowledge_base/learning_goal/interests` 动态生成 hint 按钮。需要验证效果并补充更多组合策略 | ✅ |
| 48 | **对话中画像提取节流优化** | 目前每 3 轮对话提取一次。应根据画像完整度动态调整频率（画像不完整时每轮提取） | ✅ |
| 49 | **建议回复按钮点击后自动隐藏** | 点击建议按钮后该组按钮应淡出，减少视觉干扰 | ✅ |
| 50 | **画像维度可视化提升** | 增加知识掌握度历史变化折线图（画像"随学随新"可视化） | ✅ |
| 33 | **资源导出** | Markdown/HTML/PDF 离线使用 |
| 34 | **资源搜索** | 全文搜索已生成的资源 |
| 35 | **关联资源推荐** | 查看资源时推荐同章节其他类型资源 |

### 🏗️ G. 架构与代码质量

| 序号 | 功能 | 说明 |
|------|------|------|
| 36 | 提取共享 CodeBlock 组件 | 消除 4 处复制粘贴 | ✅ |
| 37 | 统一 SSE 解析逻辑 | 消除 3 处重复 | ✅ |
| 38 | 清理未使用依赖 | requirements.txt 精简 |
| 39 | DB Session 复用 | chat.py 合并为单 session |
| 40 | CORS 可配置化 | 从 `.env` 读取 origins | ✅ |
| 41 | 开源工具使用标注 | 整理所有使用的开源工具及协议 |

### ⭐ H. 锦上添花

| 序号 | 功能 | 说明 |
|------|------|------|
| 42 | 每日学习目标 + 打卡 | 设置目标、连续天数（每日打卡统计 + 连续学习天数 + 今日学习分钟/练习/阅读） | ✅ |
| 43 | 成就徽章系统 | 里程碑徽章（8 个成就：初来乍到/破冰之旅/学以致用/三天打鱼/一周坚持/月度学霸/刷题达人/知识探索者） | ✅ |
| 44 | 间隔重复提醒 | 遗忘曲线复习提醒（SM-2 算法 + Dashboard 待复习提醒卡片 + Quiz 自动调度） | ✅ |
| 45 | 暗黑模式 | 深色主题（CSS 变量 + html.dark 切换 + index.html 防闪烁脚本 + 侧边栏🌙切换按钮） | ✅ |

---

## 八、执行计划

### 按比赛评分权重排优先级

| 阶段 | 内容 | 对应评分 | 预计耗时 |
|------|------|----------|----------|
| **Phase 0：紧急修复** | #1-3 安全漏洞 + #4-7 P0 Bug + 删除 console.log | 基础运行 | 2-3h |
| **Phase 1：登录体验** | A1-A7 登录完善 | 第一印象 | 2-3h |
| **Phase 2：图谱重做** | B8-B14 知识图谱交互重做 | 核心交互 | 4-6h |
| **Phase 3：赛题核心补齐** | C15-C22 引导向导/做题/错题本/Dashboard/画像编辑 | 45% 功能分 | 6-8h |
| **Phase 4：加分项增强** | D23-D25 辅导 + E26-E29 评估 | 20% 加分 | 4-5h |
| **Phase 5：资源体验** | F30-F35 资源优化 | 创新实用性 | 3-4h |
| **Phase 6：代码质量** | G36-G41 架构清理 | 代码规范 | 2-3h |
| **Phase 7：锦上添花** | H42-H45 激励系统 | 创新加分 | 3-4h |

### ✅ 已完成执行

| 阶段 | 内容 | 状态 |
|------|------|------|
| Phase 2 (B8) | 分层 DAG 布局 + 标题移入圆内 + V_GAP 160 + CIRCLE_R 边路径 + Hover/缩放/拖拽 + 节点详情面板 | ✅ |
| Phase 3 (C15) | 首次登录 4 步引导向导（目标/风格/兴趣/时间）→ 自动写入画像 DB | ✅ |
| Phase 3 (C16) | Profile 页面内联编辑（学习目标/认知风格/可用时间/兴趣方向） | ✅ |
| Phase 3 (C18) | 在线练习：章节选择 + 自动批改 + 得分统计 + 错题收录 | ✅ |
| Phase 3 (C19) | 错题本：自动收录 + 复习模式 + 标记已掌握 + 统计 | ✅ |
| Phase 3 (C22) | Dashboard 总览页：4 统计卡片 + 知识掌握度 + 快捷操作 + 最近动态 | ✅ |
| P0 Bug | Chat 流式对话不输出内容（chat.py 缺少 spark_service.chat_stream 调用） | ✅ |
| P1 Bug | ChromaDB 嵌入维度不匹配（RAG 服务自动检测并重建） | ✅ |
| P1 Bug | 图谱圆形遮挡下方文字（标题移入圆内 + 间距增大 + viewBox 修正） | ✅ |
| P1 Bug | AI 推荐内容固定相同（system prompt 注入画像 + 个性化 hint 按钮） | ✅ |
| 建议回复 | 带「」的建议追问自动提取 + 可点击按钮 | ✅ |
| P0 Bug | resources.py json.loads 解析纯文本崩溃（coordinator 末次 yield 非 JSON） | ✅ |
| P1 Bug | MermaidBlock Syntax error 反复浮现（增加 isValidMermaid 校验 + 错误缓存） | ✅ |
| P1 Bug | 练习生成后显示"暂无题目"（改为直接从流式文本解析题目） | ✅ |
| P1 Bug | 安全审查 _parse_json_from_llm 返回字符串导致 .get() 崩溃 | ✅ |
| 联网搜索 | 后端 WebSearchService（DuckDuckGo + HTML 兜底）+ 资源生成/辅导集成 | ✅ |
| 知识库导入 | 拖拽上传 .md/.txt/.pdf + 文件夹批量导入 + 向量库自动同步 | ✅ |
| 知识库页面 | 前端 KnowledgeBasePage（搜索/上传/文档管理）+ 侧边栏导航 | ✅ |
| 智能辅导联网 | tutoring.py 集成 web_search 作为 RAG 补充来源 | ✅ |
| 资源生成联网 | coordinator.py 集成 web_search，Orchestrator/Agent prompt 注入网络资料 | ✅ |
| 资源导出（Markdown / PDF / 学习路径大纲） | export.ts Blob 下载 + window.print 离线 PDF + 路径拓扑序列化大纲 | ✅ |
| PPT 生成（讯飞 AI PPT WebAPI） | 后端 ppt_service.py 封装 /v2/createPPT + /v2/queryCreateProgress + 前端 PPT 页面（主题输入/语言选择/进度轮询/下载） | ✅ |
| Phase 4 (D23) | 辅导来源引用：RAG 结果透传章节/source 元数据 + prompt 要求 LLM 标注 [N] 来源编号 | ✅ |
| Phase 4 (D24) | 辅导难度自适应：按 knowledge_base 水平/cognitive_style/weak_points 分层教学指令 | ✅ |
| Phase 4 (D25) | 追问建议增强：后端 prompt 要求 2-3 个「」追问 + 前端点击后淡出动画 | ✅ |
| Phase 4 (E26) | 学习时间趋势图：后端 /assessment/trends 按日聚合 14 天 + 前端 SVG 折线图 | ✅ |

**总计预估：26-36h（约 4-5 天）**

### 必做提醒

> 🔑 **`.env` 必须加入 `.gitignore`** — 当前密钥已泄露到 Git 历史
> 🔑 **JWT 密钥** — 生产环境务必更换
> 🔑 **资源接口认证** — `GET /api/resources/{id}` 当前无任何认证
> 🔑 **Embedding 重建** — 升级后需执行 `cd backend && python ../knowledge_base/build_kb.py`
> 🔑 **知识图谱显示** — 圆形布局严重遮挡，需优先重做

---

## 九、竞品参考 — OpenMAIC 借鉴

> 完整参考文件：[`reference.md`](reference.md)
> 项目来源：[OpenMAIC](https://github.com/THU-MAIC/OpenMAIC)（清华大学，1.8w+ Star，AGPL-3.0）

### 9.1 核心架构差异

| 维度 | 智学（我们） | OpenMAIC | 启示 |
|------|-------------|----------|------|
| 多 Agent 编排 | 同步 Pipeline（硬编码 4 步） | **LangGraph Director Graph**（动态决策下一个 Agent） | ⭐ 引入 Director 模式 |
| 内容生成 | 单次 LLM 输出完整内容 | **两阶段流水线（大纲→场景）** | ⭐ 大纲可控后再逐项生成 |
| Agent 输出 | 纯文本 + Mermaid | **Action 系统（28+ 种动作）** | ⭐ Agent 可"操作 UI" |
| 学习模式 | 静态浏览 | **PlaybackEngine 状态机驱动** | 值得做自动导学 |
| 白板 | 静态 SVG 知识图谱 | **AI 实时绘图 SVG 白板** | 可在辅导中使用 |

### 9.2 Director Graph 多 Agent 编排模式

OpenMAIC 使用 LangGraph `StateGraph` 构建编排图：

```
START → director ──(end)──→ END
           │
           └─(next)→ agent_generate ──→ END
```

- **Director 节点**：决定下一个谁发言（单 Agent 纯代码，多 Agent 用 LLM 决策）
- **单轮契约**：每次请求最多 1 轮 director→agent，多轮讨论由客户端串行发起
- **状态流转**：通过 `Annotation.Root` 定义可 reducer 状态

**我们的可借鉴做法：** ResourceCoordinator 可改用 Director 模式，由 LLM 动态编排 Agent 顺序，而非硬编码 RAG→Orch→Agent→Safety。

### 9.3 两阶段内容生成流水线

| 阶段 | 说明 |
|------|------|
| **Stage 1 — 大纲生成** | AI 分析用户输入 + 画像 → 生成结构化大纲（可人工审核/调整） |
| **Stage 2 — 场景生成** | 每个大纲条目独立生成完整场景（支持断点续传/部分重生成） |

**我们的可借鉴做法：** 资源生成改为先出大纲/框架（含难度、知识点、预计时长），再逐项生成内容。大纲阶段可结合画像调整策略。

### 9.4 统一 Action 系统（白板等交互的核心机制）

**核心设计：** AI 的所有交互都抽象为 Action，前端 ActionEngine 统一执行。**不需要调用后端 API，全部在前端 Zustand Store 中完成。**

```
AI 流式回复中的 action 事件
    ↓
ActionEngine.execute(action)
    ↓
StageAPI.whiteboard.addElement(element)  ← 对 Zustand Store 的封装
    ↓
Zustand Store 更新（stage.whiteboard[0].elements 推入新元素）
    ↓
React 组件 re-render（WhiteboardCanvas 自动显示）
```

**白板实现细节（全部前端）：**

| 层级 | 文件 | 职责 |
|------|------|------|
| Store | `lib/store/canvas.ts` | `whiteboardOpen` / `whiteboardClearing` UI 状态 |
| Store | `lib/store/stage.ts` | `stage.whiteboard[].elements` 存储绘图数据（内存） |
| API | `lib/api/stage-api-whiteboard.ts` | CRUD 封装（`addElement` / `deleteElement` / `listElements`） |
| Engine | `lib/action/engine.ts` | 接收 action → 调 whiteboard API → 等待动画 → 返回 |
| View | `components/whiteboard/whiteboard-canvas.tsx` | 渲染 PPTElement[]，支持 pan/zoom/动画 |

**Action 类型示例：**

| 动作 | 参数 | 执行方式 |
|------|------|---------|
| `wb_open` / `wb_close` | 无 | 同步，自动开白板 |
| `wb_draw_text` | x, y, content, color, fontSize | 同步，等元素淡入 |
| `wb_draw_shape` | x, y, shape, width, height, fill | 同步 |
| `wb_draw_chart` | chartType, data, themeColors | 同步 |
| `wb_draw_latex` | latex, x, y, color | 同步，KaTeX 渲染 |
| `spotlight` / `laser` | elementId, color | fire-and-forget |

**流式协议中 Agent 事件格式：**
```
agent_start → text_delta* → (action | text_delta)* → agent_end
```

### 9.5 PlaybackEngine 状态机

```
idle ──start()──→ playing ──pause()──→ paused
  ▲                   ▲                    │
  │                   └──── resume() ─────┘
  │
  └── handleEndDiscussion() ← live ← confirmDiscussion()
```

- 支持播放/暂停/恢复/打断
- 播放中可被用户打断进入 live 讨论模式
- 讨论结束后恢复播放进度

**我们的可借鉴做法：** 学习路径可加入自动导学模式——按节点顺序自动播放内容（语音讲解 + 高亮知识图谱 + 弹出思考题），用户随时打断提问。

### 9.6 ProactiveCard 主动教学卡片

播放过程中 Agent 可主动弹出讨论提示：
- 显示讨论话题 + "参与"/"跳过" 按钮
- 参与 → 进入 live 讨论模式
- 跳过 → 标记已消费，继续播放
- 3 秒延迟后显示（让前一个语音自然结束）

**我们的可借鉴做法：** 学习过程中 AI 可主动弹出思考题/测验/知识关联推荐卡片。

### 9.7 可直接落地的改进

| 优先级 | 改进 | 说明 | 工作量 |
|--------|------|------|--------|
| P0 | **SSE 事件协议扩展** | 新增 `action` / `agent_start` / `agent_end` 事件类型 | 1天 |
| P0 | **ActionEngine** | 前端解析 AI 回复中的 action 事件并执行（高亮图谱/弹出测验/推荐资源） | 2天 |
| P0 | **资源导出** | 导出学习资源为 Markdown / PDF | 1天 |
| P1 | **Proactive 教学卡片** | AI 主动弹出讨论/思考题，用户选择参与或跳过 | 2天 |
| P1 | **两阶段生成** | 资源生成改为先出大纲→再逐项生成 | 3天 |
| P1 | **多 Agent 讨论** | Chat 页面多角色轮流发言，头像/颜色区分 | 3天 |
| P2 | **自动导学模式** | PlaybackEngine 驱动学习路径自动播放 | 5天 |
| P2 | **白板绘图** | AI 在辅导中画图解释概念 | 5天 |
| P2 | **交互式模拟** | AI 生成可交互 HTML 组件（神经网络可视化等） | 8天 |

### 9.8 关键参考文件索引

| 文件 | 对我们最有价值的部分 |
|------|-------------------|
| `lib/orchestration/director-graph.ts` | Agent 编排状态机模式 |
| `lib/action/engine.ts` | ActionEngine 完整实现（719行） |
| `lib/types/action.ts` | 28+ Action 类型定义 |
| `lib/playback/engine.ts` | PlaybackEngine 状态机（752行） |
| `lib/generation/pipeline-runner.ts` | 两阶段流水线执行器 |
| `components/chat/proactive-card.tsx` | 主动教学卡片 UI |
| `lib/api/stage-api-whiteboard.ts` | 白板 Store API |
| `lib/store/canvas.ts` | Canvas 状态管理 |
| `components/whiteboard/whiteboard-canvas.tsx` | 白板渲染 |

---

## 十、开源工具使用标注

### 前端

| 工具 | 版本 | 协议 | 用途 |
|------|------|------|------|
| React | 19.2.6 | MIT | UI 框架 |
| React Router | 7.17.0 | MIT | 路由管理 |
| Zustand | 5.0.14 | MIT | 状态管理 |
| Tailwind CSS | 4.3.0 | MIT | 样式框架 |
| Vite | 8.0.12 | MIT | 构建工具 |
| TypeScript | 5.x | Apache-2.0 | 类型系统 |
| react-markdown | 10.1.0 | MIT | Markdown 渲染 |
| remark-gfm | 4.0.1 | MIT | GFM 表格/任务列表 |
| remark-math | 6.0.0 | MIT | 数学公式解析 |
| rehype-katex | 7.0.1 | MIT | KaTeX 数学渲染 |
| KaTeX | 0.17.0 | MIT | 数学公式渲染引擎 |
| Mermaid | 11.15.0 | MIT | 图表渲染 |
| Prism.js | 1.30.0 | MIT | 代码高亮 |
| rehype-prism-plus | 2.0.2 | MIT | 代码高亮插件 |

### 后端

| 工具 | 版本 | 协议 | 用途 |
|------|------|------|------|
| FastAPI | 0.115.0 | MIT | Web 框架 |
| Uvicorn | 0.30.6 | BSD-3 | ASGI 服务器 |
| SQLAlchemy | 2.0.35 | MIT | ORM |
| aiosqlite | 0.20.0 | Apache-2.0 | 异步 SQLite |
| ChromaDB | 0.5.20 | Apache-2.0 | 向量数据库 |
| python-jose | 3.3.0 | MIT | JWT 认证 |
| passlib | 1.7.4 | BSD | 密码哈希 |
| Pydantic | 2.9.2 | MIT | 数据校验 |
| httpx | 0.27.2 | BSD-3 | HTTP 客户端 |
| jieba | 0.42.1 | MIT | 中文分词 |

### AI 服务

| 服务 | 用途 | 说明 |
|------|------|------|
| 科大讯飞星火大模型（spark-x） | 对话/生成/辅导 | 主 LLM |
| 星火 Embedding API（embedding-2） | 文本向量化 | 1024 维 |
| DuckDuckGo + Bing | 联网搜索 | 资源生成/辅导补充 |
