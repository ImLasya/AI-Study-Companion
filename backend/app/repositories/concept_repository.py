"""Concept Inventory Persistence Repository.

Enforces strict tenant isolation: all queries must filter by both project_id and user_id.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.concept import Concept


class ConceptRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_by_project(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
    ) -> list[Concept]:
        """Fetch all concepts for a project, scoped strictly to the authenticated user."""
        stmt = (
            select(Concept)
            .where(
                Concept.project_id == project_id,
                Concept.user_id == user_id,
            )
            .order_by(Concept.name.asc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_id(
        self,
        user_id: uuid.UUID,
        concept_id: uuid.UUID,
    ) -> Concept | None:
        """Fetch a single concept by ID, scoped to user."""
        stmt = select(Concept).where(
            Concept.id == concept_id,
            Concept.user_id == user_id,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_name(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        name: str,
    ) -> Concept | None:
        """Find a concept by exact name match within the user's project."""
        stmt = select(Concept).where(
            Concept.project_id == project_id,
            Concept.user_id == user_id,
            Concept.name == name.strip(),
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create_concepts(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        concepts_data: list[dict],
    ) -> list[Concept]:
        """Bulk insert concepts for a project idempotently."""
        concepts: list[Concept] = []
        for item in concepts_data:
            existing = await self.get_by_name(user_id, project_id, item["name"])
            if existing:
                existing.description = item.get("description", existing.description)
                existing.source_chunk_ids = item.get("source_chunk_ids", existing.source_chunk_ids)
                existing.updated_at = datetime.now(UTC)
                concepts.append(existing)
            else:
                new_c = Concept(
                    id=uuid.uuid4(),
                    user_id=user_id,
                    project_id=project_id,
                    name=item["name"].strip(),
                    description=item.get("description", "").strip(),
                    source_chunk_ids=item.get("source_chunk_ids", []),
                    created_at=datetime.now(UTC),
                    updated_at=datetime.now(UTC),
                )
                self.session.add(new_c)
                concepts.append(new_c)

        await self.session.commit()
        for c in concepts:
            await self.session.refresh(c)
        return concepts

    async def delete_all_by_project(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
    ) -> int:
        """Remove all concepts for a project."""
        stmt = delete(Concept).where(
            Concept.project_id == project_id,
            Concept.user_id == user_id,
        )
        res = await self.session.execute(stmt)
        await self.session.commit()
        count = getattr(res, "rowcount", 0)
        return int(count if count is not None else 0)
