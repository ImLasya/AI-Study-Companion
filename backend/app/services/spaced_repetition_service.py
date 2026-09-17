"""Lightweight SM-2-Inspired Spaced Repetition Scheduler.

Deterministically schedules flashcard reviews based on user performance ratings:
- again: quick review needed, reset interval to 1 day, reduce ease
- difficult: short interval progression, slight ease reduction
- good: standard interval growth (1d -> 3d -> interval * ease)
- easy: aggressive interval growth, slight ease increase

All calculations are pure, deterministic, and free of external LLM calls.
All timestamps are strictly timezone-aware UTC.
"""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import Enum

# ---------------------------------------------------------------------------
# Centralized Scheduler Constants
# ---------------------------------------------------------------------------
DEFAULT_EASE_FACTOR: float = 2.5
MIN_EASE_FACTOR: float = 1.3
MAX_EASE_FACTOR: float = 3.5
INITIAL_INTERVAL_DAYS: int = 0


class SpacedRating(str, Enum):
    AGAIN = "again"
    DIFFICULT = "difficult"
    GOOD = "good"
    EASY = "easy"


@dataclass(frozen=True)
class ScheduleResult:
    """Immutable result of a deterministic spaced repetition calculation."""

    rating: str
    previous_interval: int
    new_interval: int
    previous_ease: float
    new_ease: float
    new_review_count: int
    next_review_at: datetime
    is_due: bool


class SpacedRepetitionService:
    """Lightweight SM-2-inspired scheduler for project flashcards."""

    @classmethod
    def calculate_next_schedule(
        cls,
        *,
        current_interval: int,
        current_ease: float,
        review_count: int,
        rating: str | SpacedRating,
        as_of: datetime | None = None,
    ) -> ScheduleResult:
        """Calculate the next review date, interval, and ease factor deterministically.

        Args:
            current_interval: Days until next review before this review (>= 0).
            current_ease: Current SM-2 ease factor (1.3 <= ease <= 3.5).
            review_count: Total reviews completed so far.
            rating: One of 'again', 'difficult', 'good', 'easy'.
            as_of: Base UTC timestamp for scheduling (defaults to datetime.now(UTC)).

        Returns:
            ScheduleResult with new_interval, new_ease, next_review_at, etc.
        """
        now = as_of if as_of is not None else datetime.now(UTC)
        if now.tzinfo is None:
            now = now.replace(tzinfo=UTC)

        clean_rating = (
            rating.value if isinstance(rating, SpacedRating) else str(rating).lower().strip()
        )
        if clean_rating not in {r.value for r in SpacedRating}:
            raise ValueError(
                f"Invalid rating '{rating}'. Must be one of: {[r.value for r in SpacedRating]}"
            )

        # Baseline clamp on incoming ease factor
        ease = max(MIN_EASE_FACTOR, min(MAX_EASE_FACTOR, float(current_ease)))
        interval = max(0, int(current_interval))
        count = max(0, int(review_count))

        if clean_rating == SpacedRating.AGAIN.value:
            # Card struggled: reset interval to 1 day, reduce ease
            new_interval = 1
            new_ease = max(MIN_EASE_FACTOR, round(ease - 0.20, 2))

        elif clean_rating == SpacedRating.DIFFICULT.value:
            # Hard card: slow growth, slight ease reduction
            new_ease = max(MIN_EASE_FACTOR, round(ease - 0.15, 2))
            if interval <= 0:
                new_interval = 1
            else:
                new_interval = max(interval + 1, round(interval * 1.2))

        elif clean_rating == SpacedRating.GOOD.value:
            # Standard recall: normal progression (1d -> 3d -> interval * ease)
            new_ease = round(ease, 2)
            if interval <= 0:
                new_interval = 1
            elif interval == 1:
                new_interval = 3
            else:
                new_interval = max(interval + 1, round(interval * ease))

        elif clean_rating == SpacedRating.EASY.value:
            # Effortless recall: aggressive interval jump, slight ease increase
            new_ease = min(MAX_EASE_FACTOR, round(ease + 0.15, 2))
            if interval <= 0:
                new_interval = 3
            elif interval == 1:
                new_interval = 5
            else:
                new_interval = max(interval + 2, round(interval * ease * 1.3))
        else:
            raise ValueError(f"Unhandled rating: {clean_rating}")

        next_review_at = now + timedelta(days=new_interval)
        new_review_count = count + 1

        return ScheduleResult(
            rating=clean_rating,
            previous_interval=interval,
            new_interval=new_interval,
            previous_ease=round(ease, 2),
            new_ease=round(new_ease, 2),
            new_review_count=new_review_count,
            next_review_at=next_review_at,
            is_due=False,  # Immediately after review, card is scheduled in the future
        )

    @classmethod
    def preview_intervals(
        cls,
        *,
        current_interval: int,
        current_ease: float,
        review_count: int,
    ) -> dict[str, int]:
        """Compute prospective interval days for each rating button (for UI display).

        Returns:
            dict mapping each rating ('again', 'difficult', 'good', 'easy') to days.
        """
        result = {}
        for r in SpacedRating:
            sched = cls.calculate_next_schedule(
                current_interval=current_interval,
                current_ease=current_ease,
                review_count=review_count,
                rating=r,
            )
            result[r.value] = sched.new_interval
        return result

    @classmethod
    def is_card_due(cls, next_review_at: datetime | None, as_of: datetime | None = None) -> bool:
        """Evaluate whether a flashcard is due for review.

        Semantics:
        - next_review_at is None -> True (New card, unreviewed)
        - next_review_at <= now  -> True (Due for review)
        - next_review_at > now   -> False (Not due yet)
        """
        if next_review_at is None:
            return True
        now = as_of if as_of is not None else datetime.now(UTC)
        if now.tzinfo is None:
            now = now.replace(tzinfo=UTC)
        card_tz = next_review_at
        if card_tz.tzinfo is None:
            card_tz = card_tz.replace(tzinfo=UTC)
        return card_tz <= now
