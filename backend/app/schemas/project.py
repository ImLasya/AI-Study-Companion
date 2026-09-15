import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    learning_goal: str = Field(
        min_length=1, description="Primary learning objective for this project"
    )


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    learning_goal: str | None = None


class ProjectResponse(BaseModel):
    id: uuid.UUID
    space_id: uuid.UUID
    user_id: uuid.UUID
    name: str
    description: str | None = None
    learning_goal: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
