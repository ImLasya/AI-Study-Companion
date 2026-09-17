"""API Endpoints for Personalized Project Learning Plans."""

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.learning_plan import (
    ConceptDetailResponse,
    LearningPlanGenerateRequest,
    LearningPlanItemResponse,
    LearningPlanItemUpdateRequest,
    LearningPlanResponse,
)
from app.services.learning_plan_service import LearningPlanService

router = APIRouter()


@router.get(
    "/projects/{project_id}/learning-plan",
    response_model=LearningPlanResponse | None,
    summary="Get active project learning plan",
)
async def get_active_learning_plan(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LearningPlanResponse | None:
    """Fetch the active learning plan for the specified project.

    Returns null if no learning plan has been generated yet.
    """
    service = LearningPlanService(db)
    return await service.get_active_plan(user_id=current_user.id, project_id=project_id)


@router.post(
    "/projects/{project_id}/learning-plan/generate",
    response_model=LearningPlanResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate or refresh project learning plan",
)
async def generate_learning_plan(
    project_id: uuid.UUID,
    payload: LearningPlanGenerateRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LearningPlanResponse:
    """Generate a new deterministic learning roadmap or refresh an existing one.

    - If force_reorder is False and a plan exists, preserves item order and completed history,
      merging newly extracted concepts and updating live mastery statuses.
    - If force_reorder is True, re-sequences all project concepts in textbook chapter order.
    """
    force_reorder = payload.force_reorder if payload else False
    service = LearningPlanService(db)
    return await service.generate_or_refresh_plan(
        user_id=current_user.id,
        project_id=project_id,
        force_reorder=force_reorder,
    )


@router.get(
    "/projects/{project_id}/learning-plan/items/{item_id}/detail",
    response_model=ConceptDetailResponse,
    summary="Get rich diagnostic details for a roadmap concept",
)
async def get_concept_milestone_detail(
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ConceptDetailResponse:
    """Aggregates rich diagnostic details for a roadmap milestone.

    Returns textbook source page, quiz performance, flashcard schedule, and targeted actions.
    """
    service = LearningPlanService(db)
    return await service.get_concept_detail(
        user_id=current_user.id,
        project_id=project_id,
        item_id=item_id,
    )


@router.patch(
    "/projects/{project_id}/learning-plan/items/{item_id}",
    response_model=LearningPlanItemResponse,
    summary="Update roadmap item status",
)
async def update_learning_plan_item(
    project_id: uuid.UUID,
    item_id: uuid.UUID,
    payload: LearningPlanItemUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LearningPlanItemResponse:
    """Manually update an item's roadmap status.

    SECURITY GUARANTEE:
    - Mastery remains strictly owned by the backend MasteryEngine and is not modified.
    """
    service = LearningPlanService(db)
    return await service.update_item_status(
        user_id=current_user.id,
        project_id=project_id,
        item_id=item_id,
        status_value=payload.status,
    )


@router.get(
    "/projects/{project_id}/learning-plan/{plan_id}",
    response_model=LearningPlanResponse,
    summary="Get specific learning plan by ID",
)
async def get_learning_plan_by_id(
    project_id: uuid.UUID,
    plan_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LearningPlanResponse:
    """Fetch a specific learning plan by ID with tenant and project isolation."""
    service = LearningPlanService(db)
    return await service.get_plan_by_id(
        user_id=current_user.id,
        project_id=project_id,
        plan_id=plan_id,
    )
