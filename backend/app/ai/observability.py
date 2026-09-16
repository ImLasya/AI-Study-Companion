"""Lightweight AI Observability and Metrics Logging (Phase 6).

Logs AI latency, token usage, model identifiers, and operation status without
leaking sensitive prompts, user credentials, or API keys.
Persists metrics to the ai_usage_logs database table via an awaited inline write
wrapped in try/except for resilient, best-effort observability.
"""

import uuid
from typing import Any

from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession


async def log_ai_usage(
    user_id: uuid.UUID | None,
    project_id: uuid.UUID | None,
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
    session: AsyncSession | None = None,
) -> None:
    """Record structured metrics for an AI operation to logs and database.

    Guarantees:
    - Never throws exceptions on database failures (best-effort, non-blocking on failure).
    - Never logs API keys, prompts, full responses, or sensitive credentials.
    - Uses an awaited inline write to avoid dropped writes during shutdown.
    """
    cost_usd: float | None = None
    if input_tokens is not None or output_tokens is not None:
        # Default estimation based on Gemini Flash rates ($0.10/1M in, $0.40/1M out)
        cost_usd = round(
            ((input_tokens or 0) * 0.00000010) + ((output_tokens or 0) * 0.00000040),
            6,
        )

    # 1. Terminal / file structured log via loguru
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

    # 2. Resilient inline database persistence
    try:
        from app.db.session import AsyncSessionLocal
        from app.models.ai_usage import AIUsageLog

        safe_metadata: dict[str, Any] | None = None
        if extra_metadata:
            forbidden_keys = {
                "prompt",
                "api_key",
                "response",
                "auth",
                "token",
                "password",
                "secret",
                "credential",
                "raw_text",
            }
            safe_metadata = {
                k: v for k, v in extra_metadata.items() if k.lower() not in forbidden_keys
            }

        entry = AIUsageLog(
            user_id=user_id,
            project_id=project_id,
            operation=operation,
            provider=provider,
            model=model,
            latency_ms=round(latency_ms, 2),
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            estimated_cost_usd=cost_usd,
            success=success,
            error=str(error)[:1000] if error else None,
            extra_metadata=safe_metadata,
        )

        if session is not None:
            session.add(entry)
            await session.flush()
        else:
            async with AsyncSessionLocal() as db_session:
                db_session.add(entry)
                await db_session.commit()
    except Exception as db_exc:
        logger.warning(f"Best-effort AI usage persistence skipped due to error: {db_exc}")
