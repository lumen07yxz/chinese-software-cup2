# CLAUDE.md — 项目全局知识库

---

## 项目定位

本项目为 **第十五届中国软件杯大赛——A组赛题"基于大模型的个性化资源生成与学习多智能体系统开发"**，出题企业：科大讯飞股份有限公司。

**核心目标**：借助大模型技术和多智能体协同架构，构建高等教育个性化学习资源体系。以"人工智能导论"课程为切入点，实现个性化资源的自动化生成与建设。

**核心价值**：解决大学生学习资源杂乱、缺乏个性化、薄弱点难定位、缺乏即时辅导、学习动力不足五大痛点。

---

## 技术栈

| 层级 | 技术 | 版本 | 用途 |
|------|------|------|------|
| 前端框架 | React 18 + TypeScript | 19.x | 组件化 UI |
| 构建工具 | Vite | 8.x | 快速构建 |
| CSS 框架 | Tailwind CSS | 4.x | 样式体系 |
| 状态管理 | Zustand | 5.x | 轻量状态 |
| Markdown 渲染 | react-markdown + rehype-katex + remark-gfm | - | 内容渲染 |
| 路由 | react-router-dom | 7.x | 页面路由 |
| 后端框架 | FastAPI | 0.115.x | 异步 REST API |
| 异步运行时 | Uvicorn | 0.30.x | ASGI 服务器 |
| 数据库 | SQLite (开发) / PostgreSQL 16 (生产) | - | 持久化存储 |
| ORM | SQLAlchemy 2.0 (async) | - | 数据库操作 |
| 向量数据库 | ChromaDB | 0.5.x | RAG 知识检索 |
| LLM | 科大讯飞星火 Spark X2 Flash | - | 核心 AI 能力 |
| 多智能体框架 | CrewAI | 0.80.x | 多 Agent 编排 |
| 消息缓存 | Redis | 7.x | 会话/状态管理 |
| 文件存储 | MinIO | - | S3 兼容存储 |
| 内容安全 | jieba + 正则过滤 | - | 敏感词检测 |

---

## 项目目录结构

