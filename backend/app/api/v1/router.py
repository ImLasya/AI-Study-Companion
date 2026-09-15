from fastapi import APIRouter

from app.api.v1.endpoints import auth, health, materials, projects, spaces

api_router = APIRouter()

# 1. Health Probes
api_router.include_router(health.router)

# 2. Phase 1: Authentication, Spaces & Projects
api_router.include_router(auth.router)
api_router.include_router(spaces.router)
api_router.include_router(projects.router)

# 3. Phase 2: Learning Materials & Ingestion Pipeline
api_router.include_router(materials.router, tags=["Materials"])
# api_router.include_router(tutor.router, prefix="/tutor", tags=["AI Tutor"])
# api_router.include_router(quizzes.router, prefix="/quizzes", tags=["Adaptive Quiz"])
# api_router.include_router(analytics.router, prefix="/analytics", tags=["Analytics"])
# api_router.include_router(admin.router, prefix="/admin", tags=["Admin"])
