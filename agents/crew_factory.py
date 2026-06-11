"""CrewAI 编排工厂 —— 管理多智能体协作流程"""

from crewai import Crew, Process


def create_resource_generation_crew(agents: list, tasks: list) -> Crew:
    """创建资源生成 Crew —— Orchestrator → Workers → Assembler"""
    return Crew(
        agents=agents,
        tasks=tasks,
        process=Process.sequential,
        verbose=True,
    )


def create_profile_crew(agent, task) -> Crew:
    """创建画像构建 Crew"""
    return Crew(
        agents=[agent],
        tasks=[task],
        process=Process.sequential,
        verbose=True,
    )
