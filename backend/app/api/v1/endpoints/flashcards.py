"""API Endpoints for Grounded Project-Scoped Flashcards & Spaced Repetition.

All endpoints are scoped to authenticated users and a specific project.
Flashcard generation is strictly grounded in project learning materials.
Spaced Repetition scheduling is pure and deterministic (SM-2 inspired).

Route Order Guarantee:
Static routes (/due, /due/summary, /session/*) MUST be registered before
parameterized routes (/{flashcard_id}) to prevent FastAPI path collision.
"""

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.flashcard import (
    DueFlashcardsSummaryResponse,
    FlashcardGenerateRequest,
    FlashcardGenerateResponse,
    FlashcardResponse,
    FlashcardReviewRequest,
    FlashcardReviewResponse,
    FlashcardSessionEventRequest,
)
from app.services.flashcard_service import FlashcardService

router = APIRouter(prefix="/projects", tags=["Flashcards"])


# ─────────────────────────────────────────────────────────────────────────────
# 1. Generation & Listing
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/{project_id}/flashcards/generate",
    response_model=FlashcardGenerateResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate grounded flashcards from project learning materials",
)
async def generate_flashcards(
    project_id: uuid.UUID,
    payload: FlashcardGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FlashcardGenerateResponse:
    """Generate grounded flashcards strictly based on the project's uploaded materials.

    Flashcards are always grounded in retrieved evidence from the pgvector pipeline.
    Page numbers, filenames, and material IDs are derived server-side.
    """
    service = FlashcardService(db)
    return await service.generate(
        user_id=current_user.id,
        project_id=project_id,
        payload=payload,
    )


@router.get(
    "/{project_id}/flashcards",
    response_model=list[FlashcardResponse],
    status_code=status.HTTP_200_OK,
    summary="List all flashcards for a project",
)
async def list_flashcards(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[FlashcardResponse]:
    """Retrieve all flashcards for the project, newest first. Tenant-isolated."""
    service = FlashcardService(db)
    return await service.list_flashcards(
        user_id=current_user.id,
        project_id=project_id,
    )


# ─────────────────────────────────────────────────────────────────────────────
# 2. Spaced Repetition Due Endpoints (Registered BEFORE /{flashcard_id})
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/{project_id}/flashcards/due",
    response_model=list[FlashcardResponse],
    status_code=status.HTTP_200_OK,
    summary="Get flashcards due for review",
)
async def get_due_flashcards(
    project_id: uuid.UUID,
    limit: int = Query(default=10, ge=1, le=50, description="Max cards to return (1-50)"),
    concept_id: uuid.UUID | None = Query(default=None, description="Optional concept filter"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[FlashcardResponse]:
    """Retrieve flashcards due for review with deterministic priority ordering:
    1. Overdue reviewed cards (most overdue first)
    2. Cards due now
    3. Never-reviewed/new cards (oldest created first)
    """
    service = FlashcardService(db)
    return await service.list_due(
        user_id=current_user.id,
        project_id=project_id,
        limit=limit,
        concept_id=concept_id,
    )


@router.get(
    "/{project_id}/flashcards/due/summary",
    response_model=DueFlashcardsSummaryResponse,
    status_code=status.HTTP_200_OK,
    summary="Get count summary for Today's Review Dashboard",
)
async def get_due_summary(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DueFlashcardsSummaryResponse:
    """Returns counts for due, new, and completed-today flashcard reviews."""
    service = FlashcardService(db)
    return await service.get_due_summary(
        user_id=current_user.id,
        project_id=project_id,
    )


# ─────────────────────────────────────────────────────────────────────────────
# 3. Session Tracking Endpoints (Registered BEFORE /{flashcard_id})
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/{project_id}/flashcards/session/start",
    status_code=status.HTTP_200_OK,
    summary="Record flashcard study session started",
)
async def start_flashcard_session(
    project_id: uuid.UUID,
    payload: FlashcardSessionEventRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Emit flashcard_session_started activity event."""
    service = FlashcardService(db)
    await service.record_session_event(
        user_id=current_user.id,
        project_id=project_id,
        event_type="flashcard_session_started",
        payload=payload.model_dump(),
    )
    return {"status": "recorded"}


@router.post(
    "/{project_id}/flashcards/session/complete",
    status_code=status.HTTP_200_OK,
    summary="Record flashcard study session completed",
)
async def complete_flashcard_session(
    project_id: uuid.UUID,
    payload: FlashcardSessionEventRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    """Emit flashcard_session_completed activity event."""
    service = FlashcardService(db)
    await service.record_session_event(
        user_id=current_user.id,
        project_id=project_id,
        event_type="flashcard_session_completed",
        payload=payload.model_dump(),
    )
    return {"status": "recorded"}


# ─────────────────────────────────────────────────────────────────────────────
# 4. Individual Card Operations
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/{project_id}/flashcards/{flashcard_id}",
    response_model=FlashcardResponse,
    status_code=status.HTTP_200_OK,
    summary="Get a single flashcard by ID",
)
async def get_flashcard(
    project_id: uuid.UUID,
    flashcard_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FlashcardResponse:
    """Fetch a single flashcard with full citation metadata. 404 if not owned."""
    service = FlashcardService(db)
    return await service.get_flashcard(
        user_id=current_user.id,
        project_id=project_id,
        flashcard_id=flashcard_id,
    )


@router.post(
    "/{project_id}/flashcards/{flashcard_id}/review",
    response_model=FlashcardReviewResponse,
    status_code=status.HTTP_200_OK,
    summary="Review a flashcard using Spaced Repetition (or legacy action)",
)
async def review_flashcard(
    project_id: uuid.UUID,
    flashcard_id: uuid.UUID,
    payload: FlashcardReviewRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> FlashcardReviewResponse:
    """Update the spaced repetition schedule for a flashcard.

    Ratings:
    - 'again': Struggles with recall; reset interval to 1 day, reduce ease
    - 'difficult': Recalled with effort; short interval progression, slight ease reduction
    - 'good': Standard recall; normal growth (1d -> 3d -> interval * ease)
    - 'easy': Effortless recall; aggressive growth, slight ease increase

    Legacy Actions (mapped transparently):
    - 'known' -> 'good'
    - 'difficult' -> 'difficult'
    - 'reset' -> resets card to unreviewed state

    Idempotency:
    - Pass 'idempotency_key' to safely protect against accidental double-clicks.
    """
    service = FlashcardService(db)
    return await service.review_card(
        user_id=current_user.id,
        project_id=project_id,
        flashcard_id=flashcard_id,
        payload=payload,
    )


@router.delete(
    "/{project_id}/flashcards/{flashcard_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a flashcard",
)
async def delete_flashcard(
    project_id: uuid.UUID,
    flashcard_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a flashcard from the project. 404 if not owned."""
    service = FlashcardService(db)
    await service.delete_flashcard(
        user_id=current_user.id,
        project_id=project_id,
        flashcard_id=flashcard_id,
    )
