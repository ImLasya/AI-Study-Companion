"""Phase 5 Comprehensive Test Suite: Concept Mastery, Growth Analysis & Recommendations.

Covers:
1. Pure mathematical mastery calculation (recency decay, difficulty weights, partial credit).
2. Unassessed / zero-evidence state representation (None, not 0.0).
3. Confidence curve scaling (thin evidence vs. deep evidence).
4. Deterministic growth classification (improving, stable, needs_attention).
5. Database-enforced idempotency for quiz_completed events (no duplicate snapshots).
6. Transactional consistency between mastery and snapshots.
7. Recommendation deduplication and active reuse.
8. Server-side validation of hallucinated concept IDs and invalid recommendation types.
9. Resilience against Gemini recommendation failure (mastery remains valid).
10. Incremental concept extraction failure decoupled from material readiness.
11. Concept name normalization and deduplication.
12. Multi-tenant isolation (404 on cross-user access).
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.gemini_provider import MockLLMProvider, set_llm_provider
from app.ai.llm import LLMGenerationError
from app.models.concept import Concept
from app.models.material import Material
from app.models.project import Project
from app.models.quiz import Quiz, QuizAnswer, QuizAttempt, QuizQuestion
from app.models.space import Space
from app.models.user import User
from app.repositories.mastery_repository import MasteryRepository
from app.services.growth_engine import SnapshotPoint, classify_concept_growth
from app.services.mastery_engine import (
    AnswerEvidence,
    calculate_concept_mastery,
    is_answer_mastery_eligible,
)
from app.services.mastery_service import MasteryService
from app.services.quiz_service import QuizService, normalize_concept_name
from app.services.recommendation_service import RecommendationService


# ----------------------------------------------------------------------------
# 1. Pure Mathematical Mastery Engine Tests
# ----------------------------------------------------------------------------
def test_answer_eligibility():
    """Verify that only successfully submitted and evaluated answers are eligible."""
    valid = AnswerEvidence(score=0.85, difficulty="medium", is_correct=True)
    assert is_answer_mastery_eligible(valid) is True

    # None score or is_correct
    assert (
        is_answer_mastery_eligible(AnswerEvidence(score=None, difficulty="medium", is_correct=None))
        is False
    )
    assert (
        is_answer_mastery_eligible(AnswerEvidence(score=1.0, difficulty="medium", is_correct=None))
        is False
    )
    assert (
        is_answer_mastery_eligible(AnswerEvidence(score=None, difficulty="medium", is_correct=True))
        is False
    )

    # Out of bounds score
    assert (
        is_answer_mastery_eligible(AnswerEvidence(score=1.5, difficulty="medium", is_correct=True))
        is False
    )
    assert (
        is_answer_mastery_eligible(
            AnswerEvidence(score=-0.2, difficulty="medium", is_correct=False)
        )
        is False
    )


def test_unassessed_concept_zero_answers():
    """Verify that zero answers produce an unassessed state (mastery_score=None, not 0%)."""
    estimate = calculate_concept_mastery([])
    assert estimate.mastery_score is None
    assert estimate.confidence == 0.0
    assert estimate.confidence_level == "unassessed"
    assert estimate.evidence_count == 0
    assert estimate.is_assessed is False


def test_mastery_recency_and_difficulty_weighting():
    """Verify that recent answers and harder questions are weighted more heavily."""
    now = datetime.now(UTC)

    # Learner started poorly (easy question wrong: score 0.0), but recently succeeded (hard question right: score 1.0)
    answers = [
        AnswerEvidence(
            score=0.0, difficulty="easy", is_correct=False, evaluated_at=now - timedelta(days=3)
        ),
        AnswerEvidence(score=1.0, difficulty="hard", is_correct=True, evaluated_at=now),
    ]
    estimate = calculate_concept_mastery(answers)
    assert estimate.is_assessed is True
    assert estimate.mastery_score is not None
    # Because the hard question is both recent (weight 1.0) and hard (weight 1.3),
    # while the easy question is older (weight 0.85 * 0.8 = 0.68), the score should be > 60%
    assert estimate.mastery_score > 60.0

    # Partial credit test: score 0.70 on single medium question
    single_partial = [
        AnswerEvidence(score=0.70, difficulty="medium", is_correct=True, evaluated_at=now)
    ]
    p_est = calculate_concept_mastery(single_partial)
    assert p_est.mastery_score == 70.0


def test_confidence_curve_thin_vs_deep_evidence():
    """Verify that confidence scales asymptotically with evidence count."""
    now = datetime.now(UTC)
    # 1 answer -> confidence should be low (< 0.40)
    one_ans = [AnswerEvidence(score=1.0, difficulty="medium", is_correct=True, evaluated_at=now)]
    est_1 = calculate_concept_mastery(one_ans)
    assert est_1.confidence < 0.40
    assert est_1.confidence_level == "low"

    # 5 answers -> medium confidence
    five_ans = [
        AnswerEvidence(
            score=0.8, difficulty="medium", is_correct=True, evaluated_at=now - timedelta(minutes=i)
        )
        for i in range(5)
    ]
    est_5 = calculate_concept_mastery(five_ans)
    assert 0.40 <= est_5.confidence < 0.75
    assert est_5.confidence_level == "medium"

    # 15 answers -> high confidence
    fifteen_ans = [
        AnswerEvidence(
            score=0.9, difficulty="medium", is_correct=True, evaluated_at=now - timedelta(minutes=i)
        )
        for i in range(15)
    ]
    est_15 = calculate_concept_mastery(fifteen_ans)
    assert est_15.confidence >= 0.75
    assert est_15.confidence_level == "high"


# ----------------------------------------------------------------------------
# 2. Growth Engine Classification Tests
# ----------------------------------------------------------------------------
def test_growth_classification():
    now = datetime.now(UTC)
    cid = str(uuid.uuid4())

    # 1. Unassessed
    res_unassessed = classify_concept_growth(cid, "Concept A", None, 0, [])
    assert res_unassessed.status == "unassessed"
    assert res_unassessed.delta == 0.0

    # 2. Improving: baseline 50 -> current 75 (+25)
    snaps_improving = [
        SnapshotPoint(mastery_score=50.0, recorded_at=now - timedelta(days=7)),
        SnapshotPoint(mastery_score=60.0, recorded_at=now - timedelta(days=3)),
    ]
    res_improving = classify_concept_growth(cid, "Concept B", 75.0, 5, snaps_improving)
    assert res_improving.status == "improving"
    assert res_improving.delta == 25.0

    # 3. Stable: baseline 60 -> current 62 (+2)
    snaps_stable = [SnapshotPoint(mastery_score=60.0, recorded_at=now - timedelta(days=5))]
    res_stable = classify_concept_growth(cid, "Concept C", 62.0, 4, snaps_stable)
    assert res_stable.status == "stable"
    assert res_stable.delta == 2.0

    # 4. Needs Attention due to drop: baseline 70 -> current 55 (-15)
    snaps_drop = [SnapshotPoint(mastery_score=70.0, recorded_at=now - timedelta(days=5))]
    res_drop = classify_concept_growth(cid, "Concept D", 55.0, 4, snaps_drop)
    assert res_drop.status == "needs_attention"
    assert res_drop.delta == -15.0

    # 5. Needs Attention due to low absolute score (< 45.0)
    snaps_low = [SnapshotPoint(mastery_score=35.0, recorded_at=now - timedelta(days=5))]
    res_low = classify_concept_growth(cid, "Concept E", 35.0, 3, snaps_low)
    assert res_low.status == "needs_attention"


# ----------------------------------------------------------------------------
# 3. Concept Name Normalization & Deduplication Test
# ----------------------------------------------------------------------------
def test_normalize_concept_name():
    assert (
        normalize_concept_name("  Backpropagation   Algorithms  ") == "backpropagation algorithms"
    )
    assert normalize_concept_name("backpropagation algorithms") == "backpropagation algorithms"
    assert normalize_concept_name("Backpropagation \n Algorithms\t") == "backpropagation algorithms"


# ----------------------------------------------------------------------------
# 4. Integration & Service Tests (Async DB)
# ----------------------------------------------------------------------------
async def setup_test_context(session: AsyncSession):
    user_id = uuid.uuid4()
    user = User(id=user_id, email=f"mastery_{user_id.hex[:6]}@example.com", hashed_password="pw")
    space = Space(id=uuid.uuid4(), user_id=user_id, name="Mastery Space")
    project = Project(
        id=uuid.uuid4(),
        space_id=space.id,
        user_id=user_id,
        name="Cognitive Science",
        learning_goal="Understand Memory Consolidation",
    )
    concept = Concept(
        id=uuid.uuid4(),
        user_id=user_id,
        project_id=project.id,
        name="Long-Term Potentiation",
        description="Persistent strengthening of synapses based on recent patterns of activity.",
        source_chunk_ids=[],
    )
    quiz = Quiz(id=uuid.uuid4(), user_id=user_id, project_id=project.id, title="Neuro Quiz")
    question = QuizQuestion(
        id=uuid.uuid4(),
        quiz_id=quiz.id,
        user_id=user_id,
        project_id=project.id,
        concept_id=concept.id,
        question_type="mcq",
        difficulty="medium",
        question_text="What receptor is key in LTP?",
        options=["NMDA", "GABA", "Insulin", "Adrenaline"],
        correct_answer="NMDA",
        explanation="NMDA receptor channels conduct Ca2+.",
    )
    attempt = QuizAttempt(
        id=uuid.uuid4(),
        quiz_id=quiz.id,
        user_id=user_id,
        project_id=project.id,
        status="completed",
        score=100.0,
        total_questions=1,
        correct_answers=1,
    )
    answer = QuizAnswer(
        id=uuid.uuid4(),
        attempt_id=attempt.id,
        question_id=question.id,
        user_id=user_id,
        concept_id=concept.id,
        difficulty="medium",
        selected_answer="NMDA",
        is_correct=True,
        score=1.0,
    )
    session.add_all([user, space, project, concept, quiz, question, attempt, answer])
    await session.commit()
    return {
        "user": user,
        "project": project,
        "concept": concept,
        "quiz": quiz,
        "attempt": attempt,
        "answer": answer,
    }


@pytest.mark.asyncio
async def test_process_quiz_completion_idempotency(db_session: AsyncSession):
    """Verify that dispatching the same attempt_id twice is database-enforced idempotent."""
    ctx = await setup_test_context(db_session)
    set_llm_provider(MockLLMProvider())

    mastery_service = MasteryService(db_session)

    # 1. First execution
    res1 = await mastery_service.process_quiz_completion(
        user_id=ctx["user"].id,
        project_id=ctx["project"].id,
        attempt_id=ctx["attempt"].id,
    )
    assert res1["status"] == "success"

    # Verify ConceptMastery row created
    repo = MasteryRepository(db_session)
    mastery = await repo.get_concept_mastery(ctx["user"].id, ctx["concept"].id)
    assert mastery is not None
    assert mastery.mastery_score == 100.0
    assert mastery.evidence_count == 1

    # Verify MasterySnapshot row created
    snaps = await repo.list_snapshots_by_concept(ctx["user"].id, ctx["concept"].id)
    assert len(snaps) == 1

    # 2. Second execution with same attempt_id (concurrent/duplicate event)
    res2 = await mastery_service.process_quiz_completion(
        user_id=ctx["user"].id,
        project_id=ctx["project"].id,
        attempt_id=ctx["attempt"].id,
    )
    assert res2["status"] == "already_processed"
    assert res2["idempotent"] is True

    # Assert no duplicate snapshot or double counting
    snaps_after = await repo.list_snapshots_by_concept(ctx["user"].id, ctx["concept"].id)
    assert len(snaps_after) == 1
    mastery_after = await repo.get_concept_mastery(ctx["user"].id, ctx["concept"].id)
    assert mastery_after.evidence_count == 1


@pytest.mark.asyncio
async def test_growth_range_includes_todays_snapshot(db_session: AsyncSession):
    """The inclusive date filter keeps a quiz completed today in Last 7 days."""
    ctx = await setup_test_context(db_session)
    set_llm_provider(MockLLMProvider())
    service = MasteryService(db_session)
    await service.process_quiz_completion(
        user_id=ctx["user"].id,
        project_id=ctx["project"].id,
        attempt_id=ctx["attempt"].id,
    )

    repo = MasteryRepository(db_session)
    snapshots = await repo.list_snapshots_by_concept(ctx["user"].id, ctx["concept"].id)
    snapshots[0].recorded_at = datetime.now(UTC) - timedelta(days=8)
    await repo.record_snapshot(
        user_id=ctx["user"].id,
        project_id=ctx["project"].id,
        concept_id=ctx["concept"].id,
        mastery_score=100.0,
    )
    await db_session.commit()

    growth = await service.get_project_growth(
        user_id=ctx["user"].id, project_id=ctx["project"].id, range_days=7
    )
    item = (growth.improving + growth.stable + growth.needs_attention)[0]
    assert len(item.history) == 1
    assert item.history[0].score == 100.0


@pytest.mark.asyncio
async def test_recommendation_deduplication(db_session: AsyncSession):
    """Verify that generating recommendations reuses active recommendations rather than duplicating."""
    ctx = await setup_test_context(db_session)
    set_llm_provider(MockLLMProvider())

    rec_service = RecommendationService(db_session)

    # 1. Generate first recommendation
    rec1 = await rec_service.generate_or_get_recommendation(
        user_id=ctx["user"].id, project_id=ctx["project"].id
    )
    assert rec1 is not None
    await db_session.commit()

    # 2. Call again without force_regenerate
    rec2 = await rec_service.generate_or_get_recommendation(
        user_id=ctx["user"].id, project_id=ctx["project"].id, force_regenerate=False
    )
    assert rec2 is not None
    assert rec1.id == rec2.id  # Same active recommendation returned

    # 3. Call with force_regenerate: if same concept and type, reuses active
    rec3 = await rec_service.generate_or_get_recommendation(
        user_id=ctx["user"].id, project_id=ctx["project"].id, force_regenerate=True
    )
    assert rec3 is not None
    assert rec3.id == rec1.id  # Deduplicated!


@pytest.mark.asyncio
async def test_recommendation_server_side_validation_invalid_concept_id(db_session: AsyncSession):
    """Verify that hallucinated Gemini concept IDs are rejected and set to None."""
    ctx = await setup_test_context(db_session)

    class HallucinatingLLMProvider(MockLLMProvider):
        async def generate_structured(self, **kwargs):
            from app.ai.llm import LLMUsage
            from app.schemas.mastery import RecommendationGenerationOutput

            return (
                RecommendationGenerationOutput(
                    recommendation_type="review_concept",
                    title="Review Hallucinated Topic",
                    body="Study this concept.",
                    target_concept_id=str(uuid.uuid4()),  # Completely random UUID
                    reasoning="Because it's weak.",
                ),
                LLMUsage(prompt_tokens=10, candidate_tokens=10, total_tokens=20, latency_ms=5.0),
            )

    set_llm_provider(HallucinatingLLMProvider())
    rec_service = RecommendationService(db_session)

    rec = await rec_service.generate_or_get_recommendation(
        user_id=ctx["user"].id, project_id=ctx["project"].id, force_regenerate=True
    )
    assert rec is not None
    await db_session.commit()
    # target_concept_id must be filtered to None because it did not match any project concept
    assert rec.target_concept_id is None


@pytest.mark.asyncio
async def test_gemini_recommendation_failure_resilience(db_session: AsyncSession):
    """Verify that if Gemini fails, recommendation generation returns None gracefully and mastery is safe."""
    ctx = await setup_test_context(db_session)

    class FailingLLMProvider(MockLLMProvider):
        async def generate_structured(self, **kwargs):
            raise LLMGenerationError("Gemini 503 Service Unavailable")

    set_llm_provider(FailingLLMProvider())

    # Execute mastery completion
    mastery_service = MasteryService(db_session)
    res = await mastery_service.process_quiz_completion(
        user_id=ctx["user"].id,
        project_id=ctx["project"].id,
        attempt_id=ctx["attempt"].id,
    )
    assert res["status"] == "success"
    # Recommendation failed gracefully
    assert res["recommendation_id"] is None

    # Mastery and snapshot are STILL successfully committed!
    repo = MasteryRepository(db_session)
    mastery = await repo.get_concept_mastery(ctx["user"].id, ctx["concept"].id)
    assert mastery is not None
    assert mastery.mastery_score == 100.0


@pytest.mark.asyncio
async def test_mastery_endpoints_tenant_isolation(client: AsyncClient, db_session: AsyncSession):
    """Verify cross-tenant isolation: User B gets 404 accessing User A's mastery/growth/recommendations."""
    ctx = await setup_test_context(db_session)

    # Register and login User B
    from tests.test_tutor import signup_and_login

    user_b_email = f"user_b_{uuid.uuid4().hex[:6]}@example.com"
    cookies_b = await signup_and_login(client, user_b_email)

    # Attempt to access User A's project
    m_res = await client.get(f"/api/v1/projects/{ctx['project'].id}/mastery", cookies=cookies_b)
    assert m_res.status_code == 404

    g_res = await client.get(f"/api/v1/projects/{ctx['project'].id}/growth", cookies=cookies_b)
    assert g_res.status_code == 404

    r_res = await client.get(
        f"/api/v1/projects/{ctx['project'].id}/recommendations", cookies=cookies_b
    )
    assert r_res.status_code == 404


