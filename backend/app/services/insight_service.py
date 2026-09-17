"""Learning Insight Service.

Analyzes learner activity (quiz mistakes, mastery progression, unassessed concepts)
and generates non-destructive, advisory learning insights in the background.

CRITICAL INVARIANT:
Learning insights are strictly informational and advisory.
This service NEVER directly mutates concept mastery or overwrites authoritative mastery scores.
"""

from collections import defaultdict
from datetime import UTC, datetime
import logging
import uuid

from sqlalchemy import delete, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.concept import Concept
from app.models.insight import LearningInsight
from app.models.mastery import ConceptMastery
from app.models.quiz import QuizAnswer, QuizAttempt, QuizQuestion

logger = logging.getLogger("ai_study_companion.services.insight")


class InsightService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_insights(
        self, user_id: uuid.UUID, project_id: uuid.UUID, limit: int = 20
    ) -> list[LearningInsight]:
        """Fetch all learning insights for a user in a project, newest first."""
        stmt = (
            select(LearningInsight)
            .where(
                LearningInsight.user_id == user_id,
                LearningInsight.project_id == project_id,
            )
            .order_by(desc(LearningInsight.created_at))
            .limit(limit)
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def generate_insights_for_project(
        self, user_id: uuid.UUID, project_id: uuid.UUID
    ) -> list[LearningInsight]:
        """Generate advisory insights for a user's project without mutating mastery."""
        generated: list[LearningInsight] = []

        # 1. Detect Repeated Mistakes on specific concepts
        mistakes_stmt = (
            select(QuizAnswer, QuizQuestion.question_text, Concept.id, Concept.name)
            .join(QuizAttempt, QuizAnswer.attempt_id == QuizAttempt.id)
            .join(QuizQuestion, QuizAnswer.question_id == QuizQuestion.id)
            .outerjoin(Concept, QuizQuestion.concept_id == Concept.id)
            .where(
                QuizAttempt.project_id == project_id,
                QuizAnswer.user_id == user_id,
                QuizAnswer.is_correct.is_(False),
            )
            .order_by(desc(QuizAnswer.evaluated_at))
            .limit(20)
        )
        mistakes_res = await self.session.execute(mistakes_stmt)
        concept_mistakes: dict[uuid.UUID, list[tuple[str, str]]] = defaultdict(list)
        for ans, q_text, c_id, c_name in mistakes_res.all():
            if c_id:
                concept_mistakes[c_id].append((c_name or "Unknown", q_text))

        for c_id, mistakes in concept_mistakes.items():
            if len(mistakes) >= 2:
                c_name = mistakes[0][0]
                insight = LearningInsight(
                    id=uuid.uuid4(),
                    user_id=user_id,
                    project_id=project_id,
                    insight_type="repeated_mistake",
                    title=f"Recurring Difficulty: {c_name}",
                    content=(
                        f"You have missed {len(mistakes)} questions related to '{c_name}'. "
                        "Consider reviewing this concept in your study materials or asking the AI Tutor for a step-by-step breakdown."
                    ),
                    metadata_json={
                        "concept_id": str(c_id),
                        "concept_name": c_name,
                        "mistake_count": len(mistakes),
                    },
                    created_at=datetime.now(UTC),
                )
                generated.append(insight)

        # 2. Detect Weak Concepts (< 60% mastery score)
        weak_stmt = (
            select(ConceptMastery, Concept.name)
            .join(Concept, ConceptMastery.concept_id == Concept.id)
            .where(
                ConceptMastery.user_id == user_id,
                ConceptMastery.project_id == project_id,
                ConceptMastery.mastery_score.is_not(None),
                ConceptMastery.mastery_score < 0.6,
            )
            .order_by(ConceptMastery.mastery_score.asc())
            .limit(3)
        )
        weak_res = await self.session.execute(weak_stmt)
        for mastery, c_name in weak_res.all():
            score_pct = int((mastery.mastery_score or 0) * 100)
            insight = LearningInsight(
                id=uuid.uuid4(),
                user_id=user_id,
                project_id=project_id,
                insight_type="weak_concept",
                title=f"Target Area: {c_name}",
                content=(
                    f"Your current estimated mastery for '{c_name}' is {score_pct}%. "
                    "A short targeted quiz or focused reading will help solidify this foundation."
                ),
                metadata_json={
                    "concept_id": str(mastery.concept_id),
                    "concept_name": c_name,
                    "mastery_score": mastery.mastery_score,
                },
                created_at=datetime.now(UTC),
            )
            generated.append(insight)

        # 3. Detect Improving / Strong Concepts (mastery >= 80%)
        improving_stmt = (
            select(ConceptMastery, Concept.name)
            .join(Concept, ConceptMastery.concept_id == Concept.id)
            .where(
                ConceptMastery.user_id == user_id,
                ConceptMastery.project_id == project_id,
                ConceptMastery.mastery_score >= 0.8,
            )
            .order_by(ConceptMastery.mastery_score.desc())
            .limit(2)
        )
        improving_res = await self.session.execute(improving_stmt)
        for mastery, c_name in improving_res.all():
            score_pct = int((mastery.mastery_score or 0) * 100)
            insight = LearningInsight(
                id=uuid.uuid4(),
                user_id=user_id,
                project_id=project_id,
                insight_type="improving_concept",
                title=f"Strong Mastery: {c_name}",
                content=(
                    f"Excellent work! You have achieved {score_pct}% mastery on '{c_name}'. "
                    "You are ready to advance to more complex and higher difficulty topics."
                ),
                metadata_json={
                    "concept_id": str(mastery.concept_id),
                    "concept_name": c_name,
                    "mastery_score": mastery.mastery_score,
                },
                created_at=datetime.now(UTC),
            )
            generated.append(insight)

        # 4. Check for unassessed concepts if few insights generated
        if not generated:
            unassessed_stmt = (
                select(Concept)
                .outerjoin(
                    ConceptMastery,
                    (Concept.id == ConceptMastery.concept_id) & (ConceptMastery.user_id == user_id),
                )
                .where(
                    Concept.project_id == project_id,
                    ConceptMastery.id.is_(None),
                )
                .limit(1)
            )
            unassessed_res = await self.session.execute(unassessed_stmt)
            unassessed = unassessed_res.scalar_one_or_none()
            if unassessed:
                insight = LearningInsight(
                    id=uuid.uuid4(),
                    user_id=user_id,
                    project_id=project_id,
                    insight_type="review_prompt",
                    title=f"Ready to Explore: {unassessed.name}",
                    content=(
                        f"You have not been assessed on '{unassessed.name}' yet. "
                        "Take a quick practice quiz to establish your baseline!"
                    ),
                    metadata_json={"concept_id": str(unassessed.id), "concept_name": unassessed.name},
                    created_at=datetime.now(UTC),
                )
                generated.append(insight)

        # Persist new insights (clean old ones of same type to avoid clutter)
        if generated:
            for ins in generated:
                # Remove prior insight of same type and title for this user & project
                await self.session.execute(
                    delete(LearningInsight).where(
                        LearningInsight.user_id == user_id,
                        LearningInsight.project_id == project_id,
                        LearningInsight.title == ins.title,
                    )
                )
                self.session.add(ins)
            await self.session.commit()

        return generated
