import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class MaterialResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    filename: str
    status: str
    failure_reason: str | None = None
    page_count: int | None = None
    created_at: datetime
    updated_at: datetime


class MaterialChunkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    material_id: uuid.UUID
    project_id: uuid.UUID
    page_number: int
    chunk_index: int
    content: str
    created_at: datetime
