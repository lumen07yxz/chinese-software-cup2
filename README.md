# 智学 · AI个性化学习系统

第十五届中国软件杯大赛 A组赛题——基于大模型的个性化资源生成与学习多智能体系统

## 技术栈

- **前端**: React 18 + TypeScript + Tailwind CSS + Vite
- **后端**: Python FastAPI + WebSocket
- **多智能体**: CrewAI 编排
- **LLM**: 科大讯飞星火大模型 Spark X2 Flash
- **向量库**: ChromaDB (RAG)
- **数据库**: PostgreSQL 16 + Redis

## 功能

1. 对话式学习画像自主构建（6维度）
2. 多智能体协同生成5种资源（文档/思维导图/题库/视频脚本/代码实操）
3. 个性化学习路径规划与资源推送
4. 智能辅导答疑（多模态）
5. 学习效果评估闭环

## 启动

### 首次运行

```bash
# 1. 克隆项目
git clone <项目地址> && cd chinese-software-cup2

# 2. 配置 API 凭证
#    从 .env.example 创建 .env 并填入讯飞星火 API 凭证
cp backend/.env.example backend/.env
#    编辑 backend/.env，设置 SPARK_APP_ID / SPARK_API_KEY / SPARK_API_SECRET

# 3. 启动后端（以下二选一）
#    方式 A：使用启动脚本（推荐）
start_backend.bat        # Windows 双击
bash start_backend.sh    # Linux / macOS / WSL

#    方式 B：手动启动
cd backend
pip install -r requirements.txt
uvicorn main:app --reload

# 4. 启动前端（新开终端）
cd frontend
npm install && npm run dev
```

> **注意**：启动脚本和 `uvicorn` 命令都必须在 `backend/` 目录下执行，否则无法正确加载 `.env` 配置文件和数据库路径。

### 日常启动

```bash
# 后端（在项目根目录）
start_backend.bat          # Windows
bash start_backend.sh      # Linux / macOS / WSL
# 或 cd backend && uvicorn main:app --reload

# 前端（新开终端）
cd frontend && npm run dev
```

访问 http://localhost:5173

## 项目结构

```
frontend/    React 前端
backend/     FastAPI 后端
agents/      CrewAI 多智能体
knowledge_base/  课程知识库
docs/       竞赛文档
```
