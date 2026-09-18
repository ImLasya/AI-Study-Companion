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


def safe_traceable(*d_args: Any, **d_kwargs: Any) -> Any:
    """Fail-safe traceable decorator.

    If LangSmith is disabled, not installed, rate-limited (429), or throws an internal client error
    (such as 'NoneType' object has no attribute 'send'), safe_traceable catches the tracing error,
    logs a debug warning, and executes the underlying function directly.
    """
    import inspect

    def decorator(fn: Any) -> Any:
        if not is_tracing_enabled():
            return fn

        try:
            from langsmith import traceable as ls_traceable

            wrapped = ls_traceable(*d_args, **d_kwargs)(fn)
        except Exception:
            return fn

        if inspect.iscoroutinefunction(fn):
            async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
                try:
                    return await wrapped(*args, **kwargs)
                except Exception as exc:
                    exc_str = str(exc)
                    if (
                        "'NoneType' object has no attribute 'send'" in exc_str
                        or "Rate limit exceeded" in exc_str
                        or "429" in exc_str
                        or "langsmith" in type(exc).__module__.lower()
                    ):
                        logger.debug(f"LangSmith async tracing bypassed due to client error: {exc}")
                        return await fn(*args, **kwargs)
                    raise
            return async_wrapper
        else:
            def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
                try:
                    return wrapped(*args, **kwargs)
                except Exception as exc:
                    exc_str = str(exc)
                    if (
                        "'NoneType' object has no attribute 'send'" in exc_str
                        or "Rate limit exceeded" in exc_str
                        or "429" in exc_str
                        or "langsmith" in type(exc).__module__.lower()
                    ):
                        logger.debug(f"LangSmith sync tracing bypassed due to client error: {exc}")
                        return fn(*args, **kwargs)
                    raise
            return sync_wrapper

    if len(d_args) == 1 and callable(d_args[0]) and not d_kwargs:
        return decorator(d_args[0])
    return decorator


try:
    from langsmith import get_current_run_tree, tracing_context
    traceable = safe_traceable
except ImportError:  # pragma: no cover
    traceable = safe_traceable

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
