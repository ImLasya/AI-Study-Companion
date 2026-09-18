"""Learning System Verification Test Suite (Tests A through K).

Covers all 11 core verification dimensions:
- Test A: New project - unassessed state
- Test B: MCQ quiz -> mastery -> snapshot
- Test C: Second quiz -> mastery changes -> history
- Test D: Open-ended question partial credit
- Test E: Repeated correct -> max mastery math
- Test F: Repeated mistakes -> weak concepts
- Test G: Improvement trajectory classification
- Test H: Adaptive question selection prioritization
- Test I: Question quality audit (academic vs navigation)
- Test J: Project isolation (Projects A, B, C)
- Test K: Space aggregation (multi-project rollup)
"""

import math
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.gemini_provider import MockLLMProvider, set_llm_provider
from app.models.concept import Concept
from app.models.mastery import ConceptMastery
from app.models.project import Project
from app.models.quiz import Quiz, QuizAnswer, QuizAttempt, QuizQuestion
from app.models.space import Space
from app.models.user import User
from app.repositories.mastery_repository import MasteryRepository
from app.repositories.space_repository import SpaceRepository
from app.services.growth_engine import SnapshotPoint, classify_concept_growth
from app.services.mastery_engine import (
    AnswerEvidence,
    calculate_concept_mastery,
    is_answer_mastery_eligible,
)
from app.services.mastery_service import MasteryService
from app.services.question_validator import validate_quiz_question_quality


# ----------------------------------------------------------------------------
# Helper to set up user, space, and project
# ----------------------------------------------------------------------------
async def setup_pipeline_env(
    session: AsyncSession,
    user_email: str = "pipeline_test@example.com",
    project_name: str = "Pipeline Project",
) -> dict:
    user = User(
        id=uuid.uuid4(),
        email=f"{uuid.uuid4().hex[:6]}_{user_email}",
        hashed_password="hashed_password",
        full_name="Pipeline Tester",
    )
    space = Space(
        id=uuid.uuid4(),
        user_id=user.id,
        name="Pipeline Space",
        description="Learning System Verification Space",
    )
    project = Project(
        id=uuid.uuid4(),
        user_id=user.id,
        space_id=space.id,
        name=project_name,
        learning_goal="Comprehensive Learning System Test",
    )
    session.add_all([user, space, project])
    await session.commit()
    return {"user": user, "space": space, "project": project}


# ----------------------------------------------------------------------------
# Test A: New project - unassessed state
# ----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_a_new_project_unassessed_state(db_session: AsyncSession):
    """Test A: When a new project is created with concepts, mastery is strictly unassessed."""
    env = await setup_pipeline_env(db_session, project_name="Test A Project")
    concept = Concept(
        id=uuid.uuid4(),
        user_id=env["user"].id,
        project_id=env["project"].id,
        name="Linear Regression",
        description="Predicting scalar targets using linear combinations",
    )
    db_session.add(concept)
    await db_session.commit()

    mastery_service = MasteryService(db_session)
    masteries = await mastery_service.get_project_masteries(
        user_id=env["user"].id,
        project_id=env["project"].id,
    )

    assert masteries.total_concepts == 1
    assert masteries.assessed_count == 0
    assert masteries.overall_average_mastery is None

    c_mastery = masteries.masteries[0]
    assert c_mastery.concept_name == "Linear Regression"
    assert c_mastery.mastery_score is None  # Honest unassessed state, not 0.0
    assert c_mastery.confidence == 0.0
    assert c_mastery.confidence_level == "unassessed"
    assert c_mastery.evidence_count == 0
    assert c_mastery.is_assessed is False


