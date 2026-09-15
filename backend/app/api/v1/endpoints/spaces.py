import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectResponse
from app.schemas.space import SpaceCreate, SpaceResponse, SpaceUpdate
from app.services.project_service import ProjectService
from app.services.space_service import SpaceService

router = APIRouter(prefix="/spaces", tags=["Spaces"])


@router.get("", response_model=list[SpaceResponse])
async def list_spaces(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[SpaceResponse]:
    """List all learning spaces owned by the authenticated user."""
    service = SpaceService(db)
    spaces_with_counts = await service.list_spaces(user_id=current_user.id)
    return [
        SpaceResponse(
            id=space.id,
            user_id=space.user_id,
            name=space.name,
            description=space.description,
            created_at=space.created_at,
            updated_at=space.updated_at,
            projects_count=count,
        )
        for space, count in spaces_with_counts
    ]


@router.post("", response_model=SpaceResponse, status_code=status.HTTP_201_CREATED)
async def create_space(
    data: SpaceCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SpaceResponse:
    """Create a new learning space under the current user."""
    service = SpaceService(db)
    space = await service.create_space(user_id=current_user.id, data=data)
    return SpaceResponse(
        id=space.id,
        user_id=space.user_id,
        name=space.name,
        description=space.description,
        created_at=space.created_at,
        updated_at=space.updated_at,
        projects_count=0,
    )


@router.get("/{space_id}", response_model=SpaceResponse)
async def get_space(
    space_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SpaceResponse:
    """Retrieve details of a space owned by the user. Returns 404 if not found."""
    service = SpaceService(db)
    space = await service.get_space(user_id=current_user.id, space_id=space_id)
    # Count projects
    proj_service = ProjectService(db)
    projects = await proj_service.list_projects_in_space(user_id=current_user.id, space_id=space_id)
    return SpaceResponse(
        id=space.id,
        user_id=space.user_id,
        name=space.name,
        description=space.description,
        created_at=space.created_at,
        updated_at=space.updated_at,
        projects_count=len(projects),
    )


@router.put("/{space_id}", response_model=SpaceResponse)
async def update_space(
    space_id: uuid.UUID,
    data: SpaceUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SpaceResponse:
    """Update space details."""
    service = SpaceService(db)
    space = await service.update_space(user_id=current_user.id, space_id=space_id, data=data)
    proj_service = ProjectService(db)
    projects = await proj_service.list_projects_in_space(user_id=current_user.id, space_id=space_id)
    return SpaceResponse(
        id=space.id,
        user_id=space.user_id,
        name=space.name,
        description=space.description,
        created_at=space.created_at,
        updated_at=space.updated_at,
        projects_count=len(projects),
    )


@router.delete("/{space_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_space(
    space_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a space and all its cascaded entities."""
    service = SpaceService(db)
    await service.delete_space(user_id=current_user.id, space_id=space_id)


@router.get("/{space_id}/projects", response_model=list[ProjectResponse])
async def list_projects_in_space(
    space_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ProjectResponse]:
    """List all projects belonging to the specified space."""
    service = ProjectService(db)
    projects = await service.list_projects_in_space(user_id=current_user.id, space_id=space_id)
    return [ProjectResponse.model_validate(p) for p in projects]


@router.post(
    "/{space_id}/projects",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_project_in_space(
    space_id: uuid.UUID,
    data: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectResponse:
    """Create a project inside the specified space."""
    service = ProjectService(db)
    project = await service.create_project(user_id=current_user.id, space_id=space_id, data=data)
    return ProjectResponse.model_validate(project)
