from fastapi import APIRouter

from app.api.v1.endpoints import auth, health, materials, projects, spaces, tutor

api_router = APIRouter()

# 1. Health Probes
api_router.include_router(health.router)

# 2. Phase 1: Authentication, Spaces & Projects
api_router.include_router(auth.router)
api_router.include_router(spaces.router)
api_router.include_router(projects.router)

# 3. Phase 2: Learning Materials & Ingestion Pipeline
api_router.include_router(materials.router, tags=["Materials"])

# 4. Phase 3: AI Tutor & Grounded RAG
api_router.include_router(tutor.router, tags=["AI Tutor"])
# api_router.include_router(quizzes.router, prefix="/quizzes", tags=["Adaptive Quiz"])
# api_router.include_router(analytics.router, prefix="/analytics", tags=["Analytics"])
# api_router.include_router(admin.router, prefix="/admin", tags=["Admin"])
