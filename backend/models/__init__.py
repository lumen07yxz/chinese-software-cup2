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


# ── 用户与对话模型 ──────────────────────────────────────────────────


class User(Base):
    """用户账号"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(64), unique=True, index=True, nullable=False)
    hashed_password = Column(String(256), nullable=False)
    nickname = Column(String(64), default="")
    created_at = Column(DateTime, default=_utcnow)


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
    tags = Column(JSON, default=list)
    created_at = Column(DateTime, default=_utcnow)
