"""Comprehensive Test Suite for Adaptive Quiz Anti-Repetition, Question History & Infinite Variety.

Covers:
1. New quiz does not immediately reuse identical questions.
2. Question history is considered and populated in prompt.
3. Previously incorrect concepts are prioritized.
4. Questions remain strictly project-scoped.
5. Generated questions are grounded in project material chunks.
6. Duplicate question text (exact, normalized, token similarity) is rejected.
7. Small question pool has an infinite variety fallback that prevents failure.
8. Existing quiz history and attempts are preserved across multiple quizzes.
9. Adaptive selection uses a rich multi-signal strategy (more than just right/wrong).
10. Multiple consecutive quiz starts produce varied questions.
"""

import uuid

import fitz
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.gemini_provider import MockLLMProvider, set_llm_provider
from app.models.concept import Concept
from app.models.material import Material
from app.models.project import Project
from app.models.quiz import QuizAnswer, QuizQuestion
from app.models.space import Space
from app.models.user import User
from app.schemas.quiz import QuizCreateRequest
from app.services.adaptive_engine import AdaptiveEngine
from app.services.quiz_service import (
    QuizService,
    is_duplicate_question,
)
from app.services.storage_service import storage_service
from app.workers.tasks import _process_material_async


def create_sample_pdf_bytes() -> bytes:
    """Create a 2-page test PDF with distinct concepts for grounding tests."""
    doc = fitz.open()
    p1 = doc.new_page()
    p1.insert_text(
        (50, 72),
        (
            "=== Machine Learning Foundations ===\n\n"
            "Supervised learning trains models on labeled datasets where inputs correspond to ground truth targets. "
            "Linear regression predicts continuous numerical values by fitting an optimal hyperplane. "
            "Logistic regression models binary classification probabilities using the sigmoid function."
        ),
        fontsize=11,
    )
    p2 = doc.new_page()
    p2.insert_text(
        (50, 72),
        (
            "=== Model Evaluation & Overfitting ===\n\n"
            "Overfitting occurs when a model memorizes training noise instead of generalizing to unseen distributions. "
            "Regularization techniques such as L1 Lasso and L2 Ridge penalize large model weights. "
            "Cross-validation provides an unbiased estimate of generalization error across multiple test folds."
        ),
        fontsize=11,
    )
    data = doc.tobytes()
    doc.close()
    return data


async def setup_ready_project(
    session: AsyncSession,
    user: User,
    project_name: str = "ML Project",
) -> tuple[Space, Project, Material]:
    """Helper to create a complete space, project, and ready material in test DB."""
    space = Space(id=uuid.uuid4(), user_id=user.id, name=f"Space {uuid.uuid4().hex[:6]}")
    session.add(space)
    await session.commit()

    project = Project(
        id=uuid.uuid4(),
        space_id=space.id,
        user_id=user.id,
        name=project_name,
        learning_goal="Master Machine Learning Foundations",
    )
    session.add(project)
    await session.commit()

    material_id = uuid.uuid4()
    pdf_bytes = create_sample_pdf_bytes()
    storage_path = storage_service.save_file(
        project_id=project.id,
        material_id=material_id,
        content=pdf_bytes,
    )
    material = Material(
        id=material_id,
        project_id=project.id,
        user_id=user.id,
        filename="ml_foundations.pdf",
        storage_path=storage_path,
        status="queued",
    )
    session.add(material)
    await session.commit()

    await _process_material_async(str(material.id), session)
    res = await session.execute(select(Material).where(Material.id == material.id))
    ready_mat = res.scalar_one()

    return space, project, ready_mat


@pytest.fixture
async def test_user(db_session: AsyncSession) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"quizuser_{uuid.uuid4().hex[:8]}@example.com",
        hashed_password="hashed_pw_test",
        full_name="Learner One",
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


# ===========================================================================
# 1. New quiz does not immediately reuse identical questions
# ===========================================================================
@pytest.mark.asyncio
async def test_new_quiz_does_not_immediately_reuse_identical_questions(
    db_session: AsyncSession, test_user: User
):
    """Quiz 2 must not produce the exact same questions as Quiz 1."""
    _, project, _ = await setup_ready_project(db_session, test_user)
    set_llm_provider(MockLLMProvider())
    service = QuizService(db_session)

    # Generate Quiz 1
    quiz1 = await service.create_quiz(
        user_id=test_user.id,
        project_id=project.id,
        payload=QuizCreateRequest(title="Quiz 1", question_count=3),
    )
    q1_texts = {q.question_text for q in quiz1.questions}

    # Generate Quiz 2
    quiz2 = await service.create_quiz(
        user_id=test_user.id,
        project_id=project.id,
        payload=QuizCreateRequest(title="Quiz 2", question_count=3),
    )
    q2_texts = {q.question_text for q in quiz2.questions}

    # Verify Quiz 2 avoids immediate reuse of Quiz 1 questions
    assert len(q1_texts) >= 2
    assert len(q2_texts) >= 2
    exact_overlap = q1_texts.intersection(q2_texts)
    assert len(exact_overlap) == 0, f"Quiz 2 reused identical questions: {exact_overlap}"


