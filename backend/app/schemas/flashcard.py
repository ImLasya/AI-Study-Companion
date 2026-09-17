"""Pydantic schemas for Grounded Flashcards."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


# ---------------------------------------------------------------------------
# LLM Structured Output (internal — never returned directly to client)
# ---------------------------------------------------------------------------

class FlashcardLLMItem(BaseModel):
    """Single flashcard item as returned by the LLM structured output."""
    front: str
    back: str
    citation_chunk_ids: list[str] = Field(default_factory=list)
    card_type: str = "definition"
    concept_name: str | None = None


class FlashcardGenerationOutput(BaseModel):
    """Structured output schema for Gemini flashcard generation.

    The LLM returns a list of raw flashcard drafts.
    ALL citation metadata (page_number, filename, material_id) is derived
    server-side and never trusted from the LLM response.
    """
    flashcards: list[FlashcardLLMItem]


# ---------------------------------------------------------------------------
# API Request Schemas
# ---------------------------------------------------------------------------

class FlashcardGenerateRequest(BaseModel):
    """Request body for POST /projects/{project_id}/flashcards/generate."""
    count: int = Field(default=5, ge=1, le=10, description="Number of flashcards to generate (1–10)")
    concept_id: uuid.UUID | None = Field(default=None, description="Limit to a specific project concept")
    topic_hint: str | None = Field(
        default=None,
        max_length=200,
        description="Optional topic hint to guide retrieval and generation",
    )


class FlashcardReviewRequest(BaseModel):
    """Request body for POST /projects/{project_id}/flashcards/{id}/review.

    Accepts spaced repetition rating ('again', 'difficult', 'good', 'easy')
    or legacy action ('known', 'difficult', 'reset').
    Optional idempotency_key prevents accidental double-reviews.
    """

    rating: str | None = Field(
        default=None,
        description="Spaced repetition rating: 'again', 'difficult', 'good', 'easy'",
    )
    action: str | None = Field(
        default=None,
        description="Legacy study action: 'known', 'difficult', 'reset'",
    )
    idempotency_key: str | None = Field(
        default=None,
        max_length=100,
        description="Client-generated unique ID to prevent double-click submissions",
    )


class FlashcardSessionEventRequest(BaseModel):
    """Request body for session tracking endpoints."""

    session_id: str | None = None
    cards_reviewed: int = 0
    rating_breakdown: dict[str, int] = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# API Response Schemas
# ---------------------------------------------------------------------------

class FlashcardResponse(BaseModel):
    """Full flashcard representation returned to the client."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    user_id: uuid.UUID
    material_id: uuid.UUID | None = None
    concept_id: uuid.UUID | None = None
    front: str
    back: str
    source_chunk_id: uuid.UUID | None = None
    citation_chunk_ids: list[Any] = Field(default_factory=list)
    page_number: int | None = None
    filename: str | None = None
    card_type: str
    review_count: int
    known: bool
    difficult: bool
    ease_factor: float = 2.5
    interval_days: int = 0
    next_review_at: datetime | None = None
    last_rating: str | None = None
    last_reviewed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    is_due: bool = True


class FlashcardReviewResponse(BaseModel):
    """Detailed response after rating a card via spaced repetition."""

    flashcard_id: uuid.UUID
    rating: str
    review_count: int
    interval_days: int
    ease_factor: float
    next_review_at: datetime
    is_due: bool
    previous_interval: int
    new_interval: int
    flashcard: FlashcardResponse


class DueFlashcardsSummaryResponse(BaseModel):
    """Counts for today's review dashboard."""

    due_count: int = Field(description="Cards with next_review_at <= now")
    new_count: int = Field(description="Cards never reviewed (review_count == 0 or next_review_at is NULL)")
    completed_today_count: int = Field(description="Reviews completed today (UTC)")


class FlashcardGenerateResponse(BaseModel):
    """Response for generate endpoint including skipped duplicate count."""

    flashcards: list[FlashcardResponse]
    total_generated: int
    duplicates_skipped: int
    message: str | None = None