```
e:/chinese.software.cup2/
├── agents/                          # 多智能体角色定义 + 协调器
│   ├── coordinator.py               # [NEW] 资源生成协调器 — 多 Agent 编排逻辑
│   ├── profile_coordinator.py       # [NEW] 画像提取协调器 — 对话后结构化提取
│   ├── crew_factory.py              # CrewAI 编排工厂（创建 Crew）
│   ├── profile_agent.py             # 画像构建 Agent
│   ├── path_agent.py                # 学习路径规划 Agent
│   ├── tutoring_agent.py            # 智能辅导 Agent
│   ├── assessment_agent.py          # 学习评估 Agent
│   └── resource_agents/             # 资源生成 Agents（角色定义被 coordinator.py 复用）
│       ├── orchestrator.py          # 资源设计总监 Agent
│       ├── doc_agent.py             # 课程文档 Agent
│       ├── mindmap_agent.py         # 思维导图 Agent
│       ├── quiz_agent.py            # 练习题 Agent
│       ├── video_agent.py           # 视频脚本 Agent
│       └── code_agent.py            # 实操案例 Agent
├── backend/                         # FastAPI 后端
│   ├── main.py                      # 应用入口 + 路由注册
│   ├── config.py                    # 配置管理（Pydantic Settings）
│   ├── db/                          # 数据库引擎与 Session
│   │   └── __init__.py
│   ├── models/                      # SQLAlchemy 数据模型
│   │   └── __init__.py              # StudentProfile, LearningResource, LearningPath, AssessmentRecord
│   ├── api/                         # API 路由层
│   │   ├── chat.py                  # 对话画像 SSE
│   │   ├── profile.py               # 画像 CRUD
│   │   ├── resources.py             # 资源生成 SSE + 列表
│   │   ├── learning_path.py         # 学习路径生成 SSE
│   │   ├── assessment.py            # 学习评估 SSE + 行为记录
│   │   └── tutoring.py              # 智能辅导 SSE
│   └── services/                    # 业务服务层
│       ├── spark_service.py         # 星火大模型 API 调用
│       ├── rag_service.py           # RAG 检索服务（ChromaDB）
│       ├── embedding_service.py     # 向量嵌入服务（n-gram 哈希，待升级）
│       └── safety_service.py        # 内容安全过滤 + 防幻觉
├── frontend/                        # React 前端
│   ├── src/
│   │   ├── App.tsx                  # 路由配置
│   │   ├── main.tsx                 # 入口
│   │   ├── index.css                # 全局样式 + Tailwind 主题色
│   │   ├── components/              # 通用组件
│   │   │   ├── AppLayout.tsx        # 全局布局（侧边栏 + 主区域）
│   │   │   ├── Sidebar.tsx          # 导航侧边栏
│   │   │   ├── ChatBubble.tsx       # 聊天气泡（Markdown 渲染）
│   │   │   ├── ChatInput.tsx        # 聊天输入框
│   │   │   ├── ProfilePanel.tsx     # 画像面板组件
│   │   │   ├── LoadingSkeleton.tsx   # 骨架屏
│   │   │   └── KnowledgeDecorBg.tsx # 知识装饰背景
│   │   ├── pages/
│   │   │   ├── Chat/index.tsx       # 对话画像页（已有功能，画像提取有缺陷）
│   │   │   ├── Resources/index.tsx  # 学习资源页（已有功能）
│   │   │   ├── LearningPath/index.tsx # 学习路径页（仅标题，待实现）
│   │   │   ├── Assessment/index.tsx   # 学习评估页（仅标题，待实现）
│   │   │   └── Profile/index.tsx    # 我的画像页（已有功能）
│   │   ├── stores/
│   │   │   ├── chatStore.ts         # 聊天状态
│   │   │   └── profileStore.ts      # 画像状态
│   │   └── services/
│   │       └── api.ts               # API 客户端（fetch 封装）
│   └── package.json
├── knowledge_base/                  # 课程知识库
│   ├── build_kb.py                  # 知识库构建脚本
│   └── raw/                         # 原始课程文档（10 章 Markdown）
│       ├── ch01_intro.md            # 人工智能导论
│       ├── ch02_ml_basics.md        # 机器学习基础
│       ├── ch03_deep_learning.md    # 深度学习基础
│       ├── ch04_transformer.md      # Transformer 架构
│       ├── ch05_nlp.md              # 自然语言处理
│       ├── ch06_cv.md               # 计算机视觉
│       ├── ch07_rl.md               # 强化学习
│       ├── ch08_ai_ethics.md        # AI 伦理与安全
│       ├── ch09_mlops.md            # MLOps 与 AI 工程实践
│       └── ch10_advanced_topics.md  # 前沿方向与多模态 AI
├── data/
│   └── chroma/                      # ChromaDB 持久化数据
├── docs/                            # 交付文档
│   ├── 01-需求分析.md
│   ├── 02-系统设计.md
│   ├── 03-测试报告.md
│   └── 04-部署说明.md
└── docker-compose.yml               # 基础设施编排
```

---

## 代码分层规则

### 后端分层（严格单向依赖）

```
API 路由层 (api/*.py)
    ↓ 调用
服务层 (services/*.py)
    ↓ 调用
数据层 (db/ + models/)
```

**规则**：
- API 路由层（`api/*.py`）负责：请求解析、参数校验、SSE 流式响应组装
- 协调器层（`agents/coordinator.py`、`agents/profile_coordinator.py`）负责：多 Agent 编排、LLM 调用调度、agent_status 事件产出
- 服务层（`services/*.py`）负责：LLM 调用、RAG 检索、内容安全、业务逻辑
- 数据层（`models/` + `db/`）负责：ORM 模型定义、数据库会话管理
- API 路由不得直接操作数据库，必须通过服务层或直接调用 db session（当前少量违反，逐步收敛）

### 前端分层

```
页面层 (pages/*/index.tsx) — 页面级组件，负责布局和数据协调
    ↓ 使用
组件层 (components/*.tsx) — 通用 UI 组件，无业务逻辑
状态层 (stores/*.ts) — Zustand 状态管理
服务层 (services/api.ts) — API 调用封装
```

---

## 全局编码规范

### 后端（Python）

1. **命名规范**：
   - 文件/目录：小写 + 下划线（snake_case）
   - 函数/变量：小写 + 下划线
   - 类名：大驼峰（PascalCase）
   - 常量：全大写 + 下划线
   - API 路由函数：`generate_*` / `list_*` / `get_*` / `create_*` 动词开头

2. **异步优先**：所有 API 路由和数据库操作用 `async/await`

3. **类型注解**：所有函数参数和返回值必须标注类型

4. **import 顺序**：标准库 → 第三方库 → 本地模块（每组空行分隔）

5. **错误处理**：
   - API 路由内用 `try/except` 捕获异常
   - 流式接口在异常时 yield `{"type": "error", "content": str(e)}`
   - 非流式接口抛出 `HTTPException`

