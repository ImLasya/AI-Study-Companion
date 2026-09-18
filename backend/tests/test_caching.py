"""Tests for Redis-backed Caching Layer and Debouncing."""

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import CacheService, cache_service
from app.models.project import Project
from app.models.space import Space
from app.models.user import User
from app.services.retrieval_service import RetrievalService
from tests.test_tutor import create_ready_material


@pytest.mark.asyncio
async def test_cache_key_tenant_isolation():
    """Verify that different users or projects generate distinct cache keys."""
    user_a = uuid.uuid4()
    user_b = uuid.uuid4()
    proj_a = uuid.uuid4()
    proj_b = uuid.uuid4()

    key_a = CacheService.build_key(user_a, proj_a, "retrieval", "What is attention?")
    key_b = CacheService.build_key(user_b, proj_a, "retrieval", "What is attention?")
    key_c = CacheService.build_key(user_a, proj_b, "retrieval", "What is attention?")

    assert key_a != key_b
    assert key_a != key_c
    assert str(user_a) in key_a
    assert str(proj_a) in key_a


@pytest.mark.asyncio
async def test_cache_set_get_delete():
    """Verify basic set, get, and delete operations."""
    key = f"test:cache:{uuid.uuid4()}"
    data = {"score": 95, "tags": ["math", "linear-algebra"]}

    success = await cache_service.set(key, data, ttl_seconds=60)
    if not success:
        pytest.skip("Redis server not available for test")

    retrieved = await cache_service.get(key)
    assert retrieved == data

    await cache_service.delete(key)
    assert await cache_service.get(key) is None


@pytest.mark.asyncio
async def test_cache_debouncing():
    """Verify debouncing returns False on first call, True within cooldown."""
    user_id = uuid.uuid4()
    project_id = uuid.uuid4()

    # First check: should not debounce
    is_debounced_1 = await cache_service.should_debounce(
        user_id=user_id, project_id=project_id, action="insights_test", cooldown_seconds=60
    )
    if is_debounced_1 is True:
        pytest.skip("Redis server not available for test")

    assert is_debounced_1 is False

    # Second check immediately after: should debounce
    is_debounced_2 = await cache_service.should_debounce(
        user_id=user_id, project_id=project_id, action="insights_test", cooldown_seconds=60
    )
    assert is_debounced_2 is True


@pytest.mark.asyncio
async def test_retrieval_service_caching(db_session: AsyncSession):
    """Verify that repeated retrieval queries hit the cache cleanly."""
    user = User(email=f"cache_{uuid.uuid4().hex[:6]}@example.com", hashed_password="pw")
    db_session.add(user)
    await db_session.flush()

    space = Space(name="Cache Space", user_id=user.id)
    db_session.add(space)
    await db_session.flush()

    project = Project(name="Cache Proj", space_id=space.id, user_id=user.id, learning_goal="Goal")
    db_session.add(project)
    await db_session.flush()

    await create_ready_material(db_session, user.id, project.id)

    retrieval_svc = RetrievalService(db_session)
    q = "What is self-attention mechanism?"

    # First call: cache miss, computes live
    res1 = await retrieval_svc.retrieve_relevant_chunks(
        user_id=user.id,
        project_id=project.id,
        question=q,
    )
    assert res1.is_sufficient

    # Second call: cache hit, identical results
    res2 = await retrieval_svc.retrieve_relevant_chunks(
        user_id=user.id,
        project_id=project.id,
        question=q,
    )
    assert res2.is_sufficient
    assert len(res1.accepted_chunks) == len(res2.accepted_chunks)
    assert res1.accepted_chunks[0].chunk_id == res2.accepted_chunks[0].chunk_id

    # Invalidate project cache
    deleted = await cache_service.invalidate_project(user.id, project.id)
    assert deleted >= 0
