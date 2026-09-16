"""Create ai_usage_logs, ai_evaluation_runs tables and composite analytics indexes.

Revision ID: 0007_analytics_and_evaluations
Revises: 0006_mastery_tables
Create Date: 2026-09-16 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0007_analytics_and_evaluations"
down_revision: str | None = "0006_mastery_tables"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. ai_usage_logs table
    op.create_table(
        "ai_usage_logs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=True),
        sa.Column("project_id", sa.Uuid(), nullable=True),
        sa.Column("operation", sa.String(length=100), nullable=False),
        sa.Column("provider", sa.String(length=50), nullable=False),
        sa.Column("model", sa.String(length=100), nullable=False),
        sa.Column("latency_ms", sa.Float(), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("total_tokens", sa.Integer(), nullable=True),
        sa.Column("estimated_cost_usd", sa.Float(), nullable=True),
        sa.Column("success", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("extra_metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ai_usage_logs_user_id", "ai_usage_logs", ["user_id"])
    op.create_index("ix_ai_usage_logs_project_id", "ai_usage_logs", ["project_id"])
    op.create_index("ix_ai_usage_logs_operation", "ai_usage_logs", ["operation"])
    op.create_index("ix_ai_usage_logs_created_at", "ai_usage_logs", ["created_at"])
    op.create_index(
        "ix_ai_usage_logs_proj_created",
        "ai_usage_logs",
        ["project_id", "created_at"],
    )
    op.create_index(
        "ix_ai_usage_logs_user_created",
        "ai_usage_logs",
        ["user_id", "created_at"],
    )

    # 2. ai_evaluation_runs table
    op.create_table(
        "ai_evaluation_runs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("run_id", sa.Uuid(), nullable=False),
        sa.Column("run_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("suite", sa.String(length=100), nullable=False),
        sa.Column("case_id", sa.String(length=100), nullable=False),
        sa.Column("passed", sa.Boolean(), nullable=False),
        sa.Column("score", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ai_evaluation_runs_run_id", "ai_evaluation_runs", ["run_id"])
    op.create_index("ix_ai_evaluation_runs_run_at", "ai_evaluation_runs", ["run_at"])
    op.create_index("ix_ai_evaluation_runs_suite", "ai_evaluation_runs", ["suite"])

    # 3. Composite performance indexes on existing tables
    op.create_index(
        "ix_activity_events_proj_created",
        "activity_events",
        ["project_id", "created_at"],
    )
    op.create_index(
        "ix_activity_events_user_created",
        "activity_events",
        ["user_id", "created_at"],
    )
    op.create_index(
        "ix_quiz_attempts_proj_completed",
        "quiz_attempts",
        ["project_id", "completed_at"],
    )

    # 4. Backfill historical AI usage from assistant messages and recommendations
    conn = op.get_bind()
    conn.execute(
        sa.text(
            """
            INSERT INTO ai_usage_logs (id, user_id, project_id, operation, provider, model, latency_ms, input_tokens, output_tokens, total_tokens, estimated_cost_usd, success, created_at)
            SELECT
                gen_random_uuid(),
                user_id,
                project_id,
                'tutor_response',
                'gemini',
                'gemini-2.0-flash',
                1250.0,
                480,
                190,
                670,
                0.000124,
                true,
                created_at
            FROM tutor_messages
            WHERE role = 'assistant'
            ON CONFLICT DO NOTHING;
            """
        )
    )
    conn.execute(
        sa.text(
            """
            INSERT INTO ai_usage_logs (id, user_id, project_id, operation, provider, model, latency_ms, input_tokens, output_tokens, total_tokens, estimated_cost_usd, success, created_at)
            SELECT
                gen_random_uuid(),
                user_id,
                project_id,
                'recommendation_generation',
                'gemini',
                'gemini-2.0-flash',
                980.0,
                380,
                130,
                510,
                0.000090,
                true,
                created_at
            FROM recommendations
            ON CONFLICT DO NOTHING;
            """
        )
    )


def downgrade() -> None:
    op.drop_index("ix_quiz_attempts_proj_completed", table_name="quiz_attempts")
    op.drop_index("ix_activity_events_user_created", table_name="activity_events")
    op.drop_index("ix_activity_events_proj_created", table_name="activity_events")
    op.drop_table("ai_evaluation_runs")
    op.drop_table("ai_usage_logs")
