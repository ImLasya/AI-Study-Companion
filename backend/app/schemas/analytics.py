"""Analytics Schemas (Phase 6).

Pydantic schemas for project-level and user-scoped global learning analytics.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class DailyActivityBucket(BaseModel):
    date: str
    event_count: int
    event_breakdown: dict[str, int] = Field(default_factory=dict)


class QuizPerformanceTrendItem(BaseModel):
    attempt_id: uuid.UUID
    completed_at: datetime | None = None
    score_percentage: float
    passed: bool
    total_questions: int


class MasteryDistribution(BaseModel):
    unassessed: int = 0
    needs_attention: int = 0
    stable: int = 0
    mastered: int = 0
    overall_average: float | None = None


class ConceptTrendItem(BaseModel):
    concept_id: uuid.UUID
    concept_name: str
    latest_score: float | None = None
    confidence: float = 0.0
    status: str = "unassessed"


class TutorInteractionSummary(BaseModel):
    total_conversations: int = 0
    total_messages: int = 0
    assistant_messages: int = 0


class AIActivitySummary(BaseModel):
    total_calls: int = 0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_tokens: int = 0
    total_estimated_cost_usd: float = 0.0
    avg_latency_ms: float = 0.0
    calls_by_operation: dict[str, int] = Field(default_factory=dict)


class ProjectAnalyticsResponse(BaseModel):
    project_id: uuid.UUID
    learning_activity: list[DailyActivityBucket] = Field(default_factory=list)
    quiz_performance_trend: list[QuizPerformanceTrendItem] = Field(default_factory=list)
    current_mastery_distribution: MasteryDistribution = Field(default_factory=MasteryDistribution)
    concept_trends: list[ConceptTrendItem] = Field(default_factory=list)
    tutor_interaction_counts: TutorInteractionSummary = Field(
        default_factory=TutorInteractionSummary
    )
    ai_activity: AIActivitySummary = Field(default_factory=AIActivitySummary)


class ProjectProgressItem(BaseModel):
    project_id: uuid.UUID
    project_name: str
    space_name: str
    learning_goal: str
    total_concepts: int = 0
    assessed_concepts: int = 0
    average_mastery: float | None = None
    last_active_at: datetime | None = None


class WeakAreaItem(BaseModel):
    concept_id: uuid.UUID
    concept_name: str
    project_id: uuid.UUID
    project_name: str
    mastery_score: float
    confidence: float


class GlobalStudyActivity(BaseModel):
    total_events: int = 0
    total_quizzes_completed: int = 0
    total_tutor_conversations: int = 0
    active_study_days: int = 0


class GlobalAnalyticsResponse(BaseModel):
    user_id: uuid.UUID
    total_study_activity: GlobalStudyActivity = Field(default_factory=GlobalStudyActivity)
    projects_by_progress: list[ProjectProgressItem] = Field(default_factory=list)
    weakest_areas: list[WeakAreaItem] = Field(default_factory=list)
    overall_trend: list[DailyActivityBucket] = Field(default_factory=list)
    ai_usage_summary: AIActivitySummary = Field(default_factory=AIActivitySummary)
