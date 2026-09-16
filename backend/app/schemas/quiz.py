"""Pydantic v2 Schemas for Adaptive Quiz, Assessment, and LLM Structured Outputs.

Enforces strict input validation, response masking (never exposing correct answers
prior to submission), and structured schemas for Google Gemini calls.
"""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# ---------------------------------------------------------------------------
# Concept Schemas
# ---------------------------------------------------------------------------

class ConceptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    description: str
    source_chunk_ids: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class ConceptListResponse(BaseModel):
    concepts: list[ConceptResponse]
    count: int


# ---------------------------------------------------------------------------
# LLM Structured Output Contracts (Pydantic-validated for Gemini)
# ---------------------------------------------------------------------------

class ConceptExtractionItem(BaseModel):
    name: str = Field(description="Clear, concise concept title or topic name (e.g. 'Backpropagation')")
    description: str = Field(description="Accurate 1-3 sentence summary grounded directly in the text")
    source_chunk_ids: list[str] = Field(
        default_factory=list,
        description="Chunk IDs from the material context that provide evidence for this concept",
    )


class ConceptExtractionOutput(BaseModel):
    concepts: list[ConceptExtractionItem] = Field(
        description="List of core educational concepts extracted from the material"
    )


class GeneratedMCQ(BaseModel):
    question: str = Field(description="Clear, unambiguous multiple choice question testing the concept")
    options: list[str] = Field(
        description="Exactly 4 distinct options labeled or phrased cleanly"
    )
    correct_answer: str = Field(description="The exact text of the correct option matching one of the options")
    explanation: str = Field(description="Pedagogical explanation of why the correct option is right and others are wrong")
    concept_name: str = Field(description="Name of the concept this question tests")
    difficulty: Literal["easy", "medium", "hard"] = Field(description="Target difficulty level")
    evidence_chunk_ids: list[str] = Field(
        default_factory=list,
        description="Chunk IDs from the provided context that support this question",
    )

    @field_validator("options")
    @classmethod
    def validate_four_options(cls, v: list[str]) -> list[str]:
        if len(v) != 4:
            raise ValueError(f"MCQ must have exactly 4 options, got {len(v)}")
        return v


class GeneratedOpenEnded(BaseModel):
    question: str = Field(description="Open-ended conceptual or analytical question testing deep understanding")
    expected_answer: str = Field(description="Model answer covering key criteria and concepts")
    rubric: str = Field(description="Clear criteria for evaluation: essential points required for full credit")
    explanation: str = Field(description="In-depth conceptual explanation")
    concept_name: str = Field(description="Name of the concept this question tests")
    difficulty: Literal["easy", "medium", "hard"] = Field(description="Target difficulty level")
    evidence_chunk_ids: list[str] = Field(
        default_factory=list,
        description="Chunk IDs from the provided context that support this question",
    )


class QuizQuestionGenerationOutput(BaseModel):
    mcq_questions: list[GeneratedMCQ] = Field(default_factory=list)
    open_ended_questions: list[GeneratedOpenEnded] = Field(default_factory=list)


class OpenEndedEvaluationOutput(BaseModel):
    score: float = Field(description="Normalized assessment score between 0.0 (unacceptable) and 1.0 (perfect)")
    is_correct: bool = Field(description="True if the response demonstrates satisfactory mastery (>= 0.70 score)")
    strengths: list[str] = Field(default_factory=list, description="Key correct points or strong reasoning shown by learner")
    missing_points: list[str] = Field(default_factory=list, description="Omitted criteria or misconceptions identified")
    feedback: str = Field(description="Actionable, encouraging pedagogical feedback tailored to the learner's answer")


# ---------------------------------------------------------------------------
# Inbound API Request Schemas
# ---------------------------------------------------------------------------

class QuizCreateRequest(BaseModel):
    title: str = Field(default="Adaptive Quiz", max_length=255)
    question_count: int = Field(default=5, ge=1, le=15)
    preferred_difficulty: Literal["easy", "medium", "hard", "adaptive"] | None = Field(default="adaptive")


class QuizAnswerSubmitRequest(BaseModel):
    question_id: uuid.UUID | None = Field(default=None, description="Question ID being answered")
    selected_answer: str | None = Field(default=None, description="Chosen option for MCQ questions")
    answer_text: str | None = Field(default=None, description="Written response text for open-ended questions")


# ---------------------------------------------------------------------------
# Outbound API Response Schemas
# ---------------------------------------------------------------------------

class QuizQuestionPublicResponse(BaseModel):
    """Public question view for learner during active attempt (answers and rubrics hidden)."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    quiz_id: uuid.UUID
    concept_id: uuid.UUID | None
    question_type: str  # "mcq" or "open_ended"
    question_text: str
    options: list[str]
    difficulty: str
    question_order: int
    concept_name: str | None = None


class QuizQuestionDetailResponse(BaseModel):
    """Detailed question view for post-submission or review."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    quiz_id: uuid.UUID
    concept_id: uuid.UUID | None
    question_type: str
    question_text: str
    options: list[str]
    correct_answer: str
    explanation: str
    rubric: str | None
    difficulty: str
    question_order: int
    source_chunk_ids: list[str]
    concept_name: str | None = None


class QuizResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    status: str
    created_at: datetime
    completed_at: datetime | None = None
    question_count: int
    questions: list[QuizQuestionPublicResponse] = Field(default_factory=list)


class QuizListResponse(BaseModel):
    quizzes: list[QuizResponse]
    count: int


class QuizAttemptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    quiz_id: uuid.UUID
    project_id: uuid.UUID
    started_at: datetime
    completed_at: datetime | None = None
    score: float | None = None
    total_questions: int
    correct_answers: int
    status: str  # "in_progress", "completed"


class QuizAnswerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    attempt_id: uuid.UUID
    question_id: uuid.UUID
    concept_id: uuid.UUID | None
    difficulty: str
    selected_answer: str | None
    answer_text: str | None
    is_correct: bool | None
    score: float | None
    evaluation_feedback: str | None
    evaluated_at: datetime
    # Revealed upon submission
    correct_answer: str
    explanation: str


class ConceptPerformance(BaseModel):
    concept_id: uuid.UUID | None
    concept_name: str
    total_questions: int
    correct_questions: int
    accuracy_percentage: float


class QuizResultResponse(BaseModel):
    attempt_id: uuid.UUID
    quiz_id: uuid.UUID
    project_id: uuid.UUID
    status: str
    started_at: datetime
    completed_at: datetime | None
    score_percentage: float
    total_questions: int
    correct_answers: int
    answers: list[QuizAnswerResponse]
    concept_performance: list[ConceptPerformance]
