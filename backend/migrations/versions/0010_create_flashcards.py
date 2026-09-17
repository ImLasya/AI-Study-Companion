"""Create flashcards table.

Revision ID: 0010_create_flashcards
Revises: 0009_learning_insights
Create Date: 2026-09-17 15:06:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010_create_flashcards"
down_revision: str | None = "0009_learning_insights"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "flashcards",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
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
            "material_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("materials.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "concept_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("concepts.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("front", sa.Text(), nullable=False),
        sa.Column("back", sa.Text(), nullable=False),
        sa.Column("source_chunk_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("citation_chunk_ids", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("page_number", sa.Integer(), nullable=True),
        sa.Column("filename", sa.String(500), nullable=True),
        sa.Column("card_type", sa.String(50), nullable=False, server_default="definition"),
        sa.Column("review_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("known", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("difficult", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("last_reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
    )
    # Composite index for tenant-scoped list queries
    op.create_index(
        "ix_flashcards_user_project",
        "flashcards",
        ["user_id", "project_id"],
    )
    # Index for study-mode filtering (known/difficult)
    op.create_index(
        "ix_flashcards_user_project_known",
        "flashcards",
        ["user_id", "project_id", "known"],
    )
    # Index on source chunk for citation validation audits
    op.create_index(
        "ix_flashcards_source_chunk",
        "flashcards",
        ["source_chunk_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_flashcards_source_chunk", table_name="flashcards")
    op.drop_index("ix_flashcards_user_project_known", table_name="flashcards")
    op.drop_index("ix_flashcards_user_project", table_name="flashcards")
    op.drop_table("flashcards")
