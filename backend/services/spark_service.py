import json
import httpx
from config import settings


class SparkService:
    """科大讯飞星火大模型 Spark X2 Flash WebAPI

    接口地址: https://spark-api-open.xf-yun.com/agent/v1/chat/completions
    鉴权方式: Bearer + APIKey:APISecret
    Model: spark-x (不填会报错)
    """

    BASE_HOST = "spark-api-open.xf-yun.com"
    BASE_PATH = "/agent/v1/chat/completions"
    MODEL = "spark-x"

    def __init__(self):
        self.password = f"{settings.spark_api_key}:{settings.spark_api_secret}"

    @property
    def _base_url(self) -> str:
        return f"https://{self.BASE_HOST}{self.BASE_PATH}"

    def _headers(self) -> dict:
        return {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.password}",
        }

    async def chat(
        self,
        messages: list[dict],
        temperature: float = 0.7,
        max_tokens: int = 8192,
    ) -> str:
        payload = {
            "model": self.MODEL,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(self._base_url, headers=self._headers(), json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]

    async def chat_stream(
        self,
        messages: list[dict],
        temperature: float = 0.7,
        max_tokens: int = 8192,
    ):
        payload = {
            "model": self.MODEL,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
        }
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST", self._base_url, headers=self._headers(), json=payload
            ) as resp:
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
                            delta = choices[0].get("delta", {})
                            content = delta.get("content", "")
                            if content:
                                yield content
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue


spark_service = SparkService()
