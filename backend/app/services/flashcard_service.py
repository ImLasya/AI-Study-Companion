"""Flashcard Service.

Orchestrates grounded flashcard generation and study state management.
All citation metadata is derived server-side from database records.
Gemini output is never trusted for page numbers, filenames, or material IDs.

ISOLATION INVARIANT:
Every operation filters on both user_id and project_id.
Cross-tenant and cross-project access is structurally impossible.
"""

import hashlib
import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status
from langsmith import traceable
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.flashcard_prompts import (
    FLASHCARD_SYSTEM_INSTRUCTION,
    build_flashcard_user_prompt,
)
from app.ai.gemini_provider import get_llm_provider
from app.ai.llm import LLMGenerationError
from app.ai.observability import log_ai_usage
from app.core.cache import cache_service
from app.core.config import settings
from app.models.concept import Concept
from app.models.event import ActivityEvent
from app.models.flashcard import Flashcard
from app.repositories.concept_repository import ConceptRepository
from app.repositories.flashcard_repository import FlashcardRepository
from app.repositories.material_repository import MaterialRepository
from app.repositories.project_repository import ProjectRepository
from app.schemas.flashcard import (
    DueFlashcardsSummaryResponse,
    FlashcardGenerateRequest,
    FlashcardGenerateResponse,
    FlashcardGenerationOutput,
    FlashcardResponse,
    FlashcardReviewRequest,
    FlashcardReviewResponse,
)
from app.services.retrieval_service import RetrievalService
from app.services.spaced_repetition_service import (
    DEFAULT_EASE_FACTOR,
    SpacedRepetitionService,
)

logger = logging.getLogger("ai_study_companion.services.flashcard")


# ──────────────────────────────────────────────────────────────────────────────
# Trace helpers
# ──────────────────────────────────────────────────────────────────────────────

def _safe_gen_inputs(inputs: dict[str, Any]) -> dict[str, Any]:
    return {
        "project_id": str(inputs.get("project_id", "")),
        "count": inputs.get("count", 0),
        "has_concept_id": inputs.get("concept_id") is not None,
        "has_topic_hint": inputs.get("topic_hint") is not None,
    }


def _safe_gen_outputs(result: Any) -> dict[str, Any]:
    if isinstance(result, FlashcardGenerateResponse):
        return {
            "total_generated": result.total_generated,
            "duplicates_skipped": result.duplicates_skipped,
        }
    return {}


def _safe_cite_inputs(inputs: dict[str, Any]) -> dict[str, Any]:
    return {
        "raw_citation_count": inputs.get("raw_citation_count", 0),
        "accepted_chunk_count": inputs.get("accepted_chunk_count", 0),
    }


def _safe_cite_outputs(result: Any) -> dict[str, Any]:
    return {
        "valid_ids": result.get("valid_ids", []),
        "invalid_ids": result.get("invalid_ids", []),
    }


def _safe_persist_inputs(inputs: dict[str, Any]) -> dict[str, Any]:
    return {
        "project_id": str(inputs.get("project_id", "")),
        "card_count": inputs.get("card_count", 0),
    }


def _safe_persist_outputs(result: Any) -> dict[str, Any]:
    return {"persisted_count": result.get("persisted_count", 0)}


@traceable(
    name="Validate Citations",
    run_type="chain",
    process_inputs=_safe_cite_inputs,
    process_outputs=_safe_cite_outputs,
)
def _trace_validate_flashcard_citations(
    raw_ids: list[str],
    accepted_chunk_map: dict[str, Any],
) -> dict[str, Any]:
    """Validate that citation chunk IDs returned by Gemini exist in the accepted evidence."""
    valid_ids: list[str] = []
    invalid_ids: list[str] = []
    for raw_id in raw_ids:
        clean = raw_id.strip()
        if clean in accepted_chunk_map:
            valid_ids.append(clean)
        else:
            invalid_ids.append(clean)
    return {"valid_ids": valid_ids, "invalid_ids": invalid_ids}


@traceable(
    name="Persist Flashcards",
    run_type="chain",
    process_inputs=_safe_persist_inputs,
    process_outputs=_safe_persist_outputs,
)
async def _trace_persist_flashcards(
    flashcard_repo: FlashcardRepository,
    flashcards: list[Flashcard],
    project_id: uuid.UUID,
) -> dict[str, Any]:
    saved = await flashcard_repo.bulk_create(flashcards)
    return {"persisted_count": len(saved)}


