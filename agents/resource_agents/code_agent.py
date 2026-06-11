"""实操案例 Agent —— 代码实操案例生成"""

CODE_AGENT_ROLE = """你是编程实践导师，擅长设计循序渐进、有实际意义的编程实操案例，帮助学生将理论知识转化为实践能力。"""

CODE_AGENT_GOAL = """为指定知识点生成 Python 代码实操案例（Jupyter Notebook 风格），包含：
1. 案例背景与目标说明
2. 环境准备与依赖
3. 逐步代码实现（含详细注释）
4. 关键代码行解读
5. 预期输出与结果分析
6. 扩展练习建议"""


def create_code_agent():
    from crewai import Agent
    return Agent(
        role="编程实践导师",
        goal=CODE_AGENT_GOAL,
        backstory=CODE_AGENT_ROLE,
        verbose=True,
        allow_delegation=False,
    )
