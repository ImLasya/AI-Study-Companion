"""Embedding generation module using Sentence Transformers (all-MiniLM-L6-v2).

Produces 384-dimensional dense vectors for semantic similarity and pgvector HNSW search.
Runs locally on CPU using ONNX/SentenceTransformers without paid API dependencies or cost.
"""

import logging
import time
from typing import Any

from app.core.config import settings

logger = logging.getLogger("ai_study_companion.ai.embeddings")

_fastembed_model: Any = None


def get_embedding_model() -> Any:
    """Load and cache the sentence-transformers/all-MiniLM-L6-v2 embedding model singleton."""
    global _fastembed_model
    if _fastembed_model is None:
        logger.info(f"Loading embedding model: {settings.EMBEDDING_MODEL_NAME}...")
        try:
            # Prefer fastembed ONNX runtime for robust execution under Windows AppControl/Linux
            from fastembed import TextEmbedding
            _fastembed_model = TextEmbedding(model_name=settings.EMBEDDING_MODEL_NAME)
        except Exception as e:
            logger.warning(f"FastEmbed load error: {e}. Attempting SentenceTransformer fallback...")
            from sentence_transformers import SentenceTransformer
            _fastembed_model = SentenceTransformer(settings.EMBEDDING_MODEL_NAME)

        logger.info(f"Embedding model loaded successfully (dimension={settings.EMBEDDING_DIMENSION}).")
    return _fastembed_model


def embed_text(text: str) -> list[float]:
    """Generate a single 384-dimensional vector embedding for the input text."""
    results = embed_texts([text])
    return results[0]


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Generate normalized 384-dimensional vector embeddings for a batch of texts.

    Records AI usage metrics (feature, model, latency, cost).
    """
    if not texts:
        return []

    model = get_embedding_model()
    start_time = time.perf_counter()
    success = False
    try:
        if hasattr(model, "embed"):
            # FastEmbed TextEmbedding interface
            embeddings_iter = model.embed(texts)
            result: list[list[float]] = [emb.tolist() for emb in embeddings_iter]
        else:
            # SentenceTransformer interface
            raw_embeddings = model.encode(texts, convert_to_numpy=True, normalize_embeddings=True)
            result = [emb.tolist() for emb in raw_embeddings]

        success = True
        return result
    except Exception as e:
        logger.error(f"Failed to generate embeddings: {e}", exc_info=True)
        raise
    finally:
        latency_ms = (time.perf_counter() - start_time) * 1000
        # AI usage logging (PRD Section: AI Observability / Usage tracking)
        usage_record: dict[str, Any] = {
            "feature": "embedding",
            "model": settings.EMBEDDING_MODEL_NAME,
            "dimension": settings.EMBEDDING_DIMENSION,
            "batch_size": len(texts),
            "latency_ms": round(latency_ms, 2),
            "estimated_cost_usd": 0.0,
            "success": success,
        }
        logger.info(f"AI Usage: {usage_record}")
