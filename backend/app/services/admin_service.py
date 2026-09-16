"""Admin Service (Phase 6).

Coordinates administrative operations and telemetry queries behind get_current_admin.
Ensures zero exposure of passwords, tokens, API keys, raw prompts, or document texts.
"""

import uuid
from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.admin_repository import AdminRepository
from app.schemas.admin import (
    AdminActivityFeedResponse,
    AdminAIUsageResponse,
    AdminJobHealthResponse,
    AdminOverviewResponse,
    AdminUserDetailResponse,
    AdminUserListResponse,
    AIEvaluationSummaryResponse,
)


class AdminService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.admin_repo = AdminRepository(session)

    async def get_overview(self) -> AdminOverviewResponse:
        return await self.admin_repo.get_overview()

    async def list_users(
        self, page: int = 1, page_size: int = 20, search: str | None = None
    ) -> AdminUserListResponse:
        return await self.admin_repo.list_users(page=page, page_size=page_size, search=search)

    async def get_user_journey(self, user_id: uuid.UUID) -> AdminUserDetailResponse:
        journey = await self.admin_repo.get_user_journey(user_id=user_id)
        if not journey:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )
        return journey

    async def get_activity_feed(
        self,
        user_id: uuid.UUID | None = None,
        project_id: uuid.UUID | None = None,
        event_type: str | None = None,
        from_date: datetime | None = None,
        to_date: datetime | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> AdminActivityFeedResponse:
        return await self.admin_repo.get_activity_feed(
            user_id=user_id,
            project_id=project_id,
            event_type=event_type,
            from_date=from_date,
            to_date=to_date,
            page=page,
            page_size=page_size,
        )

    async def get_ai_usage_telemetry(
        self,
        operation: str | None = None,
        model: str | None = None,
        success: bool | None = None,
        from_date: datetime | None = None,
        to_date: datetime | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> AdminAIUsageResponse:
        return await self.admin_repo.get_ai_usage_telemetry(
            operation=operation,
            model=model,
            success=success,
            from_date=from_date,
            to_date=to_date,
            page=page,
            page_size=page_size,
        )

    async def get_job_health(self) -> AdminJobHealthResponse:
        return await self.admin_repo.get_job_health()

    async def get_evaluations(self) -> AIEvaluationSummaryResponse:
        return await self.admin_repo.get_latest_evaluations()
