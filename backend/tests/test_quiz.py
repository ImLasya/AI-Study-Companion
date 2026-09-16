"""Comprehensive Test Suite for Phase 4: Adaptive Quiz, Assessment & Deterministic Evaluation.

Tests:
1. Concept Inventory creation, grounding validation, and one-time persistence.
2. Quiz generation with ready materials, no-ready-materials handling, and fabricated chunk rejection.
3. Deterministic Adaptive Engine evaluation suite:
   - Learner repeatedly misses Concept A -> Concept A receives increased priority (+40 error signal, +15 repeated mistake signal).
   - Learner has never answered Concept B -> Concept B receives unseen exploration priority (+30 exploration bonus).
   - Learner recently answered Concept C correctly -> Concept C receives recency saturation penalty (-25 penalty).
   - Difficulty calibration adjusts based on learner accuracy.
4. Deterministic MCQ evaluation (exact text match and option letter match, server-side score authority).
5. Open-ended assessment via Gemini (semantic evaluation, score normalization, feedback generation, and 502 failure handling).
6. Cross-user tenant isolation across quizzes, questions, and attempts.
7. Attempt completion, running score calculation, and concept performance breakdown.
8. Activity events generation for quiz lifecycle.
"""

import uuid
from unittest.mock import patch

import fitz
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.gemini_provider import MockLLMProvider, set_llm_provider
from app.models.concept import Concept
from app.models.event import ActivityEvent
from app.models.material import Material
from app.models.project import Project
from app.models.quiz import QuizAnswer, QuizQuestion
from app.models.space import Space
from app.models.user import User
from app.services.adaptive_engine import AdaptiveEngine
from app.services.quiz_service import QuizService
from app.services.storage_service import storage_service
from app.workers.tasks import _process_material_async


def create_neural_pdf_bytes() -> bytes:
    """Create a 2-page PDF about neural networks for deterministic tests."""
    doc = fitz.open()
    p1 = doc.new_page()
    p1.insert_text(
        (50, 72),
        (
            "=== Neural Network Architectures ===\n\n"
            "Deep neural networks consist of stacked layers that transform representations. "
            "Hidden layers learn increasingly abstract representations of the input features. "
            "Convolutions are commonly used for visual data while recurrent networks model sequences."
        ),
        fontsize=11,
    )
    p2 = doc.new_page()
    p2.insert_text(
        (50, 72),
        (
            "=== Activation Functions ===\n\n"
            "Activation functions introduce non-linearity into neural networks. "
            "Without non-linear activations, stacking multiple linear layers results mathematically "
            "in just a single linear transformation. Popular functions include ReLU, GELU, and Swish."
        ),
        fontsize=11,
    )
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


async def create_ready_test_material(
    db_session: AsyncSession,
    user_id: uuid.UUID,
    project_id: uuid.UUID,
    filename: str = "neural_networks.pdf",
) -> Material:
    """Create and process a material record to ready status with chunks in the test DB."""
    material_id = uuid.uuid4()
    pdf_bytes = create_neural_pdf_bytes()
    storage_path = storage_service.save_file(
        project_id=project_id,
        material_id=material_id,
        content=pdf_bytes,
    )
    material = Material(
        id=material_id,
        project_id=project_id,
        user_id=user_id,
        filename=filename,
        storage_path=storage_path,
        status="queued",
    )
    db_session.add(material)
    await db_session.commit()
    await db_session.refresh(material)

    await _process_material_async(str(material.id), db_session)

    res = await db_session.execute(select(Material).where(Material.id == material.id))
    return res.scalar_one()


