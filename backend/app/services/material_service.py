"""Material business logic service.

Enforces project ownership, validates file constraints, synchronously saves PDF storage,
creates queued Material records, and dispatches asynchronous Celery processing tasks.
"""

import logging
import uuid

from fastapi import HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.material import Material
from app.repositories.event_repository import EventRepository
from app.repositories.material_repository import MaterialRepository
from app.repositories.project_repository import ProjectRepository
from app.services.storage_service import sanitize_filename, storage_service
from app.workers.tasks import process_material

logger = logging.getLogger("ai_study_companion.services.material")


class MaterialService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.material_repo = MaterialRepository(session)
        self.project_repo = ProjectRepository(session)
        self.event_repo = EventRepository(session)

    async def upload_material(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        file: UploadFile,
    ) -> Material:
        """Validate, synchronously store PDF file, record queued Material, and dispatch Celery worker."""
        # 1. Verify project exists and is owned by the authenticated user
        project = await self.project_repo.get_by_id(user_id, project_id)
        if not project:
            # Strictly return 404 to prevent resource enumeration
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )

        # 2. Validate filename and extension
        original_filename = file.filename or "uploaded.pdf"
        sanitized_name = sanitize_filename(original_filename)

        if not sanitized_name.lower().endswith(".pdf"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only PDF documents (.pdf) are supported.",
            )

        # 3. Read content and validate size
        file_bytes = await file.read()
        file_size = len(file_bytes)

        if file_size == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is empty.",
            )

        if file_size > settings.MAX_UPLOAD_SIZE_BYTES:
            max_mb = settings.MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail=f"File exceeds maximum allowed size of {max_mb} MB.",
            )

        # 4. Generate deterministic material ID and synchronously save to storage
        material_id = uuid.uuid4()
        storage_path = storage_service.save_file(
            project_id=project_id,
            material_id=material_id,
            content=file_bytes,
        )

        # 5. Create database record in 'queued' status
        material = Material(
            id=material_id,
            project_id=project_id,
            user_id=user_id,
            filename=sanitized_name,
            storage_path=storage_path,
            status="queued",
            failure_reason=None,
            page_count=None,
        )
        self.session.add(material)
        await self.session.commit()
        await self.session.refresh(material)

        # 6. Audit activity event
        await self.event_repo.record_event(
            user_id=user_id,
            event_type="material_uploaded",
            project_id=project_id,
            payload={
                "material_id": str(material.id),
                "filename": sanitized_name,
                "file_size_bytes": file_size,
            },
        )

        # 7. Enqueue asynchronous Celery processing task
        try:
            process_material.delay(str(material.id))
        except Exception as exc:
            logger.warning(
                f"Celery task enqueue failed for material {material.id}: {exc}. "
                "Task remains queued for worker pickup."
            )

        return material

    async def list_materials(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
    ) -> list[Material]:
        """List materials for a project with strict tenant verification."""
        project = await self.project_repo.get_by_id(user_id, project_id)
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )
        return await self.material_repo.list_by_project(user_id, project_id)

    async def get_material(
        self,
        user_id: uuid.UUID,
        material_id: uuid.UUID,
    ) -> Material:
        """Get a single material, returning 404 if missing or unauthorized."""
        material = await self.material_repo.get_by_id(user_id, material_id)
        if not material:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Material not found",
            )
        return material

    async def retry_material(
        self,
        user_id: uuid.UUID,
        material_id: uuid.UUID,
    ) -> Material:
        """Retry a failed material by resetting status to queued and re-enqueuing Celery task."""
        material = await self.get_material(user_id, material_id)

        if material.status != "failed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Only failed materials can be retried. Current status is '{material.status}'.",
            )

        # Reset status and clear failure reason
        updated = await self.material_repo.update_status(
            material_id=material_id,
            status="queued",
            failure_reason=None,
        )
        if not updated:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Material not found",
            )

        # Enqueue processing task
        try:
            process_material.delay(str(material.id))
        except Exception as exc:
            logger.warning(f"Celery retry task enqueue failed for {material.id}: {exc}")

        return updated
