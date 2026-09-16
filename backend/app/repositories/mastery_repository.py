"""Mastery Repository (Phase 5).

Handles tenant-isolated persistence for ConceptMastery, MasterySnapshot,
Recommendation, and ProcessedEvent records.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import desc, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.mastery import (
    ConceptMastery,
    MasterySnapshot,
    ProcessedEvent,
    Recommendation,
)
from app.models.quiz import QuizAnswer, QuizAttempt


class MasteryRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ------------------------------------------------------------------------
    # 1. Concept Mastery
    # ------------------------------------------------------------------------
    async def get_concept_mastery(
        self, user_id: uuid.UUID, concept_id: uuid.UUID
    ) -> ConceptMastery | None:
        stmt = select(ConceptMastery).where(
            ConceptMastery.user_id == user_id,
            ConceptMastery.concept_id == concept_id,
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def list_project_masteries(
        self, user_id: uuid.UUID, project_id: uuid.UUID
    ) -> list[ConceptMastery]:
        stmt = (
            select(ConceptMastery)
            .where(
                ConceptMastery.user_id == user_id,
                ConceptMastery.project_id == project_id,
            )
            .order_by(desc(ConceptMastery.last_updated_at))
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def upsert_mastery(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        concept_id: uuid.UUID,
        mastery_score: float | None,
        confidence: float,
        evidence_count: int,
    ) -> ConceptMastery:
        existing = await self.get_concept_mastery(user_id, concept_id)
        now = datetime.now(UTC)
        if existing:
            existing.mastery_score = mastery_score
            existing.confidence = confidence
            existing.evidence_count = evidence_count
            existing.last_updated_at = now
            return existing

        new_mastery = ConceptMastery(
            id=uuid.uuid4(),
            project_id=project_id,
            user_id=user_id,
            concept_id=concept_id,
            mastery_score=mastery_score,
            confidence=confidence,
            evidence_count=evidence_count,
            last_updated_at=now,
            created_at=now,
        )
        self.session.add(new_mastery)
        return new_mastery

    # ------------------------------------------------------------------------
    # 2. Mastery Snapshots (Append-Only)
    # ------------------------------------------------------------------------
    async def record_snapshot(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        concept_id: uuid.UUID,
        mastery_score: float,
    ) -> MasterySnapshot:
        snapshot = MasterySnapshot(
            id=uuid.uuid4(),
            project_id=project_id,
            user_id=user_id,
            concept_id=concept_id,
            mastery_score=mastery_score,
            recorded_at=datetime.now(UTC),
        )
        self.session.add(snapshot)
        return snapshot

    async def list_snapshots_by_concept(
        self, user_id: uuid.UUID, concept_id: uuid.UUID, limit: int = 50
    ) -> list[MasterySnapshot]:
        stmt = (
            select(MasterySnapshot)
            .where(
                MasterySnapshot.user_id == user_id,
                MasterySnapshot.concept_id == concept_id,
            )
            .order_by(MasterySnapshot.recorded_at.asc())
            .limit(limit)
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def list_project_snapshots(
        self, user_id: uuid.UUID, project_id: uuid.UUID
    ) -> list[MasterySnapshot]:
        stmt = (
            select(MasterySnapshot)
            .where(
                MasterySnapshot.user_id == user_id,
                MasterySnapshot.project_id == project_id,
            )
            .order_by(MasterySnapshot.recorded_at.asc())
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    # ------------------------------------------------------------------------
    # 3. Processed Events (Database-Enforced Idempotency)
    # ------------------------------------------------------------------------
    async def try_record_processed_event(
        self, event_type: str, aggregate_id: uuid.UUID
    ) -> bool:
        """Attempt to insert a processed event row.

        Returns True if newly inserted, False if already exists.
        """
        stmt = select(ProcessedEvent).where(
            ProcessedEvent.event_type == event_type,
            ProcessedEvent.aggregate_id == aggregate_id,
        )
        res = await self.session.execute(stmt)
        if res.scalar_one_or_none() is not None:
            return False

        try:
            event = ProcessedEvent(
                id=uuid.uuid4(),
                event_type=event_type,
                aggregate_id=aggregate_id,
                processed_at=datetime.now(UTC),
            )
            self.session.add(event)
            await self.session.flush()
            return True
        except IntegrityError:
            return False

    # ------------------------------------------------------------------------
    # 4. Answers for Concept Mastery Calculation
    # ------------------------------------------------------------------------
    async def get_eligible_answers_for_concept(
        self, user_id: uuid.UUID, concept_id: uuid.UUID
    ) -> list[QuizAnswer]:
        """Fetch all successfully submitted/evaluated answers for a concept by this user."""
        stmt = (
            select(QuizAnswer)
            .join(QuizAttempt, QuizAnswer.attempt_id == QuizAttempt.id)
            .where(
                QuizAnswer.user_id == user_id,
                QuizAnswer.concept_id == concept_id,
                QuizAnswer.score.is_not(None),
                QuizAnswer.is_correct.is_not(None),
                QuizAttempt.status == "completed",
            )
            .order_by(QuizAnswer.evaluated_at.asc())
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    # ------------------------------------------------------------------------
    # 5. Recommendations
    # ------------------------------------------------------------------------
    async def get_active_recommendations(
        self, user_id: uuid.UUID, project_id: uuid.UUID
    ) -> list[Recommendation]:
        stmt = (
            select(Recommendation)
            .where(
                Recommendation.user_id == user_id,
                Recommendation.project_id == project_id,
                Recommendation.status == "active",
            )
            .order_by(desc(Recommendation.created_at))
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def create_recommendation(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        recommendation_type: str,
        title: str,
        body: str,
        target_concept_id: uuid.UUID | None,
        reasoning: str,
    ) -> Recommendation:
        rec = Recommendation(
            id=uuid.uuid4(),
            project_id=project_id,
            user_id=user_id,
            recommendation_type=recommendation_type,
            title=title,
            body=body,
            target_concept_id=target_concept_id,
            reasoning=reasoning,
            status="active",
            created_at=datetime.now(UTC),
        )
        self.session.add(rec)
        return rec

    async def dismiss_recommendation(
        self, user_id: uuid.UUID, recommendation_id: uuid.UUID
    ) -> Recommendation | None:
        stmt = (
            update(Recommendation)
            .where(
                Recommendation.id == recommendation_id,
                Recommendation.user_id == user_id,
            )
            .values(status="dismissed")
            .returning(Recommendation)
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()
