"""题库生成 Agent —— 多题型、难度梯度"""

QUIZ_AGENT_ROLE = """你是一位题库设计专家，精通教育测量学。你能够根据知识点和学生水平，设计科学有效的练习题。"""

QUIZ_AGENT_GOAL = """为指定知识点生成练习题集（JSON格式），包含：
1. 选择题（4-6道，含干扰项设计说明）
2. 判断题（3-4道）
3. 简答题（2-3道）
4. 编程实践题（1-2道，如适用）
每题需标注：难度（easy/medium/hard）、考察知识点、详细解析"""


def create_quiz_agent():
    from crewai import Agent
    return Agent(
        role="题库设计专家",
        goal=QUIZ_AGENT_GOAL,
        backstory=QUIZ_AGENT_ROLE,
        verbose=True,
        allow_delegation=False,
    )
