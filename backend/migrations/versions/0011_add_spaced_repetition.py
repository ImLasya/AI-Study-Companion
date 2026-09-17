"""Add spaced repetition scheduling and flashcard_reviews history table.

Revision ID: 0011_add_spaced_repetition
Revises: 0010_create_flashcards
Create Date: 2026-09-17 15:40:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0011_add_spaced_repetition"
down_revision: str | None = "0010_create_flashcards"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Add spaced-repetition scheduling columns to flashcards
    op.add_column(
        "flashcards",
        sa.Column("ease_factor", sa.Float(), nullable=False, server_default="2.5"),
    )
    op.add_column(
        "flashcards",
        sa.Column("interval_days", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "flashcards",
        sa.Column("next_review_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "flashcards",
        sa.Column("last_rating", sa.String(20), nullable=True),
    )

    # Index for fast due-card retrieval scoped by project and user
    op.create_index(
        "ix_flashcards_user_project_next_review",
        "flashcards",
        ["user_id", "project_id", "next_review_at"],
    )

    # 2. Create flashcard_reviews history table
    op.create_table(
        "flashcard_reviews",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "flashcard_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("flashcards.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("rating", sa.String(20), nullable=False),
        sa.Column("previous_interval", sa.Integer(), nullable=False),
        sa.Column("new_interval", sa.Integer(), nullable=False),
        sa.Column("previous_ease", sa.Float(), nullable=False),
        sa.Column("new_ease", sa.Float(), nullable=False),
        sa.Column(
            "reviewed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
            index=True,
        ),
        sa.Column("idempotency_key", sa.String(100), nullable=True),
    )

    # Unique partial index for request idempotency per user
    op.create_index(
        "ix_flashcard_reviews_user_idempotency",
        "flashcard_reviews",
        ["user_id", "idempotency_key"],
        unique=True,
        postgresql_where=sa.text("idempotency_key IS NOT NULL"),
    )

    # Compound index for user+project review history over time (analytics)
    op.create_index(
        "ix_flashcard_reviews_user_project_reviewed",
        "flashcard_reviews",
        ["user_id", "project_id", "reviewed_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_flashcard_reviews_user_project_reviewed", table_name="flashcard_reviews"
    )
    op.drop_index(
        "ix_flashcard_reviews_user_idempotency", table_name="flashcard_reviews"
    )
    op.drop_table("flashcard_reviews")

    op.drop_index("ix_flashcards_user_project_next_review", table_name="flashcards")
    op.drop_column("flashcards", "last_rating")
    op.drop_column("flashcards", "next_review_at")
    op.drop_column("flashcards", "interval_days")
    op.drop_column("flashcards", "ease_factor")
