"""Create learning_plans and learning_plan_items tables.

Revision ID: 0012_create_learning_plans
Revises: 0011_add_spaced_repetition
Create Date: 2026-09-17 16:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0012_create_learning_plans"
down_revision: str | None = "0011_add_spaced_repetition"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Create learning_plans table
    op.create_table(
        "learning_plans",
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
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.String(50),
            nullable=False,
            server_default="active",
            index=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    op.create_index(
        "ix_learning_plans_project_status",
        "learning_plans",
        ["project_id", "status"],
    )

    # 2. Create learning_plan_items table
    op.create_table(
        "learning_plan_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "learning_plan_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("learning_plans.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "concept_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("concepts.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.String(50),
            nullable=False,
            server_default="not_started",
            index=True,
        ),
        sa.Column(
            "target_mastery",
            sa.Float(),
            nullable=False,
            server_default="80.0",
        ),
        sa.Column(
            "completed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "learning_plan_id", "concept_id", name="uq_learning_plan_concept"
        ),
        sa.UniqueConstraint(
            "learning_plan_id", "position", name="uq_learning_plan_position"
        ),
    )


def downgrade() -> None:
    op.drop_table("learning_plan_items")
    op.drop_index("ix_learning_plans_project_status", table_name="learning_plans")
    op.drop_table("learning_plans")
