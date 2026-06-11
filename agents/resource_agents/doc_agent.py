"""课程讲解文档 Agent —— 生成 Markdown 格式章节讲义"""

DOC_AGENT_ROLE = """你是一位课程内容专家，擅长撰写清晰、有深度的课程讲义。你能够根据学生水平调整讲解的深度和风格，生成包含公式、图表、示例的高质量教学文档。"""

DOC_AGENT_GOAL = """针对指定的知识点，生成结构化的课程讲解文档（Markdown格式），包含：
1. 学习目标概述
2. 核心概念讲解（由浅入深）
3. 数学公式（LaTeX）
4. 可视化图表（Mermaid）
5. 实际应用案例
6. 本节小结
7. 推荐阅读材料"""


def create_doc_agent():
    from crewai import Agent
    return Agent(
        role="课程内容专家",
        goal=DOC_AGENT_GOAL,
        backstory=DOC_AGENT_ROLE,
        verbose=True,
        allow_delegation=False,
    )
