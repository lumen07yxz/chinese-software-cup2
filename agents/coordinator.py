"""资源生成多智能体协调器 —— 真正的多 Agent 编排逻辑

使用 Coordinator 模式替代 CrewAI 执行引擎（CrewAI 不支持 SSE 流式输出且
与星火 API 认证格式不兼容）。本模块从 agents/resource_agents/*.py 中导入
Agent 角色定义作为 prompt 构建源，实现顺序编排：
  Orchestrator (需求分析)
    → 专业 Agent (内容生成)
    → 合并输出
"""

import json
import asyncio
import logging
from typing import AsyncGenerator

from services.spark_service import spark_service
from services.rag_service import rag_service
from services.web_search_service import web_search_service
from services.safety_service import (
    check_safety,
    llm_safety_check,
    llm_hallucination_check,
    add_hallucination_disclaimer,
)
from prompts import (
    ORCHESTRATOR_ROLE,
    ORCHESTRATOR_GOAL,
    DOC_AGENT_ROLE,
    DOC_AGENT_GOAL,
    MINDMAP_AGENT_ROLE,
    MINDMAP_AGENT_GOAL,
    QUIZ_AGENT_ROLE,
    QUIZ_AGENT_GOAL,
    VIDEO_AGENT_ROLE,
    VIDEO_AGENT_GOAL,
    CODE_AGENT_ROLE,
    CODE_AGENT_GOAL,
)

logger = logging.getLogger(__name__)


# Agent 配置注册表 —— 基于 resource_type 分发到对应专业 Agent
AGENT_REGISTRY = {
    "doc": {
        "key": "doc_agent",
        "name": "课程内容专家",
        "role": DOC_AGENT_ROLE,
        "goal": DOC_AGENT_GOAL,
    },
    "mindmap": {
        "key": "mindmap_agent",
        "name": "知识架构师",
        "role": MINDMAP_AGENT_ROLE,
        "goal": MINDMAP_AGENT_GOAL,
    },
    "quiz": {
        "key": "quiz_agent",
        "name": "题库设计专家",
        "role": QUIZ_AGENT_ROLE,
        "goal": QUIZ_AGENT_GOAL,
    },
    "video": {
        "key": "video_agent",
        "name": "多媒体教学编剧",
        "role": VIDEO_AGENT_ROLE,
        "goal": VIDEO_AGENT_GOAL,
    },
    "code": {
        "key": "code_agent",
        "name": "编程实践导师",
        "role": CODE_AGENT_ROLE,
        "goal": CODE_AGENT_GOAL,
    },
}

AGENT_LABELS = {
    "rag": ("检索助手", "📖"),
    "orchestrator": ("资源设计总监", "🎯"),
    "doc_agent": ("课程内容专家", "📄"),
    "mindmap_agent": ("知识架构师", "🧠"),
    "quiz_agent": ("题库设计专家", "✏️"),
    "video_agent": ("多媒体教学编剧", "🎬"),
    "code_agent": ("编程实践导师", "💻"),
    "safety_checker": ("安全审查员", "🛡️"),
}