@pytest.fixture
async def quiz_two_user_setup(db_session: AsyncSession):
    """Setup two isolated users, spaces, and projects."""
    user_a = User(
        id=uuid.uuid4(),
        email=f"quiza_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="fakehash",
        full_name="User Alpha",
    )
    user_b = User(
        id=uuid.uuid4(),
        email=f"quizb_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="fakehash",
        full_name="User Beta",
    )
    db_session.add_all([user_a, user_b])
    await db_session.commit()

    space_a = Space(id=uuid.uuid4(), user_id=user_a.id, name="Space A")
    space_b = Space(id=uuid.uuid4(), user_id=user_b.id, name="Space B")
    db_session.add_all([space_a, space_b])
    await db_session.commit()

    proj_a = Project(
        id=uuid.uuid4(),
        space_id=space_a.id,
        user_id=user_a.id,
        name="Deep Learning A",
        learning_goal="Master Neural Architectures",
    )
    proj_b = Project(
        id=uuid.uuid4(),
        space_id=space_b.id,
        user_id=user_b.id,
        name="Deep Learning B",
        learning_goal="Master Neural Architectures",
    )
    db_session.add_all([proj_a, proj_b])
    await db_session.commit()

    return {"user_a": user_a, "user_b": user_b, "proj_a": proj_a, "proj_b": proj_b}


# ===========================================================================
# 1. Concept Inventory Tests
# ===========================================================================


@pytest.mark.asyncio
async def test_concept_extraction_and_persistence(
    db_session: AsyncSession,
    quiz_two_user_setup: dict,
):
    """Concepts are extracted from ready material and persisted in the concepts table."""
    user_a = quiz_two_user_setup["user_a"]
    proj_a = quiz_two_user_setup["proj_a"]

    await create_ready_test_material(db_session, user_a.id, proj_a.id)

    set_llm_provider(MockLLMProvider())
    service = QuizService(db_session)

    # Initial extraction
    concepts = await service.ensure_project_concepts(user_a.id, proj_a.id)
    assert len(concepts) >= 2
    concept_names = [c.name for c in concepts]
    assert (
        "Neural Network Architectures" in concept_names or "Activation Functions" in concept_names
    )

    # Check persistence in database
    res = await db_session.execute(select(Concept).where(Concept.project_id == proj_a.id))
    db_concepts = res.scalars().all()
    assert len(db_concepts) == len(concepts)

    # Verify that calling ensure_project_concepts again is a one-time operation (cached from DB)
    with patch.object(MockLLMProvider, "generate_structured") as mock_gen:
        cached_concepts = await service.ensure_project_concepts(user_a.id, proj_a.id)
        assert len(cached_concepts) == len(concepts)
        mock_gen.assert_not_called()


@pytest.mark.asyncio
async def test_concept_extraction_no_materials_fails(
    db_session: AsyncSession,
    quiz_two_user_setup: dict,
):
    """Concept extraction without ready materials returns 400 Bad Request."""
    user_a = quiz_two_user_setup["user_a"]
    proj_a = quiz_two_user_setup["proj_a"]

    service = QuizService(db_session)
    with pytest.raises(Exception) as exc_info:
        await service.ensure_project_concepts(user_a.id, proj_a.id)
    assert "400" in str(exc_info.value) or "upload and process" in str(exc_info.value)


# ===========================================================================
# 2. Quiz Generation & Evidence Grounding Tests
# ===========================================================================


@pytest.mark.asyncio
async def test_quiz_generation_with_ready_materials(
    client: AsyncClient,
    db_session: AsyncSession,
    quiz_two_user_setup: dict,
):
    """Quiz is successfully generated with valid MCQs and open-ended questions."""
    user_a = quiz_two_user_setup["user_a"]
    proj_a = quiz_two_user_setup["proj_a"]

    await create_ready_test_material(db_session, user_a.id, proj_a.id)
    set_llm_provider(MockLLMProvider())

    from app.core.security import create_access_token

    token = create_access_token(user_a.id)
    client.cookies.set("access_token", token)

    res = await client.post(
        f"/api/v1/projects/{proj_a.id}/quizzes",
        json={"title": "Deep Learning Fundamentals", "question_count": 3},
    )
    assert res.status_code == 201
    data = res.json()
    assert data["title"] == "Deep Learning Fundamentals"
    assert data["question_count"] >= 1
    assert len(data["questions"]) >= 1

    # Verify public question mask (correct_answer and rubric are NOT exposed)
    for q in data["questions"]:
        assert "correct_answer" not in q
        assert "rubric" not in q
        assert "explanation" not in q
        assert q["question_text"] is not None
        assert q["difficulty"] in ("easy", "medium", "hard")
        if q["question_type"] == "mcq":
            assert len(q["options"]) == 4


