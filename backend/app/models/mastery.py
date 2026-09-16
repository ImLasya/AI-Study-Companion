"""SQLAlchemy models for Concept Mastery, Growth Tracking, and Recommendations (Phase 5)."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class ConceptMastery(Base):
    """Current mastery estimate per user and concept."""

    __tablename__ = "concept_mastery"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    concept_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("concepts.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # None represents an unassessed concept with no meaningful evidence (not 0%)
    mastery_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)  # 0.0 to 1.0
    evidence_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("user_id", "concept_id", name="uq_user_concept_mastery"),
    )

    # Relationships
    concept: Mapped["Concept"] = relationship("Concept")  # type: ignore[name-defined] # noqa: F821
    project: Mapped["Project"] = relationship("Project")  # type: ignore[name-defined] # noqa: F821
    user: Mapped["User"] = relationship("User")  # type: ignore[name-defined] # noqa: F821


class MasterySnapshot(Base):
    """Append-only historical snapshot of a concept mastery score."""

    __tablename__ = "mastery_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    concept_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("concepts.id", ondelete="CASCADE"), index=True, nullable=False
    )
    mastery_score: Mapped[float] = mapped_column(Float, nullable=False)  # Recorded score at this time
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        index=True,
        nullable=False,
    )

    # Relationships
    concept: Mapped["Concept"] = relationship("Concept")  # type: ignore[name-defined] # noqa: F821


class Recommendation(Base):
    """Targeted learning recommendations answering 'what should I do next?'"""

    __tablename__ = "recommendations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    recommendation_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # review_concept, practice_quiz, study_material, explore_topic
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    target_concept_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("concepts.id", ondelete="SET NULL"), index=True, nullable=True
    )
    reasoning: Mapped[str] = mapped_column(Text, nullable=False)  # "Why am I seeing this?"
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="active"
    )  # active, dismissed, completed
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    # Relationships
    target_concept: Mapped["Concept | None"] = relationship("Concept")  # type: ignore[name-defined] # noqa: F821


class ProcessedEvent(Base):
    """Database-enforced idempotency ledger for background event handling."""

    __tablename__ = "processed_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    event_type: Mapped[str] = mapped_column(String(50), nullable=False)
    aggregate_id: Mapped[uuid.UUID] = mapped_column(nullable=False)
    processed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("event_type", "aggregate_id", name="uq_processed_event"),
    )