class ResourceCoordinator:
    """多智能体资源生成协调器。

    使用 Agent 角色定义编排协作流程，每个 Agent 独立调用 spark_service，
    通过 yield 事件让 API 路由能实时 SSE 推送。
    """

    def __init__(
        self,
        resource_type: str,
        topic: str,
        chapter: str = "",
        difficulty: float = 0.5,
        profile: dict | None = None,
        prefer_user_docs: bool = False,
        user_id: str = "",
    ):
        self.resource_type = resource_type
        self.topic = topic
        self.chapter = chapter
        self.profile = profile or {}
        self.prefer_user_docs = prefer_user_docs
        self.user_id = user_id
        # 自适应难度：优先使用算法计算值，前端传入的 difficulty 作为候选
        self.difficulty = self._compute_adaptive_difficulty(difficulty)
        self.agent_config = AGENT_REGISTRY.get(resource_type)
        if not self.agent_config:
            self.agent_config = AGENT_REGISTRY["doc"]

    def _compute_adaptive_difficulty(self, fallback: float) -> float:
        """根据学生画像的 knowledge_base 自适应计算难度。

        规则：取 topic/chapter 相关领域的平均掌握度，掌握度越低→难度越低
        （避免打击初学者），掌握度越高→难度越高（挑战提升）。
        """
        kb = self.profile.get("knowledge_base", {})
        if not kb:
            return fallback

        # 匹配相关领域
        scores = []
        search_key = (self.chapter + self.topic).lower()
        for domain, score in kb.items():
            if isinstance(score, (int, float)):
                # 粗匹配：领域关键词在 search_key 中出现
                if any(w in search_key for w in domain.lower().split()):
                    scores.append(float(score))
                # 模糊匹配：search_key 中任一词在 domain 中出现
                elif any(kw in domain.lower() for kw in search_key.split()):
                    scores.append(float(score))

        if not scores:
            # 取全局平均
            numeric = [float(v) for v in kb.values() if isinstance(v, (int, float))]
            if numeric:
                avg_mastery = sum(numeric) / len(numeric)
                return max(0.2, min(0.9, 0.3 + avg_mastery * 0.6))

            return fallback

        avg_mastery = sum(scores) / len(scores)
        # 掌握度 1.0 → 难度 ~0.8（挑战版）
        # 掌握度 0.0 → 难度 ~0.2（入门版）
        return max(0.2, min(0.9, 0.2 + avg_mastery * 0.6))

    def _emit_status(self, agent_key: str, status: str, message: str) -> dict:
        """构造 agent_status SSE 事件数据"""
        label, icon = AGENT_LABELS.get(agent_key, (agent_key, "🤖"))
        return {
            "type": "agent_status",
            "data": {
                "agent": agent_key,
                "label": label,
                "icon": icon,
                "status": status,  # "working" | "done" | "error"
                "message": message,
            },
        }

    def _emit_text(self, content: str) -> dict:
        return {"type": "text", "content": content}

    async def generate(self) -> AsyncGenerator[str, None]:
        """编排多 Agent 协作，产出 SSE 事件字符串。"""
        full_output = ""
        self._safety_results: dict = {}  # 供 API 路由读取安全审查结果
        self._web_context = ""  # 联网搜索缓存

        try:
            # ── Step 1: RAG 检索（包装为 Agent 行为）──
            yield json.dumps(
                self._emit_status("rag", "working", "正在检索相关知识库..."),
                ensure_ascii=False,
            ) + "\n\n"
            await asyncio.sleep(0.1)

            context = ""
            user_doc_count = 0

            # 始终在课程知识库中检索（课程库搜索不走语义检索，用 chapter 直接过滤）
            if self.chapter:
                chapter_context = rag_service.get_chapter_context(self.chapter)
                if chapter_context:
                    context = chapter_context

            # 语义检索：同时在课程库和用户文档集合中搜索（来源不限章节）
            search_top_k = 20 if self.prefer_user_docs else 15
            search_results = rag_service.search(self.topic, top_k=search_top_k)

            # 星火知识库增强检索（如有已就绪的用户文档）
            spark_results = []
            try:
                from api.knowledge import _spark_vector_search_for_user
                spark_results = await _spark_vector_search_for_user(
                    self.user_id, self.topic, top_k=8
                )
                if spark_results:
                    logger.info("星火知识库检索命中 %d 条（用户=%s）", len(spark_results), self.user_id)
            except Exception as e:
                logger.warning("星火知识库检索异常: %s", e)

            # 合并：星火结果放前面（精度更高）
            if spark_results:
                search_results = spark_results + search_results

            # 兜底：如果本地+星火都没找到用户文档，直接从 DB 读取用户文档内容注入
            user_doc_count = sum(1 for r in search_results if r.get('source') in ('user_upload', 'spark_kb'))
            if user_doc_count == 0 and self.user_id:
                try:
                    fallback_docs = await _get_user_docs_fallback(self.user_id, self.topic, limit=5)
                    if fallback_docs:
                        search_results = fallback_docs + search_results
                        user_doc_count = len(fallback_docs)
                        logger.info("DB 兜底检索命中 %d 条用户文档", len(fallback_docs))
                except Exception as e:
                    logger.warning("DB 兜底检索异常: %s", e)

            course_doc_count = sum(1 for r in search_results if r.get('source') == 'course')
            spark_count = len(spark_results)

            # prefer_user_docs 模式：用户文档排最前面，数量更多
            referenced_doc_titles: list[str] = []
            if self.prefer_user_docs:
                user_results = [r for r in search_results if r.get('source') in ('user_upload', 'spark_kb')]
                course_results = [r for r in search_results if r.get('source') == 'course']
                search_results = user_results[:12] + course_results[:5]
                # 记录被引用的用户文档标题
                for r in user_results[:12]:
                    title = r.get('metadata', {}).get('title', '')
                    if title and title not in referenced_doc_titles:
                        referenced_doc_titles.append(title)

            search_text = "\n\n".join(
                [f"[{r.get('source', 'unknown')}|{r.get('chapter', '')}] {r.get('content', '')[:1200]}"
                 for r in search_results]
            )

            # 合并课程库章节上下文 + 语义检索结果
            if context and search_text:
                context = context + "\n\n---\n\n## 语义检索补充\n\n" + search_text
            elif search_text:
                context = search_text

            # Step 1.5: 联网搜索补充（始终执行，为资源生成提供最新信息）
            web_context = ""
            try:
                web_results = await web_search_service.search(self.topic, top_k=5)
                web_context = "\n\n".join([
                    f"[网络资料|{r.get('title', '')}] {r['snippet']}"
                    for r in web_results if r.get('snippet')
                ])[:3000]
            except Exception:
                pass
            self._web_context = web_context

            yield json.dumps(
                self._emit_status(
                    "rag",
                    "done",
                    f"检索完成：课程库 {course_doc_count} 条 + 用户文档 {user_doc_count} 条"
                    + (f" + 星火知识库 {spark_count} 条" if spark_count else "")
                    + (f" + 网络资料 {len(web_context)} 字符" if web_context else "")
                    + (f" [优先使用知识库]" if self.prefer_user_docs else ""),
                ),
                ensure_ascii=False,
            ) + "\n\n"
            await asyncio.sleep(0.05)

            # 发送被引用的用户文档列表（前端展示）
            if referenced_doc_titles:
                yield json.dumps({
                    "type": "user_docs_referenced",
                    "data": {"titles": referenced_doc_titles},
                }, ensure_ascii=False) + "\n\n"

            # ── Step 2: Orchestrator 分析需求 ──
            yield json.dumps(
                self._emit_status(
                    "orchestrator",
                    "working",
                    f"正在分析「{self.topic}」的资源需求...",
                ),
                ensure_ascii=False,
            ) + "\n\n"
            await asyncio.sleep(0.1)

            orchestrator_prompt = self._build_orchestrator_prompt(context)
            analysis = ""
            async for chunk in spark_service.chat_stream(
                [{"role": "user", "content": orchestrator_prompt}],
                max_tokens=2048,
            ):
                analysis += chunk
            # yield analysis text so user sees the orchestration plan
            yield json.dumps(
                self._emit_text(f"\n> **📋 Orchestrator 需求分析：** {analysis[:1000]}\n\n"),
                ensure_ascii=False,
            ) + "\n\n"
            await asyncio.sleep(0.05)

            yield json.dumps(
                self._emit_status("orchestrator", "done", "资源需求分析完成"),
                ensure_ascii=False,
            ) + "\n\n"
            await asyncio.sleep(0.05)

            # ── Step 3: 专业 Agent 生成资源（携带完整 orchestration 分析）──
            agent_key = self.agent_config["key"]
            agent_name = self.agent_config["name"]

            yield json.dumps(
                self._emit_status(
                    agent_key, "working", f"({agent_name}) 正在生成{self._type_label()}..."
                ),
                ensure_ascii=False,
            ) + "\n\n"
            await asyncio.sleep(0.1)

            agent_prompt = self._build_agent_prompt(context, analysis)
            async for chunk in spark_service.chat_stream(
                [{"role": "user", "content": agent_prompt}],
                max_tokens=8192,
            ):
                full_output += chunk
                yield json.dumps(self._emit_text(chunk), ensure_ascii=False) + "\n\n"
                await asyncio.sleep(0.01)

            yield json.dumps(
                self._emit_status(agent_key, "done", f"({agent_name}) 内容生成完成"),
                ensure_ascii=False,
            ) + "\n\n"
            await asyncio.sleep(0.05)

            # ── Step 4: 安全审查（正则 + LLM-as-judge 双层）──
            yield json.dumps(
                self._emit_status("safety_checker", "working", "正在进行正则安全扫描..."),
                ensure_ascii=False,
            ) + "\n\n"
            await asyncio.sleep(0.1)

            # 4-a: 正则快速扫描
            regex_result = check_safety(full_output)
            if not regex_result["safe"]:
                categories = ", ".join(f["category"] for f in regex_result["flags"])
                yield json.dumps(
                    self._emit_text(f"\n> ⚠️ 正则扫描发现敏感内容：{categories}\n\n"),
                    ensure_ascii=False,
                ) + "\n\n"

            # 4-b: LLM-as-judge 内容安全审查
            yield json.dumps(
                self._emit_status("safety_checker", "working", "正在进行 LLM 深度安全审查..."),
                ensure_ascii=False,
            ) + "\n\n"

            llm_safety = await llm_safety_check(full_output)
            if not llm_safety["safe"]:
                issues_str = "；".join(llm_safety["issues"][:3])
                yield json.dumps(
                    self._emit_text(
                        f"\n> ⚠️ LLM 安全审查（风险等级：{llm_safety['risk_level']}）：{issues_str}\n\n"
                    ),
                    ensure_ascii=False,
                ) + "\n\n"

            # 4-c: LLM-as-judge 幻觉检测
            yield json.dumps(
                self._emit_status("safety_checker", "working", "正在进行事实准确性核查..."),
                ensure_ascii=False,
            ) + "\n\n"

            hallucination = await llm_hallucination_check(full_output, context)
            if hallucination["has_hallucination"]:
                issues_str = "；".join(hallucination["issues"][:3])
                yield json.dumps(
                    self._emit_text(
                        f"\n> 🔍 事实核查发现潜在不准确内容（置信度 {hallucination['confidence']:.0%}）：{issues_str}\n\n"
                    ),
                    ensure_ascii=False,
                ) + "\n\n"

            yield json.dumps(
                self._emit_status("safety_checker", "done", "安全审查完成（正则 + LLM 双层）"),
                ensure_ascii=False,
            ) + "\n\n"

            # 保存安全审查结果供 API 路由使用（避免重复调用 LLM）
            self._safety_results = {
                "regex": regex_result,
                "llm_safety": llm_safety,
                "hallucination": hallucination,
            }

            # ── Step 5: 返回完整输出供存储 ──
            yield full_output

        except Exception as e:
            yield json.dumps(
                self._emit_status(self.agent_config["key"], "error", str(e)),
                ensure_ascii=False,
            ) + "\n\n"
            # 返回空内容让上层知道失败了（不 raise 避免双重报错）
            return

    def _type_label(self) -> str:
        labels = {
            "doc": "课程文档",
            "mindmap": "思维导图",
            "quiz": "练习题",
            "video": "视频脚本",
            "code": "实操案例",
        }
        return labels.get(self.resource_type, "学习资源")

    async def generate_two_stage(self) -> AsyncGenerator[str, None]:
        """两阶段管线：先出大纲（结构化 JSON），再逐项生成内容。

        SSE 事件类型：
          - agent_status: Agent 状态
          - outline: 大纲就绪（JSON）
          - section_start / section_end: 逐段生成
          - text: 流式文本内容
          - done: 完成（最后一轮是纯文本 full_output）
        """
        full_output = ""
        self._safety_results: dict = {}
        self._web_context = ""

        try:
            # ── Step 1: RAG 检索（同 generate）──
            yield json.dumps(
                self._emit_status("rag", "working", "正在检索相关知识库..."),
                ensure_ascii=False,
            ) + "\n\n"
            await asyncio.sleep(0.1)

            context = ""
            if self.chapter:
                chapter_context = rag_service.get_chapter_context(self.chapter)
                if chapter_context:
                    context = chapter_context

            search_results = rag_service.search(self.topic, top_k=10)
            user_doc_count = sum(1 for r in search_results if r.get('source') == 'user_upload')
            course_doc_count = sum(1 for r in search_results if r.get('source') == 'course')
            search_text = "\n\n".join(
                [f"[{r.get('source', 'unknown')}|{r.get('chapter', '')}] {r.get('content', '')[:800]}"
                 for r in search_results]
            )
            if context and search_text:
                context = context + "\n\n---\n\n## 语义检索补充\n\n" + search_text
            elif search_text:
                context = search_text

            try:
                web_results = await web_search_service.search(self.topic, top_k=5)
                self._web_context = "\n\n".join([
                    f"[网络资料|{r.get('title', '')}] {r['snippet']}"
                    for r in web_results if r.get('snippet')
                ])[:3000]
            except Exception:
                pass

            yield json.dumps(
                self._emit_status("rag", "done",
                    f"检索完成：课程库 {course_doc_count} 条 + 用户文档 {user_doc_count} 条"),
                ensure_ascii=False,
            ) + "\n\n"
            await asyncio.sleep(0.05)

            # ── Stage 1: 大纲生成 ──
            yield json.dumps(
                self._emit_status("orchestrator", "working", f"正在生成「{self.topic}」的内容大纲..."),
                ensure_ascii=False,
            ) + "\n\n"
            await asyncio.sleep(0.1)

            outline_prompt = f"""{ORCHESTRATOR_ROLE}

{ORCHESTRATOR_GOAL}

---
请为「{self.topic}」生成一份 {self._type_label()} 的内容大纲。

章节：{self.chapter or '（未指定）'}
难度：{self.difficulty}
学生画像：{json.dumps(self.profile, ensure_ascii=False, default=str)[:400]}

课程参考内容：
{context[:4000] if context else '暂无'}

请输出严格 JSON（不要 markdown 代码块标记）：
{{
  "title": "资源标题",
  "sections": [
    {{
      "id": "s1",
      "title": "小节标题",
      "type": "content|example|formula|summary",
      "key_points": ["要点1", "要点2"],
      "estimated_minutes": 5
    }}
  ]
}}

要求：
- 4-8 个 section
- 由浅入深，逻辑递进
- 每个 section 的 key_points 2-4 个
- type 标注该小节的性质（content=讲解，example=案例，formula=公式推导，summary=总结）"""

            outline_raw = ""
            async for chunk in spark_service.chat_stream(
                [{"role": "user", "content": outline_prompt}],
                max_tokens=2048,
            ):
                outline_raw += chunk
                await asyncio.sleep(0.01)

            outline = self._parse_json_from_llm(outline_raw)
            if not outline or "sections" not in outline:
                outline = {"title": self.topic, "sections": [
                    {"id": "s1", "title": f"{self.topic}概述", "type": "content",
                     "key_points": ["核心概念", "应用场景"], "estimated_minutes": 5},
                    {"id": "s2", "title": f"{self.topic}详解", "type": "content",
                     "key_points": ["原理分析", "关键方法"], "estimated_minutes": 8},
                    {"id": "s3", "title": "示例与应用", "type": "example",
                     "key_points": ["实际案例", "代码演示"], "estimated_minutes": 5},
                    {"id": "s4", "title": "总结与回顾", "type": "summary",
                     "key_points": ["核心要点", "易错点"], "estimated_minutes": 3},
                ]}

            yield json.dumps(
                self._emit_status("orchestrator", "done", f"大纲生成完成：{len(outline['sections'])} 个小节"),
                ensure_ascii=False,
            ) + "\n\n"

            # 发送大纲事件（前端可渲染大纲预览）
            yield json.dumps({
                "type": "outline",
                "data": outline,
            }, ensure_ascii=False) + "\n\n"
            await asyncio.sleep(0.05)

            # ── Stage 2: 逐项内容生成 ──
            agent_key = self.agent_config["key"]
            agent_name = self.agent_config["name"]
            sections = outline.get("sections", [])

            for i, section in enumerate(sections):
                sid = section.get("id", f"s{i+1}")
                stitle = section.get("title", f"第{i+1}节")

                yield json.dumps({
                    "type": "section_start",
                    "section_id": sid,
                    "title": stitle,
                    "index": i,
                    "total": len(sections),
                }, ensure_ascii=False) + "\n\n"

                yield json.dumps(
                    self._emit_status(agent_key, "working", f"({agent_name}) 正在生成：{stitle}"),
                    ensure_ascii=False,
                ) + "\n\n"

                section_prompt = self._build_section_prompt(section, context)
                section_output = ""
                async for chunk in spark_service.chat_stream(
                    [{"role": "user", "content": section_prompt}],
                    max_tokens=4096,
                ):
                    section_output += chunk
                    full_output += chunk
                    yield json.dumps(self._emit_text(chunk), ensure_ascii=False) + "\n\n"
                    await asyncio.sleep(0.01)

                yield json.dumps({
                    "type": "section_end",
                    "section_id": sid,
                    "content_preview": section_output[:200],
                }, ensure_ascii=False) + "\n\n"
                await asyncio.sleep(0.05)

            yield json.dumps(
                self._emit_status(agent_key, "done", f"({agent_name}) 全部 {len(sections)} 个小节生成完成"),
                ensure_ascii=False,
            ) + "\n\n"

            # ── Step 4: 安全审查 ──
            yield json.dumps(
                self._emit_status("safety_checker", "working", "正在进行安全审查..."),
                ensure_ascii=False,
            ) + "\n\n"
            await asyncio.sleep(0.1)

            regex_result = check_safety(full_output)
            llm_safety = await llm_safety_check(full_output[:2000])
            hallucination = await llm_hallucination_check(full_output[:2000], context[:1500])

            if not regex_result["safe"]:
                cats = ", ".join(f["category"] for f in regex_result["flags"])
                yield json.dumps(self._emit_text(f"\n> ⚠️ 正则扫描发现敏感内容：{cats}\n\n"), ensure_ascii=False) + "\n\n"
            if not llm_safety["safe"]:
                issues = "；".join(llm_safety["issues"][:3])
                yield json.dumps(self._emit_text(f"\n> ⚠️ LLM 安全审查：{issues}\n\n"), ensure_ascii=False) + "\n\n"
            if hallucination.get("has_hallucination"):
                issues = "；".join(hallucination["issues"][:3])
                yield json.dumps(self._emit_text(f"\n> 🔍 事实核查：{issues}\n\n"), ensure_ascii=False) + "\n\n"

            yield json.dumps(
                self._emit_status("safety_checker", "done", "安全审查完成"),
                ensure_ascii=False,
            ) + "\n\n"

            self._safety_results = {
                "regex": regex_result,
                "llm_safety": llm_safety,
                "hallucination": hallucination,
            }

            # ── 返回完整输出 ──
            yield full_output

        except Exception as e:
            yield json.dumps(
                self._emit_status(self.agent_config["key"], "error", str(e)),
                ensure_ascii=False,
            ) + "\n\n"
            return

    def _build_section_prompt(self, section: dict, context: str) -> str:
        """为单个大纲小节构建内容生成 prompt"""
        agent = self.agent_config
        stitle = section.get("title", "内容")
        key_points = section.get("key_points", [])
        section_type = section.get("type", "content")

        type_instructions = {
            "content": "请详细讲解核心概念，由浅入深。每个概念要包含：直觉解释（100字以上）→ 形式化定义 → 具体例子。支持 Mermaid 图解和 LaTeX 公式推导。输出 400-800 字。",
            "example": "请给出 2-3 个具体的、贴近实际的案例分析。每个案例包含：背景描述 → 分步骤分析过程 → 结果解读。如有代码请给出完整可运行的示例。输出 400-800 字。",
            "formula": "请给出清晰的数学推导过程，每一步都有直觉解释（为什么要做这步变换）。推导完后给出 1-2 个应用示例。输出 300-600 字。",
            "summary": "请精炼总结核心要点，每条 2-3 句话（不只是标题）。附带：关键公式速查表、易错点清单、记忆口诀。输出 300-500 字。",
        }

        return f"""{agent['role']}

{agent['goal']}

---
### 本次任务：生成「{stitle}」的内容

**所属主题**：{self.topic}
**章节**：{self.chapter or '（未指定）'}
**难度**：{self.difficulty}
**小节类型**：{section_type}
**需要覆盖的要点**：{', '.join(key_points) if key_points else '（自由发挥）'}

**要求**：{type_instructions.get(section_type, type_instructions['content'])}

**课程参考内容**：
{context[:4000] if context else '暂无'}

**学生画像**：{json.dumps(self.profile, ensure_ascii=False, default=str)[:400]}

请生成完整的 Markdown 内容，使用 LaTeX 公式（$...$ 或 $$...$$），支持 Mermaid 图解。
不要引用外部图片链接。"""

    @staticmethod
    def _parse_json_from_llm(raw: str):
        """从 LLM 输出中提取 JSON"""
        import re as _re
        raw = raw.strip()
        m = _re.search(r'```(?:json)?\s*\n([\s\S]*?)```', raw)
        if m:
            raw = m.group(1).strip()
        elif raw.startswith("```"):
            lines = raw.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            raw = "\n".join(lines).strip()
        start = raw.find("{")
        end = raw.rfind("}")
        if start != -1 and end != -1:
            try:
                return json.loads(raw[start:end + 1])
            except json.JSONDecodeError:
                pass
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return None
        labels = {
            "doc": "课程文档",
            "mindmap": "思维导图",
            "quiz": "练习题",
            "video": "视频脚本",
            "code": "实操案例",
        }
        return labels.get(self.resource_type, "学习资源")

    def _build_orchestrator_prompt(self, context: str) -> str:
        """使用 Orchestrator Agent 的角色定义构建需求分析 prompt"""
        has_user_docs = bool(context and ("[user_upload|" in context or "[spark_kb|" in context or "[user_db_fallback|" in context))
        doc_label = "参考资料（含用户知识库文档，请重点参考）" if has_user_docs else "课程参考内容"
        user_doc_instruction = (
            "\n**重要：参考资料中包含用户个人知识库的内容"
            "（标注为 [user_upload|标题] 或 [spark_kb|标题] 或 [user_db_fallback|标题]）。"
            "这些是学生自己整理的学习资料，请在需求分析中重点考虑如何将这些资料"
            "融入到生成的资源中，使资源与学生已有的知识体系产生关联。**\n"
            if has_user_docs else ""
        )
        return f"""{ORCHESTRATOR_ROLE}

{ORCHESTRATOR_GOAL}

---
### 任务

请为以下知识点进行需求分析，确定「{self._type_label()}」的生成重点：

**知识点**：{self.topic}
**章节**：{self.chapter or "（未指定）"}
**难度**：{self.difficulty}
**学生画像摘要**：{json.dumps(self.profile, ensure_ascii=False, default=str)[:500]}

**{doc_label}**：
{context[:5000] if context else "（无）"}
{user_doc_instruction}

**网络补充资料**：
{self._web_context[:3000] if hasattr(self, '_web_context') and self._web_context else "（无）"}

请输出：
1. 该知识点的核心重点
2. 学生可能的理解难点
3. 生成该资源时应侧重的内容方向
4. 建议的讲解深度和风格"""

    def _build_agent_prompt(self, context: str, analysis: str) -> str:
        """使用专业 Agent 的角色定义构建内容生成 prompt"""
        agent = self.agent_config
        has_user_docs = bool(context and ("[user_upload|" in context or "[spark_kb|" in context or "[user_db_fallback|" in context))
        doc_label = "参考资料（含用户知识库，请优先参考用户资料）" if has_user_docs else "课程参考资料"
        user_doc_instruction = (
            "\n**关键要求：参考资料中包含用户个人知识库文档"
            "（标注为 [user_upload|标题] 或 [spark_kb|标题] 或 [user_db_fallback|标题]）。"
            "你必须在生成内容中积极引用和整合这些用户资料，"
            "使生成的学习资源与用户已有的学习笔记/文档产生关联。"
            "在内容中适当位置标注引用来源（如\"根据你的笔记...\"或\"参考你的文档...\"）。**\n"
            if has_user_docs else ""
        )
        prompt = f"""{agent['role']}

{agent['goal']}

---
### 任务

**知识点**：{self.topic}
**章节**：{self.chapter or "（未指定）"}
**难度**：{self.difficulty}
**学生画像摘要**：{json.dumps(self.profile, ensure_ascii=False, default=str)[:500]}
{user_doc_instruction}
**需求分析结论（完整）**：
{analysis[:2000]}

**{doc_label}**：
{context[:5000] if context else "（无）"}

**网络补充资料（最新信息）**：
{self._web_context[:3000] if self._web_context else "（无）"}

请严格按照你的角色定位生成高质量的{self._type_label()}。使用 Markdown 格式输出，支持 LaTeX 公式（$...$ 或 $$...$$）。

**内容深度要求**：
- 输出 **1500-3000 字** 的详细内容，不要只写提纲或列表
- 每个概念都要有：直觉解释 → 形式化定义 → 例子/应用 三层展开
- 数学公式逐步推导，每步附文字说明
- 至少 2 个 Mermaid 图表（流程图/架构图/对比表）
- 至少 2 个具体例子或类比
- 列出 2-3 个常见误区
"""
        # quiz 类型追加 JSON 输出模板（不能用 f-string 内嵌，{} 会冲突）
        if self.resource_type == "quiz":
            prompt += """**请输出以下 JSON 数组格式（不要用 Markdown 列表），每题一个对象：**
```json
[
  {
    "question": "题目内容",
    "options": ["A. 选项1", "B. 选项2", "C. 选项3", "D. 选项4"],
    "correct": 0,
    "explanation": "解析说明"
  }
]
```
**注意：不要省略 JSON 代码块标记 ```json 和 ```**
"""
            # AI 搜索出题模式：额外提示
            if not self.chapter:
                prompt += "**本次为自由知识点出题，请结合课程资料和网络资料，生成 5-10 道覆盖该知识点核心概念的练习题，从基础概念到进阶应用逐步递进。**\n"
        prompt += "**注意：不要引用外部图片链接（如图床、CDN），如需配图请使用表格、ASCII 图表或文字描述代替。**\n"
        return prompt
