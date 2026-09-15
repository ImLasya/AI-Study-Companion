"""Pydantic v2 Schemas for AI Tutor and Grounded RAG.

Enforces strict input validation, length limits, and structured JSON contracts.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.config import settings


class TutorCitation(BaseModel):
    """Server-derived citation metadata."""

    model_config = ConfigDict(from_attributes=True)

    chunk_id: uuid.UUID
    material_id: uuid.UUID
    filename: str
    page_number: int


class TutorStructuredOutput(BaseModel):
    """Structured output contract requested from the Google Gemini LLM."""

    answer: str = Field(
        description="Direct, pedagogical explanation answering the learner question based strictly on the retrieved evidence."
    )
    grounded: bool = Field(
        description="True if the explanation is grounded in the provided retrieved evidence, False otherwise."
    )
    insufficient_evidence: bool = Field(
        description="True if the retrieved evidence does not contain sufficient information to answer the question, False otherwise."
    )
    citation_chunk_ids: list[str] = Field(
        default_factory=list,
        description="List of chunk IDs (UUID strings) from the retrieved evidence that directly support the answer.",
    )


class TutorRequest(BaseModel):
    """Inbound learner question payload."""

    question: str
    conversation_id: uuid.UUID | None = None

    @field_validator("question")
    @classmethod
    def validate_question(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Question cannot be empty or whitespace only.")
        if len(trimmed) > settings.TUTOR_MAX_QUESTION_LENGTH:
            raise ValueError(
                f"Question exceeds maximum length of {settings.TUTOR_MAX_QUESTION_LENGTH} characters."
            )
        return trimmed


class TutorAnswer(BaseModel):
    """Outbound grounded tutor response."""

    model_config = ConfigDict(from_attributes=True)

    conversation_id: uuid.UUID
    message_id: uuid.UUID
    answer: str
    grounded: bool
    insufficient_evidence: bool
    citations: list[TutorCitation] = Field(default_factory=list)


class TutorMessageResponse(BaseModel):
    """Historical message turn within a tutor conversation."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    role: str
    content: str
    grounded: bool
    insufficient_evidence: bool
    citations: list[TutorCitation] = Field(default_factory=list)
    created_at: datetime


class TutorConversationResponse(BaseModel):
    """Detailed conversation payload with full message thread."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    created_at: datetime
    updated_at: datetime
    messages: list[TutorMessageResponse] = Field(default_factory=list)


class TutorConversationSummary(BaseModel):
    """Summary item for conversation list views."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    created_at: datetime
    updated_at: datetime
    message_count: int = 0
