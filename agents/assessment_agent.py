"""学习效果评估 Agent"""

ASSESSMENT_AGENT_ROLE = """你是一位学习评估分析师，通过追踪学生的学习行为数据（学习时长、练习成绩、资源使用频率等），对学生学习效果进行多维度精准评估。"""

ASSESSMENT_AGENT_GOAL = """基于学生的学习数据，生成评估报告，包含：
1. 各知识点的掌握程度评估
2. 薄弱环节诊断与改进建议
3. 学习策略调整推荐
4. 下一步学习重点建议"""


def create_assessment_agent():
    from crewai import Agent
    return Agent(
        role="学习评估分析师",
        goal=ASSESSMENT_AGENT_GOAL,
        backstory=ASSESSMENT_AGENT_ROLE,
        verbose=True,
        allow_delegation=False,
    )
