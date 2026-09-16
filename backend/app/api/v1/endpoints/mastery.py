"""API Endpoints for Concept Mastery, Growth Analysis, and Recommendations (Phase 5).

Enforces strict tenant isolation: all requests require authentication and derive
user identity from JWT tokens/cookies. Cross-user access returns 404 Not Found.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.repositories.project_repository import ProjectRepository
from app.schemas.mastery import (
    GrowthSummaryResponse,
    MasteryListResponse,
    RecommendationResponse,
)
from app.services.mastery_service import MasteryService

router = APIRouter()


async def _verify_project_ownership(
    project_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession
) -> None:
    """Verify that the project exists and belongs to the authenticated user."""
    repo = ProjectRepository(db)
    project = await repo.get_by_id(user_id=user_id, project_id=project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )


# ---------------------------------------------------------------------------
# 1. Concept Mastery
# ---------------------------------------------------------------------------
@router.get(
    "/projects/{project_id}/mastery",
    response_model=MasteryListResponse,
    status_code=status.HTTP_200_OK,
    summary="Get current concept masteries with confidence levels",
)
async def get_project_mastery(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MasteryListResponse:
    """Retrieve current mastery estimate, evidence count, and confidence for all concepts."""
    await _verify_project_ownership(project_id, current_user.id, db)
    service = MasteryService(db)
    return await service.get_project_masteries(user_id=current_user.id, project_id=project_id)


# ---------------------------------------------------------------------------
# 2. Growth Analysis
# ---------------------------------------------------------------------------
@router.get(
    "/projects/{project_id}/growth",
    response_model=GrowthSummaryResponse,
    status_code=status.HTTP_200_OK,
    summary="Get growth analysis, trajectories, and historical timeline series",
)
async def get_project_growth(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GrowthSummaryResponse:
    """Classify concepts into improving, stable, needs_attention, or unassessed with timeline points."""
    await _verify_project_ownership(project_id, current_user.id, db)
    service = MasteryService(db)
    return await service.get_project_growth(user_id=current_user.id, project_id=project_id)


# ---------------------------------------------------------------------------
# 3. Recommendations
# ---------------------------------------------------------------------------
@router.get(
    "/projects/{project_id}/recommendations",
    response_model=list[RecommendationResponse],
    status_code=status.HTTP_200_OK,
    summary="Get active targeted learning recommendations",
)
async def get_project_recommendations(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[RecommendationResponse]:
    """Retrieve active recommendations answering 'what should I do next and why?'"""
    await _verify_project_ownership(project_id, current_user.id, db)
    service = MasteryService(db)
    return await service.get_project_recommendations(user_id=current_user.id, project_id=project_id)


@router.post(
    "/projects/{project_id}/recommendations/{rec_id}/dismiss",
    status_code=status.HTTP_200_OK,
    summary="Dismiss an active recommendation",
)
async def dismiss_recommendation(
    project_id: uuid.UUID,
    rec_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Dismiss a recommendation."""
    await _verify_project_ownership(project_id, current_user.id, db)
    service = MasteryService(db)
    dismissed = await service.dismiss_recommendation(
        user_id=current_user.id, project_id=project_id, recommendation_id=rec_id
    )
    if not dismissed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Recommendation not found or already dismissed",
        )
    return {"status": "dismissed", "recommendation_id": str(rec_id)}
