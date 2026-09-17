"""SQLAlchemy models for Personalized Project Learning Plans.

Provides project-scoped learning roadmaps that sequence concepts, track completion
against target mastery, and guide next learning actions.
"""

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

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

if TYPE_CHECKING:
    from app.models.concept import Concept
    from app.models.project import Project
    from app.models.user import User


class LearningPlan(Base):
    """A personalized, project-scoped learning roadmap."""

    __tablename__ = "learning_plans"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), default="active", nullable=False, index=True
    )  # active, completed, archived
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    # Relationships
    project: Mapped["Project"] = relationship("Project")
    user: Mapped["User"] = relationship("User")
    items: Mapped[list["LearningPlanItem"]] = relationship(
        "LearningPlanItem",
        back_populates="learning_plan",
        cascade="all, delete-orphan",
        order_by="LearningPlanItem.position.asc()",
        lazy="selectin",
    )


class LearningPlanItem(Base):
    """An individual concept milestone in a learning roadmap."""

    __tablename__ = "learning_plan_items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    learning_plan_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("learning_plans.id", ondelete="CASCADE"), index=True, nullable=False
    )
    concept_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("concepts.id", ondelete="CASCADE"), index=True, nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), default="not_started", nullable=False, index=True
    )  # not_started, in_progress, completed, needs_review
    target_mastery: Mapped[float] = mapped_column(Float, default=80.0, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint(
            "learning_plan_id", "concept_id", name="uq_learning_plan_concept"
        ),
        UniqueConstraint(
            "learning_plan_id", "position", name="uq_learning_plan_position"
        ),
    )

    # Relationships
    learning_plan: Mapped["LearningPlan"] = relationship(
        "LearningPlan", back_populates="items"
    )
    concept: Mapped["Concept"] = relationship("Concept", lazy="selectin")