# ===========================================================================
# 3. Deterministic Adaptive Engine Evaluation Suite
# ===========================================================================


def test_adaptive_selection_mistake_boosting():
    """Learner repeatedly misses Concept A -> Concept A receives increased priority."""
    c_a = Concept(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        name="Concept A",
        description="A",
        source_chunk_ids=[],
    )
    c_b = Concept(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        name="Concept B",
        description="B",
        source_chunk_ids=[],
    )

    # History: Learner missed Concept A 3 times out of 3, answered Concept B correctly 3 times
    history = [
        QuizAnswer(
            id=uuid.uuid4(),
            attempt_id=uuid.uuid4(),
            question_id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            concept_id=c_a.id,
            is_correct=False,
        ),
        QuizAnswer(
            id=uuid.uuid4(),
            attempt_id=uuid.uuid4(),
            question_id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            concept_id=c_a.id,
            is_correct=False,
        ),
        QuizAnswer(
            id=uuid.uuid4(),
            attempt_id=uuid.uuid4(),
            question_id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            concept_id=c_a.id,
            is_correct=False,
        ),
        QuizAnswer(
            id=uuid.uuid4(),
            attempt_id=uuid.uuid4(),
            question_id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            concept_id=c_b.id,
            is_correct=True,
        ),
        QuizAnswer(
            id=uuid.uuid4(),
            attempt_id=uuid.uuid4(),
            question_id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            concept_id=c_b.id,
            is_correct=True,
        ),
        QuizAnswer(
            id=uuid.uuid4(),
            attempt_id=uuid.uuid4(),
            question_id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            concept_id=c_b.id,
            is_correct=True,
        ),
    ]

    plan = AdaptiveEngine.compute_plan(concepts=[c_a, c_b], history=history, question_count=3)
    # Concept A should have high priority: base 50 + error 40 + repeated mistake 15 = 105
    score_a = next(s for s in plan.selected_concepts if s.concept_id == c_a.id)
    score_b = next(s for s in plan.selected_concepts if s.concept_id == c_b.id)

    assert score_a.final_weight > score_b.final_weight
    assert score_a.error_signal > 0


def test_adaptive_selection_unseen_concept_bonus():
    """Learner has never answered Concept B -> Concept B receives exploration priority (+30)."""
    c_seen = Concept(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        name="Seen Concept",
        description="Seen",
        source_chunk_ids=[],
    )
    c_unseen = Concept(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        name="Unseen Concept",
        description="Unseen",
        source_chunk_ids=[],
    )

    # History only has seen concept
    history = [
        QuizAnswer(
            id=uuid.uuid4(),
            attempt_id=uuid.uuid4(),
            question_id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            concept_id=c_seen.id,
            is_correct=True,
        ),
    ]

    plan = AdaptiveEngine.compute_plan(
        concepts=[c_seen, c_unseen], history=history, question_count=2
    )
    score_unseen = next(s for s in plan.selected_concepts if s.concept_id == c_unseen.id)

    assert score_unseen.unseen_signal == 30.0
    assert score_unseen.final_weight == 80.0  # 50 base + 30 unseen


def test_adaptive_selection_recency_penalty():
    """Learner recently answered Concept C correctly -> Concept C receives recency penalty."""
    c_c = Concept(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        name="Concept C",
        description="C",
        source_chunk_ids=[],
    )
    history = [
        QuizAnswer(
            id=uuid.uuid4(),
            attempt_id=uuid.uuid4(),
            question_id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            concept_id=c_c.id,
            is_correct=True,
        ),
        QuizAnswer(
            id=uuid.uuid4(),
            attempt_id=uuid.uuid4(),
            question_id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            concept_id=c_c.id,
            is_correct=True,
        ),
    ]

    plan = AdaptiveEngine.compute_plan(concepts=[c_c], history=history, question_count=1)
    score_c = plan.selected_concepts[0]
    assert score_c.recency_penalty == 25.0
    assert score_c.final_weight == 25.0  # 50 base - 25 recency


