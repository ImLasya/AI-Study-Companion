"""Pydantic schemas for Background Learning Insights."""

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class LearningInsightResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    insight_type: str
    title: str
    content: str
    metadata_json: dict[str, Any] | None = None
    created_at: datetime