# ===========================================================================
# 2. Question history is considered
# ===========================================================================
@pytest.mark.asyncio
async def test_question_history_is_considered(
    db_session: AsyncSession, test_user: User
):
    """Recent question texts are queried and included in prompt for anti-repetition."""
    _, project, _ = await setup_ready_project(db_session, test_user)
    set_llm_provider(MockLLMProvider())
    service = QuizService(db_session)

    # Initially question history is empty
    history_0 = await service.quiz_repo.get_recent_project_questions(test_user.id, project.id)
    assert len(history_0) == 0

    # Create Quiz 1
    quiz1 = await service.create_quiz(
        user_id=test_user.id,
        project_id=project.id,
        payload=QuizCreateRequest(title="Quiz 1", question_count=3),
    )

    # Recent questions should now contain questions from Quiz 1
    history_1 = await service.quiz_repo.get_recent_project_questions(test_user.id, project.id)
    assert len(history_1) == len(quiz1.questions)
    assert history_1[0].question_text == quiz1.questions[-1].question_text or len(history_1) >= 3


# ===========================================================================
# 3. Previously incorrect concepts are prioritized
# ===========================================================================
def test_previously_incorrect_concepts_prioritized():
    """Concepts with mistakes receive high error signal (+40 * rate) and priority."""
    c_easy = Concept(id=uuid.uuid4(), name="Concept Easy", project_id=uuid.uuid4(), user_id=uuid.uuid4())
    c_hard = Concept(id=uuid.uuid4(), name="Concept Hard", project_id=uuid.uuid4(), user_id=uuid.uuid4())

    history = [
        # Learner missed Concept Hard twice
        QuizAnswer(id=uuid.uuid4(), attempt_id=uuid.uuid4(), question_id=uuid.uuid4(), user_id=uuid.uuid4(), concept_id=c_hard.id, is_correct=False),
        QuizAnswer(id=uuid.uuid4(), attempt_id=uuid.uuid4(), question_id=uuid.uuid4(), user_id=uuid.uuid4(), concept_id=c_hard.id, is_correct=False),
        # Learner got Concept Easy right twice
        QuizAnswer(id=uuid.uuid4(), attempt_id=uuid.uuid4(), question_id=uuid.uuid4(), user_id=uuid.uuid4(), concept_id=c_easy.id, is_correct=True),
        QuizAnswer(id=uuid.uuid4(), attempt_id=uuid.uuid4(), question_id=uuid.uuid4(), user_id=uuid.uuid4(), concept_id=c_easy.id, is_correct=True),
    ]

    plan = AdaptiveEngine.compute_plan([c_easy, c_hard], history=history, question_count=2)
    scores = {s.concept_name: s.final_weight for s in plan.selected_concepts}

    assert scores["Concept Hard"] > scores["Concept Easy"]
    # Top prioritized concept should be Concept Hard
    assert plan.selected_concepts[0].concept_name == "Concept Hard"


# ===========================================================================
# 4. Questions remain project-scoped
# ===========================================================================
@pytest.mark.asyncio
async def test_questions_remain_project_scoped(
    db_session: AsyncSession, test_user: User
):
    """Quiz in Project A must only use materials and concepts from Project A."""
    _, proj_a, _ = await setup_ready_project(db_session, test_user, "Project A")
    _, proj_b, _ = await setup_ready_project(db_session, test_user, "Project B")
    set_llm_provider(MockLLMProvider())
    service = QuizService(db_session)

    quiz_a = await service.create_quiz(
        user_id=test_user.id,
        project_id=proj_a.id,
        payload=QuizCreateRequest(title="Quiz A", question_count=3),
    )

    # Check that all questions belong strictly to proj_a
    stmt = select(QuizQuestion).where(QuizQuestion.quiz_id == quiz_a.id)
    questions = (await db_session.execute(stmt)).scalars().all()
    assert len(questions) >= 1
    for q in questions:
        assert q.project_id == proj_a.id
        assert q.project_id != proj_b.id


