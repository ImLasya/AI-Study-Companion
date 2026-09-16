"""Mastery Service (Phase 5).

Orchestrates deterministic mastery computation, transaction-safe snapshot recording,
growth trajectory analysis, and recommendation workflows.
"""

import uuid

from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.quiz import QuizAnswer
from app.repositories.concept_repository import ConceptRepository
from app.repositories.mastery_repository import MasteryRepository
from app.repositories.project_repository import ProjectRepository
from app.schemas.mastery import (
    ConceptGrowthItem,
    ConceptMasteryResponse,
    GrowthSummaryResponse,
    MasteryListResponse,
    RecommendationResponse,
    SnapshotPointSchema,
)
from app.services.growth_engine import SnapshotPoint, classify_concept_growth
from app.services.mastery_engine import AnswerEvidence, calculate_concept_mastery
from app.services.recommendation_service import RecommendationService


class MasteryService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.mastery_repo = MasteryRepository(session)
        self.concept_repo = ConceptRepository(session)
        self.project_repo = ProjectRepository(session)
        self.rec_service = RecommendationService(session)

    # ------------------------------------------------------------------------
    # 1. Event-Driven Mastery & Snapshot Processing (Idempotent + Transactional)
    # ------------------------------------------------------------------------
    async def process_quiz_completion(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        attempt_id: uuid.UUID,
    ) -> dict:
        """Process quiz completed event transactionally and idempotently.

        Guarantees:
        1. Database-enforced idempotency via processed_events unique constraint.
        2. Mastery updates and snapshot creation commit together atomically.
        3. Recommendation generation runs after mastery commit, so failure in LLM
           does not invalidate persisted mastery/snapshots.
        """
        # Check if already processed before doing heavy work
        is_new = await self.mastery_repo.try_record_processed_event(
            event_type="quiz_completed", aggregate_id=attempt_id
        )
        if not is_new:
            logger.info(
                f"Quiz attempt {attempt_id} already processed for mastery. Skipping idempotently."
            )
            return {"status": "already_processed", "idempotent": True}

        # Query attempt answers to find affected concepts
        ans_stmt = select(QuizAnswer).where(
            QuizAnswer.attempt_id == attempt_id,
            QuizAnswer.concept_id.is_not(None),
        )
        ans_res = await self.session.execute(ans_stmt)
        attempt_answers = ans_res.scalars().all()

        affected_concept_ids = list(
            {a.concept_id for a in attempt_answers if a.concept_id is not None}
        )
        logger.info(
            f"Processing quiz completion {attempt_id}: recomputing mastery for {len(affected_concept_ids)} concepts."
        )

        # 1. Transactionally update ConceptMastery and record MasterySnapshot
        updated_concepts = []
        for c_id in affected_concept_ids:
            eligible_answers = await self.mastery_repo.get_eligible_answers_for_concept(
                user_id=user_id, concept_id=c_id
            )
            evidence_list = [
                AnswerEvidence(
                    score=a.score,
                    difficulty=a.difficulty,
                    is_correct=a.is_correct,
                    evaluated_at=a.evaluated_at,
                )
                for a in eligible_answers
            ]
            estimate = calculate_concept_mastery(evidence_list)

            await self.mastery_repo.upsert_mastery(
                user_id=user_id,
                project_id=project_id,
                concept_id=c_id,
                mastery_score=estimate.mastery_score,
                confidence=estimate.confidence,
                evidence_count=estimate.evidence_count,
            )

            if estimate.is_assessed and estimate.mastery_score is not None:
                await self.mastery_repo.record_snapshot(
                    user_id=user_id,
                    project_id=project_id,
                    concept_id=c_id,
                    mastery_score=estimate.mastery_score,
                )
            updated_concepts.append(str(c_id))

        # Commit masteries and snapshots safely
        await self.session.commit()

        # 2. Recommendation Generation (Post-Mastery, decoupled from mastery persistence)
        rec = None
        try:
            rec = await self.rec_service.generate_or_get_recommendation(
                user_id=user_id, project_id=project_id, force_regenerate=True
            )
            await self.session.commit()
        except Exception as e:
            logger.warning(
                f"Post-quiz recommendation generation failed for project {project_id}: {e}. "
                "Mastery and snapshots remain safely persisted.",
                exc_info=True,
            )

        return {
            "status": "success",
            "affected_concepts": updated_concepts,
            "recommendation_id": str(rec.id) if rec else None,
        }

    # ------------------------------------------------------------------------
    # 2. Get Project Masteries API
    # ------------------------------------------------------------------------
    async def get_project_masteries(
        self, user_id: uuid.UUID, project_id: uuid.UUID
    ) -> MasteryListResponse:
        """Fetch current mastery levels for all concepts in the project."""
        # Tenant check: project must belong to user
        project = await self.project_repo.get_by_id(user_id=user_id, project_id=project_id)
        if not project:
            return MasteryListResponse(
                project_id=project_id,
                masteries=[],
                overall_average_mastery=None,
                assessed_count=0,
                total_concepts=0,
            )

        concepts = await self.concept_repo.list_by_project(user_id, project_id)
        persisted_masteries = await self.mastery_repo.list_project_masteries(user_id, project_id)
        mastery_map = {m.concept_id: m for m in persisted_masteries}

        results = []
        assessed_scores = []

        for c in concepts:
            m = mastery_map.get(c.id)
            if m and m.evidence_count > 0 and m.mastery_score is not None:
                score = m.mastery_score
                conf = m.confidence
                conf_level = "low" if conf < 0.40 else ("medium" if conf < 0.75 else "high")
                ev_count = m.evidence_count
                is_assessed = True
                updated_at = m.last_updated_at
                assessed_scores.append(score)
            else:
                score = None
                conf = 0.0
                conf_level = "unassessed"
                ev_count = 0
                is_assessed = False
                updated_at = None

            results.append(
                ConceptMasteryResponse(
                    id=m.id if m else None,
                    concept_id=c.id,
                    concept_name=c.name,
                    mastery_score=score,
                    confidence=conf,
                    confidence_level=conf_level,
                    evidence_count=ev_count,
                    is_assessed=is_assessed,
                    last_updated_at=updated_at,
                )
            )

        avg_mastery = (
            round(sum(assessed_scores) / len(assessed_scores), 1) if assessed_scores else None
        )

        return MasteryListResponse(
            project_id=project_id,
            masteries=results,
            overall_average_mastery=avg_mastery,
            assessed_count=len(assessed_scores),
            total_concepts=len(concepts),
        )

    # ------------------------------------------------------------------------
    # 3. Growth Analysis API
    # ------------------------------------------------------------------------
    async def get_project_growth(
        self, user_id: uuid.UUID, project_id: uuid.UUID
    ) -> GrowthSummaryResponse:
        """Analyze concept trajectories and return trend groups and time-series points."""
        project = await self.project_repo.get_by_id(user_id=user_id, project_id=project_id)
        if not project:
            return GrowthSummaryResponse(
                project_id=project_id,
                improving=[],
                stable=[],
                needs_attention=[],
                unassessed=[],
                overall_average=None,
            )

        concepts = await self.concept_repo.list_by_project(user_id, project_id)
        persisted_masteries = await self.mastery_repo.list_project_masteries(user_id, project_id)
        mastery_map = {m.concept_id: m for m in persisted_masteries}

        snapshots = await self.mastery_repo.list_project_snapshots(user_id, project_id)
        snapshots_by_concept: dict[uuid.UUID, list[SnapshotPoint]] = {}
        for s in snapshots:
            snapshots_by_concept.setdefault(s.concept_id, []).append(
                SnapshotPoint(mastery_score=s.mastery_score, recorded_at=s.recorded_at)
            )

        improving: list[ConceptGrowthItem] = []
        stable: list[ConceptGrowthItem] = []
        needs_attention: list[ConceptGrowthItem] = []
        unassessed: list[ConceptGrowthItem] = []
        assessed_scores: list[float] = []

        for c in concepts:
            m = mastery_map.get(c.id)
            score = m.mastery_score if m else None
            ev_count = m.evidence_count if m else 0
            if score is not None and ev_count > 0:
                assessed_scores.append(score)

            c_snaps = snapshots_by_concept.get(c.id, [])
            analysis = classify_concept_growth(
                concept_id=str(c.id),
                concept_name=c.name,
                current_score=score,
                evidence_count=ev_count,
                snapshots=c_snaps,
            )

            item = ConceptGrowthItem(
                concept_id=c.id,
                concept_name=c.name,
                current_score=analysis.current_score,
                baseline_score=analysis.baseline_score,
                delta=analysis.delta,
                status=analysis.status,
                history=[
                    SnapshotPointSchema(recorded_at=h["recorded_at"], score=h["score"])
                    for h in analysis.history
                ],
            )

            if analysis.status == "improving":
                improving.append(item)
            elif analysis.status == "needs_attention":
                needs_attention.append(item)
            elif analysis.status == "stable":
                stable.append(item)
            else:
                unassessed.append(item)

        avg_mastery = (
            round(sum(assessed_scores) / len(assessed_scores), 1) if assessed_scores else None
        )

        return GrowthSummaryResponse(
            project_id=project_id,
            improving=improving,
            stable=stable,
            needs_attention=needs_attention,
            unassessed=unassessed,
            overall_average=avg_mastery,
        )

    # ------------------------------------------------------------------------
    # 4. Recommendations API
    # ------------------------------------------------------------------------
    async def get_project_recommendations(
        self, user_id: uuid.UUID, project_id: uuid.UUID
    ) -> list[RecommendationResponse]:
        """Return active recommendations for project, generating if none exist."""
        project = await self.project_repo.get_by_id(user_id=user_id, project_id=project_id)
        if not project:
            return []

        active_recs = await self.mastery_repo.get_active_recommendations(user_id, project_id)
        if not active_recs:
            # Generate initial recommendation on demand if concepts exist
            new_rec = await self.rec_service.generate_or_get_recommendation(
                user_id=user_id, project_id=project_id
            )
            if new_rec:
                await self.session.commit()
                active_recs = [new_rec]

        concepts = await self.concept_repo.list_by_project(user_id, project_id)
        concept_names = {c.id: c.name for c in concepts}

        return [
            RecommendationResponse(
                id=r.id,
                project_id=r.project_id,
                recommendation_type=r.recommendation_type,
                title=r.title,
                body=r.body,
                target_concept_id=r.target_concept_id,
                target_concept_name=concept_names.get(r.target_concept_id)
                if r.target_concept_id
                else None,
                reasoning=r.reasoning,
                status=r.status,
                created_at=r.created_at,
            )
            for r in active_recs
        ]

    async def dismiss_recommendation(
        self, user_id: uuid.UUID, project_id: uuid.UUID, recommendation_id: uuid.UUID
    ) -> bool:
        """Dismiss an active recommendation."""
        # Ensure project belongs to user
        project = await self.project_repo.get_by_id(user_id=user_id, project_id=project_id)
        if not project:
            return False

        rec = await self.mastery_repo.dismiss_recommendation(
            user_id=user_id, recommendation_id=recommendation_id
        )
        if rec:
            await self.session.commit()
            return True
        return False
