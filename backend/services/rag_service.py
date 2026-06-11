"""RAG 检索服务 —— 基于 ChromaDB 的混合检索"""

import json
import os
from typing import Optional

import chromadb
from chromadb.config import Settings as ChromaSettings

from services.embedding_service import embedding_service


class RAGService:
    def __init__(self, persist_dir: str = "data/chroma"):
        os.makedirs(persist_dir, exist_ok=True)
        self.client = chromadb.PersistentClient(
            path=persist_dir,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        self.collection = self.client.get_or_create_collection(
            name="ai_intro_course",
            metadata={"hnsw:space": "cosine"},
        )

    def add_documents(self, chunks: list[dict]):
        """批量添加文档块到向量库。
        chunks: [{"id": str, "content": str, "metadata": dict}, ...]
        """
        if not chunks:
            return
        ids = [c["id"] for c in chunks]
        texts = [c["content"] for c in chunks]
        metadatas = [c.get("metadata", {}) for c in chunks]
        embeddings = embedding_service.embed_batch(texts)

        self.collection.add(
            ids=ids,
            documents=texts,
            metadatas=metadatas,
            embeddings=embeddings,
        )

    def search(self, query: str, top_k: int = 5, chapter: Optional[str] = None) -> list[dict]:
        """混合检索：语义检索 + 可选的章节过滤"""
        query_embedding = embedding_service.embed(query)
        where_filter = None
        if chapter:
            where_filter = {"chapter": chapter}

        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            where=where_filter,
            include=["documents", "metadatas", "distances"],
        )

        formatted = []
        if results["ids"] and results["ids"][0]:
            for i, doc_id in enumerate(results["ids"][0]):
                formatted.append({
                    "id": doc_id,
                    "content": results["documents"][0][i],
                    "metadata": results["metadatas"][0][i],
                    "score": 1 - results["distances"][0][i],
                    "chapter": results["metadatas"][0][i].get("chapter", ""),
                })
        return formatted

    def get_chapter_context(self, chapter: str, max_chunks: int = 10) -> str:
        """获取指定章节的全部上下文拼接"""
        results = self.collection.get(
            where={"chapter": chapter},
            limit=max_chunks,
            include=["documents"],
        )
        if results["documents"]:
            return "\n\n".join(results["documents"])
        return ""


rag_service = RAGService()
