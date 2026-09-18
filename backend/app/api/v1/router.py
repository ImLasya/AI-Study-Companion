from fastapi import APIRouter

from app.api.v1.endpoints import (
    admin,
    analytics,
    auth,
    flashcards,
    health,
    insights,
    learning_plans,
    mastery,
    materials,
    projects,
    quizzes,
    spaces,
    tutor,
)

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

# 5. Phase 4: Adaptive Quiz & Assessment
api_router.include_router(quizzes.router, tags=["Adaptive Quiz & Assessment"])

# 6. Phase 5: Concept Mastery, Growth & Recommendations
api_router.include_router(mastery.router, tags=["Mastery & Growth"])

# 7. Phase 6: Analytics & Admin Observability
api_router.include_router(analytics.router)
api_router.include_router(admin.router)

# 8. Learning Insights
api_router.include_router(insights.router)

# 9. Grounded Flashcards
api_router.include_router(flashcards.router, tags=["Flashcards"])

# 10. Personalized Learning Plans
api_router.include_router(learning_plans.router, tags=["Learning Plans"])
