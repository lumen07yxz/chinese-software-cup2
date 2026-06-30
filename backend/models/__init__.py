from sqlalchemy import Column, Integer, String, Text, Float, DateTime, JSON
from sqlalchemy.orm import DeclarativeBase
from datetime import datetime, timezone


def _utcnow():
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class StudentProfile(Base):
    __tablename__ = "student_profiles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(64), unique=True, index=True, nullable=False)

    knowledge_base = Column(JSON, default=dict)
    cognitive_style = Column(String(32), default="")
    weak_points = Column(JSON, default=list)
    learning_goal = Column(Text, default="")
    available_time = Column(String(32), default="")
    interests = Column(JSON, default=list)

    conversation_summary = Column(Text, default="")

    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)


class LearningResource(Base):
    __tablename__ = "learning_resources"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(64), index=True, nullable=False)
    resource_type = Column(String(32), nullable=False)
    title = Column(String(256), nullable=False)
    description = Column(Text, default="")
    content = Column(Text, default="")
    file_path = Column(String(512), default="")
    course_chapter = Column(String(64), default="")
    difficulty = Column(Float, default=0.5)
    created_at = Column(DateTime, default=_utcnow)


class LearningPath(Base):
    __tablename__ = "learning_paths"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(64), index=True, nullable=False)
    path_data = Column(JSON, default=dict)
    current_node = Column(String(64), default="")
    progress = Column(Float, default=0.0)
    completed_nodes = Column(JSON, default=list)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)


class AssessmentRecord(Base):
    __tablename__ = "assessment_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(64), index=True, nullable=False)
    study_time_minutes = Column(Integer, default=0)
    quiz_scores = Column(JSON, default=list)
    resource_interactions = Column(Integer, default=0)
    assessment_report = Column(JSON, default=dict)
    created_at = Column(DateTime, default=_utcnow)


class ConceptMastery(Base):
    """概念掌握度追踪 — 精确数学算法"""
    __tablename__ = "concept_mastery"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(64), index=True, nullable=False)
    concept_id = Column(String(128), nullable=False)
    mastery_score = Column(Float, default=0.0)
    confidence = Column(Float, default=0.0)
    last_assessed_at = Column(DateTime, default=_utcnow)
    assessment_count = Column(Integer, default=0)
    forgetting_factor = Column(Float, default=0.1)


class RealtimeLearningState(Base):
    """实时学情状态 — 每条消息后的情绪/困惑度/负荷等"""
    __tablename__ = "realtime_learning_state"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(64), index=True, nullable=False)
    emotion = Column(String(32), default="")
    confusion = Column(Float, default=0.0)
    cognitive_load = Column(Float, default=0.0)
    confidence = Column(Float, default=0.0)
    engagement = Column(Float, default=0.0)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)


class Flashcard(Base):
    """概念闪卡 — SM-2 间隔复习"""
    __tablename__ = "flashcards"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(64), index=True, nullable=False)
    concept_id = Column(String(128), default="")
    topic = Column(String(256), default="")
    front = Column(Text, nullable=False)
    back = Column(Text, nullable=False)
    ease_factor = Column(Float, default=2.5)
    interval_days = Column(Integer, default=1)
    next_review_at = Column(DateTime, default=_utcnow)
    review_count = Column(Integer, default=0)
    source_type = Column(String(32), default="auto_generated")
    created_at = Column(DateTime, default=_utcnow)


# ── 用户与对话模型 ──────────────────────────────────────────────────


class User(Base):
    """用户账号"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(64), unique=True, index=True, nullable=False)
    hashed_password = Column(String(256), nullable=False)
    nickname = Column(String(64), default="")
    created_at = Column(DateTime, default=_utcnow)
    security_question = Column(String(128), default="")   # 密保问题
    security_answer = Column(String(256), default="")     # bcrypt 哈希后的答案


class Conversation(Base):
    """对话会话"""
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(64), index=True, nullable=False)
    title = Column(String(256), default="新对话")
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)


class ConversationMessage(Base):
    """对话消息"""
    __tablename__ = "conversation_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(Integer, index=True, nullable=False)
    role = Column(String(16), nullable=False)  # "user" | "assistant" | "system"
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=_utcnow)


class UserDocument(Base):
    """用户导入的知识文档"""
    __tablename__ = "user_documents"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(64), index=True, nullable=False)
    title = Column(String(256), nullable=False)
    content = Column(Text, default="")
    file_path = Column(String(512), default="")
    source_type = Column(String(32), default="upload")  # "upload" | "web"
    file_format = Column(String(16), default="txt")      # "md"|"txt"|"pdf"|"docx"|"html"|"csv"
    notes = Column(Text, default="")                      # 用户笔记/批注
    spark_file_id = Column(String(64), default="")        # 星火 ChatDoc 文件 ID
    spark_file_status = Column(String(32), default="")    # vectored/uploaded/failed/pending
    spark_repo_id = Column(String(64), default="")        # 用户的星火知识库 ID（冗余存储，方便查询）
    tags = Column(JSON, default=list)
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)


class SavedCourse(Base):
    """已保存的课程大纲 —— 用户生成的课程可随时继续学习"""
    __tablename__ = "saved_courses"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(64), index=True, nullable=False)
    topic = Column(String(256), nullable=False)
    description = Column(Text, default="")
    outline = Column(JSON, default=list)           # [{title, description, difficulty, duration_min, key_concepts}]
    completed_lessons = Column(JSON, default=list) # 已完成的课程 title 列表
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)


class FeynmanRecord(Base):
    """费曼学习法记录 —— 以教促学，评估理解深度"""
    __tablename__ = "feynman_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(64), index=True, nullable=False)
    course_id = Column(Integer, default=0)
    concept = Column(String(256), nullable=False)
    final_understanding = Column(Float, default=0.0)
    turns = Column(Integer, default=0)
    dialogue = Column(JSON, default=list)     # [{role:"ai"|"user", content:"..."}]
    created_at = Column(DateTime, default=_utcnow)


class PPTRecord(Base):
    """PPT 生成记录 — 保存历史 PPT 供反复查看/下载"""
    __tablename__ = "ppt_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(64), index=True, nullable=False)
    title = Column(String(256), nullable=False)
    outline = Column(JSON, default=dict)       # 生成时的大纲 JSON
    source = Column(String(16), default="xfyun")  # "xfyun" | "local"
    file_url = Column(String(1024), default="")   # 讯飞 CDN URL
    file_path = Column(String(512), default="")   # 本地文件路径
    task_id = Column(String(128), default="")     # 讯飞 sid 或本地 taskId
    created_at = Column(DateTime, default=_utcnow)
