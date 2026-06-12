"""向量嵌入服务 — 星火 Embedding API + n-gram 降级兜底"""

import hashlib
import logging
import math
from typing import Optional

import httpx

from config import settings

logger = logging.getLogger(__name__)

# ── 星火 Embedding API 配置 ────────────────────────────────────────────
SPARK_EMBEDDING_URL = "https://spark-api-open.xf-yun.com/v1/embeddings"
SPARK_EMBEDDING_MODEL = "embedding-2"   # 星火语义向量模型（1024 维）
SPARK_EMBED_BATCH = 16                  # 单次最大文本数
SPARK_EMBED_TIMEOUT = 30.0              # 单次请求超时（秒）
FALLBACK_DIM = 256                      # n-gram 兜底维度


class EmbeddingService:
    """语义向量嵌入：优先星火 API，失败时降级为 n-gram 哈希"""

    # ------------------------------------------------------------------
    # 公开接口（同步，兼容现有 rag_service / build_kb 调用）
    # ------------------------------------------------------------------

    def embed(self, text: str, dim: int = 1024) -> list[float]:
        """单条文本 → 向量"""
        vec = self._spark_embed([text])
        if vec is not None:
            return vec[0]
        logger.warning("星火 Embedding API 不可用，降级为 n-gram 兜底")
        return self._ngram_embed(text, FALLBACK_DIM)

    def embed_batch(self, texts: list[str], dim: int = 1024) -> list[list[float]]:
        """批量文本 → 向量列表（自动分片）"""
        if not texts:
            return []

        all_vecs: list[Optional[list[float]]] = [None] * len(texts)

        # 分片调用星火 API
        for start in range(0, len(texts), SPARK_EMBED_BATCH):
            batch = texts[start : start + SPARK_EMBED_BATCH]
            result = self._spark_embed(batch)
            if result is not None:
                for i, vec in enumerate(result):
                    all_vecs[start + i] = vec
            else:
                break  # API 不可用，整体降级

        # 降级：对未拿到向量的条目走 n-gram
        need_fallback = [i for i, v in enumerate(all_vecs) if v is None]
        if need_fallback:
            if len(need_fallback) == len(texts):
                logger.warning("星火 Embedding API 不可用，全部降级为 n-gram")
            for i in need_fallback:
                all_vecs[i] = self._ngram_embed(texts[i], FALLBACK_DIM)

        return all_vecs  # type: ignore[return-value]

    # ------------------------------------------------------------------
    # 星火 Embedding API
    # ------------------------------------------------------------------

    def _spark_embed(self, texts: list[str]) -> Optional[list[list[float]]]:
        """调用星火语义向量接口，失败返回 None"""
        api_key = settings.spark_api_key
        api_secret = settings.spark_api_secret
        if not api_key or not api_secret:
            return None

        password = f"{api_key}:{api_secret}"
        payload = {
            "model": SPARK_EMBEDDING_MODEL,
            "input": texts,
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {password}",
        }

        try:
            with httpx.Client(timeout=SPARK_EMBED_TIMEOUT) as client:
                resp = client.post(SPARK_EMBEDDING_URL, headers=headers, json=payload)
                resp.raise_for_status()
                data = resp.json()

            # 按 index 排序，保证顺序与输入一致
            items = sorted(data["data"], key=lambda x: x["index"])
            return [item["embedding"] for item in items]
        except Exception as e:
            logger.warning("星火 Embedding API 调用失败: %s", e)
            return None

    # ------------------------------------------------------------------
    # n-gram 哈希兜底（离线 / API 不可用时使用）
    # ------------------------------------------------------------------

    @staticmethod
    def _ngram_embed(text: str, dim: int = FALLBACK_DIM) -> list[float]:
        """基于字符 3-gram + MD5 哈希的轻量嵌入（仅兜底）"""
        if len(text) < 3:
            text = text + " " * (3 - len(text))
        vec = [0.0] * dim
        for i in range(len(text) - 2):
            gram = text[i : i + 3]
            h = int(hashlib.md5(gram.encode()).hexdigest()[:8], 16)
            vec[h % dim] += 0.01
        norm = math.sqrt(sum(v * v for v in vec))
        if norm > 0:
            vec = [v / norm for v in vec]
        return vec


embedding_service = EmbeddingService()
