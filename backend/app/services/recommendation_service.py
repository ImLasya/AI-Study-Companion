"""Recommendation Service (Phase 5).

Generates targeted, actionable recommendations using Google Gemini over
structured diagnostic summaries.
"""

import time
import uuid

from loguru import logger
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.gemini_provider import get_llm_provider
from app.ai.llm import LLMGenerationError
from app.ai.observability import log_ai_usage
from app.ai.recommendation_prompts import (
    RECOMMENDATION_SYSTEM_INSTRUCTION,
    build_recommendation_prompt,
)
from app.core.config import settings
from app.models.mastery import Recommendation
from app.models.project import Project
from app.models.quiz import QuizAnswer, QuizAttempt, QuizQuestion
from app.repositories.concept_repository import ConceptRepository
from app.repositories.mastery_repository import MasteryRepository
from app.repositories.material_repository import MaterialRepository
from app.schemas.mastery import RecommendationGenerationOutput

VALID_RECOMMENDATION_TYPES = {
    "review_concept",
    "practice_quiz",
    "study_material",
    "explore_topic",
}


class RecommendationService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.mastery_repo = MasteryRepository(session)
        self.concept_repo = ConceptRepository(session)
        self.material_repo = MaterialRepository(session)

    async def generate_or_get_recommendation(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        force_regenerate: bool = False,
    ) -> Recommendation | None:
        """Fetch active recommendation or synthesize a new targeted recommendation via Gemini.

        Deduplication rules:
        - Reuses the active recommendation unless explicitly force-regenerated or no active exists.
        - Avoids persisting duplicate recommendations for the same target concept and type.
        - Gracefully degrades if Gemini fails.
        """
        active_recs = await self.mastery_repo.get_active_recommendations(user_id, project_id)
        if not force_regenerate and active_recs:
            return active_recs[0]

        # 1. Fetch Project Diagnostic State
        proj_stmt = select(Project).where(Project.id == project_id)
        p_res = await self.session.execute(proj_stmt)
        project = p_res.scalar_one_or_none()
        if not project:
            return None

        concepts = await self.concept_repo.list_by_project(user_id, project_id)
        if not concepts:
            return None

        concept_map = {c.id: c for c in concepts}
        valid_concept_ids = set(concept_map.keys())

        # 2. Fetch Current Masteries
        masteries = await self.mastery_repo.list_project_masteries(user_id, project_id)
        mastery_by_concept = {m.concept_id: m for m in masteries}

        candidate_concepts = []
        for c in concepts:
            m = mastery_by_concept.get(c.id)
            candidate_concepts.append(
                {
                    "id": str(c.id),
                    "name": c.name,
                    "mastery_score": m.mastery_score if m else None,
                    "confidence": m.confidence if m else 0.0,
                    "status": "unassessed"
                    if (not m or m.mastery_score is None)
                    else (
                        "needs_attention"
                        if m.mastery_score < 50.0
                        else ("improving" if m.mastery_score >= 70.0 else "stable")
                    ),
                }
            )

        # 3. Fetch Recent Incorrect Answers
        err_stmt = (
            select(QuizAnswer, QuizQuestion.question_text, QuizQuestion.explanation)
            .join(QuizAttempt, QuizAnswer.attempt_id == QuizAttempt.id)
            .join(QuizQuestion, QuizAnswer.question_id == QuizQuestion.id)
            .where(
                QuizAnswer.user_id == user_id,
                QuizAttempt.project_id == project_id,
                QuizAnswer.is_correct.is_(False),
            )
            .order_by(desc(QuizAnswer.evaluated_at))
            .limit(5)
        )
        err_res = await self.session.execute(err_stmt)
        recent_errors = []
        for ans, q_text, q_expl in err_res.all():
            c_name = (
                concept_map[ans.concept_id].name if ans.concept_id in concept_map else "General"
            )
            recent_errors.append(
                {
                    "concept_name": c_name,
                    "question": q_text[:120],
                    "explanation": (q_expl or "")[:120],
                }
            )

        # 4. Fetch Available Ready Materials
        materials = await self.material_repo.list_by_project(user_id, project_id)
        available_materials = [m.filename for m in materials if m.status == "ready"]

        # 5. Build Structured Prompt
        prompt = build_recommendation_prompt(
            learning_goal=project.learning_goal,
            candidate_concepts=candidate_concepts,
            recent_errors=recent_errors,
            available_materials=available_materials,
        )

        provider = get_llm_provider()
        start_time = time.perf_counter()

        try:
            output, usage = await provider.generate_structured(
                system_instruction=RECOMMENDATION_SYSTEM_INSTRUCTION,
                user_prompt=prompt,
                response_schema=RecommendationGenerationOutput,
                temperature=0.2,
            )
            latency_ms = usage.latency_ms or ((time.perf_counter() - start_time) * 1000.0)
            await log_ai_usage(
                user_id=user_id,
                project_id=project_id,
                operation="recommendation_generation",
                provider="gemini",
                model=settings.GEMINI_MODEL,
                latency_ms=latency_ms,
                input_tokens=usage.prompt_tokens,
                output_tokens=usage.candidate_tokens,
                total_tokens=usage.total_tokens,
                success=True,
                session=self.session,
            )
        except (LLMGenerationError, Exception) as err:
            latency_ms = (time.perf_counter() - start_time) * 1000.0
            await log_ai_usage(
                user_id=user_id,
                project_id=project_id,
                operation="recommendation_generation",
                provider="gemini",
                model=settings.GEMINI_MODEL,
                latency_ms=latency_ms,
                input_tokens=0,
                output_tokens=0,
                total_tokens=0,
                success=False,
                error=str(err),
                session=self.session,
            )
            logger.warning(
                f"Gemini recommendation generation failed for project {project_id}: {err}. "
                "Returning existing recommendation if available.",
                exc_info=True,
            )
            return active_recs[0] if active_recs else None

        # 6. Server-Side Validation
        target_concept_id: uuid.UUID | None = None
        if output.target_concept_id:
            try:
                candidate_uuid = uuid.UUID(output.target_concept_id)
                if candidate_uuid in valid_concept_ids:
                    target_concept_id = candidate_uuid
            except ValueError:
                target_concept_id = None

        rec_type = output.recommendation_type.lower().strip()
        if rec_type not in VALID_RECOMMENDATION_TYPES:
            rec_type = "practice_quiz"

        # 7. Deduplication against existing active recommendations
        for active in active_recs:
            if (
                active.target_concept_id == target_concept_id
                and active.recommendation_type == rec_type
            ):
                logger.info(
                    f"Reusing active recommendation {active.id} (matches concept and type)."
                )
                return active

        # 8. Persist new recommendation
        new_rec = await self.mastery_repo.create_recommendation(
            user_id=user_id,
            project_id=project_id,
            recommendation_type=rec_type,
            title=output.title.strip()[:255],
            body=output.body.strip(),
            target_concept_id=target_concept_id,
            reasoning=output.reasoning.strip(),
        )
        return new_rec
