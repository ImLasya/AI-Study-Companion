"""LangSmith Tracing and External Observability Integration.

Provides non-intrusive, optional observability for Google Gemini API calls.
Instruments the official google-genai SDK using LangSmith's native wrap_gemini
wrapper and context tracking.

Coexists with the internal app.ai.observability (ai_usage_logs).
"""

import os
from collections.abc import Generator
from contextlib import contextmanager
from typing import Any

from loguru import logger

from app.core.config import settings

# Sensitive keys that must NEVER be included in trace metadata
SENSITIVE_KEYS = {
    "api_key",
    "token",
    "secret",
    "password",
    "authorization",
    "jwt",
    "refresh_token",
    "access_token",
    "gemini_api_key",
    "langsmith_api_key",
}


def is_tracing_enabled() -> bool:
    """Return True if LangSmith tracing is actively configured and enabled."""
    return settings.is_langsmith_enabled


def setup_tracing_env() -> None:
    """Synchronize application settings to environment variables for LangSmith SDK.

    Ensures that standard LangSmith environment variables are populated
    without printing any secret values in logs.
    """
    if not is_tracing_enabled():
        return

    os.environ["LANGSMITH_TRACING"] = "true"
    os.environ["LANGCHAIN_TRACING_V2"] = "true"
    os.environ["LANGSMITH_PROJECT"] = settings.langsmith_project
    os.environ["LANGCHAIN_PROJECT"] = settings.langsmith_project

    if settings.langsmith_api_key:
        os.environ["LANGSMITH_API_KEY"] = settings.langsmith_api_key
        os.environ["LANGCHAIN_API_KEY"] = settings.langsmith_api_key

    if settings.langsmith_endpoint:
        os.environ["LANGSMITH_ENDPOINT"] = settings.langsmith_endpoint
        os.environ["LANGCHAIN_ENDPOINT"] = settings.langsmith_endpoint


def sanitize_metadata(meta: dict[str, Any] | None) -> dict[str, Any]:
    """Sanitize metadata dictionary to ensure no sensitive credentials or tokens leak."""
    if not meta:
        return {}

    sanitized: dict[str, Any] = {}
    for k, v in meta.items():
        lower_k = k.lower()
        if any(sensitive in lower_k for sensitive in SENSITIVE_KEYS):
            continue
        # Convert non-serializable objects to strings
        if isinstance(v, (str, int, float, bool)) or v is None:
            sanitized[k] = v
        elif isinstance(v, (list, tuple)):
            sanitized[k] = [str(item) for item in v[:20]]
        else:
            sanitized[k] = str(v)

    return sanitized


def trace_gemini_client(client: Any) -> Any:
    """Wrap a google-genai Client with LangSmith instrumentation if enabled.

    Fail-safe: Returns the original raw client unmodified if tracing is
    disabled, if langsmith is unavailable, or if wrapping fails.
    """
    if not is_tracing_enabled():
        return client

    try:
        setup_tracing_env()
        from langsmith.wrappers import wrap_gemini

        wrapped = wrap_gemini(client, chat_name="Gemini")
        logger.info(
            f"LangSmith Gemini tracing active [project={settings.langsmith_project}]"
        )
        return wrapped
    except Exception as exc:
        logger.warning(
            f"Failed to initialize LangSmith Gemini tracing ({exc}). Continuing with standard client."
        )
        return client


try:
    from langsmith import get_current_run_tree, traceable, tracing_context
except ImportError:  # pragma: no cover
    def traceable(*args: Any, **kwargs: Any) -> Any:  # type: ignore[no-redef, misc]
        def decorator(fn: Any) -> Any:
            return fn
        if len(args) == 1 and callable(args[0]):
            return args[0]
        return decorator

    def get_current_run_tree() -> Any:  # type: ignore[no-redef, misc]
        return None

    def tracing_context(*args: Any, **kwargs: Any) -> Any:  # type: ignore[no-redef, misc]
        from contextlib import nullcontext
        return nullcontext()



@contextmanager
def tracing_context_manager(
    feature: str,
    tags: list[str] | None = None,
    metadata: dict[str, Any] | None = None,
) -> Generator[None, None, None]:
    """Scoped context manager for attaching safe metadata and tags to LangSmith traces.

    Guarantees zero interruption to Gemini execution if LangSmith raises an error.
    """
    if not is_tracing_enabled():
        yield
        return

    merged_tags = ["ai-study-companion", feature]
    if tags:
        merged_tags.extend(tags)

    base_metadata: dict[str, Any] = {
        "feature": feature,
        "provider": "gemini",
        "model": settings.GEMINI_MODEL,
        "environment": settings.ENVIRONMENT,
    }
    if metadata:
        base_metadata.update(sanitize_metadata(metadata))

    try:
        from langsmith.run_helpers import tracing_context
    except ImportError as exc:
        logger.warning(f"LangSmith not available: {exc}")
        yield
        return

    try:
        ctx = tracing_context(
            project_name=settings.langsmith_project,
            tags=list(dict.fromkeys(merged_tags)),  # deduplicate preserving order
            metadata=base_metadata,
            enabled=True,
        )
    except Exception as exc:
        logger.warning(f"Failed to create LangSmith tracing context: {exc}")
        yield
        return

    with ctx:
        yield
