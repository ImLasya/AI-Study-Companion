"""Pydantic schemas for Personalized Project Learning Plans."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

LearningPlanItemStatus = Literal["not_started", "in_progress", "completed", "needs_review"]
LearningPlanStatus = Literal["active", "completed", "archived"]


class LearningPlanItemResponse(BaseModel):
    """An individual concept milestone in the learning roadmap."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    concept_id: uuid.UUID
    concept_name: str
    concept_description: str
    position: int
    status: str
    target_mastery: float = 80.0
    current_mastery: float | None = None
    is_assessed: bool = False
    confidence: float = 0.0
    completed_at: datetime | None = None
    source_material_title: str | None = None
    source_page: int | None = None
    recommended_action: str | None = None
    flashcard_count: int = 0
    quiz_question_count: int = 0


class LearningPlanProgress(BaseModel):
    """Aggregated progress statistics for a learning plan."""

    total_concepts: int
    completed_count: int
    in_progress_count: int
    needs_review_count: int
    not_started_count: int
    progress_percentage: int


class LearningPlanResponse(BaseModel):
    """Full learning plan including roadmap items and next recommended action."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    description: str | None = None
    status: str = "active"
    progress: LearningPlanProgress
    next_recommended_concept: LearningPlanItemResponse | None = None
    items: list[LearningPlanItemResponse]
    created_at: datetime
    updated_at: datetime


class LearningPlanGenerateRequest(BaseModel):
    """Request payload to generate or refresh a project learning plan."""

    force_reorder: bool = Field(
        default=False,
        description="If True, recomputes concept ordering from scratch while preserving completion history.",
    )


class LearningPlanItemUpdateRequest(BaseModel):
    """Request payload to update roadmap item status without touching mastery."""

    status: LearningPlanItemStatus = Field(
        description="Updated roadmap status: not_started, in_progress, completed, needs_review."
    )


class ConceptDetailResponse(BaseModel):
    """Rich diagnostic concept details aggregated from materials, quiz, and flashcards."""

    concept_id: uuid.UUID
    concept_name: str
    concept_description: str
    roadmap_status: str
    mastery_score: float | None = None
    confidence: float = 0.0
    is_assessed: bool = False
    evidence_count: int = 0
    source_material_title: str | None = None
    source_page: int | None = None
    source_chunk_count: int = 0
    flashcard_count: int = 0
    due_flashcards_count: int = 0
    quiz_question_count: int = 0
    active_recommendation: str | None = None
    recommended_actions: list[str] = Field(default_factory=list)
