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
    cost_usd: float | None = None
    if input_tokens is not None or output_tokens is not None:
        # Default estimation based on Gemini Flash rates ($0.10/1M in, $0.40/1M out)
        cost_usd = round(
            ((input_tokens or 0) * 0.00000010) + ((output_tokens or 0) * 0.00000040),
            6,
        )

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
        "estimated_cost_usd": cost_usd,
        "success": success,
    }
    if error:
        payload["error"] = error
    if extra_metadata:
        payload["metadata"] = extra_metadata

    if success:
        cost_str = f"${cost_usd:.6f}" if cost_usd is not None else "n/a"
        logger.info(
            f"[AI Usage] op={operation} provider={provider} model={model} "
            f"latency={latency_ms:.1f}ms tokens={total_tokens or 'n/a'} "
            f"cost={cost_str} status=SUCCESS"
        )
    else:
        logger.warning(
            f"[AI Usage] op={operation} provider={provider} model={model} "
            f"latency={latency_ms:.1f}ms status=FAILED error={error}"
        )