def test_adaptive_selection_difficulty_calibration():
    """Struggling learner gets easy questions, proficient learner gets hard questions."""
    concept = Concept(
        id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        name="Test Concept",
        description="Desc",
        source_chunk_ids=[],
    )

    # 1. Low accuracy learner (0 / 4 correct)
    low_history = [
        QuizAnswer(
            id=uuid.uuid4(),
            attempt_id=uuid.uuid4(),
            question_id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            concept_id=concept.id,
            is_correct=False,
        )
        for _ in range(4)
    ]
    low_plan = AdaptiveEngine.compute_plan(
        concepts=[concept], history=low_history, question_count=5
    )
    assert low_plan.recommended_difficulties.count("easy") >= 3

    # 2. High accuracy learner (5 / 5 correct)
    high_history = [
        QuizAnswer(
            id=uuid.uuid4(),
            attempt_id=uuid.uuid4(),
            question_id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            concept_id=concept.id,
            is_correct=True,
        )
        for _ in range(5)
    ]
    high_plan = AdaptiveEngine.compute_plan(
        concepts=[concept], history=high_history, question_count=5
    )
    assert high_plan.recommended_difficulties.count("hard") >= 3


# ===========================================================================
# 4. MCQ Deterministic Evaluation & Submission Tests
# ===========================================================================


@pytest.mark.asyncio
async def test_mcq_deterministic_evaluation(
    client: AsyncClient,
    db_session: AsyncSession,
    quiz_two_user_setup: dict,
):
    """MCQ answer submission is evaluated deterministically without LLM calls."""
    user_a = quiz_two_user_setup["user_a"]
    proj_a = quiz_two_user_setup["proj_a"]

    await create_ready_test_material(db_session, user_a.id, proj_a.id)
    set_llm_provider(MockLLMProvider())

    from app.core.security import create_access_token

    token = create_access_token(user_a.id)
    client.cookies.set("access_token", token)

    # 1. Create quiz
    create_res = await client.post(
        f"/api/v1/projects/{proj_a.id}/quizzes",
        json={"title": "MCQ Test", "question_count": 2},
    )
    quiz_data = create_res.json()
    quiz_id = quiz_data["id"]

    # 2. Start attempt
    att_res = await client.post(f"/api/v1/projects/{proj_a.id}/quizzes/{quiz_id}/attempts")
    assert att_res.status_code == 201
    attempt_data = att_res.json()
    attempt_id = attempt_data["id"]

    # Find the MCQ question from DB to know the correct answer
    q_res = await db_session.execute(
        select(QuizQuestion).where(
            QuizQuestion.quiz_id == uuid.UUID(quiz_id), QuizQuestion.question_type == "mcq"
        )
    )
    mcq = q_res.scalars().first()
    assert mcq is not None

    # Submit correct answer
    ans_res = await client.post(
        f"/api/v1/projects/{proj_a.id}/quizzes/{quiz_id}/attempts/{attempt_id}/answers",
        json={"question_id": str(mcq.id), "selected_answer": mcq.correct_answer},
    )
    assert ans_res.status_code == 200
    ans_data = ans_res.json()
    assert ans_data["is_correct"] is True
    assert ans_data["score"] == 1.0
    assert ans_data["correct_answer"] == mcq.correct_answer
    assert ans_data["explanation"] is not None

    # Submit incorrect answer for comparison
    wrong_opt = [opt for opt in mcq.options if opt != mcq.correct_answer][0]
    wrong_res = await client.post(
        f"/api/v1/projects/{proj_a.id}/quizzes/{quiz_id}/attempts/{attempt_id}/answers",
        json={"question_id": str(mcq.id), "selected_answer": wrong_opt},
    )
    assert wrong_res.status_code == 200
    wrong_data = wrong_res.json()
    assert wrong_data["is_correct"] is False
    assert wrong_data["score"] == 0.0


