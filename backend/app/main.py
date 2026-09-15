from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.logging import logger, setup_logging
from app.db.session import engine


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # Startup
    setup_logging()
    logger.info(
        f"Starting AI Study Companion Backend v{settings.APP_VERSION} ({settings.ENVIRONMENT})"
    )
    logger.info(f"Configured CORS origins: {settings.CORS_ORIGINS}")
    yield
    # Shutdown
    logger.info("Shutting down AI Study Companion Backend...")
    await engine.dispose()
    logger.info("Database engine connections closed.")


app = FastAPI(
    title="AI Study Companion API",
    description="Backend API for AI Study Companion - persistent, contextual, measurable AI learning workspace.",
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Root endpoint
@app.get("/", tags=["System"])
async def root() -> JSONResponse:
    return JSONResponse(
        content={
            "app": "AI Study Companion API",
            "version": settings.APP_VERSION,
            "environment": settings.ENVIRONMENT,
            "docs": "/docs",
            "health": f"{settings.API_V1_PREFIX}/health",
        }
    )


# Include v1 API router
app.include_router(api_router, prefix=settings.API_V1_PREFIX)
