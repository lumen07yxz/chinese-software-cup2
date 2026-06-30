"""向量嵌入服务 — 星火 Embedding → 豆包 Embedding → n-gram 三级降级

优先使用星火 API，失败时降级到豆包（火山引擎），最终降级到 n-gram 哈希。
"""

import asyncio
import base64
import hashlib
import hmac
import logging
import math
import struct
import json as _json
from datetime import datetime
from time import mktime
from typing import Optional
from urllib.parse import urlencode
from wsgiref.handlers import format_date_time

import httpx

from config import settings

logger = logging.getLogger(__name__)

# ── 星火 Embedding API 配置 ────────────────────────────────────────────
SPARK_EMBEDDING_URL = settings.spark_embedding_url
SPARK_EMBED_BATCH = 16
SPARK_EMBED_TIMEOUT = 30.0
TARGET_DIM = 2560
FALLBACK_DIM = 256

# ── 豆包 Embedding API 配置 ────────────────────────────────────────────
DOUBAO_EMBED_URL = settings.doubao_embed_url
DOUBAO_EMBED_MODEL = settings.doubao_embed_model
DOUBAO_EMBED_BATCH = 20
DOUBAO_EMBED_TIMEOUT = 30.0

# ── 断路器 ──────────────────────────────────────────────────────────────
_MAX_RETRIES = 2
_RETRY_DELAY = 1.0
_LICC_CODES = {11200, 11201, 11202, 11203, 11204, 11205, 11206, 11207, 11208, 11209,
               10004, 10005, 10006, 10008, 10009, 10012, 10019}
_spark_dead = False
_doubao_dead = False