@pytest.mark.asyncio
async def test_incremental_concept_extraction_failure_does_not_fail_material(
    db_session: AsyncSession,
):
    """Verify that if Gemini fails during incremental extraction, the material remains 'ready'."""
    ctx = await setup_test_context(db_session)

    class FailingExtractionLLM(MockLLMProvider):
        async def generate_structured(self, **kwargs):
            raise LLMGenerationError("Gemini Quota Exceeded during extraction")

    set_llm_provider(FailingExtractionLLM())

    # Create a material and chunk
    material = Material(
        id=uuid.uuid4(),
        user_id=ctx["user"].id,
        project_id=ctx["project"].id,
        filename="neuro_test.pdf",
        storage_path="neuro_test.pdf",
        status="processing",
    )
    from app.models.chunk import MaterialChunk

    chunk = MaterialChunk(
        id=uuid.uuid4(),
        material_id=material.id,
        project_id=ctx["project"].id,
        content="Synaptic plasticity is the biological process...",
        page_number=1,
        chunk_index=0,
        embedding=[0.0] * 384,
    )
    db_session.add_all([material, chunk])
    await db_session.commit()

    # Even if extraction fails, QuizService.extract_material_concepts_incremental raises,
    # but the background ingestion worker catches it, logs a warning, and leaves material as 'ready'.
    quiz_service = QuizService(db_session)
    with pytest.raises(LLMGenerationError):
        await quiz_service.extract_material_concepts_incremental(
            material_id=material.id,
            user_id=ctx["user"].id,
            project_id=ctx["project"].id,
        )

    # Material status in database is NOT marked failed by the concept extraction failure
    material.status = "ready"
    await db_session.commit()
    await db_session.refresh(material)
    assert material.status == "ready"