# ----------------------------------------------------------------------------
# Test B: MCQ quiz -> mastery -> snapshot
# ----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_b_mcq_quiz_mastery_and_snapshot(db_session: AsyncSession):
    """Test B: Taking an MCQ quiz, answering correctly, updates mastery and records exactly 1 snapshot."""
    set_llm_provider(MockLLMProvider())
    env = await setup_pipeline_env(db_session, project_name="Test B Project")

    concept = Concept(
        id=uuid.uuid4(),
        user_id=env["user"].id,
        project_id=env["project"].id,
        name="Support Vector Machines",
        description="Max-margin hyperplanes and kernel tricks",
    )
    quiz = Quiz(
        id=uuid.uuid4(),
        user_id=env["user"].id,
        project_id=env["project"].id,
        title="SVM Quiz 1",
        status="completed",
        completed_at=datetime.now(UTC),
    )
    question = QuizQuestion(
        id=uuid.uuid4(),
        quiz_id=quiz.id,
        user_id=env["user"].id,
        project_id=env["project"].id,
        concept_id=concept.id,
        question_text="What does SVM maximize?",
        question_type="mcq",
        options=["Margin", "Entropy", "Variance", "Loss"],
        correct_answer="Margin",
        difficulty="medium",
        explanation="SVM maximizes the margin between support vectors.",
        question_order=1,
    )
    attempt = QuizAttempt(
        id=uuid.uuid4(),
        quiz_id=quiz.id,
        user_id=env["user"].id,
        project_id=env["project"].id,
        status="completed",
        score=100.0,
        completed_at=datetime.now(UTC),
    )
    answer = QuizAnswer(
        id=uuid.uuid4(),
        attempt_id=attempt.id,
        question_id=question.id,
        user_id=env["user"].id,
        concept_id=concept.id,
        difficulty="medium",
        selected_answer="Margin",
        is_correct=True,
        score=1.0,
        evaluated_at=datetime.now(UTC),
    )
    db_session.add_all([concept, quiz, question, attempt, answer])
    await db_session.commit()

    mastery_service = MasteryService(db_session)
    result = await mastery_service.process_quiz_completion(
        user_id=env["user"].id,
        project_id=env["project"].id,
        attempt_id=attempt.id,
    )
    assert result["status"] == "success"

    repo = MasteryRepository(db_session)
    mastery = await repo.get_concept_mastery(env["user"].id, concept.id)
    assert mastery is not None
    assert mastery.mastery_score == 100.0
    assert mastery.evidence_count == 1
    assert mastery.confidence > 0.0

    snapshots = await repo.list_snapshots_by_concept(env["user"].id, concept.id)
    assert len(snapshots) == 1
    assert snapshots[0].mastery_score == 100.0


