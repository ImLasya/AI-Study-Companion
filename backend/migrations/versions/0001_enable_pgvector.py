"""Enable pgvector extension

Revision ID: 0001_enable_pgvector
Revises:
Create Date: 2026-09-15 12:00:00.000000

"""

from collections.abc import Sequence

from alembic import op
from sqlalchemy import text as sa_text

# revision identifiers, used by Alembic.
revision: str = "0001_enable_pgvector"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Check if vector extension is available in PostgreSQL before attempting CREATE EXTENSION.
    # When deployed with Docker (pgvector/pgvector:pg16) or cloud PostgreSQL with pgvector,
    # it activates the extension. When running locally without native pgvector binaries,
    # it safely skips without failing the transaction.
    conn = op.get_bind()
    has_vector_pkg = conn.execute(
        sa_text("SELECT 1 FROM pg_available_extensions WHERE name = 'vector'")
    ).scalar()
    if has_vector_pkg == 1:
        conn.execute(sa_text("CREATE EXTENSION IF NOT EXISTS vector;"))


def downgrade() -> None:
    conn = op.get_bind()
    has_ext = conn.execute(sa_text("SELECT 1 FROM pg_extension WHERE extname = 'vector'")).scalar()
    if has_ext == 1:
        conn.execute(sa_text("DROP EXTENSION IF EXISTS vector;"))
