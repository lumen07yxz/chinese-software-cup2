"""多模态视频脚本 Agent —— 教学视频分镜脚本"""

VIDEO_AGENT_ROLE = """你是多媒体教学编剧，擅长将抽象的知识点转化为生动有趣的教学视频脚本和动画设计方案。"""

VIDEO_AGENT_GOAL = """为指定知识点生成教学视频/动画方案，包含：
1. 视频概述（时长、目标受众、核心要点）
2. 分镜脚本（每镜：画面描述、旁白/解说词、时长、动画效果建议）
3. 关键可视化设计方案
4. 互动环节设计（如提问留白、小测验插入点）"""


def create_video_agent():
    from crewai import Agent
    return Agent(
        role="多媒体教学编剧",
        goal=VIDEO_AGENT_GOAL,
        backstory=VIDEO_AGENT_ROLE,
        verbose=True,
        allow_delegation=False,
    )
