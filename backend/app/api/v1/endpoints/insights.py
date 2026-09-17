"""Endpoints for Background Learning Insights."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.repositories.project_repository import ProjectRepository
from app.schemas.insight import LearningInsightResponse
from app.services.insight_service import InsightService

router = APIRouter(prefix="/projects", tags=["Learning Insights"])


@router.get("/{project_id}/insights", response_model=list[LearningInsightResponse])
async def list_project_insights(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[LearningInsightResponse]:
    """List all advisory learning insights for a project."""
    project_repo = ProjectRepository(db)
    project = await project_repo.get_by_id(user_id=current_user.id, project_id=project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    service = InsightService(db)
    insights = await service.list_insights(user_id=current_user.id, project_id=project_id)
    return [LearningInsightResponse.model_validate(ins) for ins in insights]


@router.post("/{project_id}/insights/generate", response_model=list[LearningInsightResponse])
async def generate_project_insights(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[LearningInsightResponse]:
    """Generate fresh advisory learning insights for a project."""
    project_repo = ProjectRepository(db)
    project = await project_repo.get_by_id(user_id=current_user.id, project_id=project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    service = InsightService(db)
    insights = await service.generate_insights_for_project(
        user_id=current_user.id, project_id=project_id
    )
    return [LearningInsightResponse.model_validate(ins) for ins in insights]
