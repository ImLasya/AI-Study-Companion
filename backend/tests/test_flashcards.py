"""Tests for Grounded Flashcard Feature.

Tests cover:
- Generation (success, limits, no material, insufficient evidence)
- Citation validation (valid IDs, invalid IDs, cross-project rejection)
- Tenant isolation (user A cannot see user B's cards)
- CRUD: list, get, review, delete
- Duplicate prevention
- MockLLMProvider determinism
- Activity logging and AI usage logging
- Redis unavailable graceful degradation
"""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.gemini_provider import MockLLMProvider, set_llm_provider
from app.models.flashcard import Flashcard
from app.models.project import Project
from app.models.space import Space
from app.models.user import User
from app.repositories.flashcard_repository import FlashcardRepository, _normalize_front
from app.schemas.flashcard import (
    FlashcardGenerateRequest,
    FlashcardGenerateResponse,
    FlashcardGenerationOutput,
    FlashcardLLMItem,
)
from app.services.flashcard_service import FlashcardService


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def use_mock_provider():
    """Use deterministic MockLLMProvider for all tests."""
    mock = MockLLMProvider()
    set_llm_provider(mock)
    yield mock
    set_llm_provider(None)


@pytest.fixture
async def user_project(db_session: AsyncSession):
    """Creates a user + space + project in the DB and returns (user, project)."""
    from app.core.security import hash_password

    user = User(
        id=uuid.uuid4(),
        email=f"fc_test_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password=hash_password("TestPass123!"),
        full_name="Flashcard Tester",
    )
    db_session.add(user)
    await db_session.flush()

    space = Space(
        id=uuid.uuid4(),
        user_id=user.id,
        name="Test Space",
    )
    db_session.add(space)
    await db_session.flush()

    project = Project(
        id=uuid.uuid4(),
        user_id=user.id,
        space_id=space.id,
        name="Test Project",
        learning_goal="Learn testing",
    )
    db_session.add(project)
    await db_session.flush()

    return user, project


def make_chunk(chunk_id: str | None = None, material_id: str | None = None) -> MagicMock:
    """Helper: create a mock RetrievedChunk."""
    chunk = MagicMock()
    chunk.chunk_id = uuid.UUID(chunk_id) if chunk_id else uuid.uuid4()
    chunk.material_id = uuid.UUID(material_id) if material_id else uuid.uuid4()
    chunk.filename = "test_material.pdf"
    chunk.page_number = 5
    chunk.content = "Supervised learning is a type of machine learning."
    chunk.distance = 0.12
    chunk.section_heading = "Introduction"
    chunk.content_type = "paragraph"
    return chunk


def make_retrieval_result(chunks=None, sufficient=True):
    """Helper: create a mock RetrievalResult."""
    result = MagicMock()
    result.accepted_chunks = chunks if chunks is not None else [make_chunk()]
    result.is_sufficient = sufficient
    result.all_candidates_count = len(result.accepted_chunks)
    result.accepted_count = len(result.accepted_chunks)
    result.min_distance = 0.12
    return result


# ─────────────────────────────────────────────────────────────────────────────
# 1. Successful generation
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_generate_flashcards_success(db_session: AsyncSession, user_project):
    """Should generate and persist flashcards when materials exist and evidence is sufficient."""
    user, project = user_project
    chunk = make_chunk()

    with (
        patch("app.services.flashcard_service.RetrievalService") as MockRetrieval,
        patch("app.services.flashcard_service.MaterialRepository") as MockMaterialRepo,
        patch("app.services.flashcard_service.cache_service") as MockCache,
    ):
        MockMaterialRepo.return_value.count_ready_materials = AsyncMock(return_value=1)
        MockRetrieval.return_value.retrieve_relevant_chunks = AsyncMock(
            return_value=make_retrieval_result([chunk])
        )
        MockCache.get = AsyncMock(return_value=None)
        MockCache.set = AsyncMock(return_value=True)
        MockCache.build_key = MagicMock(return_value="cache_key")

        service = FlashcardService(db_session)
        result = await service.generate(
            user_id=user.id,
            project_id=project.id,
            payload=FlashcardGenerateRequest(count=2),
        )

    assert isinstance(result, FlashcardGenerateResponse)
    assert result.total_generated >= 1
    assert len(result.flashcards) == result.total_generated
    for card in result.flashcards:
        assert card.project_id == project.id
        assert card.user_id == user.id
        assert card.front
        assert card.back
        assert len(card.citation_chunk_ids) >= 1


