"""Redis-backed Caching and Debouncing Service.

Enforces multi-tenant isolation, versioned key namespaces, configurable TTLs,
and graceful degradation (falls back to live computation if Redis is unavailable).
"""

import asyncio
import hashlib
import json
import logging
from typing import Any
import uuid

import redis.asyncio as aioredis

from app.core.config import settings

logger = logging.getLogger("ai_study_companion.core.cache")


class CacheService:
    """Multi-tenant isolated Redis caching service with graceful fallback."""

    def __init__(self, redis_url: str = settings.REDIS_URL) -> None:
        self.redis_url = redis_url
        self._client: aioredis.Redis | None = None
        self._loop: asyncio.AbstractEventLoop | None = None

    def _get_client(self) -> aioredis.Redis:
        current_loop = None
        try:
            current_loop = asyncio.get_running_loop()
        except RuntimeError:
            pass

        if self._client is not None and (self._loop != current_loop or (self._loop and self._loop.is_closed())):
            self._client = None

        if self._client is None:
            self._loop = current_loop
            self._client = aioredis.from_url(
                self.redis_url,
                socket_connect_timeout=2.0,
                socket_timeout=2.0,
                decode_responses=True,
            )
        return self._client

    @staticmethod
    def build_key(
        user_id: uuid.UUID | str,
        project_id: uuid.UUID | str,
        feature: str,
        identifier: str,
    ) -> str:
        """Construct a versioned, tenant-isolated cache key.

        Format: cache:v1:{user_id}:{project_id}:{feature}:{hash}
        """
        id_hash = hashlib.sha256(identifier.encode("utf-8")).hexdigest()[:16]
        return f"cache:v1:{user_id}:{project_id}:{feature}:{id_hash}"

    async def get(self, key: str) -> Any | None:
        """Fetch cached data. Returns None if key missing or on Redis error."""
        try:
            client = self._get_client()
            data = await client.get(key)
            if data is not None:
                return json.loads(data)
            return None
        except Exception as exc:
            logger.warning(f"Cache get failed for key {key} (falling back to live): {exc}")
            return None

    async def set(self, key: str, value: Any, ttl_seconds: int = 3600) -> bool:
        """Store value in cache with TTL. Returns False on Redis error."""
        try:
            client = self._get_client()
            serialized = json.dumps(value)
            await client.set(key, serialized, ex=ttl_seconds)
            return True
        except Exception as exc:
            logger.warning(f"Cache set failed for key {key}: {exc}")
            return False

    async def delete(self, key: str) -> bool:
        """Delete specific cache key."""
        try:
            client = self._get_client()
            await client.delete(key)
            return True
        except Exception as exc:
            logger.warning(f"Cache delete failed for key {key}: {exc}")
            return False

    async def invalidate_project(self, user_id: uuid.UUID | str, project_id: uuid.UUID | str) -> int:
        """Invalidate all cache entries for a given user and project."""
        try:
            client = self._get_client()
            pattern = f"cache:v1:{user_id}:{project_id}:*"
            cursor = 0
            deleted_count = 0
            while True:
                cursor, keys = await client.scan(cursor=cursor, match=pattern, count=100)
                if keys:
                    await client.delete(*keys)
                    deleted_count += len(keys)
                if cursor == 0:
                    break
            logger.info(f"Invalidated {deleted_count} cache keys for project {project_id}")
            return deleted_count
        except Exception as exc:
            logger.warning(f"Cache invalidation failed for project {project_id}: {exc}")
            return 0

    async def should_debounce(
        self,
        user_id: uuid.UUID | str,
        project_id: uuid.UUID | str,
        action: str,
        cooldown_seconds: int = 300,
    ) -> bool:
        """Returns True if the action is currently in cooldown (debounced), False otherwise.

        If False, atomically sets the cooldown key for cooldown_seconds.
        """
        try:
            client = self._get_client()
            debounce_key = f"debounce:{user_id}:{project_id}:{action}"
            # SET NX EX atomically sets if not exists
            was_set = await client.set(debounce_key, "1", ex=cooldown_seconds, nx=True)
            # If was_set is None or False, key already existed -> should debounce!
            return not bool(was_set)
        except Exception as exc:
            logger.warning(f"Debounce check failed for {action}: {exc}. Allowing execution.")
            return False

    async def close(self) -> None:
        """Close Redis connection."""
        if self._client:
            try:
                await self._client.aclose()
            except Exception:
                pass
            self._client = None


# Singleton instance for general use
cache_service = CacheService()
