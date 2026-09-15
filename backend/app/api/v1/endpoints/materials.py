"""Learning Materials API endpoints.

Handles PDF upload, material status queries, and processing retries with strict tenant isolation.
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.material import MaterialResponse
from app.services.material_service import MaterialService

router = APIRouter()


@router.post(
    "/projects/{project_id}/materials",
    response_model=MaterialResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload a PDF learning material to a project",
)
async def upload_material(
    project_id: uuid.UUID,
    file: Annotated[UploadFile, File(...)],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MaterialResponse:
    """Upload a PDF document to a project.

    Synchronously validates the file and persists it to storage, creates a Material
    record with status 'queued', and enqueues an asynchronous Celery processing task.
    Returns HTTP 202 Accepted immediately.
    """
    service = MaterialService(db)
    material = await service.upload_material(current_user.id, project_id, file)
    return MaterialResponse.model_validate(material)


@router.get(
    "/projects/{project_id}/materials",
    response_model=list[MaterialResponse],
    status_code=status.HTTP_200_OK,
    summary="List all materials in a project",
)
async def list_materials(
    project_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[MaterialResponse]:
    """List all materials belonging to the specified project for the authenticated user."""
    service = MaterialService(db)
    materials = await service.list_materials(current_user.id, project_id)
    return [MaterialResponse.model_validate(m) for m in materials]


@router.get(
    "/materials/{material_id}",
    response_model=MaterialResponse,
    status_code=status.HTTP_200_OK,
    summary="Get details and status of a material",
)
async def get_material(
    material_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MaterialResponse:
    """Fetch status, failure reason, and page count for a specific material."""
    service = MaterialService(db)
    material = await service.get_material(current_user.id, material_id)
    return MaterialResponse.model_validate(material)


@router.post(
    "/materials/{material_id}/retry",
    response_model=MaterialResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Retry ingestion for a failed material",
)
async def retry_material(
    material_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MaterialResponse:
    """Reset a failed material to 'queued' status and re-enqueue Celery processing."""
    service = MaterialService(db)
    material = await service.retry_material(current_user.id, material_id)
    return MaterialResponse.model_validate(material)
