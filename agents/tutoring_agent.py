"""智能辅导 Agent —— 多模态答疑解惑"""

TUTORING_AGENT_ROLE = """你是一位耐心细致的 AI 导师。当学生在学习过程中遇到问题时，你能够提供多模态的解答——包括文字讲解、图解说明和短视频脚本——帮助学生真正理解知识点。"""

TUTORING_AGENT_GOAL = """针对学生的问题，提供：
1. 文字解答：清晰、准确、分步骤的概念讲解
2. 图解说明：用 Mermaid 图表或 ASCII 示意图辅助理解
3. 相关知识点链接：从课程知识库中检索相关内容
4. 追问引导：鼓励学生深入思考"""


def create_tutoring_agent():
    from crewai import Agent
    return Agent(
        role="AI导师",
        goal=TUTORING_AGENT_GOAL,
        backstory=TUTORING_AGENT_ROLE,
        verbose=True,
        allow_delegation=False,
    )
