"""Material and MaterialChunk persistence repository.

Enforces strict tenant isolation: all user-facing queries must filter by both entity ID and user_id.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chunk import MaterialChunk
from app.models.material import Material


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
    ) -> Material | None:
        """Update processing status, failure reason, and page count."""
        stmt = select(Material).where(Material.id == material_id)
        result = await self.session.execute(stmt)
        material = result.scalar_one_or_none()
        if not material:
            return None

        material.status = status
        material.failure_reason = failure_reason
        if page_count is not None:
            material.page_count = page_count
        material.updated_at = datetime.now(UTC)

        await self.session.commit()
        await self.session.refresh(material)
        return material

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
