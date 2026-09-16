"""Admin Endpoints (Phase 6).

Administrative query interface for platform metrics, user learning paths,
activity feeds, AI telemetry, background jobs, and evaluation runs.
Protected exclusively by get_current_admin dependency (403 for non-admin, 401 for unauth).
Zero exposure of passwords, tokens, API keys, raw prompts, or document texts.
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.db.session import get_db
from app.evaluations.runner import AIEvaluationRunner
from app.models.user import User
from app.schemas.admin import (
    AdminActivityFeedResponse,
    AdminAIUsageResponse,
    AdminJobHealthResponse,
    AdminOverviewResponse,
    AdminUserDetailResponse,
    AdminUserListResponse,
    AIEvaluationSummaryResponse,
)
from app.services.admin_service import AdminService

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get(
    "/overview",
    response_model=AdminOverviewResponse,
    status_code=status.HTTP_200_OK,
    summary="Get cross-platform overview statistics",
)
async def get_admin_overview(
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminOverviewResponse:
    """Fetch high-level platform counts, active users, AI spend, and job health."""
    service = AdminService(db)
    return await service.get_overview()


@router.get(
    "/users",
    response_model=AdminUserListResponse,
    status_code=status.HTTP_200_OK,
    summary="List platform users (paginated)",
)
async def list_admin_users(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str | None = Query(default=None),
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminUserListResponse:
    """List registered users with learning statistics and safe profile fields."""
    service = AdminService(db)
    return await service.list_users(page=page, page_size=page_size, search=search)


@router.get(
    "/users/{user_id}",
    response_model=AdminUserDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Inspect one user's complete learning journey",
)
async def get_admin_user_detail(
    user_id: uuid.UUID,
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminUserDetailResponse:
    """Detailed read-only inspection of a user's spaces, projects, quiz progress, and AI usage."""
    service = AdminService(db)
    return await service.get_user_journey(user_id=user_id)


@router.get(
    "/activity",
    response_model=AdminActivityFeedResponse,
    status_code=status.HTTP_200_OK,
    summary="Query platform-wide activity feed",
)
async def get_admin_activity_feed(
    user_id: uuid.UUID | None = Query(default=None),
    project_id: uuid.UUID | None = Query(default=None),
    event_type: str | None = Query(default=None),
    from_date: datetime | None = Query(default=None),
    to_date: datetime | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminActivityFeedResponse:
    """Platform audit feed filterable by user, project, event type, and date range."""
    service = AdminService(db)
    return await service.get_activity_feed(
        user_id=user_id,
        project_id=project_id,
        event_type=event_type,
        from_date=from_date,
        to_date=to_date,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/ai-usage",
    response_model=AdminAIUsageResponse,
    status_code=status.HTTP_200_OK,
    summary="Query AI telemetry and latency percentiles",
)
async def get_admin_ai_usage(
    operation: str | None = Query(default=None),
    model: str | None = Query(default=None),
    success: bool | None = Query(default=None),
    from_date: datetime | None = Query(default=None),
    to_date: datetime | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminAIUsageResponse:
    """Compute latency p50/p95 percentiles, token sums, estimated costs, and failure rates."""
    service = AdminService(db)
    return await service.get_ai_usage_telemetry(
        operation=operation,
        model=model,
        success=success,
        from_date=from_date,
        to_date=to_date,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/jobs",
    response_model=AdminJobHealthResponse,
    status_code=status.HTTP_200_OK,
    summary="Get background ingestion job health",
)
async def get_admin_job_health(
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminJobHealthResponse:
    """Inspect status breakdown of learning materials processing and recent error logs."""
    service = AdminService(db)
    return await service.get_job_health()


@router.get(
    "/evaluations",
    response_model=AIEvaluationSummaryResponse,
    status_code=status.HTTP_200_OK,
    summary="Get latest AI evaluation run metrics",
)
async def get_admin_evaluations(
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AIEvaluationSummaryResponse:
    """Fetch latest evaluation test run metrics, pass rates, and suite breakdowns."""
    service = AdminService(db)
    return await service.get_evaluations()


@router.post(
    "/evaluations/run",
    response_model=AIEvaluationSummaryResponse,
    status_code=status.HTTP_200_OK,
    summary="Trigger an on-demand AI evaluation run",
)
async def run_admin_evaluations(
    _admin: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
) -> AIEvaluationSummaryResponse:
    """Execute evaluation harness suites and persist new test run."""
    runner = AIEvaluationRunner(db)
    await runner.run_all()
    service = AdminService(db)
    return await service.get_evaluations()