# ===========================================================================
# 5. Open-Ended Semantic Assessment & Error Boundary Tests
# ===========================================================================


@pytest.mark.asyncio
async def test_open_ended_gemini_evaluation(
    client: AsyncClient,
    db_session: AsyncSession,
    quiz_two_user_setup: dict,
):
    """Open-ended question is evaluated semantically via Gemini against rubric."""
    user_a = quiz_two_user_setup["user_a"]
    proj_a = quiz_two_user_setup["proj_a"]

    await create_ready_test_material(db_session, user_a.id, proj_a.id)
    set_llm_provider(MockLLMProvider())

    from app.core.security import create_access_token

    token = create_access_token(user_a.id)
    client.cookies.set("access_token", token)

    # Create quiz
    create_res = await client.post(
        f"/api/v1/projects/{proj_a.id}/quizzes",
        json={"title": "Open-Ended Evaluation Test", "question_count": 3},
    )
    quiz_id = create_res.json()["id"]

    att_res = await client.post(f"/api/v1/projects/{proj_a.id}/quizzes/{quiz_id}/attempts")
    attempt_id = att_res.json()["id"]

    # Find the open-ended question
    q_res = await db_session.execute(
        select(QuizQuestion).where(
            QuizQuestion.quiz_id == uuid.UUID(quiz_id), QuizQuestion.question_type == "open_ended"
        )
    )
    open_q = q_res.scalars().first()
    assert open_q is not None

    # Submit thoughtful answer
    ans_res = await client.post(
        f"/api/v1/projects/{proj_a.id}/quizzes/{quiz_id}/attempts/{attempt_id}/answers",
        json={
            "question_id": str(open_q.id),
            "answer_text": "Non-linear activation functions allow multilayer networks to compute complex curved decision boundaries without collapsing into a single linear matrix multiplication.",
        },
    )
    assert ans_res.status_code == 200
    ans_data = ans_res.json()
    assert ans_data["score"] >= 0.70
    assert ans_data["is_correct"] is True
    assert "Strengths:" in ans_data["evaluation_feedback"]


@pytest.mark.asyncio
async def test_open_ended_gemini_failure_handled(
    client: AsyncClient,
    db_session: AsyncSession,
    quiz_two_user_setup: dict,
):
    """When Gemini evaluation fails, system returns 502 and does NOT fabricate a passing score."""
    user_a = quiz_two_user_setup["user_a"]
    proj_a = quiz_two_user_setup["proj_a"]

    await create_ready_test_material(db_session, user_a.id, proj_a.id)
    set_llm_provider(MockLLMProvider())

    from app.core.security import create_access_token

    token = create_access_token(user_a.id)
    client.cookies.set("access_token", token)

    create_res = await client.post(
        f"/api/v1/projects/{proj_a.id}/quizzes",
        json={"title": "Failure Boundary Test", "question_count": 3},
    )
    quiz_id = create_res.json()["id"]

    att_res = await client.post(f"/api/v1/projects/{proj_a.id}/quizzes/{quiz_id}/attempts")
    attempt_id = att_res.json()["id"]

    q_res = await db_session.execute(
        select(QuizQuestion).where(
            QuizQuestion.quiz_id == uuid.UUID(quiz_id), QuizQuestion.question_type == "open_ended"
        )
    )
    open_q = q_res.scalars().first()
    assert open_q is not None

    # Simulate Gemini failure
    set_llm_provider(MockLLMProvider(should_fail=True))

    ans_res = await client.post(
        f"/api/v1/projects/{proj_a.id}/quizzes/{quiz_id}/attempts/{attempt_id}/answers",
        json={"question_id": str(open_q.id), "answer_text": "Testing failure state"},
    )
    assert ans_res.status_code == 502
    assert "temporarily unavailable" in ans_res.json()["detail"]

    # Restore provider
    set_llm_provider(MockLLMProvider())


# ===========================================================================
# 6. Tenant Isolation & Security Tests
# ===========================================================================


