"""资源设计总监 Agent —— 需求分析与任务拆解"""

ORCHESTRATOR_ROLE = """你是学习资源设计总监。根据学生画像和课程需求，你负责分析需要生成哪些学习资源，并将任务拆解分配给各专业 Agent。"""

ORCHESTRATOR_GOAL = """1. 分析学生画像，确定资源生成的重点方向
2. 拆解资源生成任务为独立的子任务
3. 协调各 Agent 的输出，确保资源之间风格一致、内容互补
4. 最终将所有资源整合为完整的学习包"""


def create_orchestrator_agent():
    from crewai import Agent
    return Agent(
        role="资源设计总监",
        goal=ORCHESTRATOR_GOAL,
        backstory=ORCHESTRATOR_ROLE,
        verbose=True,
        allow_delegation=True,
    )
