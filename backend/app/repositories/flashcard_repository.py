"""Flashcard Repository.

All queries enforce strict multi-tenant isolation via both user_id and project_id.
No flashcard from another user or project is ever accessible through this repository.
"""

import re
import uuid
from datetime import UTC, datetime

from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.flashcard import Flashcard, FlashcardReview
from app.services.spaced_repetition_service import (
    DEFAULT_EASE_FACTOR,
    INITIAL_INTERVAL_DAYS,
    ScheduleResult,
    SpacedRating,
    SpacedRepetitionService,
)


def _normalize_front(front: str) -> str:
    """Normalize a flashcard front for duplicate comparison."""
    text = front.lower().strip()
    text = re.sub(r"[^a-z0-9 ]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


class FlashcardRepository:
    """
    DATA ISOLATION BOUNDARY:
    Every query filters on BOTH user_id AND project_id.
    Flashcards are never accessible across tenant or project boundaries.
    """

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_by_project(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
    ) -> list[Flashcard]:
        """List all flashcards in a project, newest first. Strictly tenant-isolated."""
        stmt = (
            select(Flashcard)
            .where(
                Flashcard.user_id == user_id,
                Flashcard.project_id == project_id,
            )
            .order_by(Flashcard.created_at.desc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_id(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        flashcard_id: uuid.UUID,
    ) -> Flashcard | None:
        """Fetch a single flashcard. Returns None if not owned by this user+project."""
        stmt = select(Flashcard).where(
            Flashcard.id == flashcard_id,
            Flashcard.user_id == user_id,
            Flashcard.project_id == project_id,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_id_for_update(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        flashcard_id: uuid.UUID,
    ) -> Flashcard | None:
        """Fetch a flashcard with an exclusive row lock for atomic review transactions."""
        stmt = (
            select(Flashcard)
            .where(
                Flashcard.id == flashcard_id,
                Flashcard.user_id == user_id,
                Flashcard.project_id == project_id,
            )
            .with_for_update()
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_due(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        *,
        limit: int = 10,
        concept_id: uuid.UUID | None = None,
        as_of: datetime | None = None,
    ) -> list[Flashcard]:
        """Retrieve cards due for review with deterministic priority ordering.

        Deterministic Order:
        1. Overdue reviewed cards (next_review_at <= now, ordered by next_review_at ASC - most overdue first)
        2. Cards due now
        3. Never-reviewed / new cards (next_review_at IS NULL, ordered by created_at ASC)
        4. Tie-break on flashcard.id ASC
        """
        now = as_of if as_of is not None else datetime.now(UTC)
        if now.tzinfo is None:
            now = now.replace(tzinfo=UTC)

        filters = [
            Flashcard.user_id == user_id,
            Flashcard.project_id == project_id,
            or_(
                Flashcard.next_review_at.is_(None),
                Flashcard.next_review_at <= now,
            ),
        ]
        if concept_id is not None:
            filters.append(Flashcard.concept_id == concept_id)

        stmt = (
            select(Flashcard)
            .where(*filters)
            .order_by(
                # 0 for reviewed cards with next_review_at, 1 for never-reviewed (NULL)
                case((Flashcard.next_review_at.is_(None), 1), else_=0).asc(),
                Flashcard.next_review_at.asc(),
                Flashcard.created_at.asc(),
                Flashcard.id.asc(),
            )
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_due_summary(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        *,
        as_of: datetime | None = None,
    ) -> dict[str, int]:
        """Compute counts for Today's Review Dashboard.

        Returns:
            due_count: Cards with next_review_at <= now AND next_review_at IS NOT NULL
            new_count: Cards with next_review_at IS NULL or review_count == 0
            completed_today_count: Reviews logged in flashcard_reviews today (UTC)
        """
        now = as_of if as_of is not None else datetime.now(UTC)
        if now.tzinfo is None:
            now = now.replace(tzinfo=UTC)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        # Due reviewed cards count
        stmt_due = select(func.count(Flashcard.id)).where(
            Flashcard.user_id == user_id,
            Flashcard.project_id == project_id,
            Flashcard.next_review_at.is_not(None),
            Flashcard.next_review_at <= now,
        )
        due_res = await self.session.execute(stmt_due)
        due_count = due_res.scalar() or 0

        # New / never-reviewed cards count
        stmt_new = select(func.count(Flashcard.id)).where(
            Flashcard.user_id == user_id,
            Flashcard.project_id == project_id,
            or_(
                Flashcard.next_review_at.is_(None),
                Flashcard.review_count == 0,
            ),
        )
        new_res = await self.session.execute(stmt_new)
        new_count = new_res.scalar() or 0

        # Completed today in review history
        stmt_today = select(func.count(FlashcardReview.id)).where(
            FlashcardReview.user_id == user_id,
            FlashcardReview.project_id == project_id,
            FlashcardReview.reviewed_at >= today_start,
        )
        today_res = await self.session.execute(stmt_today)
        completed_today_count = today_res.scalar() or 0

        return {
            "due_count": due_count,
            "new_count": new_count,
            "completed_today_count": completed_today_count,
        }

    async def get_review_by_idempotency_key(
        self,
        user_id: uuid.UUID,
        idempotency_key: str,
    ) -> FlashcardReview | None:
        """Fetch review record by client idempotency key to prevent double ratings."""
        stmt = select(FlashcardReview).where(
            FlashcardReview.user_id == user_id,
            FlashcardReview.idempotency_key == idempotency_key,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def apply_spaced_review(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        flashcard_id: uuid.UUID,
        rating: str,
        *,
        idempotency_key: str | None = None,
        as_of: datetime | None = None,
    ) -> tuple[Flashcard, FlashcardReview, bool]:
        """Atomically calculate, update, and record spaced repetition review for a card.

        Returns:
            (updated_card, review_record, is_duplicate)
        """
        now = as_of if as_of is not None else datetime.now(UTC)
        if now.tzinfo is None:
            now = now.replace(tzinfo=UTC)

        # 1. Request-level idempotency check
        if idempotency_key:
            existing_review = await self.get_review_by_idempotency_key(
                user_id=user_id, idempotency_key=idempotency_key
            )
            if existing_review and existing_review.flashcard_id == flashcard_id:
                card = await self.get_by_id(user_id, project_id, flashcard_id)
                if card:
                    return card, existing_review, True

        # 2. Fetch and lock flashcard for atomic update
        card = await self.get_by_id_for_update(user_id, project_id, flashcard_id)
        if not card:
            raise ValueError("Flashcard not found or access denied")

        # 3. Calculate next schedule deterministically
        sched = SpacedRepetitionService.calculate_next_schedule(
            current_interval=card.interval_days,
            current_ease=card.ease_factor,
            review_count=card.review_count,
            rating=rating,
            as_of=now,
        )

        # 4. Map legacy known/difficult flags
        if sched.rating in (SpacedRating.GOOD.value, SpacedRating.EASY.value):
            card.known = True
            card.difficult = False
        elif sched.rating in (SpacedRating.DIFFICULT.value, SpacedRating.AGAIN.value):
            card.known = False
            card.difficult = True

        # 5. Update flashcard scheduling state (single source of truth)
        card.interval_days = sched.new_interval
        card.ease_factor = sched.new_ease
        card.review_count = sched.new_review_count
        card.next_review_at = sched.next_review_at
        card.last_rating = sched.rating
        card.last_reviewed_at = now
        card.updated_at = now

        # 6. Append immutable review history
        review = FlashcardReview(
            flashcard_id=card.id,
            user_id=user_id,
            project_id=project_id,
            rating=sched.rating,
            previous_interval=sched.previous_interval,
            new_interval=sched.new_interval,
            previous_ease=sched.previous_ease,
            new_ease=sched.new_ease,
            reviewed_at=now,
            idempotency_key=idempotency_key,
        )
        self.session.add(review)
        await self.session.flush()
        await self.session.refresh(card)

        return card, review, False

    async def reset_card_schedule(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        flashcard_id: uuid.UUID,
    ) -> Flashcard | None:
        """Reset a flashcard back to unreviewed / default initial state."""
        card = await self.get_by_id_for_update(user_id, project_id, flashcard_id)
        if not card:
            return None

        now = datetime.now(UTC)
        card.interval_days = INITIAL_INTERVAL_DAYS
        card.ease_factor = DEFAULT_EASE_FACTOR
        card.review_count = 0
        card.next_review_at = None
        card.last_rating = None
        card.known = False
        card.difficult = False
        card.last_reviewed_at = now
        card.updated_at = now

        await self.session.flush()
        await self.session.refresh(card)
        return card

    async def get_existing_fronts(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
    ) -> set[str]:
        """Return normalized front texts for all existing project flashcards.

        Used for duplicate detection before persisting new cards.
        """
        stmt = select(Flashcard.front).where(
            Flashcard.user_id == user_id,
            Flashcard.project_id == project_id,
        )
        result = await self.session.execute(stmt)
        return {_normalize_front(row[0]) for row in result.all()}

    async def bulk_create(self, flashcards: list[Flashcard]) -> list[Flashcard]:
        """Persist a batch of flashcard objects. Returns the persisted list."""
        for card in flashcards:
            self.session.add(card)
        await self.session.flush()
        for card in flashcards:
            await self.session.refresh(card)
        return flashcards

    async def update_review(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        flashcard_id: uuid.UUID,
        *,
        known: bool | None = None,
        difficult: bool | None = None,
        reset: bool = False,
    ) -> Flashcard | None:
        """Legacy helper for backward compatibility."""
        if reset:
            return await self.reset_card_schedule(user_id, project_id, flashcard_id)
        rating = "good" if known else ("difficult" if difficult else "good")
        card, _, _ = await self.apply_spaced_review(
            user_id=user_id,
            project_id=project_id,
            flashcard_id=flashcard_id,
            rating=rating,
        )
        return card

    async def delete_card(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        flashcard_id: uuid.UUID,
    ) -> bool:
        """Delete a flashcard. Returns True if deleted, False if not found."""
        card = await self.get_by_id(user_id, project_id, flashcard_id)
        if not card:
            return False
        await self.session.delete(card)
        await self.session.flush()
        return True

    @staticmethod
    def normalize_front(front: str) -> str:
        return _normalize_front(front)

