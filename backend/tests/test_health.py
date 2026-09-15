from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_root_endpoint(client: AsyncClient) -> None:
    response = await client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["app"] == "AI Study Companion API"
    assert "version" in data
    assert "health" in data


@pytest.mark.asyncio
async def test_liveness_endpoint(client: AsyncClient) -> None:
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "version" in data


@pytest.mark.asyncio
async def test_readiness_live_check(client: AsyncClient) -> None:
    # Live execution: whether Docker is up or down, endpoint returns correct contract
    response = await client.get("/api/v1/health/ready")
    assert response.status_code in [200, 503]
    data = response.json()
    assert "status" in data
    assert "database" in data
    assert "redis" in data
    assert data["status"] in ["ready", "not_ready"]


@pytest.mark.asyncio
async def test_readiness_mocked_ready(client: AsyncClient) -> None:
    with patch("app.api.v1.endpoints.health.check_db_health", new_callable=AsyncMock) as mock_db:
        mock_db.return_value = (True, True, None)
        with patch("redis.asyncio.from_url") as mock_redis_cls:
            mock_redis_instance = AsyncMock()
            mock_redis_instance.ping.return_value = True
            mock_redis_instance.aclose = AsyncMock()
            mock_redis_cls.return_value = mock_redis_instance

            response = await client.get("/api/v1/health/ready")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "ready"
            assert data["database"] == "connected"
            assert data["redis"] == "connected"


@pytest.mark.asyncio
async def test_readiness_mocked_not_ready(client: AsyncClient) -> None:
    with patch("app.api.v1.endpoints.health.check_db_health", new_callable=AsyncMock) as mock_db:
        mock_db.return_value = (False, False, "Connection refused")
        with patch("redis.asyncio.from_url") as mock_redis_cls:
            mock_redis_instance = AsyncMock()
            mock_redis_instance.ping.side_effect = Exception("Redis unreachable")
            mock_redis_instance.aclose = AsyncMock()
            mock_redis_cls.return_value = mock_redis_instance

            response = await client.get("/api/v1/health/ready")
            assert response.status_code == 503
            data = response.json()
            assert data["status"] == "not_ready"
            assert data["database"] == "unavailable"
            assert data["redis"] == "unavailable"
            assert "database_error" in data["details"]


@pytest.mark.asyncio
async def test_db_endpoint_mocked_healthy(client: AsyncClient) -> None:
    with patch("app.api.v1.endpoints.health.check_db_health", new_callable=AsyncMock) as mock_db:
        mock_db.return_value = (True, True, None)
        response = await client.get("/api/v1/health/db")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["database"] == "postgresql"
        assert data["pgvector"] is True


@pytest.mark.asyncio
async def test_db_endpoint_mocked_unhealthy(client: AsyncClient) -> None:
    with patch("app.api.v1.endpoints.health.check_db_health", new_callable=AsyncMock) as mock_db:
        mock_db.return_value = (False, False, "Connection timeout")
        response = await client.get("/api/v1/health/db")
        assert response.status_code == 503
        data = response.json()
        assert data["status"] == "unhealthy"
        assert data["pgvector"] is False
        assert data["error"] == "Connection timeout"