# ─────────────────────────────────────────────────────────────────────────────
# 2. Count validation: count > 10 rejected
# ─────────────────────────────────────────────────────────────────────────────

def test_flashcard_generate_request_rejects_count_above_10():
    """FlashcardGenerateRequest should not allow count > 10."""
    import pydantic

    with pytest.raises(pydantic.ValidationError):
        FlashcardGenerateRequest(count=11)


# ─────────────────────────────────────────────────────────────────────────────
# 3. Count validation: count < 1 rejected
# ─────────────────────────────────────────────────────────────────────────────

def test_flashcard_generate_request_rejects_count_below_1():
    """FlashcardGenerateRequest should not allow count < 1."""
    import pydantic

    with pytest.raises(pydantic.ValidationError):
        FlashcardGenerateRequest(count=0)


# ─────────────────────────────────────────────────────────────────────────────
# 4. No ready material → 400
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_generate_no_materials_raises_400(db_session: AsyncSession, user_project):
    """Should raise HTTP 400 if no ready materials exist in the project."""
    from fastapi import HTTPException

    user, project = user_project

    with patch("app.services.flashcard_service.MaterialRepository") as MockMaterialRepo:
        MockMaterialRepo.return_value.count_ready_materials = AsyncMock(return_value=0)

        service = FlashcardService(db_session)
        with pytest.raises(HTTPException) as exc_info:
            await service.generate(
                user_id=user.id,
                project_id=project.id,
                payload=FlashcardGenerateRequest(count=3),
            )

    assert exc_info.value.status_code == 400
    assert "material" in exc_info.value.detail.lower()


# ─────────────────────────────────────────────────────────────────────────────
# 5. Insufficient evidence → 422
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_generate_insufficient_evidence_raises_422(
    db_session: AsyncSession, user_project
):
    """Should raise HTTP 422 if retrieval returns insufficient evidence."""
    from fastapi import HTTPException

    user, project = user_project

    with (
        patch("app.services.flashcard_service.MaterialRepository") as MockMaterialRepo,
        patch("app.services.flashcard_service.RetrievalService") as MockRetrieval,
        patch("app.services.flashcard_service.cache_service") as MockCache,
    ):
        MockMaterialRepo.return_value.count_ready_materials = AsyncMock(return_value=1)
        MockRetrieval.return_value.retrieve_relevant_chunks = AsyncMock(
            return_value=make_retrieval_result([], sufficient=False)
        )
        MockCache.get = AsyncMock(return_value=None)
        MockCache.build_key = MagicMock(return_value="key")

        service = FlashcardService(db_session)
        with pytest.raises(HTTPException) as exc_info:
            await service.generate(
                user_id=user.id,
                project_id=project.id,
                payload=FlashcardGenerateRequest(count=2),
            )

    assert exc_info.value.status_code == 422


# ─────────────────────────────────────────────────────────────────────────────
# 6. Valid citation chunk IDs accepted
# ─────────────────────────────────────────────────────────────────────────────

def test_validate_citations_accepts_valid_ids():
    """Citation validation should accept chunk IDs present in accepted_chunk_map."""
    from app.services.flashcard_service import _trace_validate_flashcard_citations

    chunk_id = str(uuid.uuid4())
    accepted_map = {chunk_id: MagicMock()}
    result = _trace_validate_flashcard_citations([chunk_id], accepted_map)
    assert chunk_id in result["valid_ids"]
    assert result["invalid_ids"] == []


# ─────────────────────────────────────────────────────────────────────────────
# 7. Invalid citation chunk IDs rejected
# ─────────────────────────────────────────────────────────────────────────────

def test_validate_citations_rejects_invalid_ids():
    """Citation validation should reject chunk IDs not in the accepted evidence."""
    from app.services.flashcard_service import _trace_validate_flashcard_citations

    fake_id = str(uuid.uuid4())
    accepted_map = {}
    result = _trace_validate_flashcard_citations([fake_id], accepted_map)
    assert fake_id in result["invalid_ids"]
    assert result["valid_ids"] == []


# ─────────────────────────────────────────────────────────────────────────────
# 8. Cross-project citation rejected
# ─────────────────────────────────────────────────────────────────────────────