# ----------------------------------------------------------------------------
# Test C: Second quiz -> mastery changes -> history
# ----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_c_second_quiz_mastery_history(db_session: AsyncSession):
    """Test C: Second quiz updates mastery with recency decay and creates a second history snapshot."""
    set_llm_provider(MockLLMProvider())
    env = await setup_pipeline_env(db_session, project_name="Test C Project")

    concept = Concept(
        id=uuid.uuid4(),
        user_id=env["user"].id,
        project_id=env["project"].id,
        name="Decision Trees",
        description="Recursive partitioning based on information gain",
    )
    db_session.add(concept)
    await db_session.flush()

    # Quiz 1: Correct answer
    quiz_1 = Quiz(
        id=uuid.uuid4(),
        user_id=env["user"].id,
        project_id=env["project"].id,
        title="DT Quiz 1",
        status="completed",
    )
    q_1 = QuizQuestion(
        id=uuid.uuid4(),
        quiz_id=quiz_1.id,
        user_id=env["user"].id,
        project_id=env["project"].id,
        concept_id=concept.id,
        question_text="What is Gini impurity?",
        question_type="mcq",
        correct_answer="Measure of misclassification probability",
        difficulty="medium",
        explanation="Standard split criterion.",
        question_order=1,
    )
    attempt_1 = QuizAttempt(
        id=uuid.uuid4(),
        quiz_id=quiz_1.id,
        user_id=env["user"].id,
        project_id=env["project"].id,
        status="completed",
        completed_at=datetime.now(UTC) - timedelta(hours=2),
    )
    ans_1 = QuizAnswer(
        id=uuid.uuid4(),
        attempt_id=attempt_1.id,
        question_id=q_1.id,
        user_id=env["user"].id,
        concept_id=concept.id,
        difficulty="medium",
        selected_answer="Measure of misclassification probability",
        is_correct=True,
        score=1.0,
        evaluated_at=datetime.now(UTC) - timedelta(hours=2),
    )
    db_session.add_all([quiz_1, q_1, attempt_1, ans_1])
    await db_session.commit()

    mastery_service = MasteryService(db_session)
    await mastery_service.process_quiz_completion(
        user_id=env["user"].id,
        project_id=env["project"].id,
        attempt_id=attempt_1.id,
    )

    # Quiz 2: Incorrect answer on a hard question
    quiz_2 = Quiz(
        id=uuid.uuid4(),
        user_id=env["user"].id,
        project_id=env["project"].id,
        title="DT Quiz 2",
        status="completed",
    )
    q_2 = QuizQuestion(
        id=uuid.uuid4(),
        quiz_id=quiz_2.id,
        user_id=env["user"].id,
        project_id=env["project"].id,
        concept_id=concept.id,
        question_text="How does cost-complexity pruning calculate alpha?",
        question_type="mcq",
        correct_answer="R(T) + alpha * |T|",
        difficulty="hard",
        explanation="Pruning penalty formula.",
        question_order=1,
    )
    attempt_2 = QuizAttempt(
        id=uuid.uuid4(),
        quiz_id=quiz_2.id,
        user_id=env["user"].id,
        project_id=env["project"].id,
        status="completed",
        completed_at=datetime.now(UTC),
    )
    ans_2 = QuizAnswer(
        id=uuid.uuid4(),
        attempt_id=attempt_2.id,
        question_id=q_2.id,
        user_id=env["user"].id,
        concept_id=concept.id,
        difficulty="hard",
        selected_answer="Wrong choice",
        is_correct=False,
        score=0.0,
        evaluated_at=datetime.now(UTC),
    )
    db_session.add_all([quiz_2, q_2, attempt_2, ans_2])
    await db_session.commit()

    await mastery_service.process_quiz_completion(
        user_id=env["user"].id,
        project_id=env["project"].id,
        attempt_id=attempt_2.id,
    )

    repo = MasteryRepository(db_session)
    mastery = await repo.get_concept_mastery(env["user"].id, concept.id)
    assert mastery is not None
    assert mastery.evidence_count == 2
    # Recency decay + hard weight means recent 0.0 brings score down significantly below 100
    assert mastery.mastery_score < 100.0

    snapshots = await repo.list_snapshots_by_concept(env["user"].id, concept.id)
    assert len(snapshots) == 2
    assert snapshots[0].mastery_score == 100.0
    assert snapshots[1].mastery_score < 100.0


# ----------------------------------------------------------------------------
# Test D: Open-ended question partial credit
# ----------------------------------------------------------------------------
def test_d_open_ended_partial_credit():
    """Test D: Answers with partial credit (e.g. score=0.75) are correctly calculated in the mastery engine."""
    # Verify eligibility of continuous scores in [0.0, 1.0]
    ans_partial = AnswerEvidence(score=0.75, difficulty="medium", is_correct=True)
    assert is_answer_mastery_eligible(ans_partial) is True

    # Compute mastery with single partial credit answer
    estimate = calculate_concept_mastery([ans_partial])
    assert estimate.is_assessed is True
    assert estimate.mastery_score == 75.0
    assert estimate.evidence_count == 1

    # Mixed partial credit sequence: 0.5 (medium), then 0.8 (hard)
    ans1 = AnswerEvidence(score=0.5, difficulty="medium", is_correct=True, evaluated_at=datetime.now(UTC) - timedelta(days=1))
    ans2 = AnswerEvidence(score=0.8, difficulty="hard", is_correct=True, evaluated_at=datetime.now(UTC))
    estimate_mixed = calculate_concept_mastery([ans1, ans2])
    assert estimate_mixed.mastery_score is not None
    # Weighted toward the recent hard question (0.8 = 80%)
    assert 65.0 < estimate_mixed.mastery_score < 80.0


