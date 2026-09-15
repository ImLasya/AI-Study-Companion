"""Create materials and material_chunks tables with pgvector Vector(384)

Revision ID: 0003_materials_and_chunks
Revises: 0002_auth_space_project
Create Date: 2026-09-15 16:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector
from sqlalchemy import text as sa_text

# revision identifiers, used by Alembic.
revision: str = "0003_materials_and_chunks"
down_revision: str | None = "0002_auth_space_project"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Ensure pgvector extension exists
    conn = op.get_bind()
    conn.execute(sa_text("CREATE EXTENSION IF NOT EXISTS vector;"))

    # 2. materials table
    op.create_table(
        "materials",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("storage_path", sa.String(length=500), nullable=False),
        sa.Column("status", sa.String(length=50), server_default="queued", nullable=False),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("page_count", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_materials_project_id"), "materials", ["project_id"], unique=False)
    op.create_index(op.f("ix_materials_user_id"), "materials", ["user_id"], unique=False)
    op.create_index(op.f("ix_materials_status"), "materials", ["status"], unique=False)

    # 3. material_chunks table with Vector(384)
    op.create_table(
        "material_chunks",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("material_id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("page_number", sa.Integer(), nullable=False),
        sa.Column("embedding", Vector(384), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["material_id"], ["materials.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_material_chunks_material_id"), "material_chunks", ["material_id"], unique=False)
    op.create_index(op.f("ix_material_chunks_project_id"), "material_chunks", ["project_id"], unique=False)
    op.create_index(
        "ix_material_chunks_material_chunk_idx",
        "material_chunks",
        ["material_id", "chunk_index"],
        unique=False,
    )

    # 4. HNSW cosine index on embedding column
    op.execute(
        sa_text(
            "CREATE INDEX ix_material_chunks_embedding_hnsw "
            "ON material_chunks "
            "USING hnsw (embedding vector_cosine_ops);"
        )
    )


def downgrade() -> None:
    op.execute(sa_text("DROP INDEX IF EXISTS ix_material_chunks_embedding_hnsw;"))
    op.drop_index("ix_material_chunks_material_chunk_idx", table_name="material_chunks")
    op.drop_index(op.f("ix_material_chunks_project_id"), table_name="material_chunks")
    op.drop_index(op.f("ix_material_chunks_material_id"), table_name="material_chunks")
    op.drop_table("material_chunks")

    op.drop_index(op.f("ix_materials_status"), table_name="materials")
    op.drop_index(op.f("ix_materials_user_id"), table_name="materials")
    op.drop_index(op.f("ix_materials_project_id"), table_name="materials")
    op.drop_table("materials")