# ──────────────────────────────────────────────────────────────────────────────
# FlashcardService
# ──────────────────────────────────────────────────────────────────────────────

class FlashcardService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.project_repo = ProjectRepository(session)
        self.material_repo = MaterialRepository(session)
        self.flashcard_repo = FlashcardRepository(session)
        self.concept_repo = ConceptRepository(session)
        self.retrieval_service = RetrievalService(session)

    @traceable(
        name="Flashcard Generation",
        run_type="chain",
        process_inputs=_safe_gen_inputs,
        process_outputs=_safe_gen_outputs,
    )
    async def generate(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        payload: FlashcardGenerateRequest,
    ) -> FlashcardGenerateResponse:
        """Generate grounded flashcards from project learning materials.

        Grounding guarantee:
        - Evidence is retrieved via the existing pgvector similarity pipeline.
        - All citation metadata (page, filename, material_id) is derived server-side.
        - Sub-threshold evidence triggers an explicit insufficient-evidence error.
        - Gemini can never invent chunk IDs, pages, or material names.
        """
        # 1. Project ownership verification
        project = await self.project_repo.get_by_id(
            user_id=user_id, project_id=project_id
        )
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )

        # 2. Preflight: ready materials must exist
        ready_count = await self.material_repo.count_ready_materials(
            user_id=user_id, project_id=project_id
        )
        if ready_count == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No processed learning materials found. Upload and process a PDF first.",
            )

        # 3. Resolve concept name if concept_id provided (must be project-scoped)
        concept_name: str | None = None
        if payload.concept_id:
            concept = await self._get_project_concept(
                user_id=user_id,
                project_id=project_id,
                concept_id=payload.concept_id,
            )
            if not concept:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Concept not found in this project",
                )
            concept_name = concept.name

        # 4. Build retrieval query from topic hint / concept name
        query = payload.topic_hint or concept_name or "key concepts definitions and explanations"

        # 5. Check retrieval cache
        cache_key = cache_service.build_key(
            user_id=user_id,
            project_id=project_id,
            feature="flashcard_retrieval",
            identifier=hashlib.sha256(query.encode()).hexdigest(),
        )
        cached = None
        try:
            cached = await cache_service.get(cache_key)
        except Exception as e:
            logger.warning(f"Cache get failed for flashcard retrieval, falling back: {e}")

        if cached:
            # Reconstruct lightweight accepted_chunks list from cache
            logger.info(f"Flashcard retrieval cache HIT for project {project_id}")
            from app.services.retrieval_service import RetrievedChunk
            accepted_chunks = [
                RetrievedChunk(
                    chunk_id=uuid.UUID(c["chunk_id"]),
                    material_id=uuid.UUID(c["material_id"]),
                    filename=c["filename"],
                    page_number=c["page_number"],
                    content=c["content"],
                    distance=c["distance"],
                    section_heading=c.get("section_heading"),
                    content_type=c.get("content_type", "paragraph"),
                )
                for c in cached
            ]
            is_sufficient = True
        else:
            # 5. Evidence retrieval via existing pipeline
            retrieval_result = await self.retrieval_service.retrieve_relevant_chunks(
                user_id=user_id,
                project_id=project_id,
                question=query,
            )
            accepted_chunks = retrieval_result.accepted_chunks
            is_sufficient = retrieval_result.is_sufficient

            # Cache the accepted chunks for 10 minutes
            if accepted_chunks:
                serializable = [
                    {
                        "chunk_id": str(c.chunk_id),
                        "material_id": str(c.material_id),
                        "filename": c.filename,
                        "page_number": c.page_number,
                        "content": c.content,
                        "distance": c.distance,
                        "section_heading": c.section_heading,
                        "content_type": c.content_type,
                    }
                    for c in accepted_chunks
                ]
                try:
                    await cache_service.set(cache_key, serializable, ttl_seconds=600)
                except Exception as e:
                    logger.warning(f"Cache set failed for flashcard retrieval: {e}")

        # 6. Evidence sufficiency gate
        if not is_sufficient or not accepted_chunks:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "Insufficient evidence in the uploaded materials to generate grounded flashcards. "
                    "Please ensure materials cover the requested topic."
                ),
            )

        # 7. Build evidence payload for prompt (using accepted chunks only)
        accepted_chunk_map = {str(c.chunk_id): c for c in accepted_chunks}
        evidence_payload = [
            {
                "chunk_id": str(c.chunk_id),
                "page_number": c.page_number,
                "filename": c.filename,
                "content": c.content,
                "section_heading": c.section_heading,
            }
            for c in accepted_chunks
        ]

        # 8. Build grounded prompt
        user_prompt = build_flashcard_user_prompt(
            count=payload.count,
            evidence_chunks=evidence_payload,
            concept_name=concept_name,
            topic_hint=payload.topic_hint,
        )

        # 9. LLM structured generation
        provider = get_llm_provider()
        try:
            structured_output, usage = await provider.generate_structured(
                system_instruction=FLASHCARD_SYSTEM_INSTRUCTION,
                user_prompt=user_prompt,
                response_schema=FlashcardGenerationOutput,
                temperature=0.3,
                feature="flashcard_generation",
                tags=["flashcards"],
                metadata={"project_id": str(project_id)},
            )
        except LLMGenerationError as err:
            await log_ai_usage(
                user_id=user_id,
                project_id=project_id,
                operation="flashcard_generation",
                provider="gemini",
                model=settings.GEMINI_MODEL,
                latency_ms=0.0,
                success=False,
                error=str(err),
                session=self.session,
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="The AI service is temporarily unavailable. Please try again.",
            ) from err

        # 10. Validate citations server-side (NEVER trust Gemini chunk IDs)
        # 11. Load existing project flashcard fronts for duplicate prevention
        existing_fronts = await self.flashcard_repo.get_existing_fronts(
            user_id=user_id, project_id=project_id
        )

        new_flashcards: list[Flashcard] = []
        duplicates_skipped = 0

        # Pre-collect all candidate material_ids for batch verification
        candidate_material_ids: set[uuid.UUID] = set()
        for item in structured_output.flashcards:
            if item.citation_chunk_ids:
                # Use only the first valid-looking ID for pre-scan
                for raw_id in item.citation_chunk_ids:
                    chunk = accepted_chunk_map.get(raw_id.strip())
                    if chunk and chunk.material_id:
                        candidate_material_ids.add(chunk.material_id)
                        break

        # Batch-verify which material_ids actually exist in the materials table
        verified_material_ids: set[uuid.UUID] = set()
        if candidate_material_ids:
            from sqlalchemy import select as sa_select

            from app.models.material import Material as MaterialModel
            mat_stmt = sa_select(MaterialModel.id).where(
                MaterialModel.id.in_(list(candidate_material_ids))
            )
            mat_result = await self.session.execute(mat_stmt)
            verified_material_ids = {row[0] for row in mat_result.all()}

        for item in structured_output.flashcards:
            # Validate citations
            cite_result = _trace_validate_flashcard_citations(
                raw_ids=item.citation_chunk_ids,
                accepted_chunk_map=accepted_chunk_map,
            )
            valid_ids = cite_result["valid_ids"]

            # Require at least one valid citation
            if not valid_ids:
                logger.warning(
                    f"Skipping flashcard with no valid citations. "
                    f"Invalid IDs: {cite_result['invalid_ids']}"
                )
                continue

            # Duplicate front detection
            normalized_front = FlashcardRepository.normalize_front(item.front)
            if normalized_front in existing_fronts:
                duplicates_skipped += 1
                continue

            # Derive server-side metadata from primary citation chunk
            primary_chunk_id = uuid.UUID(valid_ids[0])
            primary_chunk = accepted_chunk_map.get(str(primary_chunk_id))
            page_number: int | None = None
            filename: str | None = None
            material_id: uuid.UUID | None = None
            if primary_chunk:
                page_number = primary_chunk.page_number
                filename = primary_chunk.filename
                # Only set material_id if the material actually exists in the DB
                if primary_chunk.material_id in verified_material_ids:
                    material_id = primary_chunk.material_id

            # Resolve concept_id if concept_name matches an existing project concept
            resolved_concept_id: uuid.UUID | None = payload.concept_id
            if not resolved_concept_id and item.concept_name:
                resolved_concept_id = await self._resolve_concept_id(
                    user_id=user_id,
                    project_id=project_id,
                    concept_name=item.concept_name,
                )

            card = Flashcard(
                id=uuid.uuid4(),
                project_id=project_id,
                user_id=user_id,
                material_id=material_id,
                concept_id=resolved_concept_id,
                front=item.front.strip(),
                back=item.back.strip(),
                source_chunk_id=primary_chunk_id,
                citation_chunk_ids=[str(cid) for cid in valid_ids],
                page_number=page_number,
                filename=filename,
                card_type=item.card_type or "definition",
            )
            new_flashcards.append(card)
            # Add to set so later cards from same batch don't duplicate each other
            existing_fronts.add(normalized_front)

        # 12. Persist non-duplicate flashcards
        if new_flashcards:
            await _trace_persist_flashcards(
                flashcard_repo=self.flashcard_repo,
                flashcards=new_flashcards,
                project_id=project_id,
            )
            await self.session.commit()

        # 13. AI observability
        await log_ai_usage(
            user_id=user_id,
            project_id=project_id,
            operation="flashcard_generation",
            provider="gemini",
            model=settings.GEMINI_MODEL,
            latency_ms=usage.latency_ms,
            input_tokens=usage.prompt_tokens,
            output_tokens=usage.candidate_tokens,
            total_tokens=usage.total_tokens,
            success=True,
            session=self.session,
        )

        # 14. Activity event
        await self._log_activity(
            user_id=user_id,
            project_id=project_id,
            event_type="flashcards_generated",
            payload={
                "count_requested": payload.count,
                "count_generated": len(new_flashcards),
                "duplicates_skipped": duplicates_skipped,
            },
        )
        await self.session.commit()

        # 15. Invalidate cached due queries
        await self._invalidate_due_cache(user_id=user_id, project_id=project_id)

        message: str | None = None
        if not new_flashcards and duplicates_skipped > 0:
            message = "All generated flashcards already exist in this project."
        elif duplicates_skipped > 0:
            message = f"{duplicates_skipped} duplicate card(s) were skipped."

        now = datetime.now(UTC)
        return FlashcardGenerateResponse(
            flashcards=[self._card_to_response(c, now) for c in new_flashcards],
            total_generated=len(new_flashcards),
            duplicates_skipped=duplicates_skipped,
            message=message,
        )

    def _card_to_response(
        self, card: Flashcard, now: datetime | None = None
    ) -> FlashcardResponse:
        """Convert a Flashcard ORM instance to FlashcardResponse with computed is_due."""
        as_of = now or datetime.now(UTC)
        is_due = SpacedRepetitionService.is_card_due(card.next_review_at, as_of=as_of)
        resp = FlashcardResponse.model_validate(card)
        resp.is_due = is_due
        return resp

    async def _invalidate_due_cache(
        self, user_id: uuid.UUID, project_id: uuid.UUID
    ) -> None:
        """Invalidate cached due-card queries and summary for this user+project."""
        try:
            await cache_service.delete(f"flashcards:due_summary:{user_id}:{project_id}")
            for limit in (10, 20, 50):
                await cache_service.delete(
                    f"flashcards:due:{user_id}:{project_id}:{limit}:None"
                )
        except Exception as exc:
            logger.warning(f"Failed to invalidate due flashcards cache: {exc}")

    async def list_flashcards(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
    ) -> list[FlashcardResponse]:
        """List all flashcards for the project. Tenant-isolated."""
        project = await self.project_repo.get_by_id(
            user_id=user_id, project_id=project_id
        )
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )
        cards = await self.flashcard_repo.list_by_project(
            user_id=user_id, project_id=project_id
        )
        now = datetime.now(UTC)
        return [self._card_to_response(c, now) for c in cards]

    async def get_flashcard(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        flashcard_id: uuid.UUID,
    ) -> FlashcardResponse:
        """Get a single flashcard. Tenant-isolated; 404 if not owned."""
        project = await self.project_repo.get_by_id(
            user_id=user_id, project_id=project_id
        )
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )
        card = await self.flashcard_repo.get_by_id(
            user_id=user_id, project_id=project_id, flashcard_id=flashcard_id
        )
        if not card:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Flashcard not found",
            )
        return self._card_to_response(card)

    async def list_due(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        *,
        limit: int = 10,
        concept_id: uuid.UUID | None = None,
    ) -> list[FlashcardResponse]:
        """Fetch flashcards due for review with deterministic priority ordering."""
        project = await self.project_repo.get_by_id(
            user_id=user_id, project_id=project_id
        )
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )

        if concept_id is not None:
            concept = await self.concept_repo.get_by_id(
                user_id=user_id, concept_id=concept_id
            )
            if not concept or concept.project_id != project_id:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Concept not found in project",
                )

        cache_key = f"flashcards:due:{user_id}:{project_id}:{limit}:{concept_id}"
        try:
            cached = await cache_service.get(cache_key)
            if cached:
                return [FlashcardResponse.model_validate(c) for c in cached]
        except Exception as exc:
            logger.warning(f"Cache get failed for due flashcards: {exc}")

        now = datetime.now(UTC)
        cards = await self.flashcard_repo.list_due(
            user_id=user_id,
            project_id=project_id,
            limit=limit,
            concept_id=concept_id,
            as_of=now,
        )
        results = [self._card_to_response(c, now) for c in cards]

        try:
            await cache_service.set(
                cache_key,
                [r.model_dump(mode="json") for r in results],
                ttl_seconds=60,
            )
        except Exception as exc:
            logger.warning(f"Cache set failed for due flashcards: {exc}")

        return results

    async def get_due_summary(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
    ) -> DueFlashcardsSummaryResponse:
        """Fetch count summary for Today's Review Dashboard."""
        project = await self.project_repo.get_by_id(
            user_id=user_id, project_id=project_id
        )
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )

        cache_key = f"flashcards:due_summary:{user_id}:{project_id}"
        try:
            cached = await cache_service.get(cache_key)
            if cached:
                return DueFlashcardsSummaryResponse.model_validate(cached)
        except Exception as exc:
            logger.warning(f"Cache get failed for due summary: {exc}")

        summary = await self.flashcard_repo.get_due_summary(
            user_id=user_id, project_id=project_id
        )
        resp = DueFlashcardsSummaryResponse(
            due_count=summary["due_count"],
            new_count=summary["new_count"],
            completed_today_count=summary["completed_today_count"],
        )

        try:
            await cache_service.set(
                cache_key, resp.model_dump(mode="json"), ttl_seconds=60
            )
        except Exception as exc:
            logger.warning(f"Cache set failed for due summary: {exc}")

        return resp

    async def review_card(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        flashcard_id: uuid.UUID,
        payload: FlashcardReviewRequest,
    ) -> FlashcardReviewResponse:
        """Atomically review a flashcard via Spaced Repetition (or legacy action)."""
        project = await self.project_repo.get_by_id(
            user_id=user_id, project_id=project_id
        )
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )

        card_check = await self.flashcard_repo.get_by_id(
            user_id=user_id, project_id=project_id, flashcard_id=flashcard_id
        )
        if not card_check:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Flashcard not found",
            )

        rating = payload.rating.lower().strip() if payload.rating else None
        action = payload.action.lower().strip() if payload.action else None

        if not rating and not action:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Either 'rating' or 'action' must be provided",
            )

        # Handle legacy action reset
        if action == "reset":
            card = await self.flashcard_repo.reset_card_schedule(
                user_id, project_id, flashcard_id
            )
            if not card:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Flashcard not found",
                )
            await self.session.commit()
            await self._log_activity(
                user_id=user_id,
                project_id=project_id,
                event_type="flashcard_reviewed",
                payload={"flashcard_id": str(flashcard_id), "action": "reset"},
            )
            await self._invalidate_due_cache(user_id, project_id)
            resp_card = self._card_to_response(card)
            return FlashcardReviewResponse(
                flashcard_id=card.id,
                rating="reset",
                review_count=0,
                interval_days=0,
                ease_factor=DEFAULT_EASE_FACTOR,
                next_review_at=datetime.now(UTC),
                is_due=True,
                previous_interval=0,
                new_interval=0,
                flashcard=resp_card,
            )

        # Map legacy actions
        if not rating and action:
            if action == "known":
                rating = "good"
            elif action == "difficult":
                rating = "difficult"
            else:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Invalid action '{action}'. Allowed: 'known', 'difficult', 'reset'",
                )

        if rating not in ("again", "difficult", "good", "easy"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid rating '{rating}'. Allowed: 'again', 'difficult', 'good', 'easy'",
            )

        try:
            card, review_record, is_duplicate = (
                await self.flashcard_repo.apply_spaced_review(
                    user_id=user_id,
                    project_id=project_id,
                    flashcard_id=flashcard_id,
                    rating=rating,
                    idempotency_key=payload.idempotency_key,
                )
            )
            if not is_duplicate:
                await self._log_activity(
                    user_id=user_id,
                    project_id=project_id,
                    event_type="flashcard_reviewed",
                    payload={
                        "flashcard_id": str(flashcard_id),
                        "rating": rating,
                        "interval_days": card.interval_days,
                        "ease_factor": card.ease_factor,
                        "review_count": card.review_count,
                    },
                )
            await self.session.commit()
        except Exception as exc:
            await self.session.rollback()
            logger.error(f"Failed atomic review update for card {flashcard_id}: {exc}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update flashcard review schedule",
            )

        if not is_duplicate:
            await self._invalidate_due_cache(user_id, project_id)

        resp_card = self._card_to_response(card)
        return FlashcardReviewResponse(
            flashcard_id=card.id,
            rating=rating,
            review_count=card.review_count,
            interval_days=card.interval_days,
            ease_factor=card.ease_factor,
            next_review_at=card.next_review_at or datetime.now(UTC),
            is_due=False,
            previous_interval=review_record.previous_interval,
            new_interval=review_record.new_interval,
            flashcard=resp_card,
        )

    async def review_flashcard(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        flashcard_id: uuid.UUID,
        action: str,
    ) -> FlashcardResponse:
        """Legacy review helper maintaining exact previous return type."""
        result = await self.review_card(
            user_id=user_id,
            project_id=project_id,
            flashcard_id=flashcard_id,
            payload=FlashcardReviewRequest(action=action),
        )
        return result.flashcard

    async def record_session_event(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        event_type: str,
        payload: dict[str, Any],
    ) -> None:
        """Record session started or completed activity events."""
        if event_type not in (
            "flashcard_session_started",
            "flashcard_session_completed",
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid session event_type: {event_type}",
            )
        project = await self.project_repo.get_by_id(
            user_id=user_id, project_id=project_id
        )
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )

        await self._log_activity(
            user_id=user_id,
            project_id=project_id,
            event_type=event_type,
            payload=payload,
        )
        await self.session.commit()

    async def delete_flashcard(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        flashcard_id: uuid.UUID,
    ) -> None:
        """Delete a flashcard. Tenant-isolated; 404 if not owned."""
        project = await self.project_repo.get_by_id(
            user_id=user_id, project_id=project_id
        )
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )
        deleted = await self.flashcard_repo.delete_card(
            user_id=user_id, project_id=project_id, flashcard_id=flashcard_id
        )
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Flashcard not found",
            )
        await self.session.commit()

    # ──────────────────────────────────────────────────────────────────────────
    # Private helpers
    # ──────────────────────────────────────────────────────────────────────────

    async def _get_project_concept(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        concept_id: uuid.UUID,
    ) -> Concept | None:
        """Fetch a concept only if it belongs to this user+project."""
        stmt = (
            select(Concept)
            .where(
                Concept.id == concept_id,
                Concept.user_id == user_id,
                Concept.project_id == project_id,
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def _resolve_concept_id(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        concept_name: str,
    ) -> uuid.UUID | None:
        """Match concept_name to an existing project concept (case-insensitive)."""
        stmt = select(Concept).where(
            Concept.user_id == user_id,
            Concept.project_id == project_id,
        )
        result = await self.session.execute(stmt)
        for concept in result.scalars().all():
            if concept.name.lower().strip() == concept_name.lower().strip():
                return concept.id
        return None

    async def _log_activity(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        event_type: str,
        payload: dict,
    ) -> None:
        """Persist an activity event. Non-blocking on failure."""
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
