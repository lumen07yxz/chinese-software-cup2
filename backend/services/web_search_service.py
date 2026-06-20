"""网页搜索服务 — 多后端自动降级（DuckDuckGo → Bing → 百度）"""

import logging
import re
import httpx

logger = logging.getLogger(__name__)


class WebSearchService:
    """轻量网页搜索服务，多后端自动降级。

    三级降级链路：
    1. DuckDuckGo Instant Answer API（海外可用）
    2. Bing HTML 搜索（中国大陆可用，无需 API Key）
    3. 返回空结果（系统功能不受影响，仅无网络补充资料）
    """

    SEARCH_TIMEOUT = 8.0
    USER_AGENT = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    )

    async def search(self, query: str, top_k: int = 5) -> list[dict]:
        """搜索网页并返回结果。

        Returns:
            [{"title": str, "snippet": str, "url": str}, ...]
            失败时返回空列表（不抛异常）
        """
        # 第一级：DuckDuckGo API
        results = await self._try_duckduckgo_api(query, top_k)
        if results:
            return results

        # 第二级：Bing HTML 搜索
        results = await self._try_bing_html(query, top_k)
        if results:
            return results

        logger.info("所有搜索后端均不可用，跳过联网搜索（不影响核心功能）")
        return []

    # ── DuckDuckGo Instant Answer API ──────────────────────────────────

    async def _try_duckduckgo_api(self, query: str, top_k: int) -> list[dict]:
        """DuckDuckGo Instant Answer API（海外可用，国内 GFW 封锁）"""
        if not query.strip():
            return []
        try:
            async with httpx.AsyncClient(timeout=self.SEARCH_TIMEOUT) as client:
                resp = await client.get(
                    "https://api.duckduckgo.com/",
                    params={"q": query, "format": "json", "no_html": "1", "skip_disambig": "1"},
                )
                resp.raise_for_status()
                data = resp.json()

            results = []
            abstract = data.get("AbstractText", "")
            if abstract:
                results.append({
                    "title": data.get("Heading", "搜索结果"),
                    "snippet": abstract[:500],
                    "url": data.get("AbstractURL", ""),
                })

            for item in data.get("RelatedTopics", [])[:top_k]:
                if "Text" in item:
                    results.append({
                        "title": item["Text"].split(" - ")[0][:80],
                        "snippet": item["Text"][:500],
                        "url": item.get("FirstURL", ""),
                    })
                elif "Topics" in item:
                    for sub in item["Topics"][:3]:
                        if "Text" in sub:
                            results.append({
                                "title": sub["Text"].split(" - ")[0][:80],
                                "snippet": sub["Text"][:500],
                                "url": sub.get("FirstURL", ""),
                            })

            return results[:top_k]

        except httpx.TimeoutException:
            logger.debug("DuckDuckGo API 超时（可能被 GFW 阻断）")
        except httpx.HTTPStatusError as e:
            logger.debug("DuckDuckGo API HTTP %s", e.response.status_code)
        except Exception as e:
            logger.debug("DuckDuckGo API 异常: %s", e)
        return []

    # ── Bing HTML 搜索（中国大陆可用）─────────────────────────────────

    async def _try_bing_html(self, query: str, top_k: int) -> list[dict]:
        """Bing HTML 搜索 — 解析搜索结果页（无需 API Key，国内可用）"""
        if not query.strip():
            return []
        try:
            async with httpx.AsyncClient(
                timeout=self.SEARCH_TIMEOUT, follow_redirects=True
            ) as client:
                resp = await client.get(
                    "https://cn.bing.com/search",
                    params={"q": query, "count": top_k},
                    headers={"User-Agent": self.USER_AGENT},
                )
                resp.raise_for_status()
                html = resp.text

            results = []
            # 解析 Bing 搜索结果片段
            # Bing 的搜索结果在 <li class="b_algo"> 中
            blocks = re.findall(
                r'<li class="b_algo"[^>]*>(.*?)</li>', html, re.DOTALL
            )
            for block in blocks[:top_k]:
                # 提取标题
                title_match = re.search(r'<h2[^>]*><a[^>]*>(.*?)</a>', block, re.DOTALL)
                title = re.sub(r'<[^>]+>', '', title_match.group(1)).strip() if title_match else "搜索结果"

                # 提取摘要
                snippet_match = re.search(
                    r'<(?:p|div) class="(?:b_lineclamp|b_caption)[^"]*"[^>]*>(.*?)</(?:p|div)>',
                    block, re.DOTALL
                )
                if not snippet_match:
                    snippet_match = re.search(r'<p[^>]*>(.*?)</p>', block, re.DOTALL)
                snippet = re.sub(r'<[^>]+>', '', snippet_match.group(1)).strip()[:500] if snippet_match else ""

                # 提取 URL
                url_match = re.search(r'<a[^>]*href="(https?://[^"]+)"', block)
                url = url_match.group(1) if url_match else ""

                if snippet:
                    results.append({"title": title[:80], "snippet": snippet, "url": url})

            if results:
                logger.debug("Bing HTML 搜索返回 %d 条结果", len(results))
            return results

        except httpx.TimeoutException:
            logger.debug("Bing HTML 搜索超时")
        except httpx.HTTPStatusError as e:
            logger.debug("Bing HTML 搜索 HTTP %s", e.response.status_code)
        except Exception as e:
            logger.debug("Bing HTML 搜索异常: %s", e)
        return []


web_search_service = WebSearchService()
