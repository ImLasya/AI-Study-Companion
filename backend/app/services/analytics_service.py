"""Analytics Service (Phase 6).

Coordinates tenant-isolated analytical requests for project and global scopes.
Enforces anti-enumeration 404 security checks before fetching project aggregations.
"""

import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.analytics_repository import AnalyticsRepository
from app.repositories.project_repository import ProjectRepository
from app.schemas.analytics import (
    GlobalAnalyticsResponse,
    GlobalRecommendationItem,
    ProjectAnalyticsResponse,
    RecentActivityItem,
)


class AnalyticsService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.project_repo = ProjectRepository(session)
        self.analytics_repo = AnalyticsRepository(session)

    async def get_project_analytics(
        self, user_id: uuid.UUID, project_id: uuid.UUID
    ) -> ProjectAnalyticsResponse:
        """Fetch project-specific learning analytics with strict tenant verification."""
        project = await self.project_repo.get_by_id(user_id=user_id, project_id=project_id)
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )
        return await self.analytics_repo.get_project_analytics(
            user_id=user_id, project_id=project_id
        )

    async def get_global_analytics(self, user_id: uuid.UUID) -> GlobalAnalyticsResponse:
        """Fetch cross-project learning metrics for the current user."""
        return await self.analytics_repo.get_global_analytics(user_id=user_id)

    async def get_recent_activity(
        self, user_id: uuid.UUID, limit: int = 20, project_id: uuid.UUID | None = None
    ) -> list[RecentActivityItem]:
        """Fetch tenant-isolated recent learning activity milestones."""
        if project_id:
            project = await self.project_repo.get_by_id(user_id=user_id, project_id=project_id)
            if not project:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Project not found",
                )
        return await self.analytics_repo.get_recent_activity(
            user_id=user_id, limit=limit, project_id=project_id
        )

    async def get_global_recommendations(
        self, user_id: uuid.UUID, project_id: uuid.UUID | None = None
    ) -> list[GlobalRecommendationItem]:
        """Fetch tenant-isolated active recommendations across projects."""
        if project_id:
            project = await self.project_repo.get_by_id(user_id=user_id, project_id=project_id)
            if not project:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Project not found",
                )
        return await self.analytics_repo.get_global_recommendations(
            user_id=user_id, project_id=project_id
        )
