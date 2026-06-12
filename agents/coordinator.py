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
from typing import AsyncGenerator

from services.spark_service import spark_service
from services.rag_service import rag_service
from services.safety_service import (
    check_safety,
    llm_safety_check,
    llm_hallucination_check,
    add_hallucination_disclaimer,
)
from agents.resource_agents.orchestrator import (
    ORCHESTRATOR_ROLE,
    ORCHESTRATOR_GOAL,
)
from agents.resource_agents.doc_agent import DOC_AGENT_ROLE, DOC_AGENT_GOAL
from agents.resource_agents.mindmap_agent import MINDMAP_AGENT_ROLE, MINDMAP_AGENT_GOAL
from agents.resource_agents.quiz_agent import QUIZ_AGENT_ROLE, QUIZ_AGENT_GOAL
from agents.resource_agents.video_agent import VIDEO_AGENT_ROLE, VIDEO_AGENT_GOAL
from agents.resource_agents.code_agent import CODE_AGENT_ROLE, CODE_AGENT_GOAL


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
    ):
        self.resource_type = resource_type
        self.topic = topic
        self.chapter = chapter
        self.difficulty = difficulty
        self.profile = profile or {}
        self.agent_config = AGENT_REGISTRY.get(resource_type)
        if not self.agent_config:
            # 默认用 doc_agent
            self.agent_config = AGENT_REGISTRY["doc"]

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

        try:
            # ── Step 1: RAG 检索（包装为 Agent 行为）──
            yield json.dumps(
                self._emit_status("rag", "working", "正在检索相关知识库..."),
                ensure_ascii=False,
            ) + "\n\n"
            await asyncio.sleep(0.1)

            context = ""
            if self.chapter:
                context = rag_service.get_chapter_context(self.chapter)
            if not context:
                results = rag_service.search(self.topic, top_k=5)
                context = "\n\n".join([r.get("content", "")[:500] for r in results])

            yield json.dumps(
                self._emit_status(
                    "rag",
                    "done",
                    f"检索完成，找到 {len(context)} 字符的相关内容",
                ),
                ensure_ascii=False,
            ) + "\n\n"
            await asyncio.sleep(0.05)

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
                max_tokens=1024,
            ):
                analysis += chunk
            # yield analysis text so user sees the orchestration plan
            yield json.dumps(
                self._emit_text(f"\n> **需求分析：** {analysis[:300]}...\n\n"),
                ensure_ascii=False,
            ) + "\n\n"
            await asyncio.sleep(0.05)

            yield json.dumps(
                self._emit_status("orchestrator", "done", "资源需求分析完成"),
                ensure_ascii=False,
            ) + "\n\n"
            await asyncio.sleep(0.05)

            # ── Step 3: 专业 Agent 生成资源 ──
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
                max_tokens=4096,
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
            raise

    def _type_label(self) -> str:
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
        return f"""{ORCHESTRATOR_ROLE}

{ORCHESTRATOR_GOAL}

---
### 任务

请为以下知识点进行需求分析，确定「{self._type_label()}」的生成重点：

**知识点**：{self.topic}
**章节**：{self.chapter or "（未指定）"}
**难度**：{self.difficulty}
**学生画像摘要**：{json.dumps(self.profile, ensure_ascii=False, default=str)[:500]}

**课程参考内容**：
{context[:1500] if context else "（无）"}

请输出：
1. 该知识点的核心重点
2. 学生可能的理解难点
3. 生成该资源时应侧重的内容方向
4. 建议的讲解深度和风格"""

    def _build_agent_prompt(self, context: str, analysis: str) -> str:
        """使用专业 Agent 的角色定义构建内容生成 prompt"""
        agent = self.agent_config
        return f"""{agent['role']}

{agent['goal']}

---
### 任务

**知识点**：{self.topic}
**章节**：{self.chapter or "（未指定）"}
**难度**：{self.difficulty}
**学生画像摘要**：{json.dumps(self.profile, ensure_ascii=False, default=str)[:500]}

**需求分析结论**：
{analysis[:500]}

**课程参考资料**：
{context[:2000] if context else "（无）"}

请严格按照你的角色定位生成高质量的{self._type_label()}。使用 Markdown 格式输出，支持 LaTeX 公式（$...$ 或 $$...$$）。
"""
