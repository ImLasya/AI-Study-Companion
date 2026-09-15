import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.event import ActivityEvent


class EventRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def record_event(
        self,
        user_id: uuid.UUID,
        event_type: str,
        payload: dict[str, Any] | None = None,
        project_id: uuid.UUID | None = None,
    ) -> ActivityEvent:
        event = ActivityEvent(
            user_id=user_id,
            project_id=project_id,
            event_type=event_type,
            payload=payload or {},
        )
        self.db.add(event)
        await self.db.commit()
        await self.db.refresh(event)
        return event
