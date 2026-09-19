"""In-process background task runner with task retention and error logging."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Coroutine
from typing import Any

logger = logging.getLogger("ai_study_companion.workers.background")

# Retain strong references to active background tasks to prevent garbage collection mid-execution
_background_tasks: set[asyncio.Task[Any]] = set()


def run_background(coro: Coroutine[Any, Any, Any]) -> asyncio.Task[Any]:
    """Schedule an async coroutine without blocking the HTTP response.

    Retains a strong reference until task completion and logs unhandled exceptions.
    """
    task = asyncio.create_task(coro)
    _background_tasks.add(task)

    def _on_done(t: asyncio.Task[Any]) -> None:
        _background_tasks.discard(t)
        if not t.cancelled():
            exc = t.exception()
            if exc:
                logger.error(
                    f"Unhandled exception in background task {t.get_name()}: {exc}",
                    exc_info=exc,
                )

    task.add_done_callback(_on_done)
    return task