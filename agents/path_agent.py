"""学习路径规划 Agent"""

PATH_AGENT_ROLE = """你是一位学习路径规划专家。根据学生的知识画像、学习目标和课程知识图谱，为学生设计最优的个性化学习路线。"""

PATH_AGENT_GOAL = """基于课程知识点的拓扑依赖关系和学生的知识基础，规划学习顺序和每个阶段的推荐时长。避开学生已掌握的内容，在薄弱环节分配更多时间。"""


def create_path_agent():
    from crewai import Agent
    return Agent(
        role="学习路径规划师",
        goal=PATH_AGENT_GOAL,
        backstory=PATH_AGENT_ROLE,
        verbose=True,
        allow_delegation=False,
    )
