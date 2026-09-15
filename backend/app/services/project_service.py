import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project
from app.repositories.event_repository import EventRepository
from app.repositories.project_repository import ProjectRepository
from app.repositories.space_repository import SpaceRepository
from app.schemas.project import ProjectCreate, ProjectUpdate


class ProjectService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.project_repo = ProjectRepository(db)
        self.space_repo = SpaceRepository(db)
        self.event_repo = EventRepository(db)

    async def list_projects_in_space(
        self, user_id: uuid.UUID, space_id: uuid.UUID
    ) -> list[Project]:
        # First verify the space belongs to the user
        space = await self.space_repo.get_by_id(user_id=user_id, space_id=space_id)
        if not space:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Space not found",
            )
        return await self.project_repo.list_by_space(user_id=user_id, space_id=space_id)

    async def get_project(self, user_id: uuid.UUID, project_id: uuid.UUID) -> Project:
        project = await self.project_repo.get_by_id(user_id=user_id, project_id=project_id)
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )
        return project

    async def create_project(
        self, user_id: uuid.UUID, space_id: uuid.UUID, data: ProjectCreate
    ) -> Project:
        # Cross-boundary validation: A project must belong to a space owned by the same user
        space = await self.space_repo.get_by_id(user_id=user_id, space_id=space_id)
        if not space:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Space not found",
            )

        project = await self.project_repo.create(
            user_id=user_id,
            space_id=space_id,
            name=data.name,
            learning_goal=data.learning_goal,
            description=data.description,
        )

        # Emit project_created activity event
        await self.event_repo.record_event(
            user_id=user_id,
            project_id=project.id,
            event_type="project_created",
            payload={
                "project_id": str(project.id),
                "name": project.name,
                "space_id": str(space_id),
                "learning_goal": project.learning_goal,
            },
        )
        return project

    async def update_project(
        self, user_id: uuid.UUID, project_id: uuid.UUID, data: ProjectUpdate
    ) -> Project:
        project = await self.project_repo.update(
            user_id=user_id,
            project_id=project_id,
            name=data.name,
            description=data.description,
            learning_goal=data.learning_goal,
        )
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )
        return project

    async def delete_project(self, user_id: uuid.UUID, project_id: uuid.UUID) -> None:
        deleted = await self.project_repo.delete(user_id=user_id, project_id=project_id)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )
        await self.event_repo.record_event(
            user_id=user_id,
            project_id=project_id,
            event_type="project_deleted",
            payload={"project_id": str(project_id)},
        )