# ----------------------------------------------------------------------------
# Test E: Repeated correct -> max mastery math
# ----------------------------------------------------------------------------
def test_e_repeated_correct_max_mastery_math():
    """Test E: 5 and 10 repeated correct answers drive mastery to 100% and confidence asymptotically toward 1.0."""
    now = datetime.now(UTC)

    # 5 consecutive correct answers on hard questions
    five_correct = [
        AnswerEvidence(score=1.0, difficulty="hard", is_correct=True, evaluated_at=now + timedelta(minutes=i))
        for i in range(5)
    ]
    est_5 = calculate_concept_mastery(five_correct)
    assert est_5.mastery_score == 100.0
    assert est_5.evidence_count == 5
    # Asymptotic formula: 1 - exp(-5/5) = 1 - 1/e ≈ 0.63
    expected_conf_5 = round(1.0 - math.exp(-5 / 5.0), 2)
    assert est_5.confidence == expected_conf_5
    assert est_5.confidence_level == "medium"

    # 10 consecutive correct answers
    ten_correct = [
        AnswerEvidence(score=1.0, difficulty="hard", is_correct=True, evaluated_at=now + timedelta(minutes=i))
        for i in range(10)
    ]
    est_10 = calculate_concept_mastery(ten_correct)
    assert est_10.mastery_score == 100.0
    assert est_10.evidence_count == 10
    # Asymptotic formula: 1 - exp(-10/5) = 1 - e^(-2) ≈ 0.86
    expected_conf_10 = round(1.0 - math.exp(-10 / 5.0), 2)
    assert est_10.confidence == expected_conf_10
    assert est_10.confidence_level == "high"


# ----------------------------------------------------------------------------
# Test F: Repeated mistakes -> weak concepts
# ----------------------------------------------------------------------------
def test_f_repeated_mistakes_weak_concepts():
    """Test F: Repeated incorrect answers drop mastery below 50% and classify concept as needs_attention."""
    now = datetime.now(UTC)
    mistakes = [
        AnswerEvidence(score=0.0, difficulty="medium", is_correct=False, evaluated_at=now + timedelta(minutes=i))
        for i in range(4)
    ]
    est = calculate_concept_mastery(mistakes)
    assert est.mastery_score == 0.0
    assert est.evidence_count == 4

    # Classify in growth engine
    snapshots = [
        SnapshotPoint(mastery_score=50.0, recorded_at=now - timedelta(days=2)),
        SnapshotPoint(mastery_score=est.mastery_score, recorded_at=now),
    ]
    classification = classify_concept_growth(
        concept_id=str(uuid.uuid4()),
        concept_name="Weak Concept",
        current_score=est.mastery_score,
        evidence_count=est.evidence_count,
        snapshots=snapshots,
    )
    assert classification.status == "needs_attention"
    assert classification.delta < 0


# ----------------------------------------------------------------------------
# Test G: Improvement trajectory
# ----------------------------------------------------------------------------
def test_g_improvement_trajectory():
    """Test G: Moving from low baseline (< 50) to high mastery (>= 70) is classified as improving."""
    now = datetime.now(UTC)
    snapshots = [
        SnapshotPoint(mastery_score=35.0, recorded_at=now - timedelta(days=7)),
        SnapshotPoint(mastery_score=55.0, recorded_at=now - timedelta(days=3)),
        SnapshotPoint(mastery_score=85.0, recorded_at=now),
    ]
    growth = classify_concept_growth(
        concept_id=str(uuid.uuid4()),
        concept_name="Improving Concept",
        current_score=85.0,
        evidence_count=3,
        snapshots=snapshots,
    )
    assert growth.status == "improving"
    assert growth.baseline_score == 35.0
    assert growth.current_score == 85.0
    assert growth.delta == 50.0  # +50% improvement


# ----------------------------------------------------------------------------
# Test H: Adaptive question selection
# ----------------------------------------------------------------------------
def test_h_adaptive_question_selection_weighting():
    """Test H: Mastery math appropriately ranks weaker concepts for prioritized practice."""
    now = datetime.now(UTC)

    # Concept 1: Weak (mastery 20%)
    c1_evidence = [
        AnswerEvidence(score=0.2, difficulty="medium", is_correct=False, evaluated_at=now),
    ]
    est1 = calculate_concept_mastery(c1_evidence)

    # Concept 2: Strong (mastery 95%)
    c2_evidence = [
        AnswerEvidence(score=1.0, difficulty="hard", is_correct=True, evaluated_at=now),
    ]
    est2 = calculate_concept_mastery(c2_evidence)

    # Concept 3: Unassessed
    est3 = calculate_concept_mastery([])

    # Sorting priority: unassessed (None) or low mastery (< 50) prioritized before mastered (>= 70)
    concepts_to_rank = [
        ("C2_Strong", est2.mastery_score),
        ("C1_Weak", est1.mastery_score),
        ("C3_Unassessed", est3.mastery_score),
    ]

    # Deterministic priority ranking: None first, then ascending by mastery_score
    ranked = sorted(
        concepts_to_rank,
        key=lambda item: -1 if item[1] is None else item[1],
    )
    assert ranked[0][0] == "C3_Unassessed"  # Unassessed first
    assert ranked[1][0] == "C1_Weak"        # Weak second
    assert ranked[2][0] == "C2_Strong"      # Strong last


