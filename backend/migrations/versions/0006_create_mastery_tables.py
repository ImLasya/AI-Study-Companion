"""Create concept_mastery, mastery_snapshots, recommendations, and processed_events tables.

Revision ID: 0006_mastery_tables
Revises: 0005_quiz_tables
Create Date: 2026-09-16 11:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0006_mastery_tables"
down_revision: str | None = "0005_quiz_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. concept_mastery table
    op.create_table(
        "concept_mastery",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("concept_id", sa.Uuid(), nullable=False),
        sa.Column("mastery_score", sa.Float(), nullable=True),  # None = unassessed
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("evidence_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["concept_id"], ["concepts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "concept_id", name="uq_user_concept_mastery"),
    )
    op.create_index("ix_concept_mastery_project_id", "concept_mastery", ["project_id"])
    op.create_index("ix_concept_mastery_user_id", "concept_mastery", ["user_id"])
    op.create_index("ix_concept_mastery_concept_id", "concept_mastery", ["concept_id"])
    op.create_index("ix_concept_mastery_user_proj", "concept_mastery", ["user_id", "project_id"])

    # 2. mastery_snapshots table (append-only history)
    op.create_table(
        "mastery_snapshots",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("concept_id", sa.Uuid(), nullable=False),
        sa.Column("mastery_score", sa.Float(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["concept_id"], ["concepts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_mastery_snapshots_project_id", "mastery_snapshots", ["project_id"])
    op.create_index("ix_mastery_snapshots_user_id", "mastery_snapshots", ["user_id"])
    op.create_index("ix_mastery_snapshots_concept_id", "mastery_snapshots", ["concept_id"])
    op.create_index(
        "ix_mastery_snapshots_user_concept_rec",
        "mastery_snapshots",
        ["user_id", "concept_id", "recorded_at"],
    )

    # 3. recommendations table
    op.create_table(
        "recommendations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("recommendation_type", sa.String(length=50), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("target_concept_id", sa.Uuid(), nullable=True),
        sa.Column("reasoning", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_concept_id"], ["concepts.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_recommendations_project_id", "recommendations", ["project_id"])
    op.create_index("ix_recommendations_user_id", "recommendations", ["user_id"])
    op.create_index("ix_recommendations_target_concept_id", "recommendations", ["target_concept_id"])
    op.create_index("ix_recommendations_user_status", "recommendations", ["user_id", "status"])

    # 4. processed_events table (DB-enforced idempotency)
    op.create_table(
        "processed_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("event_type", sa.String(length=50), nullable=False),
        sa.Column("aggregate_id", sa.Uuid(), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_type", "aggregate_id", name="uq_processed_event"),
    )
    op.create_index("ix_processed_events_type_agg", "processed_events", ["event_type", "aggregate_id"])


def downgrade() -> None:
    op.drop_table("processed_events")
    op.drop_table("recommendations")
    op.drop_table("mastery_snapshots")
    op.drop_table("concept_mastery")
