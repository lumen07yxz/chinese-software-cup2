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
from api.knowledge import router as knowledge_router
from api.ppt import router as ppt_router
from api.digital_human import router as digital_human_router
from api.voice import router as voice_router
from config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    import os
    import logging
    logger = logging.getLogger(__name__)
    os.makedirs("data/resources", exist_ok=True)
    os.makedirs("data/chroma", exist_ok=True)
    from db import engine
    from models import Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # 启动时校验 JWT 密钥安全性（fail-closed：默认密钥可被伪造 Token，拒绝启动）
    if settings.jwt_secret_key == "change-me-in-production-use-a-real-secret":
        raise RuntimeError(
            "JWT_SECRET_KEY 仍为默认值，存在 Token 伪造风险。"
            "请在 backend/.env 中设置 JWT_SECRET_KEY 为随机强密钥。"
        )

    # 自动构建课程知识库（如果向量库为空或不存在时）—— 放到后台线程，避免阻塞启动
    import threading

    def _build_kb():
        try:
            from services.rag_service import rag_service
            from services.embedding_service import embedding_service

            rag_service._ensure_collection()
            cnt = rag_service.collection.count() if rag_service.collection else 0
            if cnt > 0:
                logger.info("课程知识库已存在（%d chunks），跳过重建", cnt)
                return
            logger.info("课程知识库为空，后台自动构建中...")
            raw_dir = os.path.join(os.path.dirname(__file__), "..", "knowledge_base", "raw")
            chapters = sorted([f for f in os.listdir(raw_dir) if f.endswith('.md')])

            rag_service._ensure_collection()

            all_ids, all_texts, all_metadatas = [], [], []
            for ch_file in chapters:
                with open(os.path.join(raw_dir, ch_file), "r", encoding="utf-8") as f:
                    content = f.read()
                sections = content.split("\n## ")
                ch_title = sections[0].split("\n")[0].replace("# ", "").strip()
                for i, sec in enumerate(sections):
                    if i == 0:
                        sec_content = sec.split("\n", 1)[1] if "\n" in sec else sec
                        sec_title = ch_title
                    else:
                        sec_content = "## " + sec
                        sec_title = sec.split("\n")[0].replace("##", "").strip()[:80]
                    if len(sec_content.strip()) < 50:
                        continue
                    all_ids.append(f"ch{len(all_ids):04d}")
                    all_texts.append(sec_content[:8000])
                    all_metadatas.append(
                        {"chapter": ch_title, "section": sec_title, "file": ch_file}
                    )

            for start in range(0, len(all_ids), 10):
                end = start + 10
                embeds = embedding_service.embed_batch(all_texts[start:end])
                rag_service._ensure_collection()
                rag_service.collection.add(
                    ids=all_ids[start:end],
                    documents=all_texts[start:end],
                    metadatas=all_metadatas[start:end],
                    embeddings=embeds,
                )
            rag_service._ensure_collection()
            try:
                rag_service.collection.query(
                    query_embeddings=[[0.0] * 2560], n_results=1
                )
            except Exception:
                pass
            logger.info("课程知识库构建完成：%d chunks from %d chapters", len(all_ids), len(chapters))
        except Exception as e:
            logger.error("课程知识库构建失败（不影响系统运行）：%s", e, exc_info=True)

    threading.Thread(target=_build_kb, daemon=True).start()

    yield


app = FastAPI(
    title="AI学习多智能体系统",
    description="基于大模型的个性化资源生成与学习系统",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
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
app.include_router(knowledge_router)
app.include_router(ppt_router)
app.include_router(digital_human_router)
app.include_router(voice_router)


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "ai-learning-system"}
