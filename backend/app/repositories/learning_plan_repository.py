"""Repository for LearningPlan and LearningPlanItem data access."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.learning_plan import LearningPlan, LearningPlanItem


class LearningPlanRepository:
    """Handles tenant-isolated persistence and queries for learning plans and items."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_active_by_project(
        self, user_id: uuid.UUID, project_id: uuid.UUID
    ) -> LearningPlan | None:
        """Fetch the active learning plan for a user's project, with items and concepts."""
        stmt = (
            select(LearningPlan)
            .where(
                LearningPlan.user_id == user_id,
                LearningPlan.project_id == project_id,
                LearningPlan.status == "active",
            )
            .options(
                selectinload(LearningPlan.items).selectinload(LearningPlanItem.concept)
            )
            .order_by(LearningPlan.created_at.desc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_id(
        self, user_id: uuid.UUID, project_id: uuid.UUID, plan_id: uuid.UUID
    ) -> LearningPlan | None:
        """Fetch a specific learning plan ensuring strict tenant and project isolation."""
        stmt = (
            select(LearningPlan)
            .where(
                LearningPlan.id == plan_id,
                LearningPlan.user_id == user_id,
                LearningPlan.project_id == project_id,
            )
            .options(
                selectinload(LearningPlan.items).selectinload(LearningPlanItem.concept)
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create_plan(self, plan: LearningPlan) -> LearningPlan:
        """Persist a new learning plan."""
        self.session.add(plan)
        await self.session.flush()
        return plan

    async def get_item_by_id(
        self, plan_id: uuid.UUID, item_id: uuid.UUID
    ) -> LearningPlanItem | None:
        """Fetch a specific plan item within a plan."""
        stmt = (
            select(LearningPlanItem)
            .where(
                LearningPlanItem.id == item_id,
                LearningPlanItem.learning_plan_id == plan_id,
            )
            .options(selectinload(LearningPlanItem.concept))
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def update_item(
        self,
        item: LearningPlanItem,
        status: str,
        completed_at: datetime | None = None,
    ) -> LearningPlanItem:
        """Update an item's roadmap status and completion timestamp."""
        item.status = status
        item.completed_at = completed_at
        item.updated_at = datetime.now(UTC)
        await self.session.flush()
        return item

    async def bulk_create_items(
        self, items: list[LearningPlanItem]
    ) -> list[LearningPlanItem]:
        """Persist multiple plan items in a single flush."""
        self.session.add_all(items)
        await self.session.flush()
        return items

    async def delete_items_by_plan(self, plan_id: uuid.UUID) -> None:
        """Remove all existing items for a plan before a full reorder."""
        stmt = delete(LearningPlanItem).where(
            LearningPlanItem.learning_plan_id == plan_id
        )
        await self.session.execute(stmt)
        await self.session.flush()