6. **LLM 调用**：
   - 使用 `spark_service.chat_stream()` 流式调用
   - 使用 `spark_service.chat()` 非流式调用
   - 所有生成内容末尾调 `add_hallucination_disclaimer()` 添加防幻觉声明
   - 调 `check_safety()` 检查内容安全

### 前端（TypeScript/React）

1. **命名规范**：
   - 组件文件：大驼峰（`ChatBubble.tsx`）
   - 非组件文件：小驼峰（`chatStore.ts`）
   - 组件函数：大驼峰
   - 普通函数/变量：小驼峰
   - 接口/类型：大驼峰（`StudentProfile`）

2. **组件规则**：
   - 每个页面组件一个目录（`pages/Xxx/index.tsx`）
   - 函数组件 + `export default`
   - Props 接口定义在组件文件内或独立的 `types.ts`

3. **状态管理**：
   - 全局状态用 Zustand store
   - 局部状态用 `useState` / `useReducer`
   - 避免 prop drilling 超过 3 层

4. **样式规范**：
   - 使用 Tailwind CSS 原子类
   - 主题色变量定义在 `index.css` 的 `@theme` 块中
   - 不使用内联 `style` 属性（除动态计算值外）

5. **API 调用**：
   - 通过 `services/api.ts` 封装的函数调用
   - SSE 流式响应使用 `ReadableStream` + `getReader()` 读取
   - 非流式响应使用标准 `fetch` + `resp.json()`

---

## 数据模型（SQLAlchemy）

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

## API 接口规范

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

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/chat/stream` | POST | 对话画像流式接口 |
| `/api/resources/generate` | POST | 资源生成流式接口 |
| `/api/learning-path/generate` | POST | 学习路径生成流式接口 |
| `/api/assessment/generate` | POST | 评估报告生成流式接口 |
| `/api/tutoring/ask` | POST | 智能辅导流式接口 |
| `/api/profile/{user_id}` | GET | 获取画像 |
| `/api/profile/update` | POST | 更新画像 |
| `/api/resources/` | GET | 资源列表 |
| `/api/learning-path/` | GET | 获取路径 |
| `/api/assessment/` | GET | 获取评估记录 |
| `/api/assessment/record` | POST | 记录学习行为 |

**用户标识**：当前统一使用 `user_id = "default"`，后续可扩展多用户。

---

## UI 设计体系

### 配色方案
- **主色（墨绿）**：`#2D4A3E` (ink) — 按钮、激活态、强调
- **浅墨绿**：`#3D5A4E` (ink-light) — hover 态
- **暖白底**：`#FAFAF9` (warm-white) — 页面背景
- **米白面**：`#F5F0EB` (cream) — 卡片/面板背景
- **琥珀点缀**：`#C77D43` (amber) — 用户头像、强调标签
- **边框**：`#E8E4DF` (border) — 分割线、卡片边框
- **次文本**：`#8B8580` (muted) — 次要文字
- **白面**：`#FFFFFF` (surface) — 卡片白色背景

### 设计原则
- **拒绝蓝紫渐变**，使用纯色块 + 细微边框分层
- 暖灰/米白基底 + 深墨绿主色 + 琥珀点缀
- 少量知识元素装饰（课本、神经网络线、数学公式），透明度 2-5%
- 流式输出 + 骨架屏加载
- 圆角 `rounded-lg` / `rounded-md`，阴影仅 `shadow-sm`
- 字体：PingFang SC → Microsoft YaHei → system-ui

### 交互规范
- SSE 流式输出避免白屏等待
- 空状态展示引导提示而非空白
- API 异常时显示错误信息而非崩溃
- 输入框 Enter 发送，Shift+Enter 换行
- 骨架屏动画（`animate-pulse`）

---

## 当前进度与状态

### ✅ 第一阶段（P0 核心功能）已完成

| 模块 | 状态 | 说明 |
|------|------|------|
| 对话式画像构建 | ✅ 完成 | SSE 流式对话 + 后端 ProfileCoordinator 结构化提取（不再依赖前端正则） |
| 多智能体资源生成 | ✅ 完成 | ResourceCoordinator 编排检索助手→Orchestrator→专业 Agent→安全审查（4 Agent 协作） |
| 学习路径规划 | ✅ 后端完成 | SSE 流式生成 JSON 路径，支持保存 |
| 学习路径页面 | ✅ 完成 | 时间线 + SVG 知识图谱 + 学习建议面板 + 完成度追踪 |
| 学习评估 API | ✅ 后端完成 | SSE 流式评估报告 + 行为记录 |
| 学习评估页面 | ✅ 完成 | 统计看板 + SVG 雷达图 + 评估报告生成 + 历史记录表 |
| 我的画像页 | ✅ 完成 | 维度说明展示 |
| 课程知识库 | ✅ 完成 | 10 章 ChromaDB 向量库 |
| 智能辅导（P1 加分项） | ✅ 完成 | RAG + SSE 流式答疑 |

