"""Quiz, QuizQuestion, QuizAttempt, and QuizAnswer Models.

Implements full relational persistence for Adaptive Quiz and Assessment.
Enforces strict project and tenant isolation across all entities.
Stores per-question concept_id, difficulty, and correctness for downstream mastery analysis.
"""

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.concept import Concept
    from app.models.project import Project
    from app.models.user import User


class Quiz(Base):
    __tablename__ = "quizzes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="Adaptive Quiz")
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="active"
    )  # active, completed
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    user: Mapped["User"] = relationship("User")
    project: Mapped["Project"] = relationship("Project")
    questions: Mapped[list["QuizQuestion"]] = relationship(
        "QuizQuestion",
        back_populates="quiz",
        cascade="all, delete-orphan",
        order_by="QuizQuestion.question_order",
    )
    attempts: Mapped[list["QuizAttempt"]] = relationship(
        "QuizAttempt",
        back_populates="quiz",
        cascade="all, delete-orphan",
        order_by="QuizAttempt.started_at.desc()",
    )


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    quiz_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("quizzes.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    concept_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("concepts.id", ondelete="SET NULL"), index=True, nullable=True
    )
    question_type: Mapped[str] = mapped_column(String(50), nullable=False)  # mcq, open_ended
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[list] = mapped_column(JSON, default=list, nullable=False)  # 4 choices for MCQ
    correct_answer: Mapped[str] = mapped_column(
        Text, nullable=False
    )  # Server-side authoritative answer
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    rubric: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )  # Evaluation rubric for open_ended
    difficulty: Mapped[str] = mapped_column(
        String(20), nullable=False, default="medium"
    )  # easy, medium, hard
    source_chunk_ids: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    question_order: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    # Relationships
    quiz: Mapped["Quiz"] = relationship("Quiz", back_populates="questions")
    concept: Mapped["Concept | None"] = relationship("Concept", back_populates="questions")
    answers: Mapped[list["QuizAnswer"]] = relationship(
        "QuizAnswer", back_populates="question", cascade="all, delete-orphan"
    )


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    quiz_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("quizzes.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)  # Percentage (0 - 100)
    total_questions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    correct_answers: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="in_progress"
    )  # in_progress, completed

    # Relationships
    quiz: Mapped["Quiz"] = relationship("Quiz", back_populates="attempts")
    answers: Mapped[list["QuizAnswer"]] = relationship(
        "QuizAnswer", back_populates="attempt", cascade="all, delete-orphan"
    )


class QuizAnswer(Base):
    __tablename__ = "quiz_answers"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    attempt_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("quiz_attempts.id", ondelete="CASCADE"), index=True, nullable=False
    )
    question_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("quiz_questions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # Direct reference to concept_id & difficulty for seamless Mastery analytics without join churn
    concept_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("concepts.id", ondelete="SET NULL"), index=True, nullable=True
    )
    difficulty: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")
    selected_answer: Mapped[str | None] = mapped_column(Text, nullable=True)  # Learner MCQ choice
    answer_text: Mapped[str | None] = mapped_column(Text, nullable=True)  # Learner open-ended text
    is_correct: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)  # Normalized 0.0 - 1.0
    evaluation_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    evaluated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    # Relationships
    attempt: Mapped["QuizAttempt"] = relationship("QuizAttempt", back_populates="answers")
    question: Mapped["QuizQuestion"] = relationship("QuizQuestion", back_populates="answers")
    concept: Mapped["Concept | None"] = relationship("Concept")
