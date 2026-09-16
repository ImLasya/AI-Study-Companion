"""Pydantic schemas for Phase 5 Concept Mastery, Growth, and Recommendations."""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


# ----------------------------------------------------------------------------
# 1. LLM Structured Output Schema for Recommendation Generation
# ----------------------------------------------------------------------------
class RecommendationGenerationOutput(BaseModel):
    """Structured response schema enforced on Gemini for recommendation generation."""

    recommendation_type: str = Field(
        ...,
        description="Type of recommendation: 'review_concept', 'practice_quiz', 'study_material', or 'explore_topic'",
    )
    title: str = Field(..., description="Concise, action-oriented headline (e.g., 'Review Backpropagation Fundamentals')")
    body: str = Field(..., description="Actionable 2-3 sentence guidance explaining what step to take next.")
    target_concept_id: str | None = Field(
        None,
        description="The exact concept UUID from the provided candidates list that this recommendation targets, or null if general.",
    )
    reasoning: str = Field(
        ...,
        description="Transparent explanation of why this was recommended based on recent errors, low mastery, or study goals.",
    )


# ----------------------------------------------------------------------------
# 2. Concept Mastery API Responses
# ----------------------------------------------------------------------------
class ConceptMasteryResponse(BaseModel):
    id: uuid.UUID | None = None
    concept_id: uuid.UUID
    concept_name: str
    mastery_score: float | None = None  # None for unassessed
    confidence: float
    confidence_level: str  # unassessed, low, medium, high
    evidence_count: int
    is_assessed: bool
    last_updated_at: datetime | None = None


class MasteryListResponse(BaseModel):
    project_id: uuid.UUID
    masteries: list[ConceptMasteryResponse]
    overall_average_mastery: float | None = None
    assessed_count: int
    total_concepts: int


# ----------------------------------------------------------------------------
# 3. Growth Analysis API Responses
# ----------------------------------------------------------------------------
class SnapshotPointSchema(BaseModel):
    recorded_at: str
    score: float


class ConceptGrowthItem(BaseModel):
    concept_id: uuid.UUID
    concept_name: str
    current_score: float | None = None
    baseline_score: float | None = None
    delta: float
    status: str  # improving, stable, needs_attention, unassessed
    history: list[SnapshotPointSchema]


class GrowthSummaryResponse(BaseModel):
    project_id: uuid.UUID
    improving: list[ConceptGrowthItem]
    stable: list[ConceptGrowthItem]
    needs_attention: list[ConceptGrowthItem]
    unassessed: list[ConceptGrowthItem]
    overall_average: float | None = None


# ----------------------------------------------------------------------------
# 4. Recommendation API Responses
# ----------------------------------------------------------------------------
class RecommendationResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    recommendation_type: str
    title: str
    body: str
    target_concept_id: uuid.UUID | None = None
    target_concept_name: str | None = None
    reasoning: str
    status: str
    created_at: datetime