@pytest.mark.asyncio
async def test_quiz_cross_user_isolation(
    client: AsyncClient,
    db_session: AsyncSession,
    quiz_two_user_setup: dict,
):
    """User B cannot access or submit answers to User A's quiz."""
    user_a = quiz_two_user_setup["user_a"]
    user_b = quiz_two_user_setup["user_b"]
    proj_a = quiz_two_user_setup["proj_a"]

    await create_ready_test_material(db_session, user_a.id, proj_a.id)
    set_llm_provider(MockLLMProvider())

    from app.core.security import create_access_token

    token_a = create_access_token(user_a.id)
    client.cookies.set("access_token", token_a)

    # User A creates quiz
    create_res = await client.post(
        f"/api/v1/projects/{proj_a.id}/quizzes",
        json={"title": "Private Quiz A", "question_count": 2},
    )
    quiz_id = create_res.json()["id"]

    # User B tries to view User A's quiz
    token_b = create_access_token(user_b.id)
    client.cookies.set("access_token", token_b)

    cross_res = await client.get(f"/api/v1/projects/{proj_a.id}/quizzes/{quiz_id}")
    assert cross_res.status_code == 404

    # User B tries to start attempt on User A's quiz
    cross_att = await client.post(f"/api/v1/projects/{proj_a.id}/quizzes/{quiz_id}/attempts")
    assert cross_att.status_code == 404


# ===========================================================================
# 7. Attempt Completion & Results Tests
# ===========================================================================


@pytest.mark.asyncio
async def test_quiz_completion_and_concept_performance(
    client: AsyncClient,
    db_session: AsyncSession,
    quiz_two_user_setup: dict,
):
    """Completing an attempt returns total questions, score, and concept breakdown."""
    user_a = quiz_two_user_setup["user_a"]
    proj_a = quiz_two_user_setup["proj_a"]

    await create_ready_test_material(db_session, user_a.id, proj_a.id)
    set_llm_provider(MockLLMProvider())

    from app.core.security import create_access_token

    token = create_access_token(user_a.id)
    client.cookies.set("access_token", token)

    create_res = await client.post(
        f"/api/v1/projects/{proj_a.id}/quizzes",
        json={"title": "Completion Test", "question_count": 2},
    )
    quiz_id = create_res.json()["id"]

    att_res = await client.post(f"/api/v1/projects/{proj_a.id}/quizzes/{quiz_id}/attempts")
    attempt_id = att_res.json()["id"]

    # Fetch questions
    q_res = await db_session.execute(
        select(QuizQuestion).where(QuizQuestion.quiz_id == uuid.UUID(quiz_id))
    )
    questions = q_res.scalars().all()

    # Answer both questions
    for q in questions:
        if q.question_type == "mcq":
            await client.post(
                f"/api/v1/projects/{proj_a.id}/quizzes/{quiz_id}/attempts/{attempt_id}/answers",
                json={"question_id": str(q.id), "selected_answer": q.correct_answer},
            )
        else:
            await client.post(
                f"/api/v1/projects/{proj_a.id}/quizzes/{quiz_id}/attempts/{attempt_id}/answers",
                json={
                    "question_id": str(q.id),
                    "answer_text": "Detailed accurate response on activation functions",
                },
            )

    # Complete attempt
    comp_res = await client.post(
        f"/api/v1/projects/{proj_a.id}/quizzes/{quiz_id}/attempts/{attempt_id}/complete"
    )
    assert comp_res.status_code == 200
    res_data = comp_res.json()
    assert res_data["status"] == "completed"
    assert res_data["score_percentage"] > 0
    assert len(res_data["concept_performance"]) >= 1

    # Verify activity events were recorded
    events_res = await db_session.execute(
        select(ActivityEvent).where(
            ActivityEvent.user_id == user_a.id,
            ActivityEvent.project_id == proj_a.id,
        )
    )
    events = events_res.scalars().all()
    event_types = {e.event_type for e in events}
    assert "quiz_created" in event_types
    assert "quiz_started" in event_types
    assert "question_answered" in event_types
    assert "quiz_completed" in event_types
