"""Celery task definitions for asynchronous PDF processing and vector indexing."""

import asyncio
import logging
import uuid
from collections.abc import Callable, Coroutine
from datetime import UTC, datetime
from typing import Any, TypeVar

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.ai.embeddings import embed_chunk_texts
from app.ai.tracing import is_tracing_enabled
from app.ai.tracing import safe_traceable as traceable
from app.core.cache import cache_service
from app.core.config import settings
from app.repositories.material_repository import MaterialRepository
from app.services.pdf_service import pdf_service
from app.services.storage_service import storage_service
from app.workers.celery_app import celery_app

logger = logging.getLogger("ai_study_companion.workers.tasks")


def _log_stage(
    material_id: uuid.UUID,
    stage: str,
    started_at: datetime,
    completed_at: datetime,
    status: str,
    pages: int | None = None,
    chunks: int | None = None,
    embeddings: int | None = None,
    error: str | None = None,
) -> None:
    duration_sec = (completed_at - started_at).total_seconds()
    log_msg = (
        f"\n{'='*60}\n"
        f"Material ID: {material_id}\n"
        f"Stage: {stage}\n"
        f"Started: {started_at.isoformat()}\n"
        f"Completed: {completed_at.isoformat()}\n"
        f"Duration: {duration_sec:.2f}s\n"
        f"Pages: {pages if pages is not None else 'N/A'}\n"
        f"Chunks: {chunks if chunks is not None else 'N/A'}\n"
        f"Embeddings: {embeddings if embeddings is not None else 'N/A'}\n"
        f"Status: {status}\n"
        + (f"Error: {error}\n" if error else "")
        + f"{'='*60}"
    )
    logger.info(log_msg)
    print(log_msg, flush=True)


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

    overall_start = datetime.now(UTC)
    stage_name = "PDF_LOAD_AND_HYDRATE"
    stage_start = datetime.now(UTC)

    try:
        # 1. Resolve stored PDF file path and Load Material
        abs_pdf_path = storage_service.get_absolute_path(material.storage_path)

        # Hydrate from database file_data if local file is missing on this container
        if not abs_pdf_path.exists() and material.file_data:
            logger.info(
                f"Hydrating PDF from PostgreSQL file_data for material {material_id} into local cache {abs_pdf_path}"
            )
            abs_pdf_path.parent.mkdir(parents=True, exist_ok=True)
            abs_pdf_path.write_bytes(material.file_data)
        elif not abs_pdf_path.exists() and not material.file_data:
            raise FileNotFoundError(
                f"Material file not found on disk at {abs_pdf_path} and no file_data present in database."
            )

        try:
            _ = _trace_load_material(material, abs_pdf_path)
        except Exception as t_err:
            logger.debug(f"Trace load material warning: {t_err}")

        stage_end = datetime.now(UTC)
        _log_stage(
            material_id=material_id,
            stage=stage_name,
            started_at=stage_start,
            completed_at=stage_end,
            status="SUCCESS",
        )

        # 2. Extract text and generate page-aware deterministic chunks
        stage_name = "PDF_EXTRACTION"
        stage_start = datetime.now(UTC)
        extraction_result = pdf_service.extract_and_chunk(abs_pdf_path)

        if not extraction_result.chunks:
            raise ValueError(
                "No extractable text found in PDF. The document may be scanned or empty."
            )
        stage_end = datetime.now(UTC)
        _log_stage(
            material_id=material_id,
            stage=stage_name,
            started_at=stage_start,
            completed_at=stage_end,
            status="SUCCESS",
            pages=extraction_result.page_count,
            chunks=len(extraction_result.chunks),
        )

        # 3. Generate 384-dimensional vector embeddings
        stage_name = "EMBEDDING_GENERATION"
        stage_start = datetime.now(UTC)
        chunk_contents = [c.content for c in extraction_result.chunks]
        embeddings = embed_chunk_texts(chunk_contents)

        for emb in embeddings:
            if len(emb) != settings.EMBEDDING_DIMENSION:
                raise ValueError(
                    f"Embedding dimension mismatch: expected {settings.EMBEDDING_DIMENSION}, got {len(emb)}"
                )
        stage_end = datetime.now(UTC)
        _log_stage(
            material_id=material_id,
            stage=stage_name,
            started_at=stage_start,
            completed_at=stage_end,
            status="SUCCESS",
            chunks=len(chunk_contents),
            embeddings=len(embeddings),
        )

        # 4. Prepare and store chunk records with page number and sequential index
        stage_name = "CHUNK_STORAGE"
        stage_start = datetime.now(UTC)
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
        await repo.replace_chunks(material_id, material.project_id, chunks_data)
        stage_end = datetime.now(UTC)
        _log_stage(
            material_id=material_id,
            stage=stage_name,
            started_at=stage_start,
            completed_at=stage_end,
            status="SUCCESS",
            chunks=len(chunks_data),
        )

        # 5. Incremental concept extraction
        stage_name = "CONCEPT_EXTRACTION"
        stage_start = datetime.now(UTC)
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
            stage_end = datetime.now(UTC)
            _log_stage(
                material_id=material_id,
                stage=stage_name,
                started_at=stage_start,
                completed_at=stage_end,
                status="SUCCESS",
                chunks=len(chunks_data),
            )
        except Exception as c_err:
            stage_end = datetime.now(UTC)
            _log_stage(
                material_id=material_id,
                stage=stage_name,
                started_at=stage_start,
                completed_at=stage_end,
                status="WARNING",
                error=str(c_err),
            )
            logger.warning(
                f"Incremental concept extraction warning for material {material_id}: {c_err}. "
                "Material remains 'ready'. Concept extraction is retryable.",
                exc_info=True,
            )

        # 6. Update page count and mark material as ready
        stage_name = "READY"
        try:
            _ = await _trace_mark_material_ready(
                repo=repo,
                material_id=material_id,
                page_count=extraction_result.page_count,
                chunk_count=len(chunks_data),
            )
        except Exception:
            await repo.update_status(
                material_id,
                status="ready",
                failure_reason=None,
                page_count=extraction_result.page_count,
                completed_at=datetime.now(UTC),
            )

        _log_stage(
            material_id=material_id,
            stage="READY",
            started_at=overall_start,
            completed_at=datetime.now(UTC),
            status="SUCCESS",
            pages=extraction_result.page_count,
            chunks=len(chunks_data),
            embeddings=len(embeddings),
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
        logger.error(f"Failed processing material {material_id} at stage {stage_name}: {error_message}", exc_info=True)
        _log_stage(
            material_id=material_id,
            stage=stage_name,
            started_at=stage_start,
            completed_at=datetime.now(UTC),
            status="FAILED",
            error=error_message,
        )
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
        ctx: Any = nullcontext()
        if parent_trace and is_tracing_enabled():
            try:
                from langsmith.run_helpers import tracing_context
                ctx = tracing_context(
                    parent=parent_trace,
                    project_name=settings.langsmith_project,
                    enabled=True,
                )
            except Exception as t_err:
                logger.debug(f"Worker tracing context warning: {t_err}")
                ctx = nullcontext()

        try:
            with ctx:
                return asyncio.run(coro_factory())
        except AttributeError as a_err:
            if "'NoneType' object has no attribute 'send'" in str(a_err):
                logger.warning(f"LangSmith client 'send' error bypassed: {a_err}. Running coroutine directly.")
                return asyncio.run(coro_factory())
            raise

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
    Guarantees that retry exhaustion marks the material as failed in the database.
    """
    material_id = uuid.UUID(material_id_str)
    try:
        return _run_async_in_worker(
            lambda: _process_material_async(material_id),
            parent_trace=parent_trace,
        )
    except ValueError as val_err:
        val_msg = str(val_err)
        logger.warning(f"Non-retryable processing failure for material {material_id}: {val_msg}")
        try:
            session_factory = get_worker_sessionmaker()

            async def _record_val_failure() -> None:
                async with session_factory() as s:
                    r = MaterialRepository(s)
                    await r.update_status(
                        material_id,
                        status="failed",
                        failure_reason=val_msg,
                    )

            _run_async_in_worker(_record_val_failure)
        except Exception as e:
            logger.error(f"Failed to record permanent failure for material {material_id}: {e}")
        return {"status": "failed", "error": val_msg}
    except Exception as exc:
        retries = getattr(self.request, "retries", 0)
        max_retries = getattr(self, "max_retries", 3)
        exc_msg = str(exc)
        if retries < max_retries:
            countdown = min(60, (2 ** retries) * 5)
            logger.info(
                f"Retrying material {material_id} processing (attempt {retries + 1}/{max_retries}, backoff {countdown}s): {exc_msg}"
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
                            failure_reason=exc_msg,
                        )

                _run_async_in_worker(_record_retry)
            except Exception:
                pass
            raise self.retry(exc=exc, countdown=countdown)
        else:
            logger.error(
                f"Processing failed for material {material_id} after exhausting {max_retries} retries: {exc_msg}"
            )
            try:
                session_factory = get_worker_sessionmaker()

                async def _record_exhaustion_failure() -> None:
                    async with session_factory() as s:
                        r = MaterialRepository(s)
                        await r.update_status(
                            material_id,
                            status="failed",
                            retry_count=retries,
                            failure_reason=f"Processing failed after {retries} retries: {exc_msg}",
                        )

                _run_async_in_worker(_record_exhaustion_failure)
            except Exception as e:
                logger.error(f"Failed to record retry exhaustion failure for material {material_id}: {e}")
            return {"status": "failed", "error": exc_msg}


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
