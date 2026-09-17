"""Celery task definitions for asynchronous PDF processing and vector indexing."""

import asyncio
import logging
import uuid
from collections.abc import Callable, Coroutine
from typing import Any, TypeVar

from langsmith import traceable
from langsmith.run_helpers import tracing_context
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from datetime import UTC, datetime

from app.ai.embeddings import embed_chunk_texts
from app.ai.tracing import is_tracing_enabled
from app.core.cache import cache_service
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


@traceable(
    name="Load Material",
    run_type="chain",
    process_inputs=lambda inputs: {"material_id": str(inputs.get("material_id", ""))},
    process_outputs=lambda res: res,
)
def _trace_load_material(material: Any, abs_pdf_path: Any) -> dict[str, Any]:
    file_size = abs_pdf_path.stat().st_size if abs_pdf_path.exists() else 0
    return {
        "material_id": str(material.id),
        "project_id": str(material.project_id),
        "filename": material.filename,
        "storage_path": material.storage_path,
        "file_size_bytes": file_size,
        "status": "success",
    }


@traceable(
    name="Mark Material Ready",
    run_type="chain",
    process_inputs=lambda inputs: {
        "material_id": str(inputs.get("material_id", "")),
        "page_count": inputs.get("page_count", 0),
        "chunk_count": inputs.get("chunk_count", 0),
    },
    process_outputs=lambda res: res,
)
async def _trace_mark_material_ready(
    repo: MaterialRepository,
    material_id: uuid.UUID,
    page_count: int,
    chunk_count: int,
) -> dict[str, Any]:
    await repo.update_status(
        material_id,
        status="ready",
        failure_reason=None,
        page_count=page_count,
        completed_at=datetime.now(UTC),
    )
    # Invalidate retrieval and project cache on new material readiness
    try:
        mat = await repo.get_by_id_internal(material_id)
        if mat:
            await cache_service.invalidate_project(mat.user_id, mat.project_id)
    except Exception as c_err:
        logger.warning(f"Cache invalidation warning after material {material_id} processing: {c_err}")
    return {
        "material_id": str(material_id),
        "final_status": "ready",
        "page_count": page_count,
        "chunk_count": chunk_count,
        "status": "success",
    }


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