def test_validate_citations_rejects_cross_project_chunk():
    """A chunk from a different project's evidence pool should be rejected."""
    from app.services.flashcard_service import _trace_validate_flashcard_citations

    cross_project_chunk_id = str(uuid.uuid4())
    current_project_chunk_id = str(uuid.uuid4())
    accepted_map = {current_project_chunk_id: MagicMock()}

    result = _trace_validate_flashcard_citations([cross_project_chunk_id], accepted_map)
    assert cross_project_chunk_id in result["invalid_ids"]
    assert current_project_chunk_id not in result["valid_ids"]


# ─────────────────────────────────────────────────────────────────────────────
# 9. Tenant isolation: user A cannot see user B's flashcards
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_tenant_isolation_list(db_session: AsyncSession, user_project):
    """FlashcardRepository list_by_project must not return another user's cards."""
    user_a, project = user_project
    user_b_id = uuid.uuid4()

    # Insert a card for user_b with the SAME project_id (user_b doesn't own it but
    # we bypass FK for user_id since we just need to test the list filter)
    # We need a valid project_id — use user_a's project but different user_id
    card_b = Flashcard(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=user_a.id,  # same user — tested via the query filter below
        front="Card that belongs to a different conceptual user slice",
        back="Different user answer",
        citation_chunk_ids=[],
        card_type="definition",
    )
    db_session.add(card_b)
    await db_session.flush()

    repo = FlashcardRepository(db_session)
    # Query with a totally different user_id — should return empty
    cards_for_stranger = await repo.list_by_project(
        user_id=uuid.uuid4(), project_id=project.id
    )
    assert len(cards_for_stranger) == 0


# ─────────────────────────────────────────────────────────────────────────────
# 10. List flashcards: project-scoped
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_list_flashcards_project_scoped(db_session: AsyncSession, user_project):
    """list_by_project only returns cards from the specified project_id."""
    user, project = user_project

    card_a = Flashcard(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=user.id,
        front="Project A card",
        back="Project A answer",
        citation_chunk_ids=[],
        card_type="definition",
    )
    db_session.add(card_a)
    await db_session.flush()

    repo = FlashcardRepository(db_session)
    # Query for a different project — should not return card_a
    cards = await repo.list_by_project(user_id=user.id, project_id=uuid.uuid4())
    assert not any(c.id == card_a.id for c in cards)

    # Query for the real project — should return card_a
    cards_right = await repo.list_by_project(user_id=user.id, project_id=project.id)
    assert any(c.id == card_a.id for c in cards_right)


# ─────────────────────────────────────────────────────────────────────────────
# 11. Get detail: tenant isolated
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_flashcard_tenant_isolation(db_session: AsyncSession, user_project):
    """get_by_id returns None when user_id does not own the card."""
    user, project = user_project

    card = Flashcard(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=user.id,
        front="Owner's private card",
        back="Owner's private answer",
        citation_chunk_ids=[],
        card_type="definition",
    )
    db_session.add(card)
    await db_session.flush()

    repo = FlashcardRepository(db_session)
    # Another user cannot fetch the card
    result = await repo.get_by_id(
        user_id=uuid.uuid4(), project_id=project.id, flashcard_id=card.id
    )
    assert result is None

    # Owner can fetch it
    owner_result = await repo.get_by_id(
        user_id=user.id, project_id=project.id, flashcard_id=card.id
    )
    assert owner_result is not None
    assert owner_result.id == card.id


# ─────────────────────────────────────────────────────────────────────────────
# 12. Review → known=True
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_review_flashcard_mark_known(db_session: AsyncSession, user_project):
    """Marking a flashcard known sets known=True."""
    user, project = user_project
    card = Flashcard(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=user.id,
        front="What is ReLU?",
        back="Rectified Linear Unit.",
        citation_chunk_ids=[],
        card_type="definition",
    )
    db_session.add(card)
    await db_session.flush()

    repo = FlashcardRepository(db_session)
    updated = await repo.update_review(
        user_id=user.id, project_id=project.id, flashcard_id=card.id, known=True
    )
    assert updated is not None
    assert updated.known is True
    assert updated.review_count == 1


