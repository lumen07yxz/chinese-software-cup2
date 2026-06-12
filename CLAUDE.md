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
| `/api/learning-path/generate` | POST | 学习路径生成流式接口 | ✅ Bearer |
| `/api/assessment/generate` | POST | 评估报告生成流式接口 | ✅ Bearer |
| `/api/tutoring/ask` | POST | 智能辅导流式接口 | ✅ Bearer |
| `/api/profile/` | GET | 获取画像 | ✅ Bearer |
| `/api/profile/update` | POST | 更新画像 | ✅ Bearer |
| `/api/resources/` | GET | 资源列表 | ✅ Bearer |
| `/api/learning-path/` | GET | 获取路径 | ✅ Bearer |
| `/api/assessment/` | GET | 获取评估记录 | ✅ Bearer |
| `/api/assessment/record` | POST | 记录学习行为 | ✅ Bearer |

**认证方式**：前端在请求头中携带 `Authorization: Bearer <token>`，token 通过登录/注册返回。当前用户从 JWT 解析，`user_id` 不再需要前端传参。

## 当前进度与状态

### ✅ 第一阶段（P0 核心功能）已完成

| 模块 | 状态 | 说明 |
|------|------|------|
| 对话式画像构建 | ✅ 完成 | SSE 流式对话 + 后端 ProfileCoordinator 结构化提取 + 自动写入 DB + 上下文感知系统提示词 |
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
| P1 | **Embedding 服务是 n-gram 哈希** — 检索质量差 | ✅ 已修复 | 替换为星火 Embedding API（embedding-2，1024 维）+ n-gram 降级兜底；升级后需重新执行 `build_kb.py` 重建向量库 |
| P1 | **安全过滤仅 3 条正则** — 防幻觉仅尾部声明 | ✅ 已修复 | 扩充至 10 类正则模式 + LLM-as-judge 双层审查（内容安全 + 幻觉检测）；审查流程集成到 ResourceCoordinator Step 4 + API 层汇总 |
| P0 | **无登录/登出系统** — 所有用户共用 user_id="default" | ✅ 已修复 | JWT 认证（User 模型 + auth.py + auth API + 前端登录/注册页 + 路由守卫 + Sidebar 退出按钮） |
| P0 | **AI 重复提问** — 聊天无记忆，刷新即丢失 | ✅ 已修复 | Conversation + ConversationMessage 模型；后端 DB 加载历史；chat.py 自动保存消息；前端对话列表选择 |
| P0 | **画像不记忆** — 提取后仅前端展示，不写入 DB | ✅ 已修复 | chat.py 调 _save_profile() 自动写入 StudentProfile 表 + AppInitializer 加载 + localStorage 缓存 |
| P0 | **切换账号数据污染** — localStorage 用固定 key，账号 A 的画像在账号 B 登录后仍可见 | ✅ 已修复 | `profileStore` key 改为 `profile_{username}` 按账号隔离；`authStore.logout()` 清除所有 `profile_*` 缓存；`AppInitializer` 监听 `username` 变化，切换时先清空再加载对应账号缓存 |
| P3 | 两个空白页面 | ✅ 已修复 | LearningPath/Assessment 页面完整实现 |

### 🔴 待解决

| 优先级 | 问题 | 影响 | 方案简述 |
|--------|------|------|----------|
| P1 | 思维导图只输出 Mermaid 代码，不渲染 | 用户体验不佳 | 引入 Mermaid 渲染库 |
| P2 | 路径规划和资源生成是两个独立功能，未联动 | 智能化程度不够 | 路径完成后自动触发对应章节资源批量生成 |

> **⚠️ Embedding 升级必做**：维度 256 → 1024，需重建知识库：`cd backend && python ../knowledge_base/build_kb.py`
> **⚠️ JWT 密钥配置**：`backend/.env` 中 `JWT_SECRET_KEY` 启动前须填写（已生成随机值，生产环境务必更换）

### 📋 后续功能目标

| 优先级 | 功能 | 说明 | 涉及改动 |
|--------|------|------|----------|
| P2 | **资源导入** — 支持用户上传 txt/doc/pdf/markdown 文件 | 学习资源不仅限于 AI 生成 | 后端: `api/resource_import.py` + MinIO；前端: 上传按钮 |
| P2 | **资源编辑** — AI 生成资源支持修改后保存 | 修正 AI 输出小错误 | 后端: `PUT /api/resources/{id}`；前端: 可编辑详情面板 |
| P2 | **资源导出** — 导出为 Markdown / HTML / PDF | 离线使用和打印 | 后端: `GET /api/resources/{id}/export`；前端: 导出按钮 |
| P2 | **路径节点详情页** — 节点点击进入详情 | 查看章节目标、知识点、关联资源 | 前端: 节点详情弹窗；后端: 复用资源列表 |
| P2 | **评估自动计时** — 进入资源页面自动计时 | 解决手动输入"自我欺骗" | 前端: visibilitychange 监听 |
| P2 | **评估-资源联动** — 看完资源自动记录 | 阅读完成自动转化为学习记录 | 前端: 滚动到底部 / 完成按钮触发 recordBehavior |
| P3 | **思维导图渲染** — Mermaid 代码实时渲染 | 提升导图可用性 | 前端: 引入 mermaid npm 包 |
| P4 | **生产部署** — 云服务器上线，支持多用户并发 | 支持外网访问和多用户同时使用 | PostgreSQL 替代 SQLite；Nginx 反向代理 + HTTPS；Redis 启用；ChromaDB 挂持久卷；域名 + SSL 证书；`JWT_SECRET_KEY` 替换为强随机值 |