### ✅ 已完成修复

| 优先级 | 问题 | 状态 | 修复方式 |
|--------|------|------|----------|
| P0 | **多智能体协同名实不符** — Agent 定义是装饰品 | ✅ 已修复 | ResourceCoordinator 编排 (RAG→Orchestrator→专业 Agent→安全审查) 4 Agent 协作，前端 Agent 状态面板展示 |
| P1 | 画像 JSON 提取使用客户端正则 | ✅ 已修复 | ProfileCoordinator 后端 LLM 结构化提取 + profile_update SSE 事件推送 |
| P3 | 两个空白页面 | ✅ 已修复 | LearningPath/Assessment 页面完整实现 |

### 🔴 待解决

| 优先级 | 问题 | 影响 | 方案简述 |
|--------|------|------|----------|
| P1 | Embedding 服务是字符 n-gram 哈希，非真实语义嵌入 | 检索质量差，影响 RAG 效果 | 替换为星火 Embedding API 或 bge-small-zh |
| P1 | 安全过滤仅 8 个正则模式，防幻觉仅尾部声明 | 内容安全保障不足 | 增加 LLM-as-judge 后处理 |
| P1 | 思维导图只输出 Mermaid 代码，不渲染 | 用户体验不佳 | 引入 Mermaid 渲染库 |
| P2 | 路径规划和资源生成是两个独立功能，未联动 | 智能化程度不够 | 路径完成后自动触发对应章节资源批量生成 |

### 📋 后续功能目标

| 优先级 | 功能 | 说明 | 涉及改动 |
|--------|------|------|----------|
| P2 | **资源导入** — 支持用户上传 txt/doc/pdf/markdown 文件作为学习资源 | 学习资源不仅限于 AI 生成，用户可导入自有资料；文件入库后与已有资源统一展示、检索。 | 后端: 新增 `api/resource_import.py` 文件上传端点 + MinIO/S3 存储；模型新增 `resource_type=imported`；前端 Resources 页增加上传按钮 + 文件选择器；后端 `pip install python-multipart` 已就绪 |
| P2 | **资源在线编辑** — AI 生成的资源支持简单修改后保存 | 用户可直接在详情面板中编辑 Markdown 内容并保存，修正 AI 输出中的小错误 | 后端: 新增 `PUT /api/resources/{id}` 更新端点；前端: 详情面板切换到可编辑模式（textarea 或 CodeMirror 轻量编辑器）+ 保存按钮 |
| P2 | **资源导出** — 支持将资源导出为 Markdown / HTML / PDF 文件 | 方便学生离线使用和打印 | 后端: 新增 `GET /api/resources/{id}/export?format=md|html` 导出端点（可使用 markdown 转 HTML 库）；前端: 详情面板增加导出按钮下拉菜单 |
| P2 | **学习路径节点详情页** — 时间线节点可点击进入详情视图 | 点击"人工智能导论"等节点可查看：该章节的学习目标、核心知识点列表、推荐学习资源（文档/练习/视频等）链接、前置/后置章节关系图。解决当前只能打勾无具体学习入口的问题。 | 前端: LearningPath 新增节点详情弹窗/抽屉；从 `api.ts` 获取对应章节的资源列表；展示知识图谱中的关联节点；后端: 可新增 `/api/learning-path/node-detail` 或复用已有资源列表接口 |
| P2 | **学习评估自动计时** — 进入资源页面时开始计时，离开时自动记录学习时长 | 解决手动输入"自我欺骗"的问题；真实追踪学习行为 | 前端: Resources 页增加 `useEffect` 监听页面可见性（`visibilitychange`）+ 进入/离开时间差；关闭/切换页面时自动调 `recordBehavior`；后端: 不变，复用 `/api/assessment/record` |
| P2 | **学习评估与资源联动** — 看完课程文档/视频后自动触发评估记录 | 资源阅读完成事件自动转化为学习记录，含资源类型和内容知识点 | 前端: 详情面板滚动到底部或点击"完成学习"按钮时调 `recordBehavior` 携带 `topic` + `resource_type`；后端: 微调 `recordBehavior` 增加内容分析 |
| P3 | **思维导图 Mermaid 渲染** — 将 Mermaid 代码实时渲染为可视化的思维导图 | 提升思维导图资源的可用性和视觉效果 | 前端: 引入 `mermaid` npm 包，详情面板检测 mindmap 类型时渲染为图表

