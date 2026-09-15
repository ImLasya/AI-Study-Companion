from fastapi import APIRouter

from app.api.v1.endpoints import health

api_router = APIRouter()

# Register core health endpoints
api_router.include_router(health.router)

# Future Phase endpoints will be included here:
# api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
# api_router.include_router(spaces.router, prefix="/spaces", tags=["Spaces"])
# api_router.include_router(projects.router, prefix="/projects", tags=["Projects"])
# api_router.include_router(materials.router, prefix="/materials", tags=["Materials"])
# api_router.include_router(tutor.router, prefix="/tutor", tags=["AI Tutor"])
# api_router.include_router(quizzes.router, prefix="/quizzes", tags=["Adaptive Quiz"])
# api_router.include_router(analytics.router, prefix="/analytics", tags=["Analytics"])
# api_router.include_router(admin.router, prefix="/admin", tags=["Admin"])