# ─────────────────────────────────────────────────────────────────────────────
# 13. Review → difficult=True
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_review_flashcard_mark_difficult(db_session: AsyncSession, user_project):
    """Marking a flashcard difficult sets difficult=True."""
    user, project = user_project
    card = Flashcard(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=user.id,
        front="What is backpropagation?",
        back="Gradient computation via chain rule.",
        citation_chunk_ids=[],
        card_type="explanation",
    )
    db_session.add(card)
    await db_session.flush()

    repo = FlashcardRepository(db_session)
    updated = await repo.update_review(
        user_id=user.id, project_id=project.id, flashcard_id=card.id, difficult=True
    )
    assert updated is not None
    assert updated.difficult is True


# ─────────────────────────────────────────────────────────────────────────────
# 14. Review → reset
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_review_flashcard_reset(db_session: AsyncSession, user_project):
    """Reset sets both known and difficult to False."""
    user, project = user_project
    card = Flashcard(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=user.id,
        front="What is LTP?",
        back="Long-Term Potentiation.",
        citation_chunk_ids=[],
        card_type="definition",
        known=True,
        difficult=True,
    )
    db_session.add(card)
    await db_session.flush()

    repo = FlashcardRepository(db_session)
    updated = await repo.update_review(
        user_id=user.id, project_id=project.id, flashcard_id=card.id, reset=True
    )
    assert updated is not None
    assert updated.known is False
    assert updated.difficult is False


# ─────────────────────────────────────────────────────────────────────────────
# 15. Delete flashcard
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_flashcard(db_session: AsyncSession, user_project):
    """delete_card removes the flashcard and returns True."""
    user, project = user_project
    card = Flashcard(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=user.id,
        front="To be deleted",
        back="Deletable answer",
        citation_chunk_ids=[],
        card_type="definition",
    )
    db_session.add(card)
    await db_session.flush()

    repo = FlashcardRepository(db_session)
    deleted = await repo.delete_card(
        user_id=user.id, project_id=project.id, flashcard_id=card.id
    )
    assert deleted is True

    remaining = await repo.get_by_id(user.id, project.id, card.id)
    assert remaining is None


# ─────────────────────────────────────────────────────────────────────────────
# 16. Delete non-existent card returns False
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_delete_nonexistent_flashcard(db_session: AsyncSession):
    """delete_card returns False when the flashcard doesn't exist."""
    repo = FlashcardRepository(db_session)
    deleted = await repo.delete_card(
        user_id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        flashcard_id=uuid.uuid4(),
    )
    assert deleted is False


# ─────────────────────────────────────────────────────────────────────────────
# 17. Duplicate prevention: same front not saved twice
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_duplicate_prevention_same_front(db_session: AsyncSession, user_project):
    """Generating a card with the same front as an existing card should skip it."""
    user, project = user_project
    chunk = make_chunk()
    chunk_id_str = str(chunk.chunk_id)

    # Pre-insert a card with the SAME front MockLLMProvider will return for "definition"
    existing_front = "What is self-attention in transformer models?"
    existing_card = Flashcard(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=user.id,
        front=existing_front,
        back="Existing answer",
        citation_chunk_ids=[chunk_id_str],
        card_type="definition",
    )
    db_session.add(existing_card)
    await db_session.flush()

    # Override mock to return only that front
    custom_output = FlashcardGenerationOutput(
        flashcards=[
            FlashcardLLMItem(
                front=existing_front,
                back="Duplicate answer",
                citation_chunk_ids=[chunk_id_str],
                card_type="definition",
            )
        ]
    )
    mock = MockLLMProvider(canned_response=custom_output)
    set_llm_provider(mock)

    with (
        patch("app.services.flashcard_service.MaterialRepository") as MockMaterialRepo,
        patch("app.services.flashcard_service.RetrievalService") as MockRetrieval,
        patch("app.services.flashcard_service.cache_service") as MockCache,
    ):
        MockMaterialRepo.return_value.count_ready_materials = AsyncMock(return_value=1)
        mock_chunk = make_chunk(chunk_id=chunk_id_str)
        MockRetrieval.return_value.retrieve_relevant_chunks = AsyncMock(
            return_value=make_retrieval_result([mock_chunk])
        )
        MockCache.get = AsyncMock(return_value=None)
        MockCache.set = AsyncMock(return_value=True)
        MockCache.build_key = MagicMock(return_value="key")

        service = FlashcardService(db_session)
        result = await service.generate(
            user_id=user.id,
            project_id=project.id,
            payload=FlashcardGenerateRequest(count=1),
        )

    assert result.total_generated == 0
    assert result.duplicates_skipped == 1


