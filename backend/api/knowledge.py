"""知识库管理 API — 文档导入、查看、编辑、笔记、联网搜索、AI 查库"""

import os
import json
import logging
import asyncio
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select

from db import async_session
from models import User, UserDocument
from auth import get_current_user
from services.rag_service import rag_service
from services.web_search_service import web_search_service
from services.document_parser import parse_document
from services.spark_kb_service import spark_kb_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])

DATA_DIR = "data/user_documents"


class SearchRequest(BaseModel):
    query: str
    top_k: int = 5


class DocumentImportRequest(BaseModel):
    title: str
    content: str
    tags: list[str] = []
    source_type: str = "web"


class DocumentUpdateRequest(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[list[str]] = None


class KnowledgeSearchRequest(BaseModel):
    query: str
    top_k: int = 10


class AskKnowledgeRequest(BaseModel):
    question: str
    history: list[dict] = []


# ── 联网搜索 ──────────────────────────────────────────────────────────


@router.post("/web-search")
async def web_search(
    req: SearchRequest,
    current_user: User = Depends(get_current_user),
):
    """联网搜索最新的学习资源"""
    results = await web_search_service.search(req.query, req.top_k)
    return {"results": results}


@router.post("/web-search/save")
async def save_search_result(
    req: DocumentImportRequest,
    current_user: User = Depends(get_current_user),
):
    """保存搜索结果到知识库"""
    user_id = current_user.username
    async with async_session() as session:
        doc = UserDocument(
            user_id=user_id,
            title=req.title,
            content=req.content,
            source_type=req.source_type,
            file_format="txt",
            tags=req.tags,
        )
        session.add(doc)
        await session.commit()
        doc_id = doc.id

    # 同步添加到 ChromaDB 向量库
    _add_to_vector_store(user_id, doc_id, req.title, req.content, req.tags)

    return {"status": "saved", "document_id": doc_id}


# ── 文件上传 ──────────────────────────────────────────────────────────

ALLOWED_EXTENSIONS = {".md", ".txt", ".pdf", ".docx", ".html", ".csv"}


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
):
    """上传知识文档（支持 .md / .txt / .pdf / .docx / .html / .csv）"""
    user_id = current_user.username

    # 验证文件扩展名
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型: {ext}，支持: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    # 读取原始字节并用格式感知解析器提取文本
    content_bytes = await file.read()
    text = parse_document(content_bytes, file.filename or "")

    doc_title = title or (file.filename or "未命名文档")
    tag_list = json.loads(tags) if tags else []

    # 保存到磁盘
    os.makedirs(os.path.join(DATA_DIR, user_id), exist_ok=True)
    file_path = os.path.join(DATA_DIR, user_id, file.filename or f"doc_{len(text)}.txt")
    # 二进制保存原始文件（PDF/DOCX 等保留原件，文本文件存解析后文本）
    if ext in (".pdf", ".docx"):
        with open(file_path, "wb") as f:
            f.write(content_bytes)
    else:
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(text)

    # 保存到 DB
    async with async_session() as session:
        doc = UserDocument(
            user_id=user_id,
            title=doc_title,
            content=text[:100000],  # 限制 10 万字
            file_path=file_path,
            source_type="upload",
            file_format=ext.lstrip(".") or "txt",
            tags=tag_list,
        )
        session.add(doc)
        await session.commit()
        doc_id = doc.id

    # 分块添加到用户向量库（允许失败，不影响上传）
    chunk_count = 0
    try:
        chunks = _chunk_text(text, doc_title, tag_list, doc_id)
        chunk_count = len(chunks)
        if chunks:
            rag_service.add_user_documents(chunks)
    except Exception as e:
        logger.warning("向量索引添加失败（文档已保存，可稍后重建）: %s", e)

    # 异步同步到星火知识库（允许失败，不阻塞响应）
    spark_status = ""
    spark_file_id = ""
    if spark_kb_service.enabled and ext in (".pdf", ".docx", ".md", ".txt"):
        try:
            spark_result = await spark_kb_service.upload_file(
                content_bytes, file.filename or f"doc_{doc_id}{ext}",
            )
            if "fileId" in spark_result:
                spark_file_id = spark_result["fileId"]
                spark_status = "uploaded"
                # 获取/创建用户的星火知识库
                repo_id = await spark_kb_service.get_or_create_user_repo(user_id)
                # 更新 DB
                async with async_session() as session:
                    from sqlalchemy import update as _update
                    await session.execute(
                        _update(UserDocument)
                        .where(UserDocument.id == doc_id)
                        .values(
                            spark_file_id=spark_file_id,
                            spark_file_status="uploaded",
                            spark_repo_id=repo_id or "",
                        )
                    )
                    await session.commit()
                # 后台：等待向量化 + 加入仓库
                asyncio.create_task(
                    _wait_and_add_to_repo(doc_id, spark_file_id, repo_id)
                )
                # 后台等待星火处理完成
                asyncio.create_task(_wait_and_update_spark_status(doc_id, spark_file_id))
        except Exception as e:
            logger.warning("星火知识库上传失败（不影响本地功能）: %s", e)

    return {
        "status": "uploaded",
        "document_id": doc_id,
        "title": doc_title,
        "chunks": chunk_count,
        "length": len(text),
        "file_format": ext.lstrip(".") or "txt",
        "spark_status": spark_status,
    }


