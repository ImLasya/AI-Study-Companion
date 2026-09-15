from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings
from app.core.logging import logger

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for obtaining an asynchronous database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def check_db_health() -> tuple[bool, bool, str | None]:
    """
    Checks database connection and pgvector extension availability.
    Returns: (is_connected, has_pgvector, error_message)
    """
    try:
        async with engine.connect() as conn:
            # 1. Check connectivity
            result = await conn.execute(text("SELECT 1"))
            if result.scalar() != 1:
                return False, False, "Unexpected query result"

            # 2. Check pgvector extension
            ext_result = await conn.execute(
                text("SELECT 1 FROM pg_extension WHERE extname = 'vector'")
            )
            has_vector = ext_result.scalar() == 1
            return True, has_vector, None
    except Exception as exc:
        logger.warning(f"Database health check failed: {exc}")
        return False, False, str(exc)