# ─────────────────────────────────────────────────────────────────────────────
# 18. Existing cards preserved on new generation
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_existing_cards_preserved_on_new_generation(
    db_session: AsyncSession, user_project
):
    """Existing flashcards are not deleted when new ones are generated."""
    user, project = user_project
    chunk = make_chunk()

    existing_card = Flashcard(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=user.id,
        front="Pre-existing card that must survive the generation",
        back="Existing answer",
        citation_chunk_ids=[],
        card_type="definition",
    )
    db_session.add(existing_card)
    await db_session.flush()

    with (
        patch("app.services.flashcard_service.MaterialRepository") as MockMaterialRepo,
        patch("app.services.flashcard_service.RetrievalService") as MockRetrieval,
        patch("app.services.flashcard_service.cache_service") as MockCache,
    ):
        MockMaterialRepo.return_value.count_ready_materials = AsyncMock(return_value=1)
        MockRetrieval.return_value.retrieve_relevant_chunks = AsyncMock(
            return_value=make_retrieval_result([chunk])
        )
        MockCache.get = AsyncMock(return_value=None)
        MockCache.set = AsyncMock(return_value=True)
        MockCache.build_key = MagicMock(return_value="key")

        service = FlashcardService(db_session)
        await service.generate(
            user_id=user.id,
            project_id=project.id,
            payload=FlashcardGenerateRequest(count=2),
        )

    repo = FlashcardRepository(db_session)
    all_cards = await repo.list_by_project(user_id=user.id, project_id=project.id)
    assert any(c.id == existing_card.id for c in all_cards)


# ─────────────────────────────────────────────────────────────────────────────
# 19. Gemini failure raises 502
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_gemini_failure_raises_502(db_session: AsyncSession, user_project):
    """If the LLM provider raises LLMGenerationError, the service raises HTTP 502."""
    from fastapi import HTTPException

    user, project = user_project
    failing_mock = MockLLMProvider(should_fail=True)
    set_llm_provider(failing_mock)

    chunk = make_chunk()

    with (
        patch("app.services.flashcard_service.MaterialRepository") as MockMaterialRepo,
        patch("app.services.flashcard_service.RetrievalService") as MockRetrieval,
        patch("app.services.flashcard_service.cache_service") as MockCache,
    ):
        MockMaterialRepo.return_value.count_ready_materials = AsyncMock(return_value=1)
        MockRetrieval.return_value.retrieve_relevant_chunks = AsyncMock(
            return_value=make_retrieval_result([chunk])
        )
        MockCache.get = AsyncMock(return_value=None)
        MockCache.set = AsyncMock()
        MockCache.build_key = MagicMock(return_value="key")

        service = FlashcardService(db_session)
        with pytest.raises(HTTPException) as exc_info:
            await service.generate(
                user_id=user.id,
                project_id=project.id,
                payload=FlashcardGenerateRequest(count=2),
            )

    assert exc_info.value.status_code == 502


# ─────────────────────────────────────────────────────────────────────────────
# 20. MockLLMProvider works deterministically
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_mock_llm_provider_flashcard_deterministic():
    """MockLLMProvider returns valid FlashcardGenerationOutput deterministically."""
    from app.schemas.flashcard import FlashcardGenerationOutput

    mock = MockLLMProvider()
    result, usage = await mock.generate_structured(
        system_instruction="test",
        user_prompt="key concepts definitions and explanations",
        response_schema=FlashcardGenerationOutput,
    )
    assert isinstance(result, FlashcardGenerationOutput)
    assert len(result.flashcards) >= 1
    for fc in result.flashcards:
        assert fc.front
        assert fc.back
        assert fc.card_type


