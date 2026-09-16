"""Celery task definitions for asynchronous PDF processing and vector indexing."""

import asyncio
import logging
import uuid
from collections.abc import Callable, Coroutine
from typing import Any, TypeVar

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.ai.embeddings import embed_texts
from app.core.config import settings
from app.repositories.material_repository import MaterialRepository
from app.services.pdf_service import pdf_service
from app.services.storage_service import storage_service
from app.workers.celery_app import celery_app

logger = logging.getLogger("ai_study_companion.workers.tasks")

# Dedicated async engine for Celery worker processes
_worker_engine = None
_worker_session_maker = None


def get_worker_sessionmaker() -> async_sessionmaker[AsyncSession]:
    global _worker_engine, _worker_session_maker
    if _worker_session_maker is None:
        _worker_engine = create_async_engine(
            settings.DATABASE_URL,
            echo=False,
            pool_pre_ping=True,
        )
        _worker_session_maker = async_sessionmaker(
            bind=_worker_engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
        )
    return _worker_session_maker


async def _process_material_async(
    material_id: uuid.UUID,
    session: AsyncSession | None = None,
) -> dict:
    """Async execution flow for extracting, chunking, embedding, and storing PDF materials."""
    if session is not None:
        return await _execute_ingestion(material_id, session)

    session_factory = get_worker_sessionmaker()
    async with session_factory() as worker_session:
        return await _execute_ingestion(material_id, worker_session)


async def _execute_ingestion(material_id: uuid.UUID, session: AsyncSession) -> dict:
    repo = MaterialRepository(session)
    material = await repo.get_by_id_internal(material_id)

    if not material:
        logger.error(f"Material {material_id} not found in database.")
        return {"error": "Material not found"}

    # If already ready, safely exit (idempotency check)
    if material.status == "ready":
        logger.info(f"Material {material_id} is already in ready status. Skipping.")
        return {"status": "ready", "material_id": str(material_id)}

    # Mark as processing
    await repo.update_status(material_id, status="processing", failure_reason=None)

    try:
        # 1. Resolve stored PDF file path
        abs_pdf_path = storage_service.get_absolute_path(material.storage_path)

        # 2. Extract text and generate page-aware deterministic chunks
        extraction_result = pdf_service.extract_and_chunk(abs_pdf_path)

        if not extraction_result.chunks:
            raise ValueError(
                "No extractable text found in PDF. The document may be scanned or empty."
            )

        # 3. Generate 384-dimensional vector embeddings
        chunk_contents = [c.content for c in extraction_result.chunks]
        embeddings = embed_texts(chunk_contents)

        # Validate dimensions
        for emb in embeddings:
            if len(emb) != settings.EMBEDDING_DIMENSION:
                raise ValueError(
                    f"Embedding dimension mismatch: expected {settings.EMBEDDING_DIMENSION}, got {len(emb)}"
                )

        # 4. Prepare chunk records with page number and sequential index
        chunks_data = [
            {
                "content": c.content,
                "page_number": c.page_number,
                "chunk_index": c.chunk_index,
                "embedding": emb,
            }
            for c, emb in zip(extraction_result.chunks, embeddings, strict=True)
        ]

        # 5. Idempotently replace chunks (deletes existing before inserting new)
        await repo.replace_chunks(material_id, material.project_id, chunks_data)

        # 6. Update page count and mark material as ready
        await repo.update_status(
            material_id,
            status="ready",
            failure_reason=None,
            page_count=extraction_result.page_count,
        )

        logger.info(
            f"Successfully processed material {material_id}: "
            f"{extraction_result.page_count} pages, {len(chunks_data)} chunks created."
        )

        # 7. Incremental concept extraction (non-fatal, decoupled)
        # Failure of Gemini concept extraction must NOT mark an otherwise valid material as failed.
        new_concepts_count = 0
        try:
            from app.services.quiz_service import QuizService
            quiz_service = QuizService(session)
            added_concepts = await quiz_service.extract_material_concepts_incremental(
                material_id=material_id,
                user_id=material.user_id,
                project_id=material.project_id,
            )
            new_concepts_count = len(added_concepts)
            logger.info(
                f"Incremental concept extraction added {new_concepts_count} new concepts for material {material_id}."
            )
        except Exception as c_err:
            logger.warning(
                f"Incremental concept extraction warning for material {material_id}: {c_err}. "
                "Material remains 'ready'. Concept extraction is retryable.",
                exc_info=True,
            )

        return {
            "status": "ready",
            "material_id": str(material_id),
            "page_count": extraction_result.page_count,
            "chunk_count": len(chunks_data),
            "new_concepts_count": new_concepts_count,
        }

    except Exception as e:
        error_message = str(e)
        logger.error(f"Failed processing material {material_id}: {error_message}", exc_info=True)
        # Mark material as failed with the reason
        await repo.update_status(
            material_id,
            status="failed",
            failure_reason=error_message,
        )
        raise