@router.post("/import-folder")
async def import_folder(
    folder_path: str = Form(...),
    current_user: User = Depends(get_current_user),
):
    """从服务器本地路径导入 Markdown 知识文档"""
    path = Path(folder_path)
    if not path.exists() or not path.is_dir():
        raise HTTPException(status_code=400, detail=f"文件夹不存在: {folder_path}")

    user_id = current_user.username
    imported = []
    errors = []

    for f in sorted(path.glob("**/*.md")):
        try:
            text = f.read_text(encoding="utf-8")
            title = f.stem
            async with async_session() as session:
                doc = UserDocument(
                    user_id=user_id,
                    title=title,
                    content=text[:100000],
                    file_path=str(f),
                    source_type="upload",
                    file_format="md",
                    tags=["imported"],
                )
                session.add(doc)
                await session.commit()
                doc_id = doc.id

            chunks = _chunk_text(text, title, ["imported"], doc_id)
            if chunks:
                rag_service.add_user_documents(chunks)

            imported.append({"id": doc_id, "title": title, "chunks": len(chunks)})
        except Exception as e:
            errors.append({"file": str(f), "error": str(e)[:100]})

    return {
        "status": "done",
        "imported": imported,
        "errors": errors,
        "total": len(imported),
    }


# ── 文档列表 ──────────────────────────────────────────────────────────


@router.get("/documents")
async def list_documents(
    current_user: User = Depends(get_current_user),
):
    """列出用户导入的知识文档"""
    user_id = current_user.username
    async with async_session() as session:
        result = await session.execute(
            select(UserDocument)
            .where(UserDocument.user_id == user_id)
            .order_by(UserDocument.created_at.desc())
            .limit(100)
        )
        docs = result.scalars().all()
        return {
            "documents": [
                {
                    "id": d.id,
                    "title": d.title,
                    "source_type": d.source_type,
                    "file_format": d.file_format or "txt",
                    "tags": d.tags,
                    "notes": (d.notes or "")[:200],  # 列表只返回笔记摘要
                    "has_notes": bool(d.notes and d.notes.strip()),
                    "spark_file_status": d.spark_file_status or "",
                    "created_at": d.created_at.isoformat() if d.created_at else "",
                    "updated_at": d.updated_at.isoformat() if d.updated_at else "",
                    "length": len(d.content or ""),
                }
                for d in docs
            ]
        }


# ── 获取单个文档 ──────────────────────────────────────────────────────


