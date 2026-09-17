"""Add chunk rich metadata and material retry tracking columns.

Revision ID: 0008_chunk_rich_metadata_and_retries
Revises: 0007_analytics_and_evaluations
Create Date: 2026-09-17 14:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0008_chunk_metadata_retries"
down_revision: str | None = "0007_analytics_and_evaluations"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Add rich chunk metadata to material_chunks
    op.add_column("material_chunks", sa.Column("section_heading", sa.Text(), nullable=True))
    op.add_column(
        "material_chunks",
        sa.Column("content_type", sa.String(length=50), nullable=False, server_default="paragraph"),
    )
    op.create_index("ix_material_chunks_content_type", "material_chunks", ["content_type"])

    # 2. Add retry tracking and completion metadata to materials
    op.add_column(
        "materials",
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("materials", sa.Column("last_error", sa.Text(), nullable=True))
    op.add_column("materials", sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    # Drop materials retry columns
    op.drop_column("materials", "completed_at")
    op.drop_column("materials", "last_error")
    op.drop_column("materials", "retry_count")

    # Drop material_chunks rich metadata columns
    op.drop_index("ix_material_chunks_content_type", table_name="material_chunks")
    op.drop_column("material_chunks", "content_type")
    op.drop_column("material_chunks", "section_heading")
