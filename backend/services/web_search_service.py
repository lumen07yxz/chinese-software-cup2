"""网页搜索与内容获取服务

核心策略变更：不再用正则解析搜索引擎 HTML（不可靠），改为：
1. DuckDuckGo API（海外可用）
2. Bing 搜索（国内可用，返回标题+URL）
3. 直接抓取搜索结果页面的正文内容（可靠）
4. 百度百科（中文知识类查询兜底）
"""

import logging
import re
import httpx

logger = logging.getLogger(__name__)


class WebSearchService:
    SEARCH_TIMEOUT = 12.0
    FETCH_TIMEOUT = 8.0
    USER_AGENT = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    )
    HEADERS = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }

    async def search(self, query: str, top_k: int = 5) -> list[dict]:
        """搜索网页，返回带正文摘要的结果。

        Returns:
            [{"title": str, "snippet": str, "url": str}, ...]
        """
        # 第一级：Bing 搜索获取真实 URL（国内稳定）
        results = await self._search_bing_get_urls(query, top_k)
        if results:
            # 第二步：逐个抓取页面正文内容
            enriched = await self._fetch_page_contents(results, max_pages=top_k)
            return enriched

        # 第二级：DuckDuckGo API（海外可用）
        results = await self._search_duckduckgo(query, top_k)
        if results:
            enriched = await self._fetch_page_contents(results, max_pages=min(3, top_k))
            return enriched

        # 第三级：百度百科兜底（中文知识查询）
        results = await self._search_baike(query, top_k)
        if results:
            return results

        logger.info("所有搜索后端均不可用")
        return []

    # ── Bing 搜索：只提取标题和 URL ─────────────────────────────────

    async def _search_bing_get_urls(self, query: str, top_k: int) -> list[dict]:
        """Bing 搜索 — 提取标题和 URL，尝试多个 Bing 端点"""
        if not query.strip():
            return []

        # 尝试多个 Bing 端点
        endpoints = [
            "https://cn.bing.com/search",
            "https://www.bing.com/search",
        ]

        for endpoint in endpoints:
            results = await self._bing_fetch(endpoint, query, top_k)
            if results:
                return results
        return []

    async def _bing_fetch(self, endpoint: str, query: str, top_k: int) -> list[dict]:
        """单个 Bing 端点的搜索实现"""
        try:
            async with httpx.AsyncClient(
                timeout=self.SEARCH_TIMEOUT, follow_redirects=True
            ) as client:
                resp = await client.get(
                    endpoint,
                    params={"q": query, "count": max(top_k * 3, 15), "setlang": "zh-CN"},
                    headers=self.HEADERS,
                )
                resp.raise_for_status()
                html = resp.text

            # 至少要有一定长度的 HTML 才算有效响应
            if len(html) < 500:
                logger.debug("Bing 响应过短 (%d bytes)，可能被拦截", len(html))
                return []

            results = []
            # 提取搜索结果链接 — 多种模式
            link_patterns = [
                # 模式1: h2 > a（标准搜索结果标题）
                r'<h2[^>]*>\s*<a[^>]*href="(https?://[^"]+)"[^>]*>(.*?)</a>',
                # 模式2: b_algo 块内的链接
                r'<li class="b_algo"[^>]*>.*?<a[^>]*href="(https?://[^"]+)"[^>]*>(.*?)</a>',
            ]

            skip_domains = {
                "bing.com", "microsoft.com", "msn.com",
                "go.microsoft.com", "www.bing.com", "cn.bing.com",
            }

            seen_urls = set()
            for pattern in link_patterns:
                links = re.findall(pattern, html, re.DOTALL)
                for url, title_html in links:
                    if url in seen_urls:
                        continue
                    seen_urls.add(url)
                    if any(d in url for d in skip_domains):
                        continue
                    if url.startswith("javascript:"):
                        continue
                    title = re.sub(r'<[^>]+>', '', title_html).strip()
                    if title and len(title) > 3:
                        results.append({"title": title[:100], "snippet": "", "url": url})
                    if len(results) >= top_k:
                        break
                if len(results) >= top_k:
                    break

            if results:
                logger.debug("Bing(%s) 提取到 %d 个链接", endpoint, len(results))
            return results

        except httpx.TimeoutException:
            logger.debug("Bing(%s) 超时", endpoint)
        except httpx.HTTPStatusError as e:
            logger.debug("Bing(%s) HTTP %s", endpoint, e.response.status_code)
        except Exception as e:
            logger.debug("Bing(%s) 异常: %s", endpoint, e)
        return []

    # ── 抓取网页正文内容 ────────────────────────────────────────────

    async def _fetch_page_contents(self, results: list[dict], max_pages: int = 3) -> list[dict]:
        """逐个抓取搜索结果页面，提取正文文本"""
        import asyncio

        async def fetch_one(client: httpx.AsyncClient, result: dict) -> dict:
            url = result.get("url", "")
            if not url:
                return result
            try:
                resp = await client.get(url, headers=self.HEADERS, follow_redirects=True)
                resp.raise_for_status()
                content_type = resp.headers.get("content-type", "")
                if "text/html" not in content_type and "text/plain" not in content_type:
                    return result
                text = self._extract_text_from_html(resp.text)
                if text and len(text) > 50:
                    result["snippet"] = text[:1500]
                return result
            except Exception as e:
                logger.debug("抓取 %s 失败: %s", url[:50], e)
                return result

        # 并发抓取前 max_pages 个页面
        async with httpx.AsyncClient(timeout=self.FETCH_TIMEOUT, follow_redirects=True) as client:
            tasks = [fetch_one(client, r) for r in results[:max_pages]]
            fetched = await asyncio.gather(*tasks, return_exceptions=True)
            enriched = []
            for i, r in enumerate(fetched):
                if isinstance(r, Exception):
                    enriched.append(results[i])
                else:
                    enriched.append(r)
            # 追加未抓取的结果
            enriched.extend(results[max_pages:])
        return enriched

    def _extract_text_from_html(self, html: str) -> str:
        """从 HTML 提取正文文本（去除 script/style/nav/footer 等噪音）"""
        # 1. 移除 script / style / nav / footer / header 等非正文标签
        html = re.sub(r'<(script|style|nav|footer|header|aside|noscript)[^>]*>.*?</\1>', '', html, flags=re.DOTALL | re.IGNORECASE)
        # 移除 HTML 注释
        html = re.sub(r'<!--.*?-->', '', html, flags=re.DOTALL)
        # 移除所有标签
        text = re.sub(r'<[^>]+>', ' ', html)
        # 2. 清理空白
        text = re.sub(r'\s+', ' ', text).strip()
        # 3. 去重：连续重复的句子（很多网页有隐藏的重复水印文字）
        sentences = text.split('。')
        seen = set()
        unique = []
        for s in sentences:
            s = s.strip()
            if s and len(s) > 5 and s not in seen:
                seen.add(s)
                unique.append(s)
        text = '。'.join(unique)
        # 4. 限制长度
        return text[:2000]

    # ── DuckDuckGo API ──────────────────────────────────────────────

    async def _search_duckduckgo(self, query: str, top_k: int) -> list[dict]:
        """DuckDuckGo Instant Answer API"""
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
                    "snippet": abstract[:1500],
                    "url": data.get("AbstractURL", ""),
                })

            for item in data.get("RelatedTopics", [])[:top_k]:
                if "Text" in item:
                    results.append({
                        "title": item["Text"].split(" - ")[0][:80],
                        "snippet": item["Text"][:1500],
                        "url": item.get("FirstURL", ""),
                    })
                elif "Topics" in item:
                    for sub in item["Topics"][:3]:
                        if "Text" in sub:
                            results.append({
                                "title": sub["Text"].split(" - ")[0][:80],
                                "snippet": sub["Text"][:1500],
                                "url": sub.get("FirstURL", ""),
                            })

            return results[:top_k]

        except httpx.TimeoutException:
            logger.debug("DuckDuckGo API 超时")
        except httpx.HTTPStatusError as e:
            logger.debug("DuckDuckGo API HTTP %s", e.response.status_code)
        except Exception as e:
            logger.debug("DuckDuckGo API 异常: %s", e)
        return []

    # ── 百度百科兜底 ────────────────────────────────────────────────

    async def _search_baike(self, query: str, top_k: int) -> list[dict]:
        """百度百科 API — 中文知识类查询的稳定兜底"""
        if not query.strip():
            return []
        try:
            async with httpx.AsyncClient(timeout=self.SEARCH_TIMEOUT, follow_redirects=True) as client:
                # 百度百科 Open API
                resp = await client.get(
                    "https://baike.baidu.com/api/openapi/BaikeLemmaCardApi",
                    params={
                        "scope": "103",
                        "format": "json",
                        "appid": "379020",
                        "bk_key": query,
                        "bk_length": "600",
                    },
                    headers={"User-Agent": self.USER_AGENT},
                )
                data = resp.json()

            abstract = data.get("abstract", "")
            title = data.get("title", "")
            url = data.get("url", "")

            if abstract and len(abstract) > 30:
                return [{
                    "title": title or query,
                    "snippet": abstract[:2000],
                    "url": url or f"https://baike.baidu.com/item/{query}",
                }]

            # 如果 Open API 失败，尝试直接抓取百科页面
            return await self._fetch_baike_page(query)

        except Exception as e:
            logger.debug("百度百科 API 异常: %s", e)
            return await self._fetch_baike_page(query)

    async def _fetch_baike_page(self, query: str) -> list[dict]:
        """直接抓取百度百科搜索页面"""
        try:
            async with httpx.AsyncClient(timeout=self.SEARCH_TIMEOUT, follow_redirects=True) as client:
                resp = await client.get(
                    f"https://baike.baidu.com/item/{query}",
                    headers=self.HEADERS,
                )
                text = self._extract_text_from_html(resp.text)
                if text and len(text) > 50:
                    return [{
                        "title": query,
                        "snippet": text[:2000],
                        "url": f"https://baike.baidu.com/item/{query}",
                    }]
        except Exception as e:
            logger.debug("百度百科页面抓取异常: %s", e)
        return []


web_search_service = WebSearchService()
