"""画像构建 Agent —— 对话式学习画像自主构建"""

from crewai import Agent, Task
from services.spark_service import spark_service


PROFILE_AGENT_ROLE = """你是一位专业的学习画像分析师。通过与学生进行自然对话，你能够深入了解其学习背景、能力水平和偏好，并从中提取关键特征来构建学习画像。

你需要引导学生逐步完成自我描述，在对话过程中自然收集信息，而不是生硬地让用户填写表单。对话应保持温和、鼓励的语气。"""

PROFILE_AGENT_GOAL = """构建包含6个维度的学生画像：
1. 知识基础（knowledge_base）：各子领域的掌握程度（0-1分）
2. 认知风格（cognitive_style）：visual（视觉型）、verbal（语言型）、active（动手型）、reflective（反思型）
3. 易错点偏好（weak_points）：容易犯错的题型或概念类型
4. 学习目标（learning_goal）：期望达到的学习成果
5. 可用时间（available_time）：每周可用于学习的时间
6. 兴趣方向（interests）：最感兴趣的细分领域

你需要从对话中逐步收集以上信息，最终输出结构化的 JSON 画像。"""


def create_profile_agent() -> Agent:
    return Agent(
        role="学习画像分析师",
        goal=PROFILE_AGENT_GOAL,
        backstory=PROFILE_AGENT_ROLE,
        verbose=True,
        allow_delegation=False,
        llm=spark_service,  # type: ignore
    )


def create_profile_task(agent: Agent, user_message: str, existing_profile: dict | None = None) -> Task:
    context = ""
    if existing_profile:
        context = f"\n当前已有画像：{existing_profile}\n请在已有基础上更新。"
    return Task(
        description=f"用户说：{user_message}{context}\n请从用户的话中提取画像特征并返回更新后的完整画像JSON。",
        expected_output="返回完整的 JSON 画像对象，包含 6 个维度字段。",
        agent=agent,
    )
