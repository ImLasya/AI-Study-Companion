"""Admin API Schemas (Phase 6).

Pydantic schemas for platform overview, user management, activity auditing,
AI observability, job monitoring, and evaluation runs.
Guarantees zero exposure of passwords, tokens, API keys, raw prompts, or document texts.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.analytics import AIActivitySummary


class AdminOverviewResponse(BaseModel):
    total_users: int = 0
    total_spaces: int = 0
    total_projects: int = 0
    active_users_daily: int = 0
    active_users_weekly: int = 0
    total_ai_spend_usd: float = 0.0
    total_ai_calls: int = 0
    job_health_summary: dict[str, int] = Field(default_factory=dict)


class AdminUserSummary(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str | None = None
    role: str
    created_at: datetime
    project_count: int = 0
    last_activity_at: datetime | None = None


class AdminUserListResponse(BaseModel):
    items: list[AdminUserSummary] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 20


class AdminUserProjectSummary(BaseModel):
    id: uuid.UUID
    name: str
    space_name: str
    created_at: datetime
    concept_count: int = 0
    average_mastery: float | None = None


class AdminUserRecentQuiz(BaseModel):
    attempt_id: uuid.UUID
    project_name: str
    score_percentage: float
    passed: bool
    completed_at: datetime | None = None


class AdminUserRecentActivity(BaseModel):
    id: uuid.UUID
    event_type: str
    project_id: uuid.UUID | None = None
    created_at: datetime


class AdminUserDetailResponse(BaseModel):
    user: AdminUserSummary
    spaces_count: int = 0
    projects: list[AdminUserProjectSummary] = Field(default_factory=list)
    recent_activity: list[AdminUserRecentActivity] = Field(default_factory=list)
    recent_quizzes: list[AdminUserRecentQuiz] = Field(default_factory=list)
    ai_usage: AIActivitySummary = Field(default_factory=AIActivitySummary)


class AdminActivityItem(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_email: str | None = None
    project_id: uuid.UUID | None = None
    project_name: str | None = None
    event_type: str
    created_at: datetime


class AdminActivityFeedResponse(BaseModel):
    items: list[AdminActivityItem] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 50


class AdminAIUsageItem(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID | None = None
    project_id: uuid.UUID | None = None
    operation: str
    provider: str
    model: str
    latency_ms: float
    total_tokens: int | None = None
    estimated_cost_usd: float | None = None
    success: bool
    error: str | None = None
    created_at: datetime


class AdminAIUsageResponse(BaseModel):
    p50_latency_ms: float = 0.0
    p95_latency_ms: float = 0.0
    total_calls: int = 0
    failed_calls: int = 0
    failure_rate: float = 0.0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_tokens: int = 0
    total_cost_usd: float = 0.0
    recent_logs: list[AdminAIUsageItem] = Field(default_factory=list)
    total_records: int = 0
    page: int = 1
    page_size: int = 50


class AdminJobFailureItem(BaseModel):
    material_id: uuid.UUID
    project_id: uuid.UUID
    project_name: str
    filename: str
    status: str
    failure_reason: str | None = None
    created_at: datetime
    updated_at: datetime


class AdminJobHealthResponse(BaseModel):
    status_counts: dict[str, int] = Field(default_factory=dict)
    total_materials: int = 0
    recent_failures: list[AdminJobFailureItem] = Field(default_factory=list)


class AIEvaluationSuiteSummary(BaseModel):
    suite: str
    total: int = 0
    passed: int = 0
    pass_rate: float = 0.0


class AIEvaluationCaseItem(BaseModel):
    id: uuid.UUID
    run_id: uuid.UUID
    suite: str
    case_id: str
    passed: bool
    score: float | None = None
    notes: str | None = None
    run_at: datetime


class AIEvaluationSummaryResponse(BaseModel):
    latest_run_id: uuid.UUID | None = None
    latest_run_at: datetime | None = None
    overall_pass_rate: float = 0.0
    total_cases: int = 0
    passed_cases: int = 0
    suite_summaries: list[AIEvaluationSuiteSummary] = Field(default_factory=list)
    cases: list[AIEvaluationCaseItem] = Field(default_factory=list)
