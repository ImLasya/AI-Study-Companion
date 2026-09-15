"""Lightweight AI Observability and Metrics Logging.

Logs AI latency, token usage, model identifiers, and operation status without
leaking sensitive prompts, user credentials, or API keys.
"""

import uuid
from datetime import UTC, datetime
from typing import Any

from loguru import logger


def log_ai_usage(
    user_id: uuid.UUID,
    project_id: uuid.UUID,
    operation: str,
    provider: str,
    model: str,
    latency_ms: float,
    input_tokens: int | None = None,
    output_tokens: int | None = None,
    total_tokens: int | None = None,
    success: bool = True,
    error: str | None = None,
    extra_metadata: dict[str, Any] | None = None,
) -> None:
    """Record lightweight structured metrics for an AI operation."""
    payload = {
        "timestamp": datetime.now(UTC).isoformat(),
        "user_id": str(user_id),
        "project_id": str(project_id),
        "operation": operation,
        "provider": provider,
        "model": model,
        "latency_ms": round(latency_ms, 2),
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
        "success": success,
    }
    if error:
        payload["error"] = error
    if extra_metadata:
        payload["metadata"] = extra_metadata

    if success:
        logger.info(
            f"[AI Usage] op={operation} provider={provider} model={model} "
            f"latency={latency_ms:.1f}ms tokens={total_tokens or 'n/a'} status=SUCCESS"
        )
    else:
        logger.warning(
            f"[AI Usage] op={operation} provider={provider} model={model} "
            f"latency={latency_ms:.1f}ms status=FAILED error={error}"
        )