@router.get("/documents/{doc_id}")
async def get_document(
    doc_id: int,
    current_user: User = Depends(get_current_user),
):
    """获取单个文档的完整内容和笔记"""
    user_id = current_user.username
    async with async_session() as session:
        result = await session.execute(
            select(UserDocument).where(
                UserDocument.id == doc_id,
                UserDocument.user_id == user_id,
            )
        )
        doc = result.scalar_one_or_none()
        if not doc:
            raise HTTPException(status_code=404, detail="文档不存在")
        return {
            "id": doc.id,
            "title": doc.title,
            "content": doc.content or "",
            "notes": doc.notes or "",
            "file_format": doc.file_format or "txt",
            "source_type": doc.source_type,
            "spark_file_status": doc.spark_file_status or "",
            "tags": doc.tags or [],
            "created_at": doc.created_at.isoformat() if doc.created_at else "",
            "updated_at": doc.updated_at.isoformat() if doc.updated_at else "",
            "length": len(doc.content or ""),
        }


# ── 更新文档 ──────────────────────────────────────────────────────────


@router.put("/documents/{doc_id}")
async def update_document(
    doc_id: int,
    req: DocumentUpdateRequest,
    current_user: User = Depends(get_current_user),
):
    """更新文档内容、标题、笔记或标签。内容变更时自动重建向量索引。"""
    user_id = current_user.username
    async with async_session() as session:
        result = await session.execute(
            select(UserDocument).where(
                UserDocument.id == doc_id,
                UserDocument.user_id == user_id,
            )
        )
        doc = result.scalar_one_or_none()
        if not doc:
            raise HTTPException(status_code=404, detail="文档不存在")

        if req.title is not None:
            doc.title = req.title
        if req.notes is not None:
            doc.notes = req.notes
        if req.tags is not None:
            doc.tags = req.tags

        content_changed = False
        if req.content is not None:
            doc.content = req.content[:100000]
            content_changed = True

        await session.commit()

    # 内容变更时重建向量索引
    if content_changed:
        try:
            rag_service.remove_user_document_chunks(doc_id)
            chunks = _chunk_text(
                req.content or "",
                doc.title,
                doc.tags or [],
                doc_id,
            )
            if chunks:
                rag_service.add_user_documents(chunks)
        except Exception as e:
            logger.warning("文档 %d 重建索引失败: %s", doc_id, e)

    return {"status": "updated", "id": doc_id}


# ── 删除文档 ──────────────────────────────────────────────────────────


@router.delete("/documents/{doc_id}")
async def delete_document(
    doc_id: int,
    current_user: User = Depends(get_current_user),
):
    """删除导入的知识文档"""
    user_id = current_user.username
    async with async_session() as session:
        result = await session.execute(
            select(UserDocument).where(
                UserDocument.id == doc_id,
                UserDocument.user_id == user_id,
            )
        )
        doc = result.scalar_one_or_none()
        if not doc:
            raise HTTPException(status_code=404, detail="文档不存在")

        # 删除向量索引
        try:
            rag_service.remove_user_document_chunks(doc_id)
        except Exception:
            pass

        # 删除星火云端文件
        if doc.spark_file_id:
            try:
                await spark_kb_service.delete_files([doc.spark_file_id])
            except Exception:
                pass

        # 删除文件
        if doc.file_path and os.path.exists(doc.file_path):
            os.remove(doc.file_path)

        await session.delete(doc)
        await session.commit()

    return {"status": "deleted"}


# ── 知识库语义搜索 ────────────────────────────────────────────────────


@router.post("/search")
async def search_knowledge(
    req: KnowledgeSearchRequest,
    current_user: User = Depends(get_current_user),
):
    """语义搜索用户的个人知识库"""
    results = rag_service.search_user_docs(req.query, top_k=req.top_k)
    return {
        "results": [
            {
                "id": r.get("id"),
                "content": r.get("content"),
                "title": r.get("metadata", {}).get("title", ""),
                "score": r.get("score", 0),
                "doc_id": r.get("metadata", {}).get("doc_id"),
            }
            for r in results
        ]
    }


# ── AI 查库问答 ───────────────────────────────────────────────────────


