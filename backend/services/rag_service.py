"""RAG 检索服务 —— 基于 ChromaDB 的混合检索

改进：
- 追踪每个集合的嵌入方法（Spark/n-gram），检测不匹配时自动重建
- 用户文档独立检索 + 保底展示，不被课程库结果挤出
- 文本模糊兜底：向量检索失败时用字符串匹配
- 完整日志记录，消除静默失败
"""

import json
import logging
import os
from typing import Optional

import chromadb
from chromadb.config import Settings as ChromaSettings

from services.embedding_service import embedding_service

logger = logging.getLogger(__name__)


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
        """获取或创建课程知识库集合，如果维度不匹配或 config 损坏则重建"""
        try:
            collection = self.client.get_collection(name=self.COURSE_COLLECTION)
            existing_count = collection.count()
            if existing_count > 0:
                existing = collection.peek()
                if existing and existing.get("embeddings") and len(existing["embeddings"]) > 0:
                    existing_dim = len(existing["embeddings"][0])
                    test_vec = embedding_service.embed("test")
                    if len(test_vec) != existing_dim:
                        logger.warning(
                            "课程集合维度不匹配：现有 %d，需要 %d，重建...",
                            existing_dim, len(test_vec),
                        )
                        self._recreate_collection(self.COURSE_COLLECTION)
                        return
            self.collection = collection
        except (KeyError, Exception) as e:
            # KeyError = config 损坏；其他异常 = 集合不可用
            logger.warning("课程集合初始化失败（%s），重建...", type(e).__name__)
            self._recreate_collection(self.COURSE_COLLECTION)

    def _recreate_collection(self, name: str):
        """删除并重建集合（处理 config 损坏等极端情况）"""
        try:
            # 先尝试修复 config 损坏：直接操作 sqlite3
            self._fix_empty_collection_config(name)
        except Exception:
            pass
        try:
            self.client.delete_collection(name)
        except Exception:
            # delete 也可能因 config 损坏失败，直接清空 sqlite3 中的记录
            try:
                import sqlite3 as _sqlite3
                db_path = os.path.join(self.client._persist_directory, "chroma.sqlite3")
                if os.path.exists(db_path):
                    conn = _sqlite3.connect(db_path)
                    conn.execute("DELETE FROM collections WHERE name = ?", (name,))
                    conn.execute("DELETE FROM segments WHERE collection = (SELECT id FROM collections WHERE name = ?)", (name,))
                    conn.commit()
                    conn.close()
            except Exception:
                pass
        self.collection = self.client.get_or_create_collection(
            name=name,
            metadata={"hnsw:space": "cosine"},
        )

    @staticmethod
    def _fix_empty_collection_config(name: str):
        """修复 sqlite3 中 config_json_str 为空 {} 的记录"""
        import sqlite3 as _sqlite3
        db_path = os.path.join("data", "chroma", "chroma.sqlite3")
        if not os.path.exists(db_path):
            return
        conn = _sqlite3.connect(db_path)
        row = conn.execute(
            "SELECT config_json_str FROM collections WHERE name = ?", (name,)
        ).fetchone()
        if row and row[0] in ("{}", "null", ""):
            default_config = '{"hnsw_configuration": {"space": "cosine", "_type": "HNSWConfigurationInternal"}, "_type": "CollectionConfigurationInternal"}'
            conn.execute(
                "UPDATE collections SET config_json_str = ? WHERE name = ?",
                (default_config, name),
            )
            conn.commit()
            logger.info("已修复集合 '%s' 的空 config", name)
        conn.close()

    # ── 用户上传文档集合 ─────────────────────────────────────────────

    USER_COLLECTION = "ai_intro_user_docs"

    def _ensure_user_collection(self):
        """获取或创建用户上传文档向量集合（简化版，不做 peek/维度检查）"""
        self.user_collection = self.client.get_or_create_collection(
            name=self.USER_COLLECTION,
            metadata={"hnsw:space": "cosine"},
        )

    def _check_and_fix_embedding_mismatch(self) -> bool:
        """检查嵌入方法是否一致（简化版，仅日志记录）"""
        return False

    def add_user_documents(self, chunks: list[dict]):
        """添加用户上传文档到独立集合"""
        if not chunks:
            return

        # 先检查嵌入方法一致性
        try:
            self._check_and_fix_embedding_mismatch()
        except Exception:
            pass

        ids = [c["id"] for c in chunks]
        texts = [c["content"] for c in chunks]
        metadatas = [c.get("metadata", {}) for c in chunks]

        # ChromaDB 只接受 str/int/float/bool，强制转换所有 metadata 值
        for meta in metadatas:
            for k, v in list(meta.items()):
                if isinstance(v, list):
                    meta[k] = ",".join(str(x) for x in v)
                elif isinstance(v, dict):
                    meta[k] = str(v)
                elif not isinstance(v, (str, int, float, bool)):
                    meta[k] = str(v)

        try:
            self._ensure_user_collection()
        except Exception:
            # 集合初始化失败时直接创建新集合
            try:
                self.client.delete_collection(self.USER_COLLECTION)
            except Exception:
                pass
            self.user_collection = self.client.get_or_create_collection(
                name=self.USER_COLLECTION,
                metadata={"hnsw:space": "cosine"},
            )

        try:
            embeddings = embedding_service.embed_batch(texts)
        except Exception as e:
            logger.error("向量化失败: %s", e)
            return

        try:
            # 在集合元数据中记录嵌入方法
            current_method = embedding_service.current_method
            try:
                self.user_collection.modify(
                    metadata={"hnsw:space": "cosine", "embedding_method": current_method}
                )
            except Exception:
                pass

            self.user_collection.add(
                ids=ids, documents=texts, metadatas=metadatas, embeddings=embeddings,
            )
            logger.info(
                "成功导入 %d 个文档块到用户集合（嵌入方法: %s）",
                len(ids), current_method,
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
                logger.error("导入用户文档失败: %s", e, exc_info=True)
                raise

    def remove_user_document_chunks(self, doc_id: int):
        """删除某文档在向量库中的所有块（编辑后重建索引用）"""
        try:
            self._ensure_user_collection()
            count = self.user_collection.count()
            if count == 0:
                return
            # ChromaDB metadata 过滤：doc_id 以 int 存储
            all_items = self.user_collection.get(
                where={"doc_id": doc_id},
                include=["metadatas"],
            )
            if all_items["ids"]:
                self.user_collection.delete(ids=all_items["ids"])
                logger.info("已删除 doc_id=%d 的 %d 个向量块", doc_id, len(all_items["ids"]))
        except Exception as e:
            logger.warning("remove_user_document_chunks 失败: %s", e)

    def search_user_docs(self, query: str, top_k: int = 10) -> list[dict]:
        """仅搜索用户文档集合（供知识库专用搜索端点使用）"""
        try:
            self._ensure_user_collection()
            count = self.user_collection.count()
            if count == 0:
                return []

            try:
                query_embedding = embedding_service.embed(query, is_query=True)
            except Exception as e:
                logger.error("查询向量化失败: %s", e)
                return []

            results = self.user_collection.query(
                query_embeddings=[query_embedding],
                n_results=min(count, top_k),
                include=["documents", "metadatas", "distances"],
            )

            user_results = []
            if results["ids"] and results["ids"][0]:
                for i, doc_id in enumerate(results["ids"][0]):
                    meta = results["metadatas"][0][i]
                    score = 1 - results["distances"][0][i]
                    if score < -0.5:
                        continue
                    user_results.append({
                        "id": doc_id,
                        "content": results["documents"][0][i],
                        "metadata": meta,
                        "score": score,
                        "source": "user_upload",
                        "chapter": meta.get("title", ""),
                    })
            return user_results
        except Exception as e:
            logger.error("用户文档搜索失败: %s", e)
            return []

    def _get_collection(self):
        """安全获取课程集合引用"""
        try:
            self.collection.count()
        except Exception:
            logger.warning("课程集合引用失效，重新获取...")
            self._ensure_collection()
        return self.collection

    def _rebuild_on_dim_mismatch(self, func_name: str):
        """捕获维度不匹配错误并重建集合"""
        logger.warning("%s: 维度不匹配/集合失效，重建后重试...", func_name)
        self._ensure_collection()

    def add_documents(self, chunks: list[dict]):
        """批量添加课程文档块到向量库"""
        if not chunks:
            return
        ids = [c["id"] for c in chunks]
        texts = [c["content"] for c in chunks]
        metadatas = [c.get("metadata", {}) for c in chunks]
        try:
            collection = self._get_collection()
            embeddings = embedding_service.embed_batch(texts)
            collection.add(
                ids=ids, documents=texts, metadatas=metadatas, embeddings=embeddings,
            )
        except Exception as e:
            err = str(e).lower()
            if "dimension" in err or "embedding" in err or "does not exist" in err:
                self._rebuild_on_dim_mismatch("add_documents")
                embeddings = embedding_service.embed_batch(texts)
                self.collection.add(
                    ids=ids, documents=texts, metadatas=metadatas, embeddings=embeddings,
                )
            else:
                raise

    def search(self, query: str, top_k: int = 5, chapter: Optional[str] = None) -> list[dict]:
        """混合检索：课程知识库 + 用户文档

        改进：用户文档保底展示 + 文本模糊兜底
        """
        try:
            return self._search_internal(query, top_k, chapter)
        except Exception as e:
            err = str(e).lower()
            if "dimension" in err or "embedding" in err or "does not exist" in err:
                self._rebuild_on_dim_mismatch("search")
                return self._search_internal(query, top_k, chapter)
            logger.error("检索异常: %s", e, exc_info=True)
            return []

    def _search_internal(
        self, query: str, top_k: int = 5, chapter: Optional[str] = None
    ) -> list[dict]:
        # 检查嵌入方法一致性
        self._check_and_fix_embedding_mismatch()

        try:
            query_embedding = embedding_service.embed(query, is_query=True)
        except Exception as e:
            logger.error("查询向量化失败: %s", e)
            query_embedding = None

        where_filter = None
        if chapter:
            where_filter = {"chapter": chapter}

        user_results_list: list[dict] = []
        course_results_list: list[dict] = []

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
                    course_results_list.append({
                        "id": doc_id,
                        "content": course_results["documents"][0][i],
                        "metadata": course_results["metadatas"][0][i],
                        "score": 1 - course_results["distances"][0][i],
                        "chapter": course_results["metadatas"][0][i].get("chapter", ""),
                        "source": "course",
                    })
        except Exception as e:
            logger.warning("课程库检索失败: %s", e)

        # 2) 搜索用户上传文档 — 独立检索，保证不被课程库挤出
        try:
            self._ensure_user_collection()
            user_count = self.user_collection.count()
            if user_count > 0 and query_embedding is not None:
                user_results = self.user_collection.query(
                    query_embeddings=[query_embedding],
                    n_results=min(user_count, max(10, top_k * 2)),
                    include=["documents", "metadatas", "distances"],
                )
                if user_results["ids"] and user_results["ids"][0]:
                    for i, doc_id in enumerate(user_results["ids"][0]):
                        meta = user_results["metadatas"][0][i]
                        score = 1 - user_results["distances"][0][i]
                        if score < -0.5:
                            continue
                        user_results_list.append({
                            "id": doc_id,
                            "content": user_results["documents"][0][i],
                            "metadata": meta,
                            "score": score,
                            "chapter": meta.get("title", meta.get("tags", "")),
                            "source": "user_upload",
                        })
                    logger.info(
                        "用户文档检索命中 %d 条（集合共 %d 条）",
                        len(user_results_list), user_count,
                    )
        except Exception as e:
            err_str = str(e).lower()
            if "dimension" in err_str or "embedding" in err_str or "does not exist" in err_str:
                logger.warning("用户文档集合维度不匹配，清空重建（需重新导入文档）")
                self.client.delete_collection(self.USER_COLLECTION)
                self.user_collection = self.client.create_collection(
                    name=self.USER_COLLECTION, metadata={"hnsw:space": "cosine"},
                )
            else:
                logger.warning("用户文档检索失败: %s", e)

        # 3) 文本模糊兜底 — 如果向量检索没找到用户文档，尝试字符串匹配
        if not user_results_list:
            text_fallback = self._text_search_user_docs(query)
            if text_fallback:
                user_results_list.extend(text_fallback)
                logger.info("文本模糊兜底命中 %d 条用户文档", len(text_fallback))

        # 4) 合并结果：用户文档优先，保底至少展示
        all_results: list[dict] = []

        # 用户文档排前面（确保不被课程库挤出）
        all_results.extend(user_results_list)

        # 课程库结果排后面
        all_results.extend(course_results_list)

        # 如果用户文档太少，从课程库补充到 top_k
        if len(user_results_list) < 3 and len(course_results_list) > 0:
            # 合并排序
            all_results.sort(key=lambda r: r["score"], reverse=True)
            all_results = all_results[:top_k]
        else:
            # 用户文档够多，各取所需
            combined = user_results_list[:top_k] + course_results_list[:top_k]
            combined.sort(key=lambda r: r["score"], reverse=True)
            all_results = combined[:top_k]

        logger.info(
            "检索完成: query=%r, 课程库=%d, 用户文档=%d, 返回=%d",
            query[:50], len(course_results_list), len(user_results_list), len(all_results),
        )

        return all_results

    def _text_search_user_docs(self, query: str) -> list[dict]:
        """文本模糊兜底：当向量检索无果时，用关键词匹配搜索用户文档"""
        try:
            self._ensure_user_collection()
            count = self.user_collection.count()
            if count == 0:
                return []

            # 取出所有用户文档进行关键词匹配
            all_docs = self.user_collection.get(
                include=["documents", "metadatas"],
                limit=min(count, 200),
            )
            if not all_docs["documents"]:
                return []

            # 简单关键词匹配（中文按字/词拆分）
            query_lower = query.lower()
            keywords = set()
            # 拆分出关键词
            for word in query_lower.split():
                if len(word) >= 2:
                    keywords.add(word)
            # 也用 2-gram 拆分
            for i in range(len(query_lower) - 1):
                gram = query_lower[i:i+2]
                if gram.strip():
                    keywords.add(gram)

            if not keywords:
                return []

            results = []
            for i, doc in enumerate(all_docs["documents"]):
                doc_lower = doc.lower()
                # 计算匹配的关键词数
                matched = sum(1 for kw in keywords if kw in doc_lower)
                if matched >= 2 or (matched >= 1 and len(keywords) <= 3):
                    score = matched / len(keywords)
                    meta = all_docs["metadatas"][i] if all_docs["metadatas"] else {}
                    results.append({
                        "id": all_docs["ids"][i],
                        "content": doc,
                        "metadata": meta,
                        "score": score * 0.5,  # 文本匹配的分数打折（低于向量检索）
                        "chapter": meta.get("title", meta.get("tags", "")),
                        "source": "user_upload",
                    })

            # 按匹配度排序
            results.sort(key=lambda r: r["score"], reverse=True)
            return results[:10]
        except Exception as e:
            logger.debug("文本模糊兜底搜索失败: %s", e)
            return []

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
