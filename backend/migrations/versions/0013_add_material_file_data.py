"""Add file_data column to materials for cross-container storage.

Revision ID: 0013_add_material_file_data
Revises: 0012_create_learning_plans
Create Date: 2026-09-18 16:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0013_add_material_file_data"
down_revision: str | None = "0012_create_learning_plans"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "materials",
        sa.Column("file_data", sa.LargeBinary(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("materials", "file_data")
