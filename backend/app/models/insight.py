"""SQLAlchemy model for Background Learning Insights."""

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.project import Project
    from app.models.user import User



class LearningInsight(Base):
    """Advisory learning insights generated in the background.

    CRITICAL INVARIANT: Learning insights are strictly advisory (e.g. highlights,
    review prompts, pattern detections). They NEVER directly mutate concept mastery
    or overwrite authoritative mastery scores.
    """

    __tablename__ = "learning_insights"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    # insight_type: weak_concept, repeated_mistake, improving_concept, review_prompt
    insight_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    project: Mapped["Project"] = relationship("Project", foreign_keys=[project_id])

    __table_args__ = (
        Index("ix_learning_insights_user_project_type", "user_id", "project_id", "insight_type"),
    )
