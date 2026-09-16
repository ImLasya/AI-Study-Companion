"""Analytics Endpoints (Phase 6).

Provides high-performance SQL-level aggregated analytics for projects and
user-scoped cross-project global learning progress.
Strictly tenant-isolated: users can only see their own metrics.
"""

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.analytics import GlobalAnalyticsResponse, ProjectAnalyticsResponse
from app.services.analytics_service import AnalyticsService

router = APIRouter(tags=["Analytics"])


@router.get(
    "/projects/{project_id}/analytics",
    response_model=ProjectAnalyticsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get project-specific learning analytics",
)
async def get_project_analytics(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectAnalyticsResponse:
    """Fetch SQL-aggregated learning activity, quiz performance, concept mastery distribution,

    and AI activity telemetry for a specific project.
    """
    service = AnalyticsService(db)
    return await service.get_project_analytics(user_id=current_user.id, project_id=project_id)


@router.get(
    "/analytics/global",
    response_model=GlobalAnalyticsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get user-scoped global learning analytics",
)
async def get_global_analytics(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GlobalAnalyticsResponse:
    """Fetch aggregated study metrics across all spaces and projects for the current user."""
    service = AnalyticsService(db)
    return await service.get_global_analytics(user_id=current_user.id)