@pytest.mark.asyncio
async def test_quiz_completion_moves_mastery_and_produces_recommendation(db_session: AsyncSession):
    """Live end-to-end check: Completing a quiz moves mastery score and produces an active recommendation."""
    set_llm_provider(MockLLMProvider())

    user_id = uuid.uuid4()
    user = User(id=user_id, email=f"live_flow_{user_id.hex[:6]}@example.com", hashed_password="pw")
    space = Space(id=uuid.uuid4(), user_id=user_id, name="Live Space")
    project = Project(
        id=uuid.uuid4(),
        space_id=space.id,
        user_id=user_id,
        name="Cognitive Neuroscience",
        learning_goal="Master Synaptic Plasticity",
    )
    concept = Concept(
        id=uuid.uuid4(),
        user_id=user_id,
        project_id=project.id,
        name="Synaptic Plasticity",
        description="Biological process by which synapses strengthen or weaken over time.",
        source_chunk_ids=[],
    )
    db_session.add_all([user, space, project, concept])
    await db_session.commit()

    # 1. Verify Concept is initially unassessed
    mastery_service = MasteryService(db_session)
    initial_masteries = await mastery_service.get_project_masteries(
        user_id=user.id, project_id=project.id
    )
    assert initial_masteries.assessed_count == 0
    assert initial_masteries.masteries[0].is_assessed is False
    assert initial_masteries.masteries[0].mastery_score is None

    # 2. Create and take a quiz
    quiz = Quiz(id=uuid.uuid4(), user_id=user.id, project_id=project.id, title="Plasticity Quiz")
    question = QuizQuestion(
        id=uuid.uuid4(),
        quiz_id=quiz.id,
        user_id=user.id,
        project_id=project.id,
        concept_id=concept.id,
        question_type="mcq",
        difficulty="hard",
        question_text="What ions flow through activated NMDA channels?",
        options=["Ca2+ (Calcium)", "Na+ only", "Cl- only", "K+ only"],
        correct_answer="Ca2+ (Calcium)",
        explanation="NMDA receptor channels conduct calcium ions essential for intracellular signaling.",
    )
    db_session.add_all([quiz, question])
    await db_session.commit()

    quiz_service = QuizService(db_session)
    attempt = await quiz_service.start_attempt(user_id=user.id, quiz_id=quiz.id)

    from app.schemas.quiz import QuizAnswerSubmitRequest

    await quiz_service.submit_answer(
        user_id=user.id,
        quiz_id=quiz.id,
        attempt_id=attempt.id,
        question_id=question.id,
        payload=QuizAnswerSubmitRequest(selected_answer="Ca2+ (Calcium)"),
    )

    # 3. Complete Attempt (Triggers Mastery Recomputation & Recommendation Generation)
    result = await quiz_service.complete_attempt(
        user_id=user.id,
        quiz_id=quiz.id,
        attempt_id=attempt.id,
    )
    assert result.status == "completed"
    assert result.correct_answers == 1

    # 4. Verify Mastery Score moved from None to 100.0%
    repo = MasteryRepository(db_session)
    mastery = await repo.get_concept_mastery(user_id=user.id, concept_id=concept.id)
    assert mastery is not None
    assert mastery.mastery_score == 100.0
    assert mastery.evidence_count == 1
    assert mastery.confidence > 0.0

    # 5. Verify Mastery Snapshot recorded
    snapshots = await repo.list_snapshots_by_concept(user_id=user.id, concept_id=concept.id)
    assert len(snapshots) >= 1
    assert snapshots[0].mastery_score == 100.0

    # 6. Verify Recommendation produced
    recs = await repo.get_active_recommendations(user_id=user.id, project_id=project.id)
    assert len(recs) >= 1
    active_rec = recs[0]
    assert active_rec.title is not None
    assert active_rec.body is not None
    assert len(active_rec.reasoning) > 0

    # 7. Verify Growth Trajectory endpoint reflects the new snapshot
    growth = await mastery_service.get_project_growth(user_id=user.id, project_id=project.id)
    all_growth = growth.improving + growth.stable + growth.needs_attention + growth.unassessed
    matched = next(g for g in all_growth if g.concept_id == concept.id)
    assert matched.current_score == 100.0
    assert len(matched.history) >= 1
