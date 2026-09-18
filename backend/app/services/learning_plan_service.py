"""Service layer for Personalized Project Learning Plans."""

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status
from loguru import logger
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cache_service
from app.models.chunk import MaterialChunk
from app.models.concept import Concept
from app.models.event import ActivityEvent
from app.models.flashcard import Flashcard
from app.models.learning_plan import LearningPlan, LearningPlanItem
from app.models.mastery import ConceptMastery, Recommendation
from app.models.material import Material
from app.models.quiz import QuizQuestion
from app.repositories.concept_repository import ConceptRepository
from app.repositories.learning_plan_repository import LearningPlanRepository
from app.repositories.mastery_repository import MasteryRepository
from app.repositories.material_repository import MaterialRepository
from app.repositories.project_repository import ProjectRepository
from app.schemas.learning_plan import (
    ConceptDetailResponse,
    LearningPlanItemResponse,
    LearningPlanProgress,
    LearningPlanResponse,
)


class LearningPlanService:
    """Orchestrates personalized, project-scoped learning roadmaps."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.plan_repo = LearningPlanRepository(session)
        self.project_repo = ProjectRepository(session)
        self.concept_repo = ConceptRepository(session)
        self.mastery_repo = MasteryRepository(session)
        self.material_repo = MaterialRepository(session)

    # ──────────────────────────────────────────────────────────────────────────
    # Cache Invalidation Helper
    # ──────────────────────────────────────────────────────────────────────────
    async def _invalidate_plan_cache(self, user_id: uuid.UUID, project_id: uuid.UUID) -> None:
        """Invalidate the cached learning plan for a project. Non-fatal on failure."""
        try:
            cache_key = f"learning_plan:{user_id}:{project_id}"
            await cache_service.delete(cache_key)
        except Exception as exc:
            logger.warning(f"Failed to invalidate learning plan cache: {exc}")

    # ──────────────────────────────────────────────────────────────────────────
    # Activity Event Helper
    # ──────────────────────────────────────────────────────────────────────────
    async def _log_activity(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        event_type: str,
        payload: dict[str, Any],
    ) -> None:
        """Record an activity event atomically within the active session."""
        try:
            event = ActivityEvent(
                user_id=user_id,
                project_id=project_id,
                event_type=event_type,
                payload=payload,
            )
            self.session.add(event)
            await self.session.flush()
        except Exception as exc:
            logger.warning(f"Activity event logging failed ({event_type}): {exc}")

    # ──────────────────────────────────────────────────────────────────────────
    # Deterministic Status & Ordering Helpers
    # ──────────────────────────────────────────────────────────────────────────
    @staticmethod
    def calculate_status(score: float | None) -> str:
        """Map ConceptMastery score to learning plan status."""
        if score is None:
            return "not_started"
        if score >= 80.0:
            return "completed"
        if score >= 50.0:
            return "in_progress"
        return "needs_review"

    async def _get_concept_order_key(
        self, concept: Concept, chunk_order_map: dict[uuid.UUID, tuple[int, int]]
    ) -> tuple[int, int, str]:
        """Compute sorting tuple (min_page, min_chunk_index, concept_name) from source chunks."""
        min_page = 999999
        min_chunk = 999999
        source_chunk_ids = concept.source_chunk_ids or []
        for cid_raw in source_chunk_ids:
            try:
                cid = uuid.UUID(str(cid_raw))
                if cid in chunk_order_map:
                    page, c_idx = chunk_order_map[cid]
                    if (page, c_idx) < (min_page, min_chunk):
                        min_page, min_chunk = page, c_idx
            except (ValueError, TypeError):
                continue

        return (min_page, min_chunk, concept.name.lower())

    # ──────────────────────────────────────────────────────────────────────────
    # Public Methods
    # ──────────────────────────────────────────────────────────────────────────
    async def get_active_plan(
        self, user_id: uuid.UUID, project_id: uuid.UUID
    ) -> LearningPlanResponse | None:
        """Retrieve the active learning plan for a project with live mastery integration."""
        project = await self.project_repo.get_by_id(user_id=user_id, project_id=project_id)
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )

        # Check cache
        cache_key = f"learning_plan:{user_id}:{project_id}"
        try:
            cached = await cache_service.get(cache_key)
            if cached:
                return LearningPlanResponse.model_validate(cached)
        except Exception as exc:
            logger.warning(f"Cache read failed for learning plan: {exc}")

        plan = await self.plan_repo.get_active_by_project(user_id=user_id, project_id=project_id)
        if not plan:
            return None

        # Build response with live mastery state
        response = await self._build_plan_response(user_id=user_id, project_id=project_id, plan=plan)

        # Cache response
        try:
            await cache_service.set(cache_key, response.model_dump(mode="json"), ttl_seconds=300)
        except Exception as exc:
            logger.warning(f"Cache write failed for learning plan: {exc}")

        return response

    async def get_plan_by_id(
        self, user_id: uuid.UUID, project_id: uuid.UUID, plan_id: uuid.UUID
    ) -> LearningPlanResponse:
        """Fetch a specific plan ensuring strict tenant and project isolation."""
        project = await self.project_repo.get_by_id(user_id=user_id, project_id=project_id)
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )

        plan = await self.plan_repo.get_by_id(user_id=user_id, project_id=project_id, plan_id=plan_id)
        if not plan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Learning plan not found",
            )

        return await self._build_plan_response(user_id=user_id, project_id=project_id, plan=plan)

    async def generate_or_refresh_plan(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        force_reorder: bool = False,
    ) -> LearningPlanResponse:
        """Generate a new deterministic learning plan or refresh an existing one."""
        project = await self.project_repo.get_by_id(user_id=user_id, project_id=project_id)
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )

        # 1. Fetch all concepts strictly belonging to this project
        concepts = await self.concept_repo.list_by_project(user_id=user_id, project_id=project_id)
        if not concepts:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No concepts available yet in this project. Upload and process learning materials to begin.",
            )

        # 2. Build chunk position map for deterministic material-order sorting
        chunks_stmt = select(MaterialChunk.id, MaterialChunk.page_number, MaterialChunk.chunk_index).where(
            MaterialChunk.project_id == project_id
        )
        chunks_res = await self.session.execute(chunks_stmt)
        chunk_order_map: dict[uuid.UUID, tuple[int, int]] = {
            row[0]: (row[1], row[2]) for row in chunks_res.all()
        }

        # 3. Sort concepts deterministically
        sorted_concepts = sorted(
            concepts,
            key=lambda c: (
                # Earliest page and chunk index
                min(
                    [
                        chunk_order_map[uuid.UUID(str(cid))]
                        for cid in (c.source_chunk_ids or [])
                        if uuid.UUID(str(cid)) in chunk_order_map
                    ]
                    or [(999999, 999999)]
                ),
                c.created_at,
                c.name.lower(),
                str(c.id),
            ),
        )

        # 4. Fetch live concept masteries
        masteries = await self.mastery_repo.list_project_masteries(user_id=user_id, project_id=project_id)
        mastery_by_concept = {m.concept_id: m for m in masteries}

        # 5. Check if an active plan already exists
        existing_plan = await self.plan_repo.get_active_by_project(user_id=user_id, project_id=project_id)

        now = datetime.now(UTC)

        if existing_plan and not force_reorder:
            # Refresh existing plan: preserve existing items, append any new concepts
            existing_items_by_concept = {item.concept_id: item for item in existing_plan.items}
            max_pos = max([item.position for item in existing_plan.items], default=-1)

            new_items: list[LearningPlanItem] = []
            for concept in sorted_concepts:
                m = mastery_by_concept.get(concept.id)
                current_score = m.mastery_score if m else None
                computed_status = self.calculate_status(current_score)

                if concept.id in existing_items_by_concept:
                    item = existing_items_by_concept[concept.id]
                    # Update status based on mastery
                    item.status = computed_status
                    if computed_status == "completed" and not item.completed_at:
                        item.completed_at = now
                    item.updated_at = now
                else:
                    # Brand new concept added to project after plan creation
                    max_pos += 1
                    new_item = LearningPlanItem(
                        learning_plan_id=existing_plan.id,
                        concept_id=concept.id,
                        position=max_pos,
                        status=computed_status,
                        target_mastery=80.0,
                        completed_at=now if computed_status == "completed" else None,
                        created_at=now,
                        updated_at=now,
                    )
                    new_items.append(new_item)

            if new_items:
                await self.plan_repo.bulk_create_items(new_items)

            existing_plan.updated_at = now
            await self.session.commit()
            plan = existing_plan

        elif existing_plan and force_reorder:
            # Recompute full sequence while preserving completed_at timestamps
            completed_at_map = {
                item.concept_id: item.completed_at
                for item in existing_plan.items
                if item.completed_at is not None
            }

            # Delete old items and insert re-sequenced items
            await self.plan_repo.delete_items_by_plan(existing_plan.id)

            items_to_create = []
            for pos, concept in enumerate(sorted_concepts):
                m = mastery_by_concept.get(concept.id)
                current_score = m.mastery_score if m else None
                computed_status = self.calculate_status(current_score)
                completed_at = completed_at_map.get(concept.id)
                if computed_status == "completed" and not completed_at:
                    completed_at = now

                items_to_create.append(
                    LearningPlanItem(
                        learning_plan_id=existing_plan.id,
                        concept_id=concept.id,
                        position=pos,
                        status=computed_status,
                        target_mastery=80.0,
                        completed_at=completed_at,
                        created_at=now,
                        updated_at=now,
                    )
                )

            await self.plan_repo.bulk_create_items(items_to_create)
            existing_plan.updated_at = now
            await self.session.commit()
            plan = existing_plan

        else:
            # Create brand new active plan
            plan = LearningPlan(
                project_id=project_id,
                user_id=user_id,
                title=f"{project.name} Learning Roadmap",
                description=f"Personalized study roadmap covering {len(sorted_concepts)} core concepts.",
                status="active",
                created_at=now,
                updated_at=now,
            )
            await self.plan_repo.create_plan(plan)

            items_to_create = []
            for pos, concept in enumerate(sorted_concepts):
                m = mastery_by_concept.get(concept.id)
                current_score = m.mastery_score if m else None
                computed_status = self.calculate_status(current_score)

                items_to_create.append(
                    LearningPlanItem(
                        learning_plan_id=plan.id,
                        concept_id=concept.id,
                        position=pos,
                        status=computed_status,
                        target_mastery=80.0,
                        completed_at=now if computed_status == "completed" else None,
                        created_at=now,
                        updated_at=now,
                    )
                )

            await self.plan_repo.bulk_create_items(items_to_create)
            await self._log_activity(
                user_id=user_id,
                project_id=project_id,
                event_type="learning_plan_created",
                payload={
                    "plan_id": str(plan.id),
                    "concept_count": len(items_to_create),
                },
            )
            await self.session.commit()

        saved_plan_id = plan.id
        # Invalidate cache
        await self._invalidate_plan_cache(user_id=user_id, project_id=project_id)

        # Expire plan instance and reload eagerly with items and concepts
        try:
            self.session.expire(plan)
        except Exception:
            pass
        refreshed_plan = await self.plan_repo.get_by_id(
            user_id=user_id, project_id=project_id, plan_id=saved_plan_id
        )
        return await self._build_plan_response(user_id=user_id, project_id=project_id, plan=refreshed_plan or plan)

    async def update_item_status(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        item_id: uuid.UUID,
        status_value: str,
    ) -> LearningPlanItemResponse:
        """Manually update an item's roadmap status.

        SECURITY GUARANTEE:
        - Never modifies ConceptMastery (mastery remains owned by MasteryEngine).
        - Strictly verifies project and user ownership.
        """
        if status_value not in ("not_started", "in_progress", "completed", "needs_review"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid status '{status_value}'. Allowed: not_started, in_progress, completed, needs_review",
            )

        plan = await self.plan_repo.get_active_by_project(user_id=user_id, project_id=project_id)
        if not plan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Active learning plan not found",
            )

        item = await self.plan_repo.get_item_by_id(plan_id=plan.id, item_id=item_id)
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Learning plan item not found",
            )

        now = datetime.now(UTC)
        completed_at = item.completed_at
        if status_value == "completed" and not completed_at:
            completed_at = now
        elif status_value != "completed":
            completed_at = None

        await self.plan_repo.update_item(item=item, status=status_value, completed_at=completed_at)
        await self._log_activity(
            user_id=user_id,
            project_id=project_id,
            event_type="learning_plan_item_updated",
            payload={
                "item_id": str(item.id),
                "concept_id": str(item.concept_id),
                "new_status": status_value,
            },
        )
        await self.session.commit()
        await self._invalidate_plan_cache(user_id=user_id, project_id=project_id)

        # Build item response
        m = (
            await self.session.execute(
                select(ConceptMastery).where(
                    ConceptMastery.user_id == user_id,
                    ConceptMastery.concept_id == item.concept_id,
                )
            )
        ).scalar_one_or_none()

        return self._format_item_response(item=item, mastery=m)

    async def get_concept_detail(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        item_id: uuid.UUID,
    ) -> ConceptDetailResponse:
        """Aggregate rich, honest diagnostic data for a roadmap concept milestone."""
        plan = await self.plan_repo.get_active_by_project(user_id=user_id, project_id=project_id)
        if not plan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Active learning plan not found",
            )

        item = await self.plan_repo.get_item_by_id(plan_id=plan.id, item_id=item_id)
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Learning plan item not found",
            )

        concept = item.concept
        if not concept:
            concept = await self.concept_repo.get_by_id(user_id=user_id, concept_id=item.concept_id)

        # Mastery data
        m_stmt = select(ConceptMastery).where(
            ConceptMastery.user_id == user_id,
            ConceptMastery.concept_id == item.concept_id,
        )
        mastery = (await self.session.execute(m_stmt)).scalar_one_or_none()

        # Source Chunk & Material Info
        source_title: str | None = None
        source_page: int | None = None
        chunk_count = len(concept.source_chunk_ids or [])

        if chunk_count > 0:
            try:
                first_chunk_id = uuid.UUID(str(concept.source_chunk_ids[0]))
                chunk_stmt = (
                    select(MaterialChunk, Material.filename)
                    .join(Material, MaterialChunk.material_id == Material.id)
                    .where(MaterialChunk.id == first_chunk_id)
                )
                chunk_res = (await self.session.execute(chunk_stmt)).first()
                if chunk_res:
                    chunk_obj, mat_filename = chunk_res
                    source_title = mat_filename
                    source_page = chunk_obj.page_number
            except Exception:
                pass

        # Flashcards count
        fc_stmt = select(func.count(Flashcard.id)).where(
            Flashcard.user_id == user_id,
            Flashcard.project_id == project_id,
            Flashcard.concept_id == item.concept_id,
        )
        flashcard_count = (await self.session.execute(fc_stmt)).scalar() or 0

        # Due Flashcards count
        now = datetime.now(UTC)
        due_fc_stmt = select(func.count(Flashcard.id)).where(
            Flashcard.user_id == user_id,
            Flashcard.project_id == project_id,
            Flashcard.concept_id == item.concept_id,
            (Flashcard.next_review_at <= now) | (Flashcard.next_review_at.is_(None)),
        )
        due_fc_count = (await self.session.execute(due_fc_stmt)).scalar() or 0

        # Quiz Question Count
        qq_stmt = select(func.count(QuizQuestion.id)).where(
            QuizQuestion.concept_id == item.concept_id
        )
        quiz_count = (await self.session.execute(qq_stmt)).scalar() or 0

        # Active Recommendation for this concept if any
        rec_stmt = select(Recommendation).where(
            Recommendation.user_id == user_id,
            Recommendation.project_id == project_id,
            Recommendation.target_concept_id == item.concept_id,
            Recommendation.status == "active",
        ).limit(1)
        active_rec = (await self.session.execute(rec_stmt)).scalar_one_or_none()

        # Recommended actions based on status
        actions = []
        if item.status == "not_started":
            actions = ["Study with AI Tutor", "Read Material", "Take Quiz"]
        elif item.status == "needs_review":
            actions = ["Study with AI Tutor", "Review Flashcards", "Take Practice Quiz"]
        elif item.status == "in_progress":
            actions = ["Practice Quiz", "Study with AI Tutor", "Review Flashcards"]
        else:
            actions = ["Review Flashcards", "Take Mastery Quiz"]

        return ConceptDetailResponse(
            concept_id=concept.id,
            concept_name=concept.name,
            concept_description=concept.description,
            roadmap_status=item.status,
            mastery_score=mastery.mastery_score if mastery else None,
            confidence=mastery.confidence if mastery else 0.0,
            is_assessed=mastery is not None and mastery.mastery_score is not None,
            evidence_count=mastery.evidence_count if mastery else 0,
            source_material_title=source_title,
            source_page=source_page,
            source_chunk_count=chunk_count,
            flashcard_count=flashcard_count,
            due_flashcards_count=due_fc_count,
            quiz_question_count=quiz_count,
            active_recommendation=active_rec.reasoning if active_rec else None,
            recommended_actions=actions,
        )

    # ──────────────────────────────────────────────────────────────────────────
    # Response Builder
    # ──────────────────────────────────────────────────────────────────────────
    async def _build_plan_response(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        plan: LearningPlan,
    ) -> LearningPlanResponse:
        """Construct full LearningPlanResponse with progress metrics and next recommended concept."""
        # 1. Fetch live masteries for all items in plan
        masteries = await self.mastery_repo.list_project_masteries(user_id=user_id, project_id=project_id)
        mastery_by_concept = {m.concept_id: m for m in masteries}


        # 2. Fetch active recommendations to unify with next concept guidance
        active_recs = await self.mastery_repo.get_active_recommendations(user_id=user_id, project_id=project_id)
        active_target_concept_ids = {
            r.target_concept_id for r in active_recs if r.target_concept_id is not None
        }

        # 3. Format item responses
        item_responses: list[LearningPlanItemResponse] = []
        for item in plan.items:
            m = mastery_by_concept.get(item.concept_id)
            item_responses.append(self._format_item_response(item=item, mastery=m))

        # 4. Compute progress
        total_concepts = len(item_responses)
        completed_count = sum(1 for it in item_responses if it.status == "completed")
        in_progress_count = sum(1 for it in item_responses if it.status == "in_progress")
        needs_review_count = sum(1 for it in item_responses if it.status == "needs_review")
        not_started_count = sum(1 for it in item_responses if it.status == "not_started")

        progress_pct = (
            round((completed_count / total_concepts) * 100) if total_concepts > 0 else 0
        )

        progress = LearningPlanProgress(
            total_concepts=total_concepts,
            completed_count=completed_count,
            in_progress_count=in_progress_count,
            needs_review_count=needs_review_count,
            not_started_count=not_started_count,
            progress_percentage=progress_pct,
        )

        # 5. Select Next Recommended Concept
        next_concept: LearningPlanItemResponse | None = None

        # Priority 1: Incomplete concept targeted by active recommendation
        for it in item_responses:
            if it.concept_id in active_target_concept_ids and it.status != "completed":
                next_concept = it
                break

        # Priority 2: First concept in roadmap order needing review
        if not next_concept:
            for it in item_responses:
                if it.status == "needs_review":
                    next_concept = it
                    break

        # Priority 3: First concept in progress
        if not next_concept:
            for it in item_responses:
                if it.status == "in_progress":
                    next_concept = it
                    break

        # Priority 4: First unassessed concept in curriculum order
        if not next_concept:
            for it in item_responses:
                if it.status == "not_started":
                    next_concept = it
                    break

        return LearningPlanResponse(
            id=plan.id,
            project_id=plan.project_id,
            title=plan.title,
            description=plan.description,
            status=plan.status,
            progress=progress,
            next_recommended_concept=next_concept,
            items=item_responses,
            created_at=plan.created_at,
            updated_at=plan.updated_at,
        )

    @staticmethod
    def _format_item_response(
        item: LearningPlanItem, mastery: ConceptMastery | None
    ) -> LearningPlanItemResponse:
        """Format a single item into LearningPlanItemResponse."""
        concept = item.concept
        c_name = concept.name if concept else "Concept"
        c_desc = concept.description if concept else ""

        score = mastery.mastery_score if mastery else None
        confidence = mastery.confidence if mastery else 0.0

        # Suggested action
        if item.status == "not_started":
            action = "Study with AI Tutor"
        elif item.status == "needs_review":
            action = "Review with AI Tutor"
        elif item.status == "in_progress":
            action = "Practice Quiz"
        else:
            action = "Review Flashcards"

        return LearningPlanItemResponse(
            id=item.id,
            concept_id=item.concept_id,
            concept_name=c_name,
            concept_description=c_desc,
            position=item.position,
            status=item.status,
            target_mastery=item.target_mastery,
            current_mastery=score,
            is_assessed=score is not None,
            confidence=confidence,
            completed_at=item.completed_at,
            recommended_action=action,
        )