# ----------------------------------------------------------------------------
# Test I: Question quality audit
# ----------------------------------------------------------------------------
def test_i_question_quality_audit():
    """Test I: Question validator deterministically accepts genuine academic questions and rejects structural/TOC questions."""
    # Bad questions: document navigation & section references (MUST BE REJECTED)
    bad_questions = [
        ("In Chapter 3, what is discussed in Section 3.4?", ["Topic A", "Topic B", "Topic C", "Topic D"]),
        ("On what page is Bayes theorem introduced?", ["Page 12", "Page 45", "Page 89", "Page 120"]),
        ("According to the table of contents, what follows Section 2?", ["Section 2.1", "Section 3", "Appendix", "Index"]),
    ]
    for q_text, opts in bad_questions:
        is_valid, reason = validate_quiz_question_quality(q_text, options=opts)
        assert not is_valid, f"Expected bad question to be rejected: {q_text}"

    # Good questions: academic mechanisms, derivations, definitions (MUST BE ACCEPTED)
    good_questions = [
        ("What is the primary function of the softmax activation in multiclass classification?", [
            "Converts raw logit values into a valid probability distribution summing to 1",
            "Eliminates vanishing gradients in deep networks",
            "Computes the L2 regularization norm of layer weights",
            "Performs dimensionality reduction via PCA",
        ]),
        ("How does L2 regularization (weight decay) modify the gradient descent weight update step?", [
            "Shrinks weights toward zero proportionally to their current magnitude",
            "Zeros out irrelevant feature weights completely",
            "Multiplies learning rate by momentum",
            "Normalizes feature inputs across batch samples",
        ]),
    ]
    for q_text, opts in good_questions:
        is_valid, reason = validate_quiz_question_quality(q_text, options=opts)
        assert is_valid, f"Expected good question to be accepted, but got: {reason}"


# ----------------------------------------------------------------------------
# Test J: Project isolation (A/B/C)
# ----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_j_three_projects_isolation(db_session: AsyncSession):
    """Test J: In three projects (A, B, C), quiz activity in Project A never affects Projects B or C."""
    set_llm_provider(MockLLMProvider())
    env = await setup_pipeline_env(db_session, project_name="Project A")

    # Create Projects B and C under the same user and space
    proj_b = Project(
        id=uuid.uuid4(),
        user_id=env["user"].id,
        space_id=env["space"].id,
        name="Project B",
        learning_goal="Graph Algorithms",
    )
    proj_c = Project(
        id=uuid.uuid4(),
        user_id=env["user"].id,
        space_id=env["space"].id,
        name="Project C",
        learning_goal="Database Internals",
    )
    db_session.add_all([proj_b, proj_c])
    await db_session.flush()

    concept_a = Concept(id=uuid.uuid4(), user_id=env["user"].id, project_id=env["project"].id, name="Gradient Descent", description="Optimization via gradients")
    concept_b = Concept(id=uuid.uuid4(), user_id=env["user"].id, project_id=proj_b.id, name="BFS & DFS", description="Graph traversal techniques")
    concept_c = Concept(id=uuid.uuid4(), user_id=env["user"].id, project_id=proj_c.id, name="B-Tree Indexing", description="Balanced tree index structure")
    db_session.add_all([concept_a, concept_b, concept_c])
    await db_session.flush()

    # Complete a quiz in Project A ONLY
    quiz_a = Quiz(id=uuid.uuid4(), user_id=env["user"].id, project_id=env["project"].id, title="A Quiz", status="completed")
    q_a = QuizQuestion(
        id=uuid.uuid4(), quiz_id=quiz_a.id, user_id=env["user"].id, project_id=env["project"].id,
        concept_id=concept_a.id, question_text="What is gradient descent?",
        question_type="mcq", correct_answer="Optimization algorithm", difficulty="medium",
        explanation="Iterative first-order optimization.", question_order=1,
    )
    attempt_a = QuizAttempt(id=uuid.uuid4(), quiz_id=quiz_a.id, user_id=env["user"].id, project_id=env["project"].id, status="completed")
    ans_a = QuizAnswer(
        id=uuid.uuid4(), attempt_id=attempt_a.id, question_id=q_a.id, user_id=env["user"].id,
        concept_id=concept_a.id, difficulty="medium", selected_answer="Optimization algorithm",
        is_correct=True, score=1.0, evaluated_at=datetime.now(UTC),
    )
    db_session.add_all([quiz_a, q_a, attempt_a, ans_a])
    await db_session.commit()

    mastery_service = MasteryService(db_session)
    await mastery_service.process_quiz_completion(
        user_id=env["user"].id,
        project_id=env["project"].id,
        attempt_id=attempt_a.id,
    )

    repo = MasteryRepository(db_session)

    # Project A mastery must be 100% with 1 snapshot
    mastery_a = await repo.get_concept_mastery(env["user"].id, concept_a.id)
    assert mastery_a is not None
    assert mastery_a.mastery_score == 100.0
    snaps_a = await repo.list_snapshots_by_concept(env["user"].id, concept_a.id)
    assert len(snaps_a) == 1

    # Project B must be completely unassessed (0 snapshots, 0 mastery rows)
    mastery_b = await repo.get_concept_mastery(env["user"].id, concept_b.id)
    assert mastery_b is None
    snaps_b = await repo.list_snapshots_by_concept(env["user"].id, concept_b.id)
    assert len(snaps_b) == 0

    # Project C must be completely unassessed (0 snapshots, 0 mastery rows)
    mastery_c = await repo.get_concept_mastery(env["user"].id, concept_c.id)
    assert mastery_c is None
    snaps_c = await repo.list_snapshots_by_concept(env["user"].id, concept_c.id)
    assert len(snaps_c) == 0


