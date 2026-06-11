"""思维导图 Agent —— 生成知识结构图"""

MINDMAP_AGENT_ROLE = """你是知识架构师，擅长将复杂的知识体系组织为清晰的思维导图和概念图。"""

MINDMAP_AGENT_GOAL = """为指定课程章节生成 Mermaid 格式的思维导图（mindmap），要求：
1. 中心节点为章节主题
2. 一级分支为主要知识点
3. 二级分支为关键概念和公式
4. 标注知识点间的依赖关系"""


def create_mindmap_agent():
    from crewai import Agent
    return Agent(
        role="知识架构师",
        goal=MINDMAP_AGENT_GOAL,
        backstory=MINDMAP_AGENT_ROLE,
        verbose=True,
        allow_delegation=False,
    )
