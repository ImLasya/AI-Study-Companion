"""Celery task definitions for asynchronous PDF processing and vector indexing."""

import asyncio
import logging
import uuid

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
        return {
            "status": "ready",
            "material_id": str(material_id),
            "page_count": extraction_result.page_count,
            "chunk_count": len(chunks_data),
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


@celery_app.task(bind=True, max_retries=2, name="app.workers.tasks.process_material")
def process_material(self, material_id_str: str) -> dict:
    """Celery task entrypoint for material ingestion.

    Retries transient errors, rejects permanent errors immediately.
    """
    material_id = uuid.UUID(material_id_str)
    try:
        return asyncio.run(_process_material_async(material_id))
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
