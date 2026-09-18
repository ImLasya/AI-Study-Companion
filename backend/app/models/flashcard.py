"""Flashcard Domain Model.

Grounded project-scoped flashcards generated from uploaded learning materials.
Every flashcard is strictly isolated to a single user's project and carries
server-validated citations derived from the pgvector retrieval pipeline.

Study state (review_count, known, difficult) is lightweight and does NOT
implement spaced-repetition scheduling.
"""

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.concept import Concept
    from app.models.material import Material
    from app.models.project import Project
    from app.models.user import User


class Flashcard(Base):
    __tablename__ = "flashcards"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)

    # Tenant isolation — mandatory on every query
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )

    # Optional links to source material and concept (project-scoped only)
    material_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("materials.id", ondelete="SET NULL"), nullable=True
    )
    concept_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("concepts.id", ondelete="SET NULL"), nullable=True
    )

    # Card content
    front: Mapped[str] = mapped_column(Text, nullable=False)
    back: Mapped[str] = mapped_column(Text, nullable=False)

    # Server-derived citation metadata (never from raw Gemini output)
    source_chunk_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    citation_chunk_ids: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    page_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    filename: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Card classification
    card_type: Mapped[str] = mapped_column(
        String(50), default="definition", nullable=False
    )

    # Lightweight study state & Spaced-Repetition scheduling (SM-2 inspired)
    review_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    known: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    difficult: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ease_factor: Mapped[float] = mapped_column(Float, default=2.5, nullable=False)
    interval_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    next_review_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    last_rating: Mapped[str | None] = mapped_column(String(20), nullable=True)
    last_reviewed_at: Mapped[datetime | None] = mapped_column(
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

    # Relationships
    project: Mapped["Project"] = relationship("Project")
    user: Mapped["User"] = relationship("User")
    material: Mapped["Material | None"] = relationship("Material")
    concept: Mapped["Concept | None"] = relationship("Concept")
    reviews: Mapped[list["FlashcardReview"]] = relationship(
        "FlashcardReview", back_populates="flashcard", cascade="all, delete-orphan"
    )


class FlashcardReview(Base):
    """Historical record of an individual flashcard spaced repetition review."""

    __tablename__ = "flashcard_reviews"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    flashcard_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("flashcards.id", ondelete="CASCADE"), index=True, nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), index=True, nullable=False
    )
    rating: Mapped[str] = mapped_column(String(20), nullable=False)
    previous_interval: Mapped[int] = mapped_column(Integer, nullable=False)
    new_interval: Mapped[int] = mapped_column(Integer, nullable=False)
    previous_ease: Mapped[float] = mapped_column(Float, nullable=False)
    new_ease: Mapped[float] = mapped_column(Float, nullable=False)
    reviewed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
        index=True,
    )
    idempotency_key: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Relationships
    flashcard: Mapped["Flashcard"] = relationship("Flashcard", back_populates="reviews")
    user: Mapped["User"] = relationship("User")
    project: Mapped["Project"] = relationship("Project")

