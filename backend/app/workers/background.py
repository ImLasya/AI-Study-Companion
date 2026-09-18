"""In-process background task runner."""

import asyncio
from collections.abc import Coroutine
from typing import Any


def run_background(coro: Coroutine[Any, Any, Any]) -> None:
    """Schedule an async coroutine without blocking the HTTP response."""
    asyncio.create_task(coro)