import os
from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

import app.models  # noqa: F401
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.workers import tasks
from app.workers.celery_app import celery_app

# Enable eager execution in test environment (no Redis broker required)
celery_app.conf.update(task_always_eager=True, task_eager_propagates=True)

# Postgres test database URL
TEST_DB_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://postgres:lasya@localhost:5432/ai_study_companion_test",
)

test_engine = create_async_engine(
    TEST_DB_URL,
    echo=False,
    future=True,
    poolclass=NullPool,
)

TestingSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

tasks._worker_session_maker = TestingSessionLocal


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"


@pytest.fixture(scope="session", autouse=True)
def prepare_test_database():
    """Create all schema tables in PostgreSQL test database before running tests.

    This fixture is intentionally SYNCHRONOUS even though the engine is async.
    Reason: with ``asyncio_mode = "auto"`` and function-scoped test event loops,
    an ``async`` session-scoped fixture has non-deterministic lifecycle — its
    teardown (``drop_all``) can fire prematurely between test files because
    pytest-asyncio may cycle the event loop at module boundaries.  Using
    ``asyncio.run()`` in a plain sync fixture gives the schema setup/teardown its
    own completely isolated event loop that is independent of pytest-asyncio's
    loop management, guaranteeing exactly-once setup and exactly-once teardown.
    """
    import asyncio

    async def _create_schema() -> None:
        async with test_engine.begin() as conn:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)

    async def _drop_schema() -> None:
        async with test_engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await test_engine.dispose()

    asyncio.run(_create_schema())
    yield
    asyncio.run(_drop_schema())


@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Provides an isolated database session per test.

    Always rolls back any aborted transaction before running cleanup so that a
    test which leaves the DB session in a failed-transaction state (e.g. due to
    an HTTPException being raised mid-request) does not cause
    ``InFailedSQLTransactionError`` during teardown and cascade-poison all
    subsequent tests.
    """
    async with TestingSessionLocal() as session:
        yield session
        # If the test left the connection in an aborted transaction, roll it
        # back first so the cleanup DELETE statements can execute cleanly.
        try:
            await session.rollback()
        except Exception:
            pass  # Already clean — ignore
        # Truncate all tables so the next test starts with an empty database.
        try:
            for table in reversed(Base.metadata.sorted_tables):
                await session.execute(table.delete())
            await session.commit()
        except Exception:
            await session.rollback()


@pytest.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Async test client with dependency override pointing to Postgres test database."""

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