---

## 多智能体体系

### Agent 角色定义（已实现编排）

| Agent | 角色 | 职责 | 编排位置 |
|-------|------|------|----------|
| ProfileAgent | 学习画像分析师 | 对话引导、特征抽取、6 维画像构建 | `agents/profile_coordinator.py` 对话后提取 |
| OrchestratorAgent | 资源设计总监 | 需求分析、任务拆解、资源整合 | `agents/coordinator.py` Step 2 |
| RAGRetriever | 检索助手 | RAG 知识库检索 | `agents/coordinator.py` Step 1 |
| DocAgent | 课程内容专家 | Markdown 讲义生成 | `agents/coordinator.py` Step 3 (doc) |
| MindMapAgent | 知识架构师 | Mermaid 思维导图生成 | `agents/coordinator.py` Step 3 (mindmap) |
| QuizAgent | 题库设计师 | 多题型生成 | `agents/coordinator.py` Step 3 (quiz) |
| VideoAgent | 多媒体编剧 | 视频分镜脚本生成 | `agents/coordinator.py` Step 3 (video) |
| CodeAgent | 实操导师 | Python 代码案例生成 | `agents/coordinator.py` Step 3 (code) |
| SafetyChecker | 安全审查员 | 内容安全审查 | `agents/coordinator.py` Step 4 |
| PathAgent | 学习路径规划师 | 路径规划 | 待编排 |
| TutorAgent | AI 导师 | 多模态答疑 | 待编排 |
| AssessmentAgent | 学习评估分析师 | 效果评估 | 待编排 |

### 现有多 Agent 协作流程（资源生成）

```
用户请求
  ↓
[检索助手] → RAG 知识库检索 → agent_status SSE
  ↓
[资源设计总监] → 需求分析 → agent_status SSE
  ↓
[专业 Agent] → 内容生成 (Doc/MindMap/Quiz/Video/Code) → text SSE 流式输出
  ↓
[安全审查员] → 内容安全审查 → agent_status SSE
  ↓
存储 + done 事件
```

前端的资源生成页面实时展示每个 Agent 的状态（等待中/进行中/已完成），
用户可以看到完整的多智能体协作过程。

### 对话画像流程

```
用户消息 → 流式对话输出 (text SSE)
  ↓ (对话流结束)
ProfileCoordinator → LLM 结构化 JSON 提取
  ↓
profile_update SSE 事件 → 前端直接更新画像面板
```

### CrewAI 编排现状
- `agents/crew_factory.py` 已定义 `create_resource_generation_crew()` 和 `create_profile_crew()`
- 当前使用 Coordinator 模式（兼容 SSE 流式），未来可迁移到原生 CrewAI 执行引擎

---

## 开发约定

1. **身份定位**：作为本项目专属专职开发助手，所有输出 100% 严格依从本文档标注的内容
2. **指令精简**：用户下达精简业务/开发指令即可，无需重复告知背景、技术、规范、历史进度
3. **代码适配**：产出代码完全适配本项目技术环境，可直接复用，无兼容冲突
4. **风格统一**：代码命名、注释、格式、返回体、异常写法和现有代码完全统一
5. **主动更新**：功能迭代完成后，主动提示用户更新 CLAUDE.md 内容并同步 git 归档
6. **确认机制**：有项目冲突、规范歧义第一时间向用户确认，不自行决策改动项目规则

---

## 部署方式

### 开发环境

**推荐使用启动脚本（项目根目录执行）：**
```bash
start_backend.bat      # Windows
bash start_backend.sh  # Linux / macOS / WSL
```

**或手动启动：**
```bash
# 后端（必须在 backend/ 目录下）
cd backend && uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 前端
cd frontend && npm run dev

# 基础设施
docker compose up -d postgres redis minio

# 知识库构建
cd backend && python ../knowledge_base/build_kb.py
```

> 首次运行需先配置 `backend/.env`（可从 `backend/.env.example` 复制并填入 API 凭证）

### 环境变量（backend/.env）
- `SPARK_APP_ID` — 讯飞星火应用 ID
- `SPARK_API_KEY` — 讯飞星火 API Key
- `SPARK_API_SECRET` — 讯飞星火 API Secret
- `database_url` — 数据库连接（默认 SQLite）

### 服务端口
| 服务 | 端口 |
|------|------|
| 前端开发服务器 | 5173 |
| 后端 API | 8000 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| MinIO 控制台 | 9001 |

---

*本文档为项目永久基准上下文，更新任何功能后须同步更新本文档。*
