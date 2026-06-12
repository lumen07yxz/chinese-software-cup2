import sys
import os
# 将项目根目录加入 sys.path，使 agents/ 可以从 backend/ 下被 import
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from api.chat import router as chat_router
from api.profile import router as profile_router
from api.resources import router as resources_router
from api.learning_path import router as learning_path_router
from api.assessment import router as assessment_router
from api.tutoring import router as tutoring_router
from api.conversations import router as conversations_router
from api.auth import router as auth_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    import os
    os.makedirs("data/resources", exist_ok=True)
    os.makedirs("data/chroma", exist_ok=True)
    from db import engine
    from models import Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(
    title="AI学习多智能体系统",
    description="基于大模型的个性化资源生成与学习系统",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(conversations_router)
app.include_router(chat_router)
app.include_router(profile_router)
app.include_router(resources_router)
app.include_router(learning_path_router)
app.include_router(assessment_router)
app.include_router(tutoring_router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "ai-learning-system"}
