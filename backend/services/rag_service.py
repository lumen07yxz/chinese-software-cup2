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
        self._ensure_collection()
        self._ensure_user_collection()

    # ── 课程知识库集合（build_kb.py 管理）────────────────────────────

    COURSE_COLLECTION = "ai_intro_course"

    def _ensure_collection(self):
        """获取或创建课程知识库集合，如果维度不匹配则重建"""
        try:
            collection = self.client.get_collection(name=self.COURSE_COLLECTION)
            # 使用 count 而非 peek 避免空集合下载 embedding 模型或异常
            existing_count = collection.count()
            if existing_count > 0:
                # 检查第一个向量的维度是否匹配
                existing = collection.peek()
                if existing and existing.get("embeddings") and len(existing["embeddings"]) > 0:
                    existing_dim = len(existing["embeddings"][0])
                    test_vec = embedding_service.embed("test")
                    if len(test_vec) != existing_dim:
                        import logging
                        logging.getLogger(__name__).warning(
                            f"维度不匹配：现有 {existing_dim}，需要 {len(test_vec)}，重建课程集合..."
                        )
                        self.client.delete_collection(self.COURSE_COLLECTION)
                        collection = self.client.create_collection(
                            name=self.COURSE_COLLECTION,
                            metadata={"hnsw:space": "cosine"},
                        )
            self.collection = collection
        except Exception:
            try:
                self.client.delete_collection(self.COURSE_COLLECTION)
            except Exception:
                pass
            self.collection = self.client.get_or_create_collection(
                name=self.COURSE_COLLECTION,
                metadata={"hnsw:space": "cosine"},
            )

    # ── 用户上传文档集合（不会被 build_kb.py 清空）──────────────────

    USER_COLLECTION = "ai_intro_user_docs"

    def _ensure_user_collection(self):
        """获取或创建用户上传文档向量集合，含维度一致性检查"""
        try:
            self.user_collection = self.client.get_collection(name=self.USER_COLLECTION)
            # 检查现有向量的维度是否与当前 embedding 一致
            existing = self.user_collection.peek()
            if existing and existing.get("embeddings") and len(existing["embeddings"]) > 0:
                existing_dim = len(existing["embeddings"][0])
                test_vec = embedding_service.embed("test", dim=2560)
                if len(test_vec) != existing_dim:
                    import logging
                    logging.getLogger(__name__).warning(
                        f"用户文档集合维度不匹配：现有 {existing_dim}，需要 {len(test_vec)}，重建..."
                    )
                    self.client.delete_collection(self.USER_COLLECTION)
                    self.user_collection = self.client.create_collection(
                        name=self.USER_COLLECTION,
                        metadata={"hnsw:space": "cosine"},
                    )
        except Exception:
            self.user_collection = self.client.get_or_create_collection(
                name=self.USER_COLLECTION,
                metadata={"hnsw:space": "cosine"},
            )

    def add_user_documents(self, chunks: list[dict]):
        """添加用户上传文档到独立集合（不会被 build_kb.py 清空）"""
        if not chunks:
            return
        ids = [c["id"] for c in chunks]
        texts = [c["content"] for c in chunks]
        metadatas = [c.get("metadata", {}) for c in chunks]
        try:
            self._ensure_user_collection()
            embeddings = embedding_service.embed_batch(texts)
            self.user_collection.add(
                ids=ids, documents=texts, metadatas=metadatas, embeddings=embeddings,
            )
        except Exception as e:
            err = str(e).lower()
            if "dimension" in err or "embedding" in err or "does not exist" in err:
                self.user_collection = self.client.get_or_create_collection(
                    name=self.USER_COLLECTION, metadata={"hnsw:space": "cosine"},
                )
                embeddings = embedding_service.embed_batch(texts)
                self.user_collection.add(
                    ids=ids, documents=texts, metadatas=metadatas, embeddings=embeddings,
                )
            else:
                raise

    def _get_collection(self):
        """安全获取集合引用，防止 stale handle（被外部 rebuild 删除后重建）"""
        try:
            # 快速验证：检查集合是否仍存在——用 count 替代 peek，因为空集合 peek 会报错
            self.collection.count()
        except Exception:
            import logging
            logging.getLogger(__name__).warning("集合引用失效，重新获取...")
            self._ensure_collection()
        return self.collection

    def _rebuild_on_dim_mismatch(self, func_name: str):
        """捕获维度不匹配错误并重建集合（惰性修复）"""
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"{func_name}: 维度不匹配 / 集合失效，重建后重试...")
        self._ensure_collection()

    def add_documents(self, chunks: list[dict]):
        """批量添加文档块到向量库。
        chunks: [{"id": str, "content": str, "metadata": dict}, ...]
        """
        if not chunks:
            return
        ids = [c["id"] for c in chunks]
        texts = [c["content"] for c in chunks]
        metadatas = [c.get("metadata", {}) for c in chunks]
        try:
            collection = self._get_collection()
            embeddings = embedding_service.embed_batch(texts)
            collection.add(
                ids=ids,
                documents=texts,
                metadatas=metadatas,
                embeddings=embeddings,
            )
        except Exception as e:
            err = str(e).lower()
            if "dimension" in err or "embedding" in err or "does not exist" in err:
                self._rebuild_on_dim_mismatch("add_documents")
                embeddings = embedding_service.embed_batch(texts)
                self.collection.add(
                    ids=ids,
                    documents=texts,
                    metadatas=metadatas,
                    embeddings=embeddings,
                )
            else:
                raise

    def search(self, query: str, top_k: int = 5, chapter: Optional[str] = None) -> list[dict]:
        """混合检索：课程知识库 + 用户文档，合并去重"""
        try:
            return self._search_internal(query, top_k, chapter)
        except Exception as e:
            err = str(e).lower()
            if "dimension" in err or "embedding" in err or "does not exist" in err:
                self._rebuild_on_dim_mismatch("search")
                return self._search_internal(query, top_k, chapter)
            raise

    def _search_internal(
        self, query: str, top_k: int = 5, chapter: Optional[str] = None
    ) -> list[dict]:
        query_embedding = embedding_service.embed(query)
        where_filter = None
        if chapter:
            where_filter = {"chapter": chapter}

        all_results: list[dict] = []

        # 1) 搜索课程知识库
        try:
            course_coll = self._get_collection()
            course_results = course_coll.query(
                query_embeddings=[query_embedding],
                n_results=top_k,
                where=where_filter,
                include=["documents", "metadatas", "distances"],
            )
            if course_results["ids"] and course_results["ids"][0]:
                for i, doc_id in enumerate(course_results["ids"][0]):
                    all_results.append({
                        "id": doc_id,
                        "content": course_results["documents"][0][i],
                        "metadata": course_results["metadatas"][0][i],
                        "score": 1 - course_results["distances"][0][i],
                        "chapter": course_results["metadatas"][0][i].get("chapter", ""),
                        "source": "course",
                    })
        except Exception:
            pass  # 课程集合不可用时静默跳过

        # 2) 搜索用户上传文档（不按 chapter 过滤，因为用户文档无此字段）
        try:
            self._ensure_user_collection()
            self.user_collection.peek()  # 快速验证集合可用
            user_results = self.user_collection.query(
                query_embeddings=[query_embedding],
                n_results=max(5, top_k * 2),
                include=["documents", "metadatas", "distances"],
            )
            if user_results["ids"] and user_results["ids"][0]:
                for i, doc_id in enumerate(user_results["ids"][0]):
                    meta = user_results["metadatas"][0][i]
                    all_results.append({
                        "id": doc_id,
                        "content": user_results["documents"][0][i],
                        "metadata": meta,
                        "score": 1 - user_results["distances"][0][i],
                        "chapter": meta.get("title", meta.get("tags", "")),
                        "source": "user_upload",
                    })
        except Exception as e:
            err_str = str(e).lower()
            if "dimension" in err_str or "embedding" in err_str or "does not exist" in err_str:
                # 维度不匹配 → 重建用户集合（清空后重新操作），暂不返回结果
                import logging
                logging.getLogger(__name__).warning("用户文档集合维度不匹配，重建后需重新导入文档")
                self.client.delete_collection(self.USER_COLLECTION)
                self.user_collection = self.client.create_collection(
                    name=self.USER_COLLECTION, metadata={"hnsw:space": "cosine"},
                )
            # 其他错误静默跳过（集合可能为空）、

        # 按分数降序排列，取 top_k
        all_results.sort(key=lambda r: r["score"], reverse=True)
        return all_results[:top_k]

    def get_chapter_context(self, chapter: str, max_chunks: int = 10) -> str:
        """获取指定章节的全部上下文拼接"""
        try:
            return self._get_chapter_context_internal(chapter, max_chunks)
        except Exception as e:
            err = str(e).lower()
            if "dimension" in err or "embedding" in err or "does not exist" in err:
                self._rebuild_on_dim_mismatch("get_chapter_context")
                return self._get_chapter_context_internal(chapter, max_chunks)
            raise

    def _get_chapter_context_internal(self, chapter: str, max_chunks: int = 10) -> str:
        collection = self._get_collection()
        results = collection.get(
            where={"chapter": chapter},
            limit=max_chunks,
            include=["documents"],
        )
        if results["documents"]:
            return "\n\n".join(results["documents"])
        return ""


rag_service = RAGService()