@router.post("/ask")
async def ask_knowledge_base(
    req: AskKnowledgeRequest,
    current_user: User = Depends(get_current_user),
):
    """基于用户个人知识库的 AI 问答（SSE 流式）

    优先使用星火知识库精准检索，降级到本地 ChromaDB。
    """
    # 优先用星火知识库检索
    spark_results = await _spark_vector_search_for_user(
        current_user.username, req.question, top_k=8
    )
    # 本地 ChromaDB 检索（始终执行，作为补充 + 降级保障）
    local_results = rag_service.search(req.question, top_k=15)

    # 合并：星火结果放前面（精度更高），本地结果补充
    results = spark_results + local_results

    if not results:
        async def empty_gen():
            yield f"data: {json.dumps({'type': 'text', 'content': '你的知识库中暂无相关内容。请先导入相关文档，或尝试其他问题。'}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"
        return StreamingResponse(empty_gen(), media_type="text/event-stream")

    # 构建来源引用
    context_parts = []
    seen_titles: list[str] = []
    sources: list[dict] = []
    for r in results:
        title = r.get("metadata", {}).get("title", r.get("chapter", "未知"))
        source = r.get("source", "")
        if source == "spark_kb":
            source_type = "星火知识库"
        elif source == "user_upload":
            source_type = "用户文档"
        else:
            source_type = "课程知识库"
        context_parts.append(f"[{title}] {r['content'][:800]}")
        if title not in seen_titles:
            seen_titles.append(title)
            sources.append({
                "title": title,
                "source_type": source_type,
                "score": round(r.get("score", 0), 3),
                "doc_id": r.get("metadata", {}).get("doc_id"),
            })

    context = "\n\n".join(context_parts)

    system_prompt = f"""你是智学的 AI 助手，正在根据用户个人知识库中的文档回答问题。

请基于以下用户知识库内容回答问题。回答要准确、具体，引用知识库中的具体内容。
如果知识库中的内容不足以回答，请诚实说明哪些部分来自知识库、哪些是你的补充。

用户知识库内容：
{context[:6000]}

回答要求：
- 优先引用知识库中的具体内容，在句末用 [来源: 文档标题] 标注
- 如果知识库中没有相关信息，诚实说明并给出通用回答
- 使用 Markdown 格式，支持 LaTeX 公式和 Mermaid 图表"""

    async def generate():
        full = ""
        try:
            from services.spark_service import spark_service

            messages = [{"role": "system", "content": system_prompt}]
            for h in req.history:
                messages.append(h)
            messages.append({"role": "user", "content": req.question})

            async for chunk in spark_service.chat_stream(
                messages, temperature=0.3, max_tokens=4096
            ):
                full += chunk
                yield f"data: {json.dumps({'type': 'text', 'content': chunk}, ensure_ascii=False)}\n\n"
                await asyncio.sleep(0.01)

            # 返回引用来源
            yield f"data: {json.dumps({'type': 'sources', 'sources': sources[:5]}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


# ── 星火知识库原生问答 ──────────────────────────────────────────────


@router.post("/ask-native")
async def ask_native(
    req: AskKnowledgeRequest,
    current_user: User = Depends(get_current_user),
):
    """使用星火知识库原生 RAG 对话（WebSocket 流式）

    直接调用星火 ChatDoc 的对话 API，利用其服务端检索+生成能力，
    不需要本地拼 context。返回与 /ask 相同的 SSE 格式。
    """
    user_id = current_user.username

    if not spark_kb_service.enabled:
        async def fallback():
            yield f"data: {json.dumps({'type': 'text', 'content': '星火知识库未启用，请联系管理员配置 SPARK_KB_APP_ID 和 SPARK_KB_APP_SECRET。'}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"
        return StreamingResponse(fallback(), media_type="text/event-stream")

    # 获取用户的星火知识库 ID
    async with async_session() as session:
        result = await session.execute(
            select(UserDocument.spark_repo_id).where(
                UserDocument.user_id == user_id,
                UserDocument.spark_repo_id != "",
            ).limit(1)
        )
        row = result.first()

    repo_id = row[0] if row else None
    if not repo_id:
        async def no_repo():
            yield f"data: {json.dumps({'type': 'text', 'content': '你还没有上传过知识文档。请先在「导入知识」中上传文档，文档会自动同步到星火知识库。'}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"
        return StreamingResponse(no_repo(), media_type="text/event-stream")

    async def generate():
        full = ""
        try:
            history = list(req.history or [])
            async for event in spark_kb_service.chat_stream(
                question=req.question,
                repo_id=repo_id,
                history=history,
                temperature=0.3,
            ):
                etype = event.get("type", "")
                if etype == "content":
                    text = event.get("text", "")
                    full += text
                    yield f"data: {json.dumps({'type': 'text', 'content': text}, ensure_ascii=False)}\n\n"
                elif etype == "references":
                    # 星火返回的引用信息
                    refs = event.get("data", {})
                    yield f"data: {json.dumps({'type': 'references', 'data': refs}, ensure_ascii=False)}\n\n"
                elif etype == "error":
                    yield f"data: {json.dumps({'type': 'error', 'content': event.get('message', '')}, ensure_ascii=False)}\n\n"
                    return
            yield f"data: {json.dumps({'type': 'done'}, ensure_ascii=False)}\n\n"
        except Exception as e:
            logger.error("星火知识库问答异常: %s", e)
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