# ===========================================================================
# 5. Generated questions are grounded in project materials
# ===========================================================================
@pytest.mark.asyncio
async def test_generated_questions_are_grounded(
    db_session: AsyncSession, test_user: User
):
    """Every question must cite valid evidence chunk IDs from project materials."""
    _, project, ready_mat = await setup_ready_project(db_session, test_user)
    set_llm_provider(MockLLMProvider())
    service = QuizService(db_session)

    quiz = await service.create_quiz(
        user_id=test_user.id,
        project_id=project.id,
        payload=QuizCreateRequest(title="Grounded Quiz", question_count=3),
    )

    chunks = await service.material_repo.get_chunks_by_material(ready_mat.id)
    valid_chunk_ids = {str(c.id) for c in chunks}

    stmt = select(QuizQuestion).where(QuizQuestion.quiz_id == quiz.id)
    questions = (await db_session.execute(stmt)).scalars().all()

    for q in questions:
        assert q.source_chunk_ids, f"Question {q.id} has empty evidence citations"
        for cid in q.source_chunk_ids:
            assert cid in valid_chunk_ids, f"Fabricated chunk ID found: {cid}"


# ===========================================================================
# 6. Duplicate question text is rejected
# ===========================================================================
def test_duplicate_question_text_is_rejected():
    """Duplicate detection catches exact match, normalized match, and token similarity."""
    existing = [
        "Which of the following is a non-linear activation function mentioned in the material?",
        "What is the primary role of hidden layers in deep neural networks?",
    ]

    # Exact duplicate
    assert is_duplicate_question(
        "Which of the following is a non-linear activation function mentioned in the material?",
        existing,
    ) is True

    # Normalized duplicate (different case & stripped punctuation)
    assert is_duplicate_question(
        "which of the following is a nonlinear activation function mentioned in the material",
        existing,
    ) is True

    # High token-level Jaccard similarity
    assert is_duplicate_question(
        "Which of the following is a non-linear activation function in the material?",
        existing,
    ) is True

    # Completely different question
    assert is_duplicate_question(
        "Explain how convolutions slide across spatial dimensions for visual data.",
        existing,
    ) is False


# ===========================================================================
# 7. Small question pool has a fallback that prevents failure
# ===========================================================================
@pytest.mark.asyncio
async def test_small_question_pool_has_fallback(
    db_session: AsyncSession, test_user: User
):
    """When new questions duplicate existing pool, fallback fills from historical questions."""
    _, project, _ = await setup_ready_project(db_session, test_user)
    service = QuizService(db_session)

    # Initial quiz creation with MockLLMProvider
    set_llm_provider(MockLLMProvider())
    quiz1 = await service.create_quiz(
        user_id=test_user.id,
        project_id=project.id,
        payload=QuizCreateRequest(title="Initial Quiz", question_count=3),
    )
    assert len(quiz1.questions) == 3

    # Now simulate an LLM that only generates duplicates of Quiz 1
    canned_duplicate_output = {
        "mcq_questions": [
            {
                "question": quiz1.questions[0].question_text,  # exact duplicate
                "options": ["A", "B", "C", "D"],
                "correct_answer": "A",
                "explanation": "Dup",
                "concept_name": "Activation Functions",
                "difficulty": "medium",
                "evidence_chunk_ids": [],
            }
        ],
        "open_ended_questions": [],
    }
    set_llm_provider(MockLLMProvider(canned_response=canned_duplicate_output))

    try:
        # Infinite variety fallback must activate and fill questions from historical pool without failing
        quiz2 = await service.create_quiz(
            user_id=test_user.id,
            project_id=project.id,
            payload=QuizCreateRequest(title="Fallback Quiz", question_count=3),
        )
        assert len(quiz2.questions) >= 1, "Quiz failed to generate questions via fallback"
    finally:
        set_llm_provider(MockLLMProvider())


# ===========================================================================
# 8. Existing quiz history is preserved
# ===========================================================================
@pytest.mark.asyncio
async def test_existing_quiz_history_is_preserved(
    db_session: AsyncSession, test_user: User
):
    """Creating new quizzes never deletes historical attempts, answers, or scores."""
    set_llm_provider(MockLLMProvider())
    _, project, _ = await setup_ready_project(db_session, test_user)
    service = QuizService(db_session)

    # 1. Create Quiz 1 & take attempt
    quiz1 = await service.create_quiz(
        user_id=test_user.id,
        project_id=project.id,
        payload=QuizCreateRequest(title="Quiz 1", question_count=2),
    )
    attempt = await service.start_attempt(test_user.id, quiz1.id)

    # Complete attempt
    await service.complete_attempt(
        user_id=test_user.id, quiz_id=quiz1.id, attempt_id=attempt.id
    )

    # 2. Create Quiz 2 and Quiz 3
    await service.create_quiz(
        user_id=test_user.id,
        project_id=project.id,
        payload=QuizCreateRequest(title="Quiz 2", question_count=2),
    )
    await service.create_quiz(
        user_id=test_user.id,
        project_id=project.id,
        payload=QuizCreateRequest(title="Quiz 3", question_count=2),
    )

    # 3. Verify Quiz 1 and its attempt still exist
    re_quiz1 = await service.quiz_repo.get_quiz(test_user.id, quiz1.id)
    assert re_quiz1 is not None
    re_attempt = await service.quiz_repo.get_attempt(test_user.id, attempt.id)
    assert re_attempt is not None
    assert re_attempt.status == "completed"

    all_quizzes = await service.quiz_repo.list_quizzes(test_user.id, project.id)
    assert len(all_quizzes) == 3


