import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class SpaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None


class SpaceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None


class SpaceResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    description: str | None = None
    created_at: datetime
    updated_at: datetime
    projects_count: int = 0

    model_config = {"from_attributes": True}
