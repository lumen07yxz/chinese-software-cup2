"""多模态视觉模型服务 —— 拍照搜题 / 图片理解

支持三种后端（按优先级自动检测）：
1. 讯飞图片理解 WebSocket（wss://spark-api.cn-huabei-1.xf-yun.com/v2.1/image）
   → HMAC-SHA256 签名鉴权，适合拍照搜题
2. OpenAI 格式 HTTP API（通义千问 VL / 智谱 GLM-4V / Ollama 等）
   → Bearer Token 鉴权
3. 星火 REST API fallback（复用 SPARK_API_KEY/SPARK_API_SECRET）
   → 无需额外配置，自动使用 spark-x 模型的多模态能力

在 .env 中配置对应字段即可自动启用，未配置时自动降级到下一级后端。
"""

import asyncio
import base64
import hashlib
import hmac
import json
import logging
import time
import uuid
import httpx
from config import settings

logger = logging.getLogger(__name__)


class VisionService:
    """多模态视觉模型调用服务"""

    def __init__(self):
        self._backend: str | None = None  # "xfyun_image" | "openai_compat" | "spark_rest" | None

    @property
    def is_available(self) -> bool:
        return self._detect_backend() is not None

    @property
    def backend(self) -> str:
        return self._detect_backend() or ""

    def _detect_backend(self) -> str | None:
        """自动检测使用哪种视觉后端"""
        if self._backend is not None:
            return self._backend

        # 优先：讯飞图片理解 WebSocket
        if (settings.image_understanding_api_url
            and settings.image_understanding_api_key
            and settings.image_understanding_api_secret
            and settings.image_understanding_api_app_id):
            self._backend = "xfyun_image"
            logger.info("视觉后端: 讯飞图片理解 (%s)", settings.image_understanding_api_url)
            return self._backend

        # 备选：OpenAI 兼容 HTTP API
        if settings.vision_api_url and settings.vision_api_key and settings.vision_model:
            self._backend = "openai_compat"
            logger.info("视觉后端: OpenAI 兼容 (%s)", settings.vision_model)
            return self._backend

        # 兜底：复用星火 REST API（spark-x 支持多模态图片输入）
        if settings.spark_api_key and settings.spark_api_secret and settings.spark_rest_url:
            self._backend = "spark_rest"
            logger.info("视觉后端: 星火 REST API fallback (%s)", settings.spark_rest_url)
            return self._backend

        self._backend = None
        return None

    # ── 讯飞图片理解 WebSocket ──────────────────────────────────

    def _build_xfyun_auth_url(self) -> str:
        """生成带 HMAC-SHA256 签名的讯飞 WebSocket URL

        讯飞标准 WebSocket 认证：
        1. signature_origin = "host: {host}\ndate: {date}\nGET {path} HTTP/1.1"
        2. signature = base64(hmac-sha256(api_secret, signature_origin))
        3. authorization_origin = 'api_key="{key}", algorithm="hmac-sha256", ...'
        4. authorization = base64(authorization_origin)
        5. URL: wss://{host}{path}?authorization={auth}&date={date}&host={host}
           ⚠️ 所有 query 参数必须经过 URL 编码，否则 base64 中的 =/+ 会被截断/转义
        """
        from urllib.parse import urlparse, urlencode

        url = urlparse(settings.image_understanding_api_url)
        host = url.hostname
        path = url.path

        now = datetime_str = time.strftime("%a, %d %b %Y %H:%M:%S GMT", time.gmtime())

        signature_origin = f"host: {host}\ndate: {datetime_str}\nGET {path} HTTP/1.1"
        signature_sha = hmac.new(
            settings.image_understanding_api_secret.encode("utf-8"),
            signature_origin.encode("utf-8"),
            digestmod=hashlib.sha256,
        ).digest()
        signature = base64.b64encode(signature_sha).decode("utf-8")

        authorization_origin = (
            f'api_key="{settings.image_understanding_api_key}", '
            f'algorithm="hmac-sha256", '
            f'headers="host date request-line", '
            f'signature="{signature}"'
        )
        authorization = base64.b64encode(authorization_origin.encode("utf-8")).decode("utf-8")

        # ⚠️ authorization 中的 base64 字符 (=, /, +) 必须 URL 编码
        # 但 date 中的空格不能编码为 +（服务器会原样比对签名中的 date）
        from urllib.parse import quote
        auth_encoded = quote(authorization, safe="")
        return f"wss://{host}{path}?authorization={auth_encoded}&date={datetime_str}&host={host}"

    async def xfyun_recognize(
        self,
        images: list[str],
        question: str = "请详细描述这张图片的内容",
    ) -> str:
        """调用讯飞图片理解 WebSocket API

        Args:
            images: base64 data URL 列表（"data:image/jpeg;base64,..."）
            question: 要问图片的问题

        Returns:
            图片理解结果文本
        """
        import websockets

        auth_url = self._build_xfyun_auth_url()

        # 准备图片数据
        image_list = []
        for img_url in images[:4]:
            # 去掉 data:image/xxx;base64, 前缀
            if "base64," in img_url:
                raw_b64 = img_url.split("base64,", 1)[1]
            else:
                raw_b64 = img_url
            image_list.append({"image": raw_b64})

        # 构建请求
        payload = {
            "header": {
                "app_id": settings.image_understanding_api_app_id,
            },
            "parameter": {
                "image": {
                    "question": question,
                    "feature": {
                        "general_understanding": {},
                    },
                },
            },
            "payload": {
                "image": {
                    "image_list": image_list,
                },
            },
        }

        try:
            async with websockets.connect(auth_url, ping_interval=30) as ws:
                await ws.send(json.dumps(payload))

                # 等待响应（最多 30 秒）
                result_text = ""
                async for msg in ws:
                    data = json.loads(msg)
                    header = data.get("header", {})
                    code = header.get("code", -1)

                    if code != 0:
                        error_msg = header.get("message", "unknown error")
                        raise RuntimeError(f"讯飞图片理解错误 ({code}): {error_msg}")

                    # 提取结果
                    payload_data = data.get("payload", {})
                    choices = payload_data.get("choices", {})
                    text = choices.get("text", [])
                    for item in text:
                        content = item.get("content", "")
                        if content:
                            result_text += content

                    # 检查是否结束
                    status = payload_data.get("status", {})
                    if status.get("text", "") == "2":
                        break

                return result_text or "无法识别图片内容"

        except Exception as e:
            logger.error("讯飞图片理解失败: %s", e)
            raise

    # ── OpenAI 兼容 HTTP API ────────────────────────────────────

    async def openai_compat_chat(
        self,
        messages: list[dict],
        temperature: float = 0.5,
        max_tokens: int = 4096,
    ) -> str:
        """调用 OpenAI 兼容的视觉 API"""
        payload = {
            "model": settings.vision_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {settings.vision_api_key}",
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(settings.vision_api_url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]

    async def openai_compat_chat_stream(
        self,
        messages: list[dict],
        temperature: float = 0.5,
        max_tokens: int = 4096,
    ):
        """调用 OpenAI 兼容的视觉 API（流式）"""
        payload = {
            "model": settings.vision_model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {settings.vision_api_key}",
        }

        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream("POST", settings.vision_api_url, headers=headers, json=payload) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    chunk = line[6:].strip()
                    if not chunk or chunk == "[DONE]":
                        continue
                    try:
                        data = json.loads(chunk)
                        choices = data.get("choices", [])
                        if choices:
                            content = choices[0].get("delta", {}).get("content", "")
                            if content:
                                yield content
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue

    # ── 星火 REST API fallback（复用已有凭证） ───────────────────

    async def spark_rest_chat(
        self,
        messages: list[dict],
        temperature: float = 0.5,
        max_tokens: int = 4096,
    ) -> str:
        """复用星火 REST API 调用 spark-x 的多模态能力"""
        password = f"{settings.spark_api_key}:{settings.spark_api_secret}"
        payload = {
            "model": "spark-x",
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {password}",
        }
        url = settings.spark_rest_url or "https://spark-api-open.xf-yun.com/agent/v1/chat/completions"

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]

    # ── 统一入口 ────────────────────────────────────────────────

    async def recognize_images(
        self,
        images: list[str],
        question: str = "请详细描述这张图片的内容",
    ) -> str:
        """统一入口：识别图片内容

        Args:
            images: base64 data URL 列表
            question: 问题

        Returns:
            识别结果文本
        """
        backend = self._detect_backend()
        if not backend:
            raise RuntimeError("视觉模型未配置")

        if backend == "xfyun_image":
            return await self.xfyun_recognize(images, question)
        elif backend == "openai_compat":
            messages = [
                {"role": "user", "content": [
                    {"type": "text", "text": question},
                    *[{"type": "image_url", "image_url": {"url": img}} for img in images[:4]],
                ]},
            ]
            return await self.openai_compat_chat(messages)
        elif backend == "spark_rest":
            messages = [
                {"role": "user", "content": [
                    {"type": "text", "text": question},
                    *[{"type": "image_url", "image_url": {"url": img}} for img in images[:4]],
                ]},
            ]
            return await self.spark_rest_chat(messages)
        else:
            raise RuntimeError(f"未知后端: {backend}")


# 单例
vision_service = VisionService()