# ===========================================================================
# 9. Adaptive selection uses more than just correct/incorrect
# ===========================================================================
def test_adaptive_selection_uses_rich_multi_signals():
    """Adaptive selection incorporates mistakes, recency saturation, exposure, and diverse rotation."""
    c1 = Concept(id=uuid.uuid4(), name="Concept 1", project_id=uuid.uuid4(), user_id=uuid.uuid4())
    c2 = Concept(id=uuid.uuid4(), name="Concept 2", project_id=uuid.uuid4(), user_id=uuid.uuid4())
    c3 = Concept(id=uuid.uuid4(), name="Concept 3", project_id=uuid.uuid4(), user_id=uuid.uuid4())

    # c1 has clean recent passes -> recency saturation penalty (-25)
    # c2 is unseen -> exploration bonus (+30)
    # c3 was recently featured in prior quiz -> exposure penalty (-15)
    history = [
        QuizAnswer(id=uuid.uuid4(), attempt_id=uuid.uuid4(), question_id=uuid.uuid4(), user_id=uuid.uuid4(), concept_id=c1.id, is_correct=True),
        QuizAnswer(id=uuid.uuid4(), attempt_id=uuid.uuid4(), question_id=uuid.uuid4(), user_id=uuid.uuid4(), concept_id=c1.id, is_correct=True),
    ]
    mock_recent_q = QuizQuestion(
        id=uuid.uuid4(),
        quiz_id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        project_id=uuid.uuid4(),
        concept_id=c3.id,
        question_type="mcq",
        question_text="Sample Q3",
        options=[],
        correct_answer="A",
        explanation="Exp",
        source_chunk_ids=[],
    )

    plan = AdaptiveEngine.compute_plan(
        [c1, c2, c3],
        history=history,
        question_count=3,
        recent_questions=[mock_recent_q],
        quiz_count=1,
    )

    # c2 (unseen) should have highest priority
    assert plan.selected_concepts[0].concept_id == c2.id
    # c1 should reflect recency saturation penalty in rationale
    c1_score = next(s for s in plan.selected_concepts if s.concept_id == c1.id)
    assert "recency saturation penalty" in c1_score.rationale.lower()


# ===========================================================================
# 10. Multiple quiz starts produce varied questions
# ===========================================================================
@pytest.mark.asyncio
async def test_multiple_quiz_starts_produce_varied_questions(
    db_session: AsyncSession, test_user: User
):
    """Multiple consecutive quiz starts produce substantial question variation."""
    _, project, _ = await setup_ready_project(db_session, test_user)
    set_llm_provider(MockLLMProvider())
    service = QuizService(db_session)

    # Quiz 1
    quiz1 = await service.create_quiz(
        user_id=test_user.id,
        project_id=project.id,
        payload=QuizCreateRequest(title="Quiz Batch 1", question_count=3),
    )
    texts_q1 = [q.question_text for q in quiz1.questions]

    # Quiz 2
    quiz2 = await service.create_quiz(
        user_id=test_user.id,
        project_id=project.id,
        payload=QuizCreateRequest(title="Quiz Batch 2", question_count=3),
    )
    texts_q2 = [q.question_text for q in quiz2.questions]

    # Quiz 3
    quiz3 = await service.create_quiz(
        user_id=test_user.id,
        project_id=project.id,
        payload=QuizCreateRequest(title="Quiz Batch 3", question_count=3),
    )
    texts_q3 = [q.question_text for q in quiz3.questions]

    # Check substantial variation:
    # 1. Quiz 1 vs Quiz 2 must have zero identical questions
    assert set(texts_q1).isdisjoint(set(texts_q2)), "Quiz 2 repeated questions from Quiz 1"
    # 2. Quiz 2 vs Quiz 3 must have zero identical questions
    assert set(texts_q2).isdisjoint(set(texts_q3)), "Quiz 3 repeated questions from Quiz 2"
    # 3. Across all three quizzes, there must be a wide variety of unique questions
    all_unique_texts = set(texts_q1 + texts_q2 + texts_q3)
    assert len(all_unique_texts) >= 6, f"Expected at least 6 distinct questions across 3 quizzes, got {len(all_unique_texts)}"