# ─────────────────────────────────────────────────────────────────────────────
# 21. Cache hit bypasses retrieval
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_cache_hit_bypasses_retrieval(db_session: AsyncSession, user_project):
    """When cache has retrieval data, the retrieval service should not be called."""
    user, project = user_project
    chunk_id = str(uuid.uuid4())
    material_id = str(uuid.uuid4())

    cached_chunks = [
        {
            "chunk_id": chunk_id,
            "material_id": material_id,
            "filename": "cached.pdf",
            "page_number": 3,
            "content": "Cached content about supervised learning.",
            "distance": 0.1,
            "section_heading": None,
            "content_type": "paragraph",
        }
    ]

    with (
        patch("app.services.flashcard_service.MaterialRepository") as MockMaterialRepo,
        patch("app.services.flashcard_service.RetrievalService") as MockRetrieval,
        patch("app.services.flashcard_service.cache_service") as MockCache,
    ):
        MockMaterialRepo.return_value.count_ready_materials = AsyncMock(return_value=1)
        MockCache.get = AsyncMock(return_value=cached_chunks)
        MockCache.build_key = MagicMock(return_value="key")

        service = FlashcardService(db_session)
        result = await service.generate(
            user_id=user.id,
            project_id=project.id,
            payload=FlashcardGenerateRequest(count=1, topic_hint="supervised learning"),
        )

    # Retrieval service should NOT have been called (cache hit)
    MockRetrieval.return_value.retrieve_relevant_chunks.assert_not_called()


# ─────────────────────────────────────────────────────────────────────────────
# 22. Redis unavailable → generation continues
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_redis_unavailable_generation_continues(
    db_session: AsyncSession, user_project
):
    """If Redis is offline, flashcard generation should still succeed (graceful degradation)."""
    user, project = user_project
    chunk = make_chunk()

    with (
        patch("app.services.flashcard_service.MaterialRepository") as MockMaterialRepo,
        patch("app.services.flashcard_service.RetrievalService") as MockRetrieval,
        patch("app.services.flashcard_service.cache_service") as MockCache,
    ):
        MockMaterialRepo.return_value.count_ready_materials = AsyncMock(return_value=1)
        MockRetrieval.return_value.retrieve_relevant_chunks = AsyncMock(
            return_value=make_retrieval_result([chunk])
        )
        # Simulate Redis offline: get raises, set raises
        MockCache.get = AsyncMock(side_effect=Exception("Redis connection refused"))
        MockCache.set = AsyncMock(side_effect=Exception("Redis connection refused"))
        MockCache.build_key = MagicMock(return_value="key")

        service = FlashcardService(db_session)
        # Should not raise — falls back to live retrieval
        result = await service.generate(
            user_id=user.id,
            project_id=project.id,
            payload=FlashcardGenerateRequest(count=1),
        )

    assert isinstance(result, FlashcardGenerateResponse)


# ─────────────────────────────────────────────────────────────────────────────
# 23. AI usage logging records the call
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_ai_usage_logged_on_generation(db_session: AsyncSession, user_project):
    """AI usage should be logged (to db) after a successful flashcard generation."""
    from app.models.ai_usage import AIUsageLog
    from sqlalchemy import select

    user, project = user_project
    chunk = make_chunk()

    with (
        patch("app.services.flashcard_service.MaterialRepository") as MockMaterialRepo,
        patch("app.services.flashcard_service.RetrievalService") as MockRetrieval,
        patch("app.services.flashcard_service.cache_service") as MockCache,
    ):
        MockMaterialRepo.return_value.count_ready_materials = AsyncMock(return_value=1)
        MockRetrieval.return_value.retrieve_relevant_chunks = AsyncMock(
            return_value=make_retrieval_result([chunk])
        )
        MockCache.get = AsyncMock(return_value=None)
        MockCache.set = AsyncMock(return_value=True)
        MockCache.build_key = MagicMock(return_value="key")

        service = FlashcardService(db_session)
        await service.generate(
            user_id=user.id,
            project_id=project.id,
            payload=FlashcardGenerateRequest(count=2),
        )

    stmt = (
        select(AIUsageLog)
        .where(
            AIUsageLog.user_id == user.id,
            AIUsageLog.project_id == project.id,
            AIUsageLog.operation == "flashcard_generation",
        )
    )
    result = await db_session.execute(stmt)
    logs = list(result.scalars().all())
    assert len(logs) >= 1
    assert logs[0].success is True


# ─────────────────────────────────────────────────────────────────────────────
# Normalization helper
# ─────────────────────────────────────────────────────────────────────────────

def test_normalize_front_strips_punctuation():
    """normalize_front should lowercase and remove punctuation."""
    assert _normalize_front("What is ReLU?") == "what is relu"
    assert _normalize_front("  What is ReLU?  ") == "what is relu"
    assert _normalize_front("WHAT IS RELU?") == "what is relu"
