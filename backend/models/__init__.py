from sqlalchemy import Column, Integer, String, Text, Float, DateTime, JSON
from sqlalchemy.orm import DeclarativeBase
from datetime import datetime


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

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


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
    created_at = Column(DateTime, default=datetime.utcnow)


class LearningPath(Base):
    __tablename__ = "learning_paths"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(64), index=True, nullable=False)
    path_data = Column(JSON, default=dict)
    current_node = Column(String(64), default="")
    progress = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AssessmentRecord(Base):
    __tablename__ = "assessment_records"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(64), index=True, nullable=False)
    study_time_minutes = Column(Integer, default=0)
    quiz_scores = Column(JSON, default=list)
    resource_interactions = Column(Integer, default=0)
    assessment_report = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)