# ── DB 兜底检索 ──────────────────────────────────────────────────────


async def _get_user_docs_fallback(
    user_id: str, query: str, limit: int = 5
) -> list[dict]:
    """当 RAG 检索找不到用户文档时，直接从 DB 读取内容并做关键词匹配。

    返回格式与 rag_service.search 结果兼容:
    [{content, score, metadata: {title, doc_id}, source: "user_db_fallback"}]
    """
    async with async_session() as session:
        result = await session.execute(
            select(UserDocument).where(
                UserDocument.user_id == user_id,
            ).order_by(UserDocument.created_at.desc()).limit(50)
        )
        docs = result.scalars().all()

    if not docs:
        return []

    # 简单关键词匹配打分
    query_lower = query.lower()
    keywords = set()
    for w in query_lower.split():
        if len(w) >= 2:
            keywords.add(w)
    # 2-gram 拆分
    for i in range(len(query_lower) - 1):
        gram = query_lower[i:i+2]
        if gram.strip():
            keywords.add(gram)

    if not keywords:
        # 没有有效关键词，返回最近的 3 篇文档
        return [
            {
                "content": (d.content or "")[:1500],
                "score": 0.1,
                "metadata": {"title": d.title, "doc_id": d.id},
                "source": "user_db_fallback",
            }
            for d in docs[:3]
        ]

    scored = []
    for d in docs:
        content_lower = (d.content or "").lower()
        matched = sum(1 for kw in keywords if kw in content_lower)
        if matched >= 1:
            score = min(matched / len(keywords), 1.0) * 0.7  # 兜底分数打折
            # 取最相关的片段（包含第一个匹配关键词的段落）
            snippet = _extract_relevant_snippet(d.content or "", query_lower, 1500)
            scored.append({
                "content": snippet,
                "score": score,
                "metadata": {"title": d.title, "doc_id": d.id},
                "source": "user_db_fallback",
            })

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:limit]


def _extract_relevant_snippet(content: str, query: str, max_len: int = 1500) -> str:
    """从文档内容中提取与 query 最相关的片段"""
    if not content:
        return ""
    # 找到第一个包含 query 关键词的位置
    idx = content.lower().find(query[:10].lower())
    if idx == -1:
        # 尝试 query 的前 5 个字符
        idx = content.lower().find(query[:5].lower())
    if idx == -1:
        return content[:max_len]
    # 从匹配位置前后各取一段
    start = max(0, idx - 200)
    end = min(len(content), idx + max_len - 200)
    snippet = content[start:end]
    if start > 0:
        snippet = "..." + snippet
    if end < len(content):
        snippet = snippet + "..."
    return snippet


# ── 工具函数 ──────────────────────────────────────────────────────────


