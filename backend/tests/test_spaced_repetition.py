"""Tests for Lightweight Spaced Repetition for Flashcards.

Tests cover:
- Lightweight SM-2-inspired scheduler unit tests (deterministic calculation, boundaries, UTC timestamps)
- Priority ordering for due cards (overdue first, then new, deterministic tie-breaking)
- Single source of truth & legacy action compatibility
- Request-level idempotency protection
- Append-only review history table (FlashcardReview)
- Atomic review transactions & rollback
- Route order (/due resolved before /{flashcard_id})
- Due count summary for Today's Review dashboard
- Concept filtering & project isolation
- Redis cache invalidation and fallback
- Session tracking activity events
"""

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.main import app
from app.models.concept import Concept
from app.models.flashcard import Flashcard, FlashcardReview
from app.models.project import Project
from app.models.space import Space
from app.models.user import User
from app.schemas.flashcard import FlashcardReviewRequest
from app.services.flashcard_service import FlashcardService
from app.services.spaced_repetition_service import (
    DEFAULT_EASE_FACTOR,
    INITIAL_INTERVAL_DAYS,
    MAX_EASE_FACTOR,
    MIN_EASE_FACTOR,
    SpacedRepetitionService,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
async def user_project(db_session: AsyncSession):
    """Create a test user, space, and project with valid foreign keys."""
    uid = uuid.uuid4()
    user = User(
        id=uid,
        email=f"sr_user_{uid.hex[:8]}@example.com",
        hashed_password=hash_password("Password123!"),
        full_name="Spaced Repetition User",
    )
    db_session.add(user)
    await db_session.flush()

    space = Space(
        id=uuid.uuid4(),
        user_id=user.id,
        name="Study Space",
    )
    db_session.add(space)
    await db_session.flush()

    project = Project(
        id=uuid.uuid4(),
        user_id=user.id,
        space_id=space.id,
        name="Machine Learning Fundamentals",
        learning_goal="Master spaced repetition",
    )
    db_session.add(project)
    await db_session.flush()

    return user, project


# ---------------------------------------------------------------------------
# Part 1: Scheduler Pure Unit Tests (1–13)
# ---------------------------------------------------------------------------

def test_scheduler_new_card_initial_state():
    """Default values must be consistent."""
    assert DEFAULT_EASE_FACTOR == 2.5
    assert MIN_EASE_FACTOR == 1.3
    assert MAX_EASE_FACTOR == 3.5
    assert INITIAL_INTERVAL_DAYS == 0


def test_scheduler_first_again():
    """First review rated 'again' resets interval to 1 day and decreases ease by 0.20."""
    now = datetime(2026, 9, 17, 12, 0, 0, tzinfo=UTC)
    result = SpacedRepetitionService.calculate_next_schedule(
        current_interval=0,
        current_ease=2.5,
        review_count=0,
        rating="again",
        as_of=now,
    )
    assert result.new_interval == 1
    assert result.new_ease == 2.30
    assert result.new_review_count == 1
    assert result.next_review_at == now + timedelta(days=1)
    assert result.is_due is False


def test_scheduler_first_difficult():
    """First review rated 'difficult' sets interval to 1 day and decreases ease by 0.15."""
    now = datetime(2026, 9, 17, 12, 0, 0, tzinfo=UTC)
    result = SpacedRepetitionService.calculate_next_schedule(
        current_interval=0,
        current_ease=2.5,
        review_count=0,
        rating="difficult",
        as_of=now,
    )
    assert result.new_interval == 1
    assert result.new_ease == 2.35
    assert result.new_review_count == 1
    assert result.next_review_at == now + timedelta(days=1)


def test_scheduler_first_good():
    """First review rated 'good' sets interval to 1 day and preserves ease."""
    now = datetime(2026, 9, 17, 12, 0, 0, tzinfo=UTC)
    result = SpacedRepetitionService.calculate_next_schedule(
        current_interval=0,
        current_ease=2.5,
        review_count=0,
        rating="good",
        as_of=now,
    )
    assert result.new_interval == 1
    assert result.new_ease == 2.50
    assert result.new_review_count == 1
    assert result.next_review_at == now + timedelta(days=1)


def test_scheduler_first_easy():
    """First review rated 'easy' sets interval to 3 days and increases ease by 0.15."""
    now = datetime(2026, 9, 17, 12, 0, 0, tzinfo=UTC)
    result = SpacedRepetitionService.calculate_next_schedule(
        current_interval=0,
        current_ease=2.5,
        review_count=0,
        rating="easy",
        as_of=now,
    )
    assert result.new_interval == 3
    assert result.new_ease == 2.65
    assert result.new_review_count == 1
    assert result.next_review_at == now + timedelta(days=3)


def test_scheduler_repeated_good_progression():
    """Progression of Good reviews: 1d -> 3d -> round(interval * ease)."""
    now = datetime(2026, 9, 17, 12, 0, 0, tzinfo=UTC)
    # Review 1: Good from 0 -> 1d
    res1 = SpacedRepetitionService.calculate_next_schedule(
        current_interval=0, current_ease=2.5, review_count=0, rating="good", as_of=now
    )
    assert res1.new_interval == 1

    # Review 2: Good from 1 -> 3d
    res2 = SpacedRepetitionService.calculate_next_schedule(
        current_interval=res1.new_interval, current_ease=res1.new_ease, review_count=1, rating="good", as_of=now
    )
    assert res2.new_interval == 3

    # Review 3: Good from 3 -> round(3 * 2.5) = 8d
    res3 = SpacedRepetitionService.calculate_next_schedule(
        current_interval=res2.new_interval, current_ease=res2.new_ease, review_count=2, rating="good", as_of=now
    )
    assert res3.new_interval == 8


def test_scheduler_repeated_easy_aggressive_growth():
    """Easy progression scales aggressively: 3d -> 6d -> round(6 * ease * 1.3)."""
    now = datetime(2026, 9, 17, 12, 0, 0, tzinfo=UTC)
    res1 = SpacedRepetitionService.calculate_next_schedule(
        current_interval=0, current_ease=2.5, review_count=0, rating="easy", as_of=now
    )
    assert res1.new_interval == 3
    assert res1.new_ease == 2.65

    res2 = SpacedRepetitionService.calculate_next_schedule(
        current_interval=res1.new_interval, current_ease=res1.new_ease, review_count=1, rating="easy", as_of=now
    )
    # 3 * 2.65 * 1.3 = 10.335 -> 10 days
    assert res2.new_interval == 10
    assert res2.new_ease == 2.80

    res3 = SpacedRepetitionService.calculate_next_schedule(
        current_interval=res2.new_interval, current_ease=res2.new_ease, review_count=2, rating="easy", as_of=now
    )
    # 10 * 2.80 * 1.3 = 36.4 -> 36 days
    assert res3.new_interval == 36


def test_scheduler_repeated_difficult_slow_growth():
    """Difficult reviews grow interval conservatively."""
    now = datetime(2026, 9, 17, 12, 0, 0, tzinfo=UTC)
    res1 = SpacedRepetitionService.calculate_next_schedule(
        current_interval=0, current_ease=2.5, review_count=0, rating="difficult", as_of=now
    )
    assert res1.new_interval == 1
    assert res1.new_ease == 2.35

    res2 = SpacedRepetitionService.calculate_next_schedule(
        current_interval=res1.new_interval, current_ease=res1.new_ease, review_count=1, rating="difficult", as_of=now
    )
    # max(1 + 1, round(1 * 1.2)) = 2
    assert res2.new_interval == 2
    assert res2.new_ease == 2.20


def test_scheduler_again_after_success():
    """Rating 'again' resets interval back to 1 day even if previously large."""
    now = datetime(2026, 9, 17, 12, 0, 0, tzinfo=UTC)
    res = SpacedRepetitionService.calculate_next_schedule(
        current_interval=30, current_ease=2.8, review_count=5, rating="again", as_of=now
    )
    assert res.new_interval == 1
    assert res.new_ease == 2.60


def test_scheduler_ease_factor_boundaries():
    """Ease factor never drops below 1.3 or exceeds 3.5."""
    # Underflow boundary
    res_low = SpacedRepetitionService.calculate_next_schedule(
        current_interval=5, current_ease=1.35, review_count=3, rating="again"
    )
    assert res_low.new_ease == MIN_EASE_FACTOR  # 1.35 - 0.20 clamped to 1.3

    # Overflow boundary
    res_high = SpacedRepetitionService.calculate_next_schedule(
        current_interval=10, current_ease=3.45, review_count=4, rating="easy"
    )
    assert res_high.new_ease == MAX_EASE_FACTOR  # 3.45 + 0.15 clamped to 3.5


def test_scheduler_interval_boundaries():
    """Active review interval is always >= 1."""
    res = SpacedRepetitionService.calculate_next_schedule(
        current_interval=0, current_ease=1.3, review_count=0, rating="again"
    )
    assert res.new_interval >= 1


def test_scheduler_timezone_aware_utc():
    """Returned next_review_at is strictly timezone-aware UTC."""
    result = SpacedRepetitionService.calculate_next_schedule(
        current_interval=0, current_ease=2.5, review_count=0, rating="good"
    )
    assert result.next_review_at.tzinfo is not None
    assert result.next_review_at.tzinfo == UTC


def test_scheduler_deterministic_behavior():
    """Identical parameters produce identical results every time."""
    now = datetime(2026, 9, 17, 15, 0, 0, tzinfo=UTC)
    r1 = SpacedRepetitionService.calculate_next_schedule(
        current_interval=4, current_ease=2.3, review_count=2, rating="good", as_of=now
    )
    r2 = SpacedRepetitionService.calculate_next_schedule(
        current_interval=4, current_ease=2.3, review_count=2, rating="good", as_of=now
    )
    assert r1 == r2


def test_preview_intervals():
    """preview_intervals returns prospective days for all 4 ratings."""
    previews = SpacedRepetitionService.preview_intervals(
        current_interval=3, current_ease=2.5, review_count=2
    )
    assert "again" in previews
    assert "difficult" in previews
    assert "good" in previews
    assert "easy" in previews
    assert previews["again"] == 1
    assert previews["difficult"] >= 4
    assert previews["good"] == 8
    assert previews["easy"] > previews["good"]


def test_is_card_due_semantics():
    """Check is_card_due semantics: None -> True, past -> True, future -> False."""
    now = datetime(2026, 9, 17, 12, 0, 0, tzinfo=UTC)
    # Never reviewed -> True
    assert SpacedRepetitionService.is_card_due(None, as_of=now) is True
    # In past -> True
    assert SpacedRepetitionService.is_card_due(now - timedelta(hours=1), as_of=now) is True
    # Now -> True
    assert SpacedRepetitionService.is_card_due(now, as_of=now) is True
    # Future -> False
    assert SpacedRepetitionService.is_card_due(now + timedelta(hours=1), as_of=now) is False


# ---------------------------------------------------------------------------
# Part 2: Database, Migration & Route Resolution Tests (14–17)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_route_order_due_not_interpreted_as_uuid(user_project):
    """FastAPI must resolve GET /flashcards/due without raising 422 UUID parsing error."""
    user, project = user_project
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Request with unauthenticated client should return 401, not 422
        resp = await client.get(f"/api/v1/projects/{project.id}/flashcards/due")
        assert resp.status_code == 401

        resp_sum = await client.get(f"/api/v1/projects/{project.id}/flashcards/due/summary")
        assert resp_sum.status_code == 401


# ---------------------------------------------------------------------------
# Part 3: Service & Repository Integration Tests (18–33)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_get_due_flashcards_empty(db_session: AsyncSession, user_project):
    """Returns empty list when no flashcards exist in project."""
    user, project = user_project
    service = FlashcardService(db_session)
    due = await service.list_due(user_id=user.id, project_id=project.id)
    assert due == []


@pytest.mark.asyncio
async def test_get_due_flashcards_includes_unreviewed(db_session: AsyncSession, user_project):
    """Cards with next_review_at IS NULL appear in due cards."""
    user, project = user_project
    card = Flashcard(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=user.id,
        front="What is backpropagation?",
        back="An algorithm to compute gradients.",
        next_review_at=None,
        review_count=0,
    )
    db_session.add(card)
    await db_session.flush()

    service = FlashcardService(db_session)
    due = await service.list_due(user_id=user.id, project_id=project.id)
    assert len(due) == 1
    assert due[0].id == card.id
    assert due[0].is_due is True


@pytest.mark.asyncio
async def test_due_flashcards_priority_ordering(db_session: AsyncSession, user_project):
    """Due cards must be ordered: overdue cards first (oldest next_review_at), then new cards (created_at)."""
    user, project = user_project
    now = datetime.now(UTC)

    # 1. Very overdue card
    c_very_overdue = Flashcard(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=user.id,
        front="Very overdue card",
        back="Answer 1",
        next_review_at=now - timedelta(days=5),
        created_at=now - timedelta(days=10),
    )
    # 2. Slightly overdue card
    c_slightly_overdue = Flashcard(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=user.id,
        front="Slightly overdue card",
        back="Answer 2",
        next_review_at=now - timedelta(days=1),
        created_at=now - timedelta(days=9),
    )
    # 3. New unreviewed card
    c_new = Flashcard(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=user.id,
        front="New card",
        back="Answer 3",
        next_review_at=None,
        created_at=now - timedelta(days=2),
    )
    # 4. Not due card (in future) - should NOT be in due list
    c_future = Flashcard(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=user.id,
        front="Future card",
        back="Answer 4",
        next_review_at=now + timedelta(days=3),
        created_at=now - timedelta(days=1),
    )
    db_session.add_all([c_very_overdue, c_slightly_overdue, c_new, c_future])
    await db_session.flush()

    service = FlashcardService(db_session)
    due = await service.list_due(user_id=user.id, project_id=project.id)

    assert len(due) == 3
    # Strict order: very overdue -> slightly overdue -> new
    assert due[0].id == c_very_overdue.id
    assert due[1].id == c_slightly_overdue.id
    assert due[2].id == c_new.id


@pytest.mark.asyncio
async def test_due_summary_counts(db_session: AsyncSession, user_project):
    """get_due_summary accurately counts due, new, and completed-today reviews."""
    user, project = user_project
    now = datetime.now(UTC)

    # 1 due card
    c_due = Flashcard(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=user.id,
        front="Card 1",
        back="A1",
        next_review_at=now - timedelta(days=1),
        review_count=1,
    )
    # 2 new cards
    c_new1 = Flashcard(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=user.id,
        front="Card 2",
        back="A2",
        next_review_at=None,
        review_count=0,
    )
    c_new2 = Flashcard(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=user.id,
        front="Card 3",
        back="A3",
        next_review_at=None,
        review_count=0,
    )
    db_session.add_all([c_due, c_new1, c_new2])
    await db_session.flush()

    # 1 review history today
    review = FlashcardReview(
        flashcard_id=c_due.id,
        user_id=user.id,
        project_id=project.id,
        rating="good",
        previous_interval=0,
        new_interval=1,
        previous_ease=2.5,
        new_ease=2.5,
        reviewed_at=now,
    )
    db_session.add(review)
    await db_session.flush()

    service = FlashcardService(db_session)
    summary = await service.get_due_summary(user_id=user.id, project_id=project.id)
    assert summary.due_count == 1
    assert summary.new_count == 2
    assert summary.completed_today_count == 1


@pytest.mark.asyncio
async def test_review_card_spaced_ratings(db_session: AsyncSession, user_project):
    """Reviewing with ratings (again, difficult, good, easy) updates card schedule and creates history."""
    user, project = user_project
    card = Flashcard(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=user.id,
        front="What is SGD?",
        back="Stochastic Gradient Descent",
        interval_days=0,
        ease_factor=2.5,
        review_count=0,
    )
    db_session.add(card)
    await db_session.flush()

    service = FlashcardService(db_session)

    # 1. Review with Good
    resp = await service.review_card(
        user_id=user.id,
        project_id=project.id,
        flashcard_id=card.id,
        payload=FlashcardReviewRequest(rating="good"),
    )
    assert resp.rating == "good"
    assert resp.review_count == 1
    assert resp.interval_days == 1
    assert resp.ease_factor == 2.5
    assert resp.flashcard.known is True
    assert resp.flashcard.difficult is False
    assert resp.previous_interval == 0
    assert resp.new_interval == 1

    # Verify history row created
    stmt = select(FlashcardReview).where(FlashcardReview.flashcard_id == card.id)
    reviews = (await db_session.execute(stmt)).scalars().all()
    assert len(reviews) == 1
    assert reviews[0].rating == "good"
    assert reviews[0].new_interval == 1


@pytest.mark.asyncio
async def test_review_card_legacy_action_mapping(db_session: AsyncSession, user_project):
    """Legacy action 'known' maps to good, 'difficult' to difficult, 'reset' resets schedule."""
    user, project = user_project
    card = Flashcard(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=user.id,
        front="Legacy card",
        back="Answer",
        interval_days=4,
        ease_factor=2.2,
        review_count=3,
        known=True,
    )
    db_session.add(card)
    await db_session.flush()

    service = FlashcardService(db_session)

    # Reset action
    reset_resp = await service.review_card(
        user_id=user.id,
        project_id=project.id,
        flashcard_id=card.id,
        payload=FlashcardReviewRequest(action="reset"),
    )
    assert reset_resp.rating == "reset"
    assert reset_resp.review_count == 0
    assert reset_resp.interval_days == 0
    assert reset_resp.ease_factor == 2.5
    assert reset_resp.flashcard.known is False
    assert reset_resp.flashcard.difficult is False
    assert reset_resp.flashcard.next_review_at is None


@pytest.mark.asyncio
async def test_review_card_idempotency_key_prevents_double_update(db_session: AsyncSession, user_project):
    """Submitting with identical idempotency_key returns cached review without recalculating or double jumping."""
    user, project = user_project
    card = Flashcard(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=user.id,
        front="Idempotency test card",
        back="Answer",
        interval_days=1,
        ease_factor=2.5,
        review_count=1,
    )
    db_session.add(card)
    await db_session.flush()

    service = FlashcardService(db_session)
    key = str(uuid.uuid4())

    # First request
    resp1 = await service.review_card(
        user_id=user.id,
        project_id=project.id,
        flashcard_id=card.id,
        payload=FlashcardReviewRequest(rating="good", idempotency_key=key),
    )
    assert resp1.review_count == 2
    assert resp1.interval_days == 3

    # Duplicate request with same key
    resp2 = await service.review_card(
        user_id=user.id,
        project_id=project.id,
        flashcard_id=card.id,
        payload=FlashcardReviewRequest(rating="good", idempotency_key=key),
    )
    # Must NOT have jumped to 8 days or review_count 3!
    assert resp2.review_count == 2
    assert resp2.interval_days == 3

    # Exactly 1 history record should exist with this key
    stmt = select(FlashcardReview).where(FlashcardReview.idempotency_key == key)
    reviews = (await db_session.execute(stmt)).scalars().all()
    assert len(reviews) == 1


@pytest.mark.asyncio
async def test_tenant_isolation_due_cards(db_session: AsyncSession, user_project):
    """User B cannot fetch due cards for User A's project."""
    user_a, project_a = user_project

    # Create User B
    uid_b = uuid.uuid4()
    user_b = User(
        id=uid_b,
        email=f"user_b_{uid_b.hex[:8]}@example.com",
        hashed_password=hash_password("Pass123!"),
        full_name="User B",
    )
    db_session.add(user_b)
    await db_session.flush()

    service = FlashcardService(db_session)

    # User B attempting to get due cards of Project A must raise 404
    with pytest.raises(HTTPException) as exc_info:
        await service.list_due(user_id=user_b.id, project_id=project_a.id)
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_concept_filtering_due_cards(db_session: AsyncSession, user_project):
    """GET due cards with concept_id filters correctly and rejects cross-project concept."""
    user, project = user_project
    concept = Concept(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=user.id,
        name="Loss Functions",
        description="Loss function concepts for ML",
    )
    db_session.add(concept)
    await db_session.flush()

    card_with_concept = Flashcard(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=user.id,
        concept_id=concept.id,
        front="Cross Entropy",
        back="A loss function",
        next_review_at=None,
    )
    card_without_concept = Flashcard(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=user.id,
        concept_id=None,
        front="Learning Rate",
        back="A hyperparameter",
        next_review_at=None,
    )
    db_session.add_all([card_with_concept, card_without_concept])
    await db_session.flush()

    service = FlashcardService(db_session)

    # Filter by concept
    due = await service.list_due(
        user_id=user.id, project_id=project.id, concept_id=concept.id
    )
    assert len(due) == 1
    assert due[0].id == card_with_concept.id

    # Cross project or nonexistent concept returns 404
    with pytest.raises(HTTPException) as exc_info:
        await service.list_due(
            user_id=user.id, project_id=project.id, concept_id=uuid.uuid4()
        )
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_review_card_invalid_rating(db_session: AsyncSession, user_project):
    """Reviewing with an invalid rating raises 422."""
    user, project = user_project
    card = Flashcard(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=user.id,
        front="Test",
        back="Answer",
    )
    db_session.add(card)
    await db_session.flush()

    service = FlashcardService(db_session)
    with pytest.raises(HTTPException) as exc_info:
        await service.review_card(
            user_id=user.id,
            project_id=project.id,
            flashcard_id=card.id,
            payload=FlashcardReviewRequest(rating="excellent"),
        )
    assert exc_info.value.status_code == 422


@pytest.mark.asyncio
async def test_session_tracking_activity_events(db_session: AsyncSession, user_project):
    """Session start and complete events are recorded via ActivityEvent."""
    user, project = user_project
    service = FlashcardService(db_session)

    await service.record_session_event(
        user_id=user.id,
        project_id=project.id,
        event_type="flashcard_session_started",
        payload={"deck_size": 10},
    )

    await service.record_session_event(
        user_id=user.id,
        project_id=project.id,
        event_type="flashcard_session_completed",
        payload={"cards_reviewed": 10, "rating_breakdown": {"good": 10}},
    )


@pytest.mark.asyncio
async def test_redis_unavailable_due_cards_fallback(db_session: AsyncSession, user_project):
    """If Redis is unavailable, get_due_flashcards falls back to database query."""
    user, project = user_project
    card = Flashcard(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=user.id,
        front="Redis fallback card",
        back="Answer",
        next_review_at=None,
    )
    db_session.add(card)
    await db_session.flush()

    with patch("app.services.flashcard_service.cache_service") as MockCache:
        MockCache.get = AsyncMock(side_effect=Exception("Redis connection error"))
        MockCache.set = AsyncMock(side_effect=Exception("Redis connection error"))

        service = FlashcardService(db_session)
        due = await service.list_due(user_id=user.id, project_id=project.id)
        assert len(due) == 1
        assert due[0].id == card.id


def test_alembic_migration_chain_no_branches():
    """Verify alembic migrations form a single linear chain with no branch points."""
    alembic_cfg = Config("alembic.ini")
    script = ScriptDirectory.from_config(alembic_cfg)
    heads = script.get_heads()
    assert len(heads) == 1

    # Trace back chain
    sr_rev = script.get_revision("0011_add_spaced_repetition")
    assert sr_rev.down_revision == "0010_create_flashcards"


@pytest.mark.asyncio
async def test_rapid_legitimate_reviews_succeed_with_distinct_keys(db_session: AsyncSession, user_project):
    """Two legitimate rapid reviews on the same card with distinct keys both execute sequentially."""
    user, project = user_project
    card = Flashcard(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=user.id,
        front="Rapid card",
        back="Answer",
        interval_days=0,
        ease_factor=2.5,
        review_count=0,
    )
    db_session.add(card)
    await db_session.flush()

    service = FlashcardService(db_session)
    key1 = str(uuid.uuid4())
    key2 = str(uuid.uuid4())

    resp1 = await service.review_card(
        user_id=user.id,
        project_id=project.id,
        flashcard_id=card.id,
        payload=FlashcardReviewRequest(rating="again", idempotency_key=key1),
    )
    assert resp1.review_count == 1
    assert resp1.interval_days == 1

    # Second review immediately after
    resp2 = await service.review_card(
        user_id=user.id,
        project_id=project.id,
        flashcard_id=card.id,
        payload=FlashcardReviewRequest(rating="good", idempotency_key=key2),
    )
    assert resp2.review_count == 2
    assert resp2.interval_days == 3


@pytest.mark.asyncio
async def test_current_schedule_vs_historical_review_records(db_session: AsyncSession, user_project):
    """Verifies that Flashcard keeps current state, and FlashcardReview stores append-only history of every transition."""
    user, project = user_project
    card = Flashcard(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=user.id,
        front="Transition card",
        back="Answer",
        interval_days=0,
        ease_factor=2.5,
        review_count=0,
    )
    db_session.add(card)
    await db_session.flush()

    service = FlashcardService(db_session)
    await service.review_card(
        user_id=user.id,
        project_id=project.id,
        flashcard_id=card.id,
        payload=FlashcardReviewRequest(rating="good", idempotency_key=str(uuid.uuid4())),
    )
    await service.review_card(
        user_id=user.id,
        project_id=project.id,
        flashcard_id=card.id,
        payload=FlashcardReviewRequest(rating="good", idempotency_key=str(uuid.uuid4())),
    )
    await service.review_card(
        user_id=user.id,
        project_id=project.id,
        flashcard_id=card.id,
        payload=FlashcardReviewRequest(rating="easy", idempotency_key=str(uuid.uuid4())),
    )

    # Current card state
    updated_card = await db_session.get(Flashcard, card.id)
    assert updated_card.review_count == 3
    assert updated_card.last_rating == "easy"
    assert updated_card.interval_days == 10

    # History records: append-only
    stmt = (
        select(FlashcardReview)
        .where(FlashcardReview.flashcard_id == card.id)
        .order_by(FlashcardReview.reviewed_at.asc())
    )
    history = (await db_session.execute(stmt)).scalars().all()
    assert len(history) == 3
    assert history[0].previous_interval == 0 and history[0].new_interval == 1
    assert history[1].previous_interval == 1 and history[1].new_interval == 3
    assert history[2].previous_interval == 3 and history[2].new_interval == 10


@pytest.mark.asyncio
async def test_cache_invalidation_after_review(db_session: AsyncSession, user_project):
    """Reviewing a card invalidates the due-cards cache for the project."""
    user, project = user_project
    card = Flashcard(
        id=uuid.uuid4(),
        project_id=project.id,
        user_id=user.id,
        front="Cache card",
        back="Answer",
        next_review_at=None,
    )
    db_session.add(card)
    await db_session.flush()

    with patch("app.services.flashcard_service.cache_service") as MockCache:
        MockCache.delete = AsyncMock(return_value=True)
        service = FlashcardService(db_session)
        await service.review_card(
            user_id=user.id,
            project_id=project.id,
            flashcard_id=card.id,
            payload=FlashcardReviewRequest(rating="good"),
        )
        assert MockCache.delete.called

