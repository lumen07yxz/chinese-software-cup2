"""知识库管理 API — 文档导入、联网搜索、知识库扩充"""

import os
import json
import logging
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy import select

from db import async_session
from models import User, UserDocument
from auth import get_current_user
from services.rag_service import rag_service
from services.web_search_service import web_search_service

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
    """上传知识文档（支持 .md / .txt / .pdf / .docx / .html）"""
    user_id = current_user.username

    # 验证文件扩展名
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型: {ext}，支持: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    # 读取内容
    content = await file.read()
    try:
        text = content.decode("utf-8")
    except UnicodeDecodeError:
        try:
            text = content.decode("gbk")
        except UnicodeDecodeError:
            text = content.decode("utf-8", errors="replace")

    doc_title = title or (file.filename or "未命名文档")
    tag_list = json.loads(tags) if tags else []

    # 保存到 DB
    os.makedirs(os.path.join(DATA_DIR, user_id), exist_ok=True)
    file_path = os.path.join(DATA_DIR, user_id, file.filename or f"doc_{len(text)}.md")
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(text)

    async with async_session() as session:
        doc = UserDocument(
            user_id=user_id,
            title=doc_title,
            content=text[:100000],  # 限制 10 万字
            file_path=file_path,
            source_type="upload",
            tags=tag_list,
        )
        session.add(doc)
        await session.commit()
        doc_id = doc.id

    # 分块添加到用户向量库（独立集合）
    chunks = _chunk_text(text, doc_title, tag_list, doc_id)
    if chunks:
        rag_service.add_user_documents(chunks)

    return {
        "status": "uploaded",
        "document_id": doc_id,
        "title": doc_title,
        "chunks": len(chunks),
        "length": len(text),
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
                    "tags": d.tags,
                    "created_at": d.created_at.isoformat() if d.created_at else "",
                    "length": len(d.content or ""),
                }
                for d in docs
            ]
        }


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

        # 删除文件
        if doc.file_path and os.path.exists(doc.file_path):
            os.remove(doc.file_path)

        await session.delete(doc)
        await session.commit()

    return {"status": "deleted"}


# ── 工具函数 ──────────────────────────────────────────────────────────


def _chunk_text(text: str, title: str, tags: list[str], doc_id: int) -> list[dict]:
    """将长文本分块，每块约 500 字"""
    chunks = []
    # 按段落分割
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
                    "tags": ",".join(tags),
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
                "tags": ",".join(tags),
                "doc_id": doc_id,
            },
        })
    return chunks


def _add_to_vector_store(user_id: str, doc_id: int, title: str, content: str, tags: list[str]):
    """同步文档到用户向量库（独立集合，不会被 build_kb.py 清空）"""
    chunks = _chunk_text(content, title, tags, doc_id)
    if chunks:
        rag_service.add_user_documents(chunks)
