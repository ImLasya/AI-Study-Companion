import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project


class ProjectRepository:
    """
    DATA ISOLATION BOUNDARY:
    Every query method in this repository requires `user_id` and enforces it directly in the SQL
    WHERE clause (`WHERE user_id = :user_id`). This ensures projects can never be listed, retrieved,
    modified, or deleted across user boundaries. Unauthorized accesses evaluate to None at the SQL
    engine level and return 404 Not Found, completely cloaking the existence of other tenants' projects.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_by_space(self, user_id: uuid.UUID, space_id: uuid.UUID) -> list[Project]:
        """List all projects in space_id owned by user_id."""
        query = (
            select(Project)
            .where(
                Project.space_id == space_id,
                Project.user_id == user_id,  # Mandatory isolation condition
            )
            .order_by(Project.created_at.desc())
        )
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_by_id(self, user_id: uuid.UUID, project_id: uuid.UUID) -> Project | None:
        """Fetch a project by project_id ONLY if it belongs to user_id."""
        query = select(Project).where(
            Project.id == project_id,
            Project.user_id == user_id,  # Mandatory isolation condition
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def create(
        self,
        user_id: uuid.UUID,
        space_id: uuid.UUID,
        name: str,
        learning_goal: str,
        description: str | None = None,
    ) -> Project:
        project = Project(
            user_id=user_id,
            space_id=space_id,
            name=name.strip(),
            learning_goal=learning_goal.strip(),
            description=description.strip() if description else None,
        )
        self.db.add(project)
        await self.db.commit()
        await self.db.refresh(project)
        return project

    async def update(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        name: str | None = None,
        description: str | None = None,
        learning_goal: str | None = None,
    ) -> Project | None:
        project = await self.get_by_id(user_id=user_id, project_id=project_id)
        if not project:
            return None

        if name is not None:
            project.name = name.strip()
        if description is not None:
            project.description = description.strip() if description else None
        if learning_goal is not None:
            project.learning_goal = learning_goal.strip()

        await self.db.commit()
        await self.db.refresh(project)
        return project

    async def delete(self, user_id: uuid.UUID, project_id: uuid.UUID) -> bool:
        project = await self.get_by_id(user_id=user_id, project_id=project_id)
        if not project:
            return False

        await self.db.delete(project)
        await self.db.commit()
        return True
