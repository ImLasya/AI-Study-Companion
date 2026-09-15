"""Retrieval Service for Grounded AI Tutor.

Embeds learner questions, executes pgvector cosine similarity search,
enforces strict tenant/project boundaries, and filters evidence by threshold.
"""

import uuid
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.embeddings import embed_text
from app.core.config import settings
from app.repositories.material_repository import MaterialRepository


@dataclass(frozen=True)
class RetrievedChunk:
    """A single retrieved chunk with validated metadata and distance score."""

    chunk_id: uuid.UUID
    material_id: uuid.UUID
    filename: str
    page_number: int
    content: str
    distance: float


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

    async def retrieve_relevant_chunks(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        question: str,
        top_k: int | None = None,
        similarity_threshold: float | None = None,
    ) -> RetrievalResult:
        """Retrieve and filter relevant chunks for a question within project boundaries.

        Algorithm:
        1. Embed question using sentence-transformers/all-MiniLM-L6-v2.
        2. Query top K candidates from pgvector using <=> cosine distance.
        3. Filter candidates by distance <= threshold (default 0.65).
        4. If zero chunks pass the filter: mark is_sufficient=False.
        5. Return only accepted chunks. Rejected chunks are NEVER sent to LLM.
        """
        k = top_k or settings.TUTOR_TOP_K
        threshold = (
            similarity_threshold
            if similarity_threshold is not None
            else settings.TUTOR_SIMILARITY_THRESHOLD
        )

        # 1. Embed query
        query_vector = embed_text(question.strip())

        # 2. Query candidates from pgvector (scoped strictly to project_id and user_id)
        candidates = await self.material_repo.search_chunks_with_material(
            user_id=user_id,
            project_id=project_id,
            query_embedding=query_vector,
            limit=k,
        )

        if not candidates:
            return RetrievalResult(
                accepted_chunks=[],
                is_sufficient=False,
                all_candidates_count=0,
                accepted_count=0,
                min_distance=None,
            )

        min_distance = candidates[0][2]

        # 3. Filter candidates by threshold
        # In pgvector cosine distance: 0.0 is exact match, 1.0 is orthogonal, 2.0 is opposite.
        # Chunks with distance <= threshold are accepted as sufficient evidence.
        accepted_chunks: list[RetrievedChunk] = []
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
                    )
                )

        is_sufficient = len(accepted_chunks) > 0

        return RetrievalResult(
            accepted_chunks=accepted_chunks,
            is_sufficient=is_sufficient,
            all_candidates_count=len(candidates),
            accepted_count=len(accepted_chunks),
            min_distance=round(min_distance, 4),
        )
