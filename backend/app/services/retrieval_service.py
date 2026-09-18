"""Retrieval Service for Grounded AI Tutor.

Embeds learner questions, executes pgvector cosine similarity search,
enforces strict tenant/project boundaries, and filters evidence by threshold.
"""

import logging
import re
import uuid
from dataclasses import dataclass
from typing import Any

from langsmith import traceable
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.embeddings import embed_text
from app.core.cache import CacheService, cache_service
from app.core.config import settings
from app.models.chunk import MaterialChunk
from app.repositories.material_repository import MaterialRepository

logger = logging.getLogger("ai_study_companion.services.retrieval")


def _safe_retrieve_inputs(inputs: dict[str, Any]) -> dict[str, Any]:
    return {
        "project_id": str(inputs.get("project_id", "")),
        "top_k": inputs.get("top_k") or settings.TUTOR_TOP_K,
        "similarity_threshold": (
            inputs.get("similarity_threshold")
            if inputs.get("similarity_threshold") is not None
            else settings.TUTOR_SIMILARITY_THRESHOLD
        ),
        "question_length": len(str(inputs.get("question", ""))),
    }


def _safe_retrieve_outputs(result: Any) -> dict[str, Any]:
    if not isinstance(result, RetrievalResult):
        return {}
    return {
        "is_sufficient": result.is_sufficient,
        "accepted_count": result.accepted_count,
        "candidates_count": result.all_candidates_count,
        "min_distance": result.min_distance,
    }


def _safe_vector_search_inputs(inputs: dict[str, Any]) -> dict[str, Any]:
    return {
        "project_id": str(inputs.get("project_id", "")),
        "top_k": inputs.get("top_k", 0),
        "variants_count": inputs.get("variants_count", 1),
    }


def _safe_vector_search_outputs(candidates: list[Any]) -> dict[str, Any]:
    return {
        "candidates_count": len(candidates),
        "candidate_chunk_ids": [str(c[0].id) for c in candidates],
        "page_numbers": [c[0].page_number for c in candidates],
        "distance_scores": [round(c[2], 4) for c in candidates],
    }


def _safe_threshold_inputs(inputs: dict[str, Any]) -> dict[str, Any]:
    return {
        "threshold": inputs.get("threshold", 0.0),
        "candidates_count": inputs.get("candidates_count", 0),
    }


def _safe_threshold_outputs(result: tuple[list[Any], dict[str, Any]]) -> dict[str, Any]:
    return result[1] if len(result) > 1 else {}


@dataclass(frozen=True)
class RetrievedChunk:
    """A single retrieved chunk with validated metadata and distance score."""

    chunk_id: uuid.UUID
    material_id: uuid.UUID
    filename: str
    page_number: int
    content: str
    distance: float
    section_heading: str | None = None
    content_type: str = "text"


@dataclass(frozen=True)
class RetrievalResult:
    """Outcome of the retrieval pass containing accepted evidence and sufficiency assessment."""

    accepted_chunks: list[RetrievedChunk]
    is_sufficient: bool
    all_candidates_count: int
    accepted_count: int
    min_distance: float | None = None