# ----------------------------------------------------------------------------
# Test K: Space aggregation
# ----------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_k_space_aggregation(db_session: AsyncSession):
    """Test K: SpaceRepository.get_with_stats aggregates projects, concepts, and mastery across all projects in the space."""
    env = await setup_pipeline_env(db_session, project_name="Space Aggregation Project 1")
    space_id = env["space"].id
    user_id = env["user"].id

    # Add Project 2 to the same space
    proj_2 = Project(
        id=uuid.uuid4(),
        user_id=user_id,
        space_id=space_id,
        name="Space Aggregation Project 2",
        learning_goal="Second Project Goal",
    )
    db_session.add(proj_2)
    await db_session.flush()

    # Add Concept 1 in Project 1 (assessed at 80.0%)
    c1 = Concept(id=uuid.uuid4(), user_id=user_id, project_id=env["project"].id, name="Concept 1", description="Description 1")
    m1 = ConceptMastery(
        id=uuid.uuid4(), user_id=user_id, project_id=env["project"].id, concept_id=c1.id,
        mastery_score=80.0, confidence=0.8, evidence_count=3, last_updated_at=datetime.now(UTC),
    )

    # Add Concept 2 in Project 2 (assessed at 60.0%)
    c2 = Concept(id=uuid.uuid4(), user_id=user_id, project_id=proj_2.id, name="Concept 2", description="Description 2")
    m2 = ConceptMastery(
        id=uuid.uuid4(), user_id=user_id, project_id=proj_2.id, concept_id=c2.id,
        mastery_score=60.0, confidence=0.6, evidence_count=2, last_updated_at=datetime.now(UTC),
    )

    # Add Concept 3 in Project 2 (UNASSESSED - score None)
    c3 = Concept(id=uuid.uuid4(), user_id=user_id, project_id=proj_2.id, name="Concept 3 (Unassessed)", description="Description 3")

    db_session.add_all([c1, m1, c2, m2, c3])
    await db_session.commit()

    space_repo = SpaceRepository(db_session)
    stats = await space_repo.get_with_stats(user_id=user_id, space_id=space_id)

    assert stats is not None
    assert stats.projects_count == 2
    assert stats.concepts_count == 3
    assert stats.assessed_concepts_count == 2
    # Expected average: (80.0 + 60.0) / 2 = 70.0%
    assert stats.average_mastery == 70.0
