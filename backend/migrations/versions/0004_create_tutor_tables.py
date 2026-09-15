"""Create tutor_conversations and tutor_messages tables.

Revision ID: 0004_tutor_tables
Revises: 0003_materials_and_chunks
Create Date: 2026-09-15 18:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004_tutor_tables"
down_revision: str | None = "0003_materials_and_chunks"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. tutor_conversations table
    op.create_table(
        "tutor_conversations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=255), server_default="Study Session", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_tutor_conversations_user_id", "tutor_conversations", ["user_id"], unique=False
    )
    op.create_index(
        "ix_tutor_conversations_project_id", "tutor_conversations", ["project_id"], unique=False
    )

    # 2. tutor_messages table
    op.create_table(
        "tutor_messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(length=50), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("grounded", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column(
            "insufficient_evidence",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column("citations", sa.JSON(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["conversation_id"], ["tutor_conversations.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tutor_messages_conversation_id", "tutor_messages", ["conversation_id"], unique=False)
    op.create_index("ix_tutor_messages_user_id", "tutor_messages", ["user_id"], unique=False)
    op.create_index("ix_tutor_messages_project_id", "tutor_messages", ["project_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_tutor_messages_project_id", table_name="tutor_messages")
    op.drop_index("ix_tutor_messages_user_id", table_name="tutor_messages")
    op.drop_index("ix_tutor_messages_conversation_id", table_name="tutor_messages")
    op.drop_table("tutor_messages")

    op.drop_index("ix_tutor_conversations_project_id", table_name="tutor_conversations")
    op.drop_index("ix_tutor_conversations_user_id", table_name="tutor_conversations")
    op.drop_table("tutor_conversations")
