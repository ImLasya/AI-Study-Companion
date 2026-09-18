import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.space import Space
from app.repositories.event_repository import EventRepository
from app.repositories.space_repository import SpaceRepository, SpaceStats
from app.schemas.space import SpaceCreate, SpaceUpdate


class SpaceService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.space_repo = SpaceRepository(db)
        self.event_repo = EventRepository(db)

    async def list_spaces(self, user_id: uuid.UUID) -> list[SpaceStats]:
        return await self.space_repo.list_by_user(user_id)

    async def get_space(self, user_id: uuid.UUID, space_id: uuid.UUID) -> Space:
        space = await self.space_repo.get_by_id(user_id=user_id, space_id=space_id)
        if not space:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Space not found",
            )
        return space

    async def get_space_with_stats(self, user_id: uuid.UUID, space_id: uuid.UUID) -> SpaceStats:
        stats = await self.space_repo.get_with_stats(user_id=user_id, space_id=space_id)
        if not stats:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Space not found",
            )
        return stats

    async def create_space(self, user_id: uuid.UUID, data: SpaceCreate) -> Space:
        space = await self.space_repo.create(
            user_id=user_id,
            name=data.name,
            description=data.description,
        )
        # Emit space_created activity event
        await self.event_repo.record_event(
            user_id=user_id,
            event_type="space_created",
            payload={"space_id": str(space.id), "name": space.name},
        )
        return space

    async def update_space(
        self, user_id: uuid.UUID, space_id: uuid.UUID, data: SpaceUpdate
    ) -> Space:
        space = await self.space_repo.update(
            user_id=user_id,
            space_id=space_id,
            name=data.name,
            description=data.description,
        )
        if not space:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Space not found",
            )
        return space

    async def delete_space(self, user_id: uuid.UUID, space_id: uuid.UUID) -> None:
        deleted = await self.space_repo.delete(user_id=user_id, space_id=space_id)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Space not found",
            )
        await self.event_repo.record_event(
            user_id=user_id,
            event_type="space_deleted",
            payload={"space_id": str(space_id)},
        )
