"""LLM Provider Abstraction.

Defines the contract for LLM generation with structured outputs, latency measurement,
token tracking, and error isolation.
"""

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any, TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


class LLMGenerationError(Exception):
    """Raised when an LLM provider fails, times out, or returns invalid responses."""

    def __init__(self, message: str, original_error: Exception | None = None) -> None:
        super().__init__(message)
        self.original_error = original_error


@dataclass(frozen=True)
class LLMUsage:
    """Token usage and latency metrics for an LLM generation call."""

    prompt_tokens: int | None = None
    candidate_tokens: int | None = None
    total_tokens: int | None = None
    latency_ms: float = 0.0


class LLMProvider(ABC):
    """Abstract interface for LLM operations.

    Decouples application services from specific vendor SDKs.
    """

    @abstractmethod
    async def generate_structured(
        self,
        system_instruction: str,
        user_prompt: str,
        response_schema: type[T],
        temperature: float = 0.2,
        feature: str = "general",
        tags: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> tuple[T, LLMUsage]:
        """Generate a structured response adhering to a Pydantic schema."""
        raise NotImplementedError

    @abstractmethod
    def generate_stream(
        self,
        system_instruction: str,
        user_prompt: str,
        temperature: float = 0.2,
        feature: str = "general",
        tags: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> AsyncIterator[str]:
        """Stream generated text tokens asynchronously.

        Yields:
            Individual token or chunk strings.

        Raises:
            LLMGenerationError: If the provider fails or the stream is interrupted.
        """
        raise NotImplementedError