T = TypeVar("T")


def _run_async_in_worker(coro_factory: Callable[[], Coroutine[Any, Any, T]]) -> T:
    """Run an async coroutine factory in a sync task safely even if an event loop is running."""
    import concurrent.futures
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro_factory())
    else:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            return executor.submit(lambda: asyncio.run(coro_factory())).result()


@celery_app.task(bind=True, max_retries=2, name="app.workers.tasks.process_material")
def process_material(self, material_id_str: str) -> dict:
    """Celery task entrypoint for material ingestion.

    Retries transient errors, rejects permanent errors immediately.
    """
    material_id = uuid.UUID(material_id_str)
    try:
        return _run_async_in_worker(lambda: _process_material_async(material_id))
    except ValueError as val_err:
        # Permanent errors (e.g. corrupt PDF, empty PDF) should not be retried
        logger.warning(f"Non-retryable processing failure for material {material_id}: {val_err}")
        return {"status": "failed", "error": str(val_err)}
    except Exception as exc:
        # Transient errors (e.g. DB connection issues) may be retried with backoff
        if self.request.retries < self.max_retries:
            logger.info(f"Retrying material {material_id} processing (attempt {self.request.retries + 1})...")
            raise self.retry(exc=exc, countdown=5)
        return {"status": "failed", "error": str(exc)}


async def _process_quiz_completed_async(
    user_id: uuid.UUID,
    project_id: uuid.UUID,
    attempt_id: uuid.UUID,
    session: AsyncSession | None = None,
) -> dict:
    if session is not None:
        from app.services.mastery_service import MasteryService
        service = MasteryService(session)
        return await service.process_quiz_completion(user_id, project_id, attempt_id)

    session_factory = get_worker_sessionmaker()
    async with session_factory() as worker_session:
        from app.services.mastery_service import MasteryService
        service = MasteryService(worker_session)
        return await service.process_quiz_completion(user_id, project_id, attempt_id)


@celery_app.task(bind=True, max_retries=2, name="app.workers.tasks.process_quiz_completed")
def process_quiz_completed(
    self,
    user_id_str: str,
    project_id_str: str,
    attempt_id_str: str,
) -> dict:
    """Celery task entrypoint for post-quiz mastery recomputation and recommendations."""
    try:
        return _run_async_in_worker(
            lambda: _process_quiz_completed_async(
                user_id=uuid.UUID(user_id_str),
                project_id=uuid.UUID(project_id_str),
                attempt_id=uuid.UUID(attempt_id_str),
            )
        )
    except Exception as exc:
        if self.request.retries < self.max_retries:
            logger.info(f"Retrying quiz completion task for attempt {attempt_id_str}...")
            raise self.retry(exc=exc, countdown=5)
        logger.error(f"Failed processing quiz completion {attempt_id_str}: {exc}", exc_info=True)
        return {"status": "failed", "error": str(exc)}