class EmbeddingService:
    """语义向量嵌入：星火 → 豆包 → n-gram 三级降级"""

    @property
    def current_method(self) -> str:
        if not _spark_dead:
            return "spark"
        if not _doubao_dead:
            return "doubao"
        return "ngram"

    # ── 公开接口 ──────────────────────────────────────────────────────

    def embed(self, text: str, dim: int = TARGET_DIM, is_query: bool = False) -> list[float]:
        """单条文本 → 向量"""
        vec = self._spark_embed([text], is_query=is_query)
        if vec and vec[0] is not None:
            return self._pad_to_dim(vec[0], dim)

        vec = self._doubao_embed([text])
        if vec and vec[0] is not None:
            return self._pad_to_dim(vec[0], dim)

        return self._pad_to_dim(self._ngram_embed(text, FALLBACK_DIM), dim)

    def embed_batch(self, texts: list[str], dim: int = TARGET_DIM) -> list[list[float]]:
        """批量文本 → 向量列表（自动分片）"""
        if not texts:
            return []

        all_vecs: list[Optional[list[float]]] = [None] * len(texts)

        # 第一级：星火
        for start in range(0, len(texts), SPARK_EMBED_BATCH):
            batch = texts[start:start + SPARK_EMBED_BATCH]
            result = self._spark_embed(batch)
            if result:
                for i, vec in enumerate(result):
                    if vec is not None:
                        all_vecs[start + i] = vec

        # 第二级：豆包（填充星火失败的）
        need_doubao = [i for i, v in enumerate(all_vecs) if v is None]
        if need_doubao:
            for start in range(0, len(need_doubao), DOUBAO_EMBED_BATCH):
                batch_indices = need_doubao[start:start + DOUBAO_EMBED_BATCH]
                batch_texts = [texts[i] for i in batch_indices]
                result = self._doubao_embed(batch_texts)
                if result:
                    for j, vec in enumerate(result):
                        if vec is not None:
                            all_vecs[batch_indices[j]] = vec

        # 第三级：n-gram（最终兜底）
        need_fallback = [i for i, v in enumerate(all_vecs) if v is None]
        if need_fallback:
            logger.info("星火+豆包均不可用，n-gram 兜底 %d 条", len(need_fallback))
            for i in need_fallback:
                all_vecs[i] = self._pad_to_dim(self._ngram_embed(texts[i], FALLBACK_DIM), dim)

        # 统一 pad 到目标维度（星火=2560，豆包=2048，n-gram=FALLBACK_DIM）
        return [self._pad_to_dim(v, dim) if v is not None else [0.0] * dim for v in all_vecs]

    async def a_embed(self, text: str, dim: int = TARGET_DIM, is_query: bool = False) -> list[float]:
        """异步单条文本 → 向量"""
        vec = await self._a_spark_embed([text], is_query=is_query)
        if vec and vec[0] is not None:
            return self._pad_to_dim(vec[0], dim)

        vec = await self._a_doubao_embed([text])
        if vec and vec[0] is not None:
            return self._pad_to_dim(vec[0], dim)

        return self._pad_to_dim(self._ngram_embed(text, FALLBACK_DIM), dim)

    # ── 星火 API（同步）──────────────────────────────────────────────

    def _spark_embed(self, texts: list[str], is_query: bool = False) -> Optional[list[Optional[list[float]]]]:
        global _spark_dead
        if _spark_dead:
            return None
        if not settings.spark_app_id or not settings.spark_api_key or not settings.spark_api_secret:
            return None

        auth_url = self._build_auth_url(SPARK_EMBEDDING_URL, "POST",
                                        settings.spark_api_key, settings.spark_api_secret)
        results: list[Optional[list[float]]] = []
        for text in texts:
            body = self._build_body(settings.spark_app_id, text, is_query=is_query)
            vec: Optional[list[float]] = None
            for attempt in range(1, _MAX_RETRIES + 1):
                try:
                    with httpx.Client(timeout=SPARK_EMBED_TIMEOUT) as client:
                        resp = client.post(auth_url, json=body, headers={"Content-Type": "application/json"})
                        parsed_code = self._peek_error_code(resp.text)
                        if parsed_code in _LICC_CODES:
                            _spark_dead = True
                            logger.error("星火 Embedding 断路器触发 (code=%s)", parsed_code)
                            break
                        if resp.status_code >= 500:
                            if attempt < _MAX_RETRIES:
                                import time; time.sleep(_RETRY_DELAY * attempt)
                            continue
                        resp.raise_for_status()
                        vec = self._parse_spark_response(resp.text)
                        break
                except Exception:
                    if attempt < _MAX_RETRIES:
                        import time; time.sleep(_RETRY_DELAY * attempt)
            results.append(vec)
        return results

    async def _a_spark_embed(self, texts: list[str], is_query: bool = False) -> Optional[list[Optional[list[float]]]]:
        global _spark_dead
        if _spark_dead:
            return None
        if not settings.spark_app_id or not settings.spark_api_key or not settings.spark_api_secret:
            return None

        auth_url = self._build_auth_url(SPARK_EMBEDDING_URL, "POST",
                                        settings.spark_api_key, settings.spark_api_secret)
        results: list[Optional[list[float]]] = []
        async with httpx.AsyncClient(timeout=SPARK_EMBED_TIMEOUT) as client:
            for text in texts:
                body = self._build_body(settings.spark_app_id, text, is_query=is_query)
                vec: Optional[list[float]] = None
                for attempt in range(1, _MAX_RETRIES + 1):
                    try:
                        resp = await client.post(auth_url, json=body, headers={"Content-Type": "application/json"})
                        parsed_code = self._peek_error_code(resp.text)
                        if parsed_code in _LICC_CODES:
                            _spark_dead = True
                            logger.error("星火 Embedding 断路器触发 (code=%s)", parsed_code)
                            break
                        if resp.status_code >= 500:
                            if attempt < _MAX_RETRIES:
                                await asyncio.sleep(_RETRY_DELAY * attempt)
                            continue
                        resp.raise_for_status()
                        vec = self._parse_spark_response(resp.text)
                        break
                    except Exception:
                        if attempt < _MAX_RETRIES:
                            await asyncio.sleep(_RETRY_DELAY * attempt)
                results.append(vec)
        return results

    # ── 豆包 API（同步）──────────────────────────────────────────────

    def _doubao_embed(self, texts: list[str]) -> Optional[list[Optional[list[float]]]]:
        global _doubao_dead
        if _doubao_dead:
            return None
        api_key = settings.doubao_api_key
        if not api_key:
            return None

        results: list[Optional[list[float]]] = []
        for text in texts:
            vec = self._call_doubao_api(api_key, text)
            if vec is None and text == texts[0]:
                # 第一条就失败，可能是永久性错误
                _doubao_dead = True
                logger.error("豆包 Embedding 断路器触发")
                results.extend([None] * (len(texts) - 1))
                break
            results.append(vec)
        return results

    async def _a_doubao_embed(self, texts: list[str]) -> Optional[list[Optional[list[float]]]]:
        global _doubao_dead
        if _doubao_dead:
            return None
        api_key = settings.doubao_api_key
        if not api_key:
            return None

        results: list[Optional[list[float]]] = []
        async with httpx.AsyncClient(timeout=DOUBAO_EMBED_TIMEOUT) as client:
            for text in texts:
                try:
                    resp = await client.post(
                        DOUBAO_EMBED_URL,
                        json={
                            "model": DOUBAO_EMBED_MODEL,
                            "input": [{"type": "text", "text": text}],
                        },
                        headers={
                            "Content-Type": "application/json",
                            "Authorization": f"Bearer {api_key}",
                        },
                    )
                    if resp.status_code >= 400:
                        logger.warning("豆包 Embedding 失败: HTTP %s, %s", resp.status_code, resp.text[:200])
                        if resp.status_code in (401, 403, 404):
                            _doubao_dead = True
                        results.append(None)
                        continue
                    data = resp.json()
                    embed_data = data.get("data", {})
                    if isinstance(embed_data, dict):
                        vec = embed_data.get("embedding", [])
                    elif isinstance(embed_data, list) and embed_data:
                        vec = embed_data[0].get("embedding", [])
                    else:
                        vec = []
                    results.append(vec if vec else None)
                except Exception as e:
                    logger.warning("豆包 Embedding 异常: %s", e)
                    results.append(None)
        return results

    def _call_doubao_api(self, api_key: str, text: str) -> Optional[list[float]]:
        """同步调用豆包多模态 Embedding API"""
        try:
            with httpx.Client(timeout=DOUBAO_EMBED_TIMEOUT) as client:
                resp = client.post(
                    DOUBAO_EMBED_URL,
                    json={
                        "model": DOUBAO_EMBED_MODEL,
                        "input": [{"type": "text", "text": text}],
                    },
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {api_key}",
                    },
                )
                if resp.status_code >= 400:
                    logger.warning("豆包 Embedding 失败: HTTP %s, %s", resp.status_code, resp.text[:200])
                    return None
                data = resp.json()
                # 响应格式: {"data": {"embedding": [...]}} (非数组)
                embed_data = data.get("data", {})
                if isinstance(embed_data, dict):
                    vec = embed_data.get("embedding", [])
                elif isinstance(embed_data, list) and embed_data:
                    vec = embed_data[0].get("embedding", [])
                else:
                    return None
                return vec if vec else None
        except Exception as e:
            logger.warning("豆包 Embedding 异常: %s", e)
        return None

    # ── 星火鉴权 ──────────────────────────────────────────────────────

    @staticmethod
    def _build_auth_url(request_url: str, method: str, api_key: str, api_secret: str) -> str:
        st_idx = request_url.index("://")
        schema = request_url[:st_idx + 3]
        host_path = request_url[st_idx + 3:]
        ed_idx = host_path.index("/") if "/" in host_path else len(host_path)
        host = host_path[:ed_idx]
        path = host_path[ed_idx:] if ed_idx < len(host_path) else "/"

        now = datetime.now()
        date = format_date_time(mktime(now.timetuple()))
        signature_origin = f"host: {host}\ndate: {date}\n{method} {path} HTTP/1.1"
        signature_sha = hmac.new(api_secret.encode(), signature_origin.encode(), digestmod=hashlib.sha256).digest()
        signature_str = base64.b64encode(signature_sha).decode()
        authorization_origin = f'api_key="{api_key}", algorithm="hmac-sha256", headers="host date request-line", signature="{signature_str}"'
        authorization = base64.b64encode(authorization_origin.encode()).decode()
        params = {"host": host, "date": date, "authorization": authorization}
        return f"{schema}{host}{path}?{urlencode(params)}"

    @staticmethod
    def _build_body(app_id: str, text: str, is_query: bool = False) -> dict:
        payload = {"messages": [{"content": text, "role": "user"}]}
        text_b64 = base64.b64encode(_json.dumps(payload).encode()).decode()
        domain = "query" if is_query else "para"
        return {
            "header": {"app_id": app_id, "uid": "student-learning-system", "status": 3},
            "parameter": {"emb": {"domain": domain, "feature": {"encoding": "utf8"}}},
            "payload": {"messages": {"text": text_b64}},
        }

    @staticmethod
    def _peek_error_code(raw_text: str) -> int:
        try:
            data = _json.loads(raw_text)
            return data.get("header", {}).get("code", 0)
        except Exception:
            return 0

    @staticmethod
    def _parse_spark_response(raw_text: str) -> Optional[list[float]]:
        data = _json.loads(raw_text)
        code = data["header"]["code"]
        if code != 0:
            return None
        text_b64 = data["payload"]["feature"]["text"]
        binary = base64.b64decode(text_b64)
        fmt = "<" + str(len(binary) // 4) + "f"
        vec = list(struct.unpack(fmt, binary))
        return vec[:2560] if len(vec) > 2560 else vec

    # ── n-gram 兜底 ──────────────────────────────────────────────────

    @staticmethod
    def _pad_to_dim(vec: list[float], target_dim: int) -> list[float]:
        if len(vec) == target_dim:
            return vec
        if len(vec) > target_dim:
            return vec[:target_dim]
        return vec + [0.0] * (target_dim - len(vec))

    @staticmethod
    def _ngram_embed(text: str, dim: int = FALLBACK_DIM) -> list[float]:
        if not text:
            text = " "
        if len(text) < 10:
            text = text + " " + text[::-1] + " " + text.upper()
        vec = [0.0] * dim
        total = 0
        for n in range(2, 6):
            for i in range(len(text) - n + 1):
                gram = text[i:i + n]
                h1 = int(hashlib.md5((gram + "h1").encode()).hexdigest()[:8], 16)
                h2 = int(hashlib.md5((gram + "h2").encode()).hexdigest()[:8], 16)
                vec[h1 % dim] += 1.0
                vec[h2 % dim] += 1.0
                total += 2
        if total > 0:
            norm = math.sqrt(sum(v * v for v in vec))
            if norm > 0:
                vec = [v / norm for v in vec]
        return vec


embedding_service = EmbeddingService()
