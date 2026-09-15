import redis.asyncio as aioredis
from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.logging import logger
from app.db.session import check_db_health
from app.schemas.health import DatabaseHealthStatus, HealthStatus, ReadyStatus

router = APIRouter(tags=["Health & System"])


@router.get(
    "/health",
    response_model=HealthStatus,
    summary="Application Liveness Probe",
    description="Returns 200 if the FastAPI application process is up and running.",
)
async def liveness_check() -> HealthStatus:
    """Liveness probe: confirms the process is alive."""
    return HealthStatus(status="healthy", version=settings.APP_VERSION)


@router.get(
    "/health/ready",
    response_model=ReadyStatus,
    summary="Application Readiness Probe",
    description="Checks downstream dependencies (PostgreSQL and Redis). Returns 200 if ready, 503 otherwise.",
)
async def readiness_check() -> JSONResponse:
    """Readiness probe: checks whether dependencies are accessible."""
    # 1. Check PostgreSQL
    db_connected, _, db_error = await check_db_health()
    db_status_str = "connected" if db_connected else "unavailable"

    # 2. Check Redis
    redis_status_str = "unavailable"
    redis_error = None
    try:
        redis_client = aioredis.from_url(
            settings.REDIS_URL,
            socket_connect_timeout=1.5,
            socket_timeout=1.5,
        )
        ping_result = await redis_client.ping()
        await redis_client.aclose()
        if ping_result:
            redis_status_str = "connected"
    except Exception as exc:
        logger.warning(f"Redis health check failed: {exc}")
        redis_error = str(exc)

    is_ready = db_connected and (redis_status_str == "connected")
    status_str = "ready" if is_ready else "not_ready"
    status_code = status.HTTP_200_OK if is_ready else status.HTTP_503_SERVICE_UNAVAILABLE

    details = {}
    if db_error:
        details["database_error"] = db_error
    if redis_error:
        details["redis_error"] = redis_error

    response_data = ReadyStatus(
        status=status_str,
        database=db_status_str,
        redis=redis_status_str,
        details=details if details else None,
    ).model_dump()

    return JSONResponse(status_code=status_code, content=response_data)


@router.get(
    "/health/db",
    response_model=DatabaseHealthStatus,
    summary="Database & Vector Extension Probe",
    description="Checks whether PostgreSQL accepts queries and if pgvector extension is available.",
)
async def database_check() -> JSONResponse:
    """Database probe: checks SQL connectivity and pgvector presence."""
    db_connected, has_vector, db_error = await check_db_health()

    if db_connected:
        response_data = DatabaseHealthStatus(
            status="healthy",
            database="postgresql",
            pgvector=has_vector,
            error=None,
        ).model_dump()
        return JSONResponse(status_code=status.HTTP_200_OK, content=response_data)
    else:
        response_data = DatabaseHealthStatus(
            status="unhealthy",
            database="postgresql",
            pgvector=False,
            error=db_error,
        ).model_dump()
        return JSONResponse(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, content=response_data)