@traceable(
    name="Process Material",
    run_type="chain",
    process_inputs=lambda inputs: {"material_id": str(inputs.get("material_id", ""))},
    process_outputs=lambda res: {
        "status": res.get("status", "unknown"),
        "material_id": res.get("material_id", ""),
        "page_count": res.get("page_count", 0),
        "chunk_count": res.get("chunk_count", 0),
    },
)
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
        # 1. Resolve stored PDF file path and Load Material (Traced Node)
        abs_pdf_path = storage_service.get_absolute_path(material.storage_path)
        _ = _trace_load_material(material, abs_pdf_path)

        # 2. Extract text and generate page-aware deterministic chunks (Traced Nodes: Read PDF, Extract Text, Process Pages, Clean Text, Chunk Document)
        extraction_result = pdf_service.extract_and_chunk(abs_pdf_path)

        if not extraction_result.chunks:
            raise ValueError(
                "No extractable text found in PDF. The document may be scanned or empty."
            )

        # 3. Generate 384-dimensional vector embeddings (Traced Node: Generate Chunk Embeddings)
        chunk_contents = [c.content for c in extraction_result.chunks]
        embeddings = embed_chunk_texts(chunk_contents)

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
                "section_heading": getattr(c, "section_heading", None),
                "content_type": getattr(c, "content_type", "paragraph"),
            }
            for c, emb in zip(extraction_result.chunks, embeddings, strict=True)
        ]

        # 5. Idempotently replace chunks (Traced Node: Store Chunks)
        await repo.replace_chunks(material_id, material.project_id, chunks_data)

        # 6. Incremental concept extraction (Traced Node: Extract Concepts -> Gemini, Parse Structured Output)
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

        # 7. Update page count and mark material as ready (Traced Node: Mark Material Ready)
        _ = await _trace_mark_material_ready(
            repo=repo,
            material_id=material_id,
            page_count=extraction_result.page_count,
            chunk_count=len(chunks_data),
        )

        logger.info(
            f"Successfully processed material {material_id}: "
            f"{extraction_result.page_count} pages, {len(chunks_data)} chunks created."
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


def _run_async_in_worker(
    coro_factory: Callable[[], Coroutine[Any, Any, T]],
    parent_trace: dict | None = None,
) -> T:
    """Run an async coroutine factory in a sync task safely even if an event loop is running."""
    import concurrent.futures
    from contextlib import nullcontext

    def _execute() -> T:
        ctx: Any
        try:
            ctx = (
                tracing_context(
                    parent=parent_trace,
                    project_name=settings.langsmith_project,
                    enabled=is_tracing_enabled(),
                )
                if parent_trace
                else nullcontext()
            )
        except Exception:
            ctx = nullcontext()

        with ctx:
            return asyncio.run(coro_factory())

    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return _execute()
    else:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            return executor.submit(_execute).result()


@celery_app.task(bind=True, max_retries=3, name="app.workers.tasks.process_material")
def process_material(self, material_id_str: str, parent_trace: dict | None = None) -> dict:
    """Celery task entrypoint for material ingestion.

    Retries transient errors with exponential backoff, rejects permanent errors immediately.
    """
    material_id = uuid.UUID(material_id_str)
    try:
        return _run_async_in_worker(
            lambda: _process_material_async(material_id),
            parent_trace=parent_trace,
        )
    except ValueError as val_err:
        # Permanent errors (e.g. corrupt PDF, empty PDF) should not be retried
        logger.warning(f"Non-retryable processing failure for material {material_id}: {val_err}")
        return {"status": "failed", "error": str(val_err)}
    except Exception as exc:
        # Transient errors retried with exponential backoff
        retries = getattr(self.request, "retries", 0)
        max_retries = getattr(self, "max_retries", 3)
        if retries < max_retries:
            countdown = min(60, (2 ** retries) * 5)
            logger.info(
                f"Retrying material {material_id} processing (attempt {retries + 1}/{max_retries}, backoff {countdown}s): {exc}"
            )
            try:
                session_factory = get_worker_sessionmaker()

                async def _record_retry() -> None:
                    async with session_factory() as s:
                        r = MaterialRepository(s)
                        await r.update_status(
                            material_id,
                            status="processing",
                            retry_count=retries + 1,
                            failure_reason=str(exc),
                        )

                _run_async_in_worker(_record_retry)
            except Exception:
                pass
            raise self.retry(exc=exc, countdown=countdown)
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
        result = await service.process_quiz_completion(user_id, project_id, attempt_id)
        try:
            generate_project_insights.delay(str(user_id), str(project_id))
        except Exception as e:
            logger.warning(f"Could not enqueue insight task: {e}")
        return result

    session_factory = get_worker_sessionmaker()
    async with session_factory() as worker_session:
        from app.services.mastery_service import MasteryService

        service = MasteryService(worker_session)
        result = await service.process_quiz_completion(user_id, project_id, attempt_id)
        try:
            generate_project_insights.delay(str(user_id), str(project_id))
        except Exception as e:
            logger.warning(f"Could not enqueue insight task: {e}")
        return result


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
            countdown = min(60, (2 ** self.request.retries) * 5)
            logger.info(f"Retrying quiz completion task for attempt {attempt_id_str}...")
            raise self.retry(exc=exc, countdown=countdown)
        logger.error(f"Failed processing quiz completion {attempt_id_str}: {exc}", exc_info=True)
        return {"status": "failed", "error": str(exc)}


async def _generate_insights_async(
    user_id: uuid.UUID,
    project_id: uuid.UUID,
    session: AsyncSession | None = None,
) -> dict:
    should_debounce = await cache_service.should_debounce(
        user_id=user_id,
        project_id=project_id,
        action="insights",
        cooldown_seconds=300,
    )
    if should_debounce:
        logger.info(f"Insight generation for project {project_id} debounced (cooldown active).")
        return {"status": "debounced", "message": "Cooldown active"}

    if session is not None:
        from app.services.insight_service import InsightService

        service = InsightService(session)
        insights = await service.generate_insights_for_project(user_id, project_id)
        return {"status": "success", "count": len(insights)}

    session_factory = get_worker_sessionmaker()
    async with session_factory() as worker_session:
        from app.services.insight_service import InsightService

        service = InsightService(worker_session)
        insights = await service.generate_insights_for_project(user_id, project_id)
        return {"status": "success", "count": len(insights)}


@celery_app.task(bind=True, max_retries=2, name="app.workers.tasks.generate_project_insights")
def generate_project_insights(
    self,
    user_id_str: str,
    project_id_str: str,
) -> dict:
    """Celery task for advisory learning insight generation in the background."""
    try:
        return _run_async_in_worker(
            lambda: _generate_insights_async(
                user_id=uuid.UUID(user_id_str),
                project_id=uuid.UUID(project_id_str),
            )
        )
    except Exception as exc:
        retries = getattr(self.request, "retries", 0)
        max_retries = getattr(self, "max_retries", 2)
        if retries < max_retries:
            countdown = min(60, (2 ** retries) * 5)
            logger.info(f"Retrying insight task for project {project_id_str} (attempt {retries + 1})...")
            raise self.retry(exc=exc, countdown=countdown)
        logger.error(f"Failed generating insights for project {project_id_str}: {exc}", exc_info=True)
        return {"status": "failed", "error": str(exc)}