async def _wait_and_update_spark_status(doc_id: int, spark_file_id: str):
    """后台等待星火处理完成并更新 DB 状态"""
    try:
        ready = await spark_kb_service.wait_file_ready(spark_file_id, timeout=180)
        status = "vectored" if ready else "failed"
        async with async_session() as session:
            from sqlalchemy import update as _update
            await session.execute(
                _update(UserDocument)
                .where(UserDocument.id == doc_id)
                .values(spark_file_status=status)
            )
            await session.commit()
        logger.info("星火文档 %d 处理完成: %s", doc_id, status)
    except Exception as e:
        logger.warning("星火文档 %d 状态更新失败: %s", doc_id, e)


async def _wait_and_add_to_repo(
    doc_id: int, spark_file_id: str, repo_id: str | None
):
    """后台等待向量化完成后自动加入用户知识库"""
    try:
        ready = await spark_kb_service.wait_file_ready(spark_file_id, timeout=180)
        status = "vectored" if ready else "failed"
        if ready and repo_id:
            await spark_kb_service.sync_doc_to_repo(repo_id, spark_file_id)
        async with async_session() as session:
            from sqlalchemy import update as _update
            await session.execute(
                _update(UserDocument)
                .where(UserDocument.id == doc_id)
                .values(spark_file_status=status)
            )
            await session.commit()
    except Exception as e:
        logger.warning("星火文档 %d 同步仓库失败: %s", doc_id, e)


async def _spark_vector_search_for_user(
    user_id: str, query: str, top_k: int = 5
) -> list[dict]:
    """用星火知识库为指定用户做向量检索。

    返回格式与 rag_service.search_user_docs 兼容:
    [{content, score, metadata: {title, doc_id}, source: "spark_kb"}]
    """
    if not spark_kb_service.enabled:
        return []

    # 获取用户所有已就绪的星火文档 fileId
    async with async_session() as session:
        result = await session.execute(
            select(UserDocument).where(
                UserDocument.user_id == user_id,
                UserDocument.spark_file_status == "vectored",
                UserDocument.spark_file_id != "",
            )
        )
        docs = result.scalars().all()

    if not docs:
        return []

    file_ids = [d.spark_file_id for d in docs]
    doc_map = {d.spark_file_id: d for d in docs}

    # 星火向量检索
    raw_results = await spark_kb_service.vector_search(
        query, file_ids=file_ids, top_k=top_k, wiki_filter_score=0.5
    )

    results = []
    for r in raw_results:
        fid = r.get("fileId", "")
        doc = doc_map.get(fid)
        results.append({
            "content": r.get("content", ""),
            "score": r.get("score", 0) / 100.0,  # 星火分数归一化到 0-1
            "metadata": {
                "title": doc.title if doc else r.get("fileId", ""),
                "doc_id": doc.id if doc else 0,
            },
            "source": "spark_kb",
        })
    return results


def _chunk_text(text: str, title: str, tags: list[str], doc_id: int) -> list[dict]:
    """将长文本分块，每块约 500 字"""
    # ChromaDB metadata 只接受 str/int/float/bool，tags 必须转为字符串
    tags_str = ",".join(tags) if tags else ""
    chunks = []
    paragraphs = text.split("\n\n")
    current = ""
    chunk_idx = 0
    for para in paragraphs:
        if len(current) + len(para) > 500 and current:
            chunks.append({
                "id": f"user_doc_{doc_id}_{chunk_idx:04d}",
                "content": current.strip(),
                "metadata": {
                    "source": "user_upload",
                    "title": title,
                    "tags": tags_str,
                    "doc_id": doc_id,
                },
            })
            chunk_idx += 1
            current = para
        else:
            current += "\n\n" + para if current else para

    if current.strip():
        chunks.append({
            "id": f"user_doc_{doc_id}_{chunk_idx:04d}",
            "content": current.strip(),
            "metadata": {
                "source": "user_upload",
                "title": title,
                "tags": tags_str,
                "doc_id": doc_id,
            },
        })
    return chunks


def _add_to_vector_store(user_id: str, doc_id: int, title: str, content: str, tags: list[str]):
    """同步文档到用户向量库"""
    chunks = _chunk_text(content, title, tags, doc_id)
    if chunks:
        rag_service.add_user_documents(chunks)
