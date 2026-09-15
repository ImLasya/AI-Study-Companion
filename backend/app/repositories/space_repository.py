import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project
from app.models.space import Space


class SpaceRepository:
    """
    DATA ISOLATION BOUNDARY:
    Every query method in this repository requires `user_id` and enforces it directly in the SQL
    WHERE clause (`WHERE user_id = :user_id`). This guarantees strict multitenant data isolation
    at the database query layer rather than relying on application-level post-filtering.
    Unauthorized cross-user entity lookups will return None (translating to HTTP 404),
    preventing both data leakage and entity existence enumeration.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_by_user(self, user_id: uuid.UUID) -> list[tuple[Space, int]]:
        """List all spaces owned by user_id along with count of projects."""
        query = (
            select(Space, func.count(Project.id).label("projects_count"))
            .outerjoin(Project, Project.space_id == Space.id)
            .where(Space.user_id == user_id)
            .group_by(Space.id)
            .order_by(Space.created_at.desc())
        )
        result = await self.db.execute(query)
        return [(row[0], row[1]) for row in result.all()]

    async def get_by_id(self, user_id: uuid.UUID, space_id: uuid.UUID) -> Space | None:
        """Fetch a space by space_id ONLY if it belongs to user_id."""
        query = select(Space).where(
            Space.id == space_id,
            Space.user_id == user_id,  # Mandatory isolation condition
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def create(
        self,
        user_id: uuid.UUID,
        name: str,
        description: str | None = None,
    ) -> Space:
        space = Space(
            user_id=user_id,
            name=name.strip(),
            description=description.strip() if description else None,
        )
        self.db.add(space)
        await self.db.commit()
        await self.db.refresh(space)
        return space

    async def update(
        self,
        user_id: uuid.UUID,
        space_id: uuid.UUID,
        name: str | None = None,
        description: str | None = None,
    ) -> Space | None:
        space = await self.get_by_id(user_id=user_id, space_id=space_id)
        if not space:
            return None

        if name is not None:
            space.name = name.strip()
        if description is not None:
            space.description = description.strip() if description else None

        await self.db.commit()
        await self.db.refresh(space)
        return space

    async def delete(self, user_id: uuid.UUID, space_id: uuid.UUID) -> bool:
        space = await self.get_by_id(user_id=user_id, space_id=space_id)
        if not space:
            return False

        await self.db.delete(space)
        await self.db.commit()
        return True
