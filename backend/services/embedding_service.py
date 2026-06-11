"""向量嵌入服务"""

import hashlib


class EmbeddingService:
    """基于字符 n-gram 哈希的轻量嵌入，生产可替换为星火 Embedding API"""

    def embed(self, text: str, dim: int = 256) -> list[float]:
        if len(text) < 3:
            text = text + " " * (3 - len(text))
        vec = [0.0] * dim
        for i in range(len(text) - 2):
            gram = text[i:i + 3]
            h = int(hashlib.md5(gram.encode()).hexdigest()[:8], 16)
            vec[h % dim] += 0.01
        norm = sum(v * v for v in vec) ** 0.5
        if norm > 0:
            vec = [v / norm for v in vec]
        return vec

    def embed_batch(self, texts: list[str], dim: int = 256) -> list[list[float]]:
        return [self.embed(t, dim) for t in texts]


embedding_service = EmbeddingService()
