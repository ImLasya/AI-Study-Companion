"""Material and MaterialChunk persistence repository.

Enforces strict tenant isolation: all user-facing queries must filter by both entity ID and user_id.
"""

import uuid
from datetime import UTC, datetime

from langsmith import traceable
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.chunk import MaterialChunk
from app.models.material import Material


def _safe_store_chunks_inputs(inputs: dict) -> dict:
    chunks_data = inputs.get("chunks_data", [])
    return {
        "material_id": str(inputs.get("material_id", "")),
        "project_id": str(inputs.get("project_id", "")),
        "chunk_count": len(chunks_data),
        "index_target": "ix_material_chunks_embedding_hnsw",
        "index_type": "HNSW",
        "distance_metric": "cosine",
        "vector_dimension": settings.EMBEDDING_DIMENSION,
    }


def _safe_store_chunks_outputs(result: list[MaterialChunk]) -> dict:
    return {
        "inserted_count": len(result),
        "index_target": "ix_material_chunks_embedding_hnsw",
        "index_type": "HNSW",
        "distance_metric": "cosine",
        "vector_dimension": settings.EMBEDDING_DIMENSION,
        "status": "success",
    }


class MaterialRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_by_project(self, user_id: uuid.UUID, project_id: uuid.UUID) -> list[Material]:
        """List all materials belonging to a project, enforcing tenant isolation.

        ISOLATION BOUNDARY: WHERE project_id = :project_id AND user_id = :user_id
        """
        stmt = (
            select(Material)
            .where(
                Material.project_id == project_id,
                Material.user_id == user_id,
            )
            .order_by(Material.created_at.desc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_id(self, user_id: uuid.UUID, material_id: uuid.UUID) -> Material | None:
        """Get a material by ID, scoped strictly to the authenticated user.

        ISOLATION BOUNDARY: WHERE id = :material_id AND user_id = :user_id
        """
        stmt = select(Material).where(
            Material.id == material_id,
            Material.user_id == user_id,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def count_ready_materials(self, user_id: uuid.UUID, project_id: uuid.UUID) -> int:
        """Count the number of materials with status='ready' for a project, scoped to user."""
        stmt = (
            select(func.count())
            .select_from(Material)
            .where(
                Material.project_id == project_id,
                Material.user_id == user_id,
                Material.status == "ready",
            )
        )
        result = await self.session.execute(stmt)
        return int(result.scalar_one())

    async def has_ready_materials(self, user_id: uuid.UUID, project_id: uuid.UUID) -> bool:
        """Check if a project has at least one material with status='ready', scoped to user."""
        count = await self.count_ready_materials(user_id=user_id, project_id=project_id)
        return count > 0

    async def get_by_id_internal(self, material_id: uuid.UUID) -> Material | None:
        """Internal lookup by ID for background worker execution."""
        stmt = select(Material).where(Material.id == material_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create(
        self,
        project_id: uuid.UUID,
        user_id: uuid.UUID,
        filename: str,
        storage_path: str,
    ) -> Material:
        """Create a new Material record in 'queued' status."""
        material = Material(
            id=uuid.uuid4(),
            project_id=project_id,
            user_id=user_id,
            filename=filename,
            storage_path=storage_path,
            status="queued",
            failure_reason=None,
            page_count=None,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        self.session.add(material)
        await self.session.commit()
        await self.session.refresh(material)
        return material

    async def update_status(
        self,
        material_id: uuid.UUID,
        status: str,
        failure_reason: str | None = None,
        page_count: int | None = None,
        retry_count: int | None = None,
        completed_at: datetime | None = None,
    ) -> Material | None:
        """Update processing status, failure reason, and page count."""
        stmt = select(Material).where(Material.id == material_id)
        result = await self.session.execute(stmt)
        material = result.scalar_one_or_none()
        if not material:
            return None

        material.status = status
        material.failure_reason = failure_reason
        if failure_reason:
            material.last_error = failure_reason
        if page_count is not None:
            material.page_count = page_count
        if retry_count is not None:
            material.retry_count = retry_count
        if status == "ready":
            material.completed_at = completed_at or datetime.now(UTC)
        material.updated_at = datetime.now(UTC)

        await self.session.commit()
        await self.session.refresh(material)
        return material

    @traceable(
        name="Store Chunks",
        run_type="chain",
        process_inputs=_safe_store_chunks_inputs,
        process_outputs=_safe_store_chunks_outputs,
    )
    async def replace_chunks(
        self,
        material_id: uuid.UUID,
        project_id: uuid.UUID,
        chunks_data: list[dict],
    ) -> list[MaterialChunk]:
        """Idempotently replace all chunks for a material.

        Deletes existing chunks first to prevent duplication on retry, then inserts new chunks.
        """
        # Delete existing chunks for this material
        await self.session.execute(
            delete(MaterialChunk).where(MaterialChunk.material_id == material_id)
        )

        # Insert new chunks
        chunks = [
            MaterialChunk(
                id=uuid.uuid4(),
                material_id=material_id,
                project_id=project_id,
                content=chunk["content"],
                page_number=chunk["page_number"],
                embedding=chunk["embedding"],
                chunk_index=chunk["chunk_index"],
                section_heading=chunk.get("section_heading"),
                content_type=chunk.get("content_type", "paragraph"),
                created_at=datetime.now(UTC),
            )
            for chunk in chunks_data
        ]

        if chunks:
            self.session.add_all(chunks)

        await self.session.commit()
        return chunks

    async def get_chunks_by_material(self, material_id: uuid.UUID) -> list[MaterialChunk]:
        """Fetch all chunks belonging to a material ordered by chunk_index."""
        stmt = (
            select(MaterialChunk)
            .where(MaterialChunk.material_id == material_id)
            .order_by(MaterialChunk.chunk_index.asc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_chunks_by_ids(
        self, project_id: uuid.UUID, chunk_ids: list[uuid.UUID]
    ) -> list[MaterialChunk]:
        """Fetch chunks by their UUIDs within a project.

        ISOLATION BOUNDARY: WHERE project_id = :project_id AND id IN (:chunk_ids)
        """
        if not chunk_ids:
            return []
        stmt = (
            select(MaterialChunk)
            .where(
                MaterialChunk.project_id == project_id,
                MaterialChunk.id.in_(chunk_ids),
            )
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())


    async def search_chunks_by_vector(
        self,
        project_id: uuid.UUID,
        query_embedding: list[float],
        limit: int = 5,
    ) -> list[tuple[MaterialChunk, float]]:
        """Perform cosine similarity search on chunks using pgvector <=> operator.

        ISOLATION BOUNDARY: WHERE project_id = :project_id
        Returns (chunk, cosine_distance) sorted in ascending order of distance.
        """
        stmt = (
            select(
                MaterialChunk,
                MaterialChunk.embedding.cosine_distance(query_embedding).label("distance"),
            )
            .where(MaterialChunk.project_id == project_id)
            .order_by("distance")
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return [(row[0], float(row[1])) for row in result.all()]

    async def search_chunks_with_material(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        query_embedding: list[float],
        limit: int = 5,
    ) -> list[tuple[MaterialChunk, str, float]]:
        """Perform cosine similarity search on chunks joining Material for filename.

        ISOLATION BOUNDARY: WHERE MaterialChunk.project_id = :project_id AND Material.user_id = :user_id
        Returns list of tuples: (MaterialChunk, filename, cosine_distance) sorted by distance asc.
        """
        stmt = (
            select(
                MaterialChunk,
                Material.filename,
                MaterialChunk.embedding.cosine_distance(query_embedding).label("distance"),
            )
            .join(Material, MaterialChunk.material_id == Material.id)
            .where(
                MaterialChunk.project_id == project_id,
                Material.user_id == user_id,
                Material.status == "ready",
            )
            .order_by("distance")
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return [(row[0], str(row[1]), float(row[2])) for row in result.all()]

    async def delete(self, user_id: uuid.UUID, material_id: uuid.UUID) -> bool:
        """Delete a material, enforcing tenant isolation.

        ISOLATION BOUNDARY: WHERE id = :material_id AND user_id = :user_id
        """
        material = await self.get_by_id(user_id, material_id)
        if not material:
            return False

        await self.session.delete(material)
        await self.session.commit()
        return True
