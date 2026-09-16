"""Phase 4 End-to-End Integration & Verification Test Suite.

Tests complete workflow against PostgreSQL database:
1. Concept Extraction & One-Time Caching
2. Adaptive Quiz Generation & Evidence Validation
3. Attempt Lifecycle: Start -> MCQ Submit -> Open-Ended Submit -> Complete
4. Concept Performance Calculation
5. Cross-User Tenant Isolation
6. Activity Events Audit
"""

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.gemini_provider import MockLLMProvider, set_llm_provider
from app.models.concept import Concept
from app.models.event import ActivityEvent
from app.models.project import Project
from app.models.space import Space
from app.models.user import User
from app.schemas.quiz import QuizAnswerSubmitRequest, QuizCreateRequest
from app.services.quiz_service import QuizService
from tests.test_quiz import create_ready_test_material


@pytest.mark.asyncio
async def test_quiz_e2e_integration(db_session: AsyncSession):
    set_llm_provider(MockLLMProvider())

    # 1. Setup User and Project
    user_id = uuid.uuid4()
    user = User(
        id=user_id,
        email=f"phase4_e2e_{user_id.hex[:6]}@example.com",
        hashed_password="hash",
        full_name="Phase 4 Tester",
    )
    space = Space(id=uuid.uuid4(), user_id=user_id, name="E2E Space")
    project = Project(
        id=uuid.uuid4(),
        space_id=space.id,
        user_id=user_id,
        name="Neural Computation",
        learning_goal="Master Deep Learning",
    )
    db_session.add_all([user, space, project])
    await db_session.commit()

    # 2. Add Ready Material with Chunks
    await create_ready_test_material(
        db_session, user_id, project.id, filename="neural_networks.pdf"
    )

    # 3. Test Concept Extraction
    quiz_service = QuizService(db_session)
    concepts = await quiz_service.ensure_project_concepts(user_id=user.id, project_id=project.id)
    assert len(concepts) == 2

    # Verify Persistence
    persisted_concepts = await db_session.execute(
        select(Concept).where(Concept.project_id == project.id)
    )
    c_list = persisted_concepts.scalars().all()
    assert len(c_list) == 2

    # One-Time Persistence Check
    concepts_cached = await quiz_service.ensure_project_concepts(
        user_id=user.id, project_id=project.id
    )
    assert len(concepts_cached) == 2

    # 4. Generate Adaptive Quiz
    quiz_resp = await quiz_service.create_quiz(
        user_id=user.id,
        project_id=project.id,
        payload=QuizCreateRequest(
            title="Deep Learning Exam",
            question_count=3,
            preferred_difficulty="adaptive",
        ),
    )
    assert quiz_resp.title == "Deep Learning Exam"
    assert len(quiz_resp.questions) == 3

    # 5. Start Attempt
    attempt = await quiz_service.start_attempt(user_id=user.id, quiz_id=quiz_resp.id)
    assert attempt.status == "in_progress"

    # Find MCQ and Open-Ended questions
    mcq_q = next(q for q in quiz_resp.questions if q.question_type == "mcq")
    open_q = next(q for q in quiz_resp.questions if q.question_type == "open_ended")

    # 6. Submit MCQ Answer
    mcq_ans = await quiz_service.submit_answer(
        user_id=user.id,
        quiz_id=quiz_resp.id,
        attempt_id=attempt.id,
        question_id=mcq_q.id,
        payload=QuizAnswerSubmitRequest(selected_answer="ReLU (Rectified Linear Unit)"),
    )
    assert mcq_ans.is_correct is True
    assert mcq_ans.score == 1.0
    assert mcq_ans.concept_id is not None
    assert mcq_ans.difficulty in ("easy", "medium", "hard")

    # 7. Submit Open-Ended Answer
    open_ans = await quiz_service.submit_answer(
        user_id=user.id,
        quiz_id=quiz_resp.id,
        attempt_id=attempt.id,
        question_id=open_q.id,
        payload=QuizAnswerSubmitRequest(
            answer_text="Activation functions introduce essential non-linear mappings preventing multilayer networks from collapsing into a single linear transform."
        ),
    )
    assert open_ans.is_correct is True
    assert open_ans.score is not None
    assert open_ans.score >= 0.70

    # 8. Complete Attempt
    result = await quiz_service.complete_attempt(
        user_id=user.id,
        quiz_id=quiz_resp.id,
        attempt_id=attempt.id,
    )
    assert result.score_percentage > 0
    assert result.correct_answers == 2
    assert len(result.concept_performance) > 0

    # 9. Cross-User Tenant Isolation
    other_user_id = uuid.uuid4()
    other_user = User(
        id=other_user_id,
        email=f"intruder_{other_user_id.hex[:6]}@example.com",
        hashed_password="pw",
    )
    db_session.add(other_user)
    await db_session.commit()

    with pytest.raises(Exception):
        await quiz_service.get_quiz(user_id=other_user_id, quiz_id=quiz_resp.id)

    # 10. Verify Activity Events
    ev_res = await db_session.execute(select(ActivityEvent).where(ActivityEvent.user_id == user.id))
    events = ev_res.scalars().all()
    event_types = [e.event_type for e in events]
    assert "quiz_created" in event_types
    assert "quiz_started" in event_types
    assert "question_answered" in event_types
    assert "quiz_completed" in event_types