class RetrievalService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.material_repo = MaterialRepository(session)

    @traceable(
        name="Vector Search",
        run_type="retriever",
        process_inputs=_safe_vector_search_inputs,
        process_outputs=_safe_vector_search_outputs,
    )
    async def _execute_vector_search(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        query_variants: list[str],
        top_k: int,
        variants_count: int,
    ) -> list[tuple[MaterialChunk, str, float]]:
        """Query pgvector candidates across query variants within project boundaries."""
        candidate_map: dict[uuid.UUID, tuple[MaterialChunk, str, float]] = {}
        for variant in query_variants:
            v_vector = embed_text(variant)
            v_cands = await self.material_repo.search_chunks_with_material(
                user_id=user_id,
                project_id=project_id,
                query_embedding=v_vector,
                limit=top_k,
            )
            for chunk, filename, dist in v_cands:
                if chunk.id not in candidate_map or dist < candidate_map[chunk.id][2]:
                    candidate_map[chunk.id] = (chunk, filename, dist)

        return list(candidate_map.values())

    @traceable(
        name="Rank Results",
        run_type="chain",
        process_inputs=lambda inputs: {"input_candidates_count": len(inputs.get("candidates", []))},
        process_outputs=lambda res: {
            "ranked_count": len(res),
            "ordered_chunk_ids": [str(c[0].id) for c in res],
            "best_distance": round(res[0][2], 4) if res else None,
        },
    )
    def _rank_candidates(
        self,
        candidates: list[tuple[MaterialChunk, str, float]],
        top_k: int,
    ) -> list[tuple[MaterialChunk, str, float]]:
        """Sort candidates by cosine distance in ascending order and limit to top_k."""
        return sorted(candidates, key=lambda x: x[2])[:top_k]

    @traceable(
        name="Apply Evidence Threshold",
        run_type="chain",
        process_inputs=_safe_threshold_inputs,
        process_outputs=_safe_threshold_outputs,
    )
    def _apply_evidence_threshold(
        self,
        candidates: list[tuple[MaterialChunk, str, float]],
        threshold: float,
        candidates_count: int,
    ) -> tuple[list[RetrievedChunk], dict[str, Any]]:
        """Filter retrieved candidates by cosine distance threshold."""
        accepted_chunks: list[RetrievedChunk] = []
        rejected_ids: list[str] = []
        rejected_scores: list[float] = []

        for chunk, filename, distance in candidates:
            if distance <= threshold:
                accepted_chunks.append(
                    RetrievedChunk(
                        chunk_id=chunk.id,
                        material_id=chunk.material_id,
                        filename=filename,
                        page_number=chunk.page_number,
                        content=chunk.content,
                        distance=round(distance, 4),
                        section_heading=getattr(chunk, "section_heading", None),
                        content_type=getattr(chunk, "content_type", "text"),
                    )
                )
            else:
                rejected_ids.append(str(chunk.id))
                rejected_scores.append(round(distance, 4))

        is_sufficient = len(accepted_chunks) > 0
        summary = {
            "threshold": threshold,
            "candidates_count": len(candidates),
            "accepted_count": len(accepted_chunks),
            "rejected_count": len(rejected_ids),
            "accepted_chunk_ids": [str(c.chunk_id) for c in accepted_chunks],
            "accepted_page_numbers": [c.page_number for c in accepted_chunks],
            "rejected_chunk_ids": rejected_ids,
            "rejected_scores": rejected_scores,
            "retrieval_distances": [c.distance for c in accepted_chunks],
            "sufficient_evidence": is_sufficient,
            "grounding_decision": "proceed" if is_sufficient else "insufficient_evidence",
            "previews": [
                {
                    "chunk_id": str(c.chunk_id),
                    "page": c.page_number,
                    "preview": c.content[:100].strip(),
                }
                for c in accepted_chunks
            ],
        }
        return accepted_chunks, summary

    @traceable(
        name="Retrieve Relevant Knowledge",
        run_type="retriever",
        process_inputs=_safe_retrieve_inputs,
        process_outputs=_safe_retrieve_outputs,
    )
    async def retrieve_relevant_chunks(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        question: str,
        top_k: int | None = None,
        similarity_threshold: float | None = None,
    ) -> RetrievalResult:
        """Retrieve and filter relevant chunks for a question within project boundaries."""
        k = top_k or settings.TUTOR_TOP_K
        threshold = (
            similarity_threshold
            if similarity_threshold is not None
            else settings.TUTOR_SIMILARITY_THRESHOLD
        )

        clean_question = question.strip()

        # 0. Check Tenant-Isolated Cache (1-hour TTL)
        cache_key = CacheService.build_key(
            user_id=user_id,
            project_id=project_id,
            feature="retrieval",
            identifier=f"{clean_question}:{k}:{threshold}",
        )
        cached_data = await cache_service.get(cache_key)
        if cached_data is not None:
            try:
                accepted = [
                    RetrievedChunk(
                        chunk_id=uuid.UUID(c["chunk_id"]),
                        material_id=uuid.UUID(c["material_id"]),
                        filename=c["filename"],
                        page_number=c["page_number"],
                        content=c["content"],
                        distance=c["distance"],
                        section_heading=c.get("section_heading"),
                        content_type=c.get("content_type", "text"),
                    )
                    for c in cached_data.get("accepted_chunks", [])
                ]
                return RetrievalResult(
                    accepted_chunks=accepted,
                    is_sufficient=cached_data.get("is_sufficient", False),
                    all_candidates_count=cached_data.get("all_candidates_count", len(accepted)),
                    accepted_count=len(accepted),
                    min_distance=cached_data.get("min_distance"),
                )
            except Exception as e:
                logger.warning(f"Failed deserializing cached retrieval result: {e}")

        query_variants = [clean_question]

        # 1. Acronym expansion for common domain abbreviations (e.g. GK -> General Knowledge)
        if re.search(r"\bGK\b", clean_question, re.IGNORECASE):
            expanded = re.sub(r"\bGK\b", "General Knowledge", clean_question, flags=re.IGNORECASE).strip()
            if expanded != clean_question:
                query_variants.append(expanded)

        # 2. Meta-referential query expansion:
        referential_pattern = re.compile(
            r"\b(this book|the book|uploaded material|the material|this material)\b",
            re.IGNORECASE,
        )
        if referential_pattern.search(clean_question):
            materials = await self.material_repo.list_by_project(user_id=user_id, project_id=project_id)
            for mat in materials[:2]:
                clean_name = re.sub(r"[^a-zA-Z0-9\s]", " ", mat.filename.rsplit(".", 1)[0])
                words = [w for w in clean_name.split() if len(w) > 2 and not w.isdigit()]
                topic_words = " ".join(words[:6])
                if topic_words:
                    query_variants.append(f"{clean_question} {topic_words}")

        # 3. Query candidates across all variants with Vector Search child trace
        raw_candidates = await self._execute_vector_search(
            user_id=user_id,
            project_id=project_id,
            query_variants=query_variants,
            top_k=k,
            variants_count=len(query_variants),
        )

        if not raw_candidates:
            return RetrievalResult(
                accepted_chunks=[],
                is_sufficient=False,
                all_candidates_count=0,
                accepted_count=0,
                min_distance=None,
            )

        # 4. Rank Results child trace
        sorted_candidates = self._rank_candidates(
            candidates=raw_candidates,
            top_k=k,
        )

        min_distance = sorted_candidates[0][2]

        # 5. Filter candidates by threshold with Apply Evidence Threshold child trace
        accepted_chunks, _ = self._apply_evidence_threshold(
            candidates=sorted_candidates,
            threshold=threshold,
            candidates_count=len(sorted_candidates),
        )

        is_sufficient = len(accepted_chunks) > 0
        final_min_dist = round(min_distance, 4) if min_distance is not None else None

        retrieval_res = RetrievalResult(
            accepted_chunks=accepted_chunks,
            is_sufficient=is_sufficient,
            all_candidates_count=len(sorted_candidates),
            accepted_count=len(accepted_chunks),
            min_distance=final_min_dist,
        )

        # Cache successful retrieval result for 1 hour
        try:
            to_cache = {
                "accepted_chunks": [
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
                ],
                "is_sufficient": is_sufficient,
                "all_candidates_count": len(sorted_candidates),
                "min_distance": final_min_dist,
            }
            await cache_service.set(cache_key, to_cache, ttl_seconds=3600)
        except Exception as e:
            logger.warning(f"Failed caching retrieval result: {e}")

        return retrieval_res

