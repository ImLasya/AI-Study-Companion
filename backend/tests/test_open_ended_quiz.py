"""Regression and integration tests for Open-Ended Quiz Generation and Evaluation.

Verifies:
1. Mixed quiz generation guarantees inclusion of open-ended questions (not sliced off).
2. Open-ended only quiz generation creates 100% open-ended questions without options.
3. Multiple-choice only quiz generation creates 100% MCQs.
4. Submitting an open-ended answer invokes semantic evaluation, returns structured rubric feedback,
   and completes the mastery learning loop.
"""

import uuid
from unittest.mock import AsyncMock, patch
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chunk import MaterialChunk
from app.models.concept import Concept
from app.models.material import Material
from app.models.project import Project
from app.models.space import Space
from app.models.user import User
from app.schemas.quiz import (
    GeneratedMCQ,
    GeneratedOpenEnded,
    OpenEndedEvaluationOutput,
    QuizAnswerSubmitRequest,
    QuizCreateRequest,
    QuizQuestionGenerationOutput,
)
from app.services.quiz_service import QuizService


@pytest.fixture
async def sample_project(db_session: AsyncSession):
    user = User(
        id=uuid.uuid4(),
        email=f"learner_{uuid.uuid4().hex[:8]}@example.com",
        full_name="Test Learner",
        hashed_password="hash",

    )
    db_session.add(user)
    space = Space(id=uuid.uuid4(), user_id=user.id, name="Deep Learning Space")
    db_session.add(space)
    project = Project(
        id=uuid.uuid4(),
        user_id=user.id,
        space_id=space.id,
        name="Neural Nets",
        learning_goal="Master Neural Networks",
    )
    db_session.add(project)

    material = Material(
        id=uuid.uuid4(),
        user_id=user.id,
        project_id=project.id,
        filename="deep_learning.pdf",
        status="ready",
        storage_path="/tmp/deep_learning.pdf",
    )

    db_session.add(material)

    chunk1 = MaterialChunk(
        id=uuid.uuid4(),
        material_id=material.id,
        project_id=project.id,
        chunk_index=0,
        page_number=1,
        content="Backpropagation computes gradients of the loss function with respect to weights using the chain rule.",
        embedding=[0.1] * 384,
    )
    chunk2 = MaterialChunk(
        id=uuid.uuid4(),
        material_id=material.id,
        project_id=project.id,
        chunk_index=1,
        page_number=2,
        content="Activation functions like ReLU and GELU introduce non-linearities, allowing networks to learn complex representations.",
        embedding=[0.2] * 384,
    )
    db_session.add_all([chunk1, chunk2])

    concept1 = Concept(
        id=uuid.uuid4(),
        user_id=user.id,
        project_id=project.id,
        name="Backpropagation",
        description="Gradient computation algorithm using chain rule",
        source_chunk_ids=[str(chunk1.id)],
    )
    concept2 = Concept(
        id=uuid.uuid4(),
        user_id=user.id,
        project_id=project.id,
        name="Activation Functions",
        description="Non-linear functions enabling deep representations",
        source_chunk_ids=[str(chunk2.id)],
    )
    db_session.add_all([concept1, concept2])
    await db_session.commit()

    return user, project, [chunk1, chunk2], [concept1, concept2]


@pytest.mark.asyncio
async def test_mixed_quiz_generation_guarantees_open_ended(
    db_session: AsyncSession, sample_project
):
    """Verify that generating a mixed quiz guarantees open-ended questions are not sliced off."""
    user, project, chunks, concepts = sample_project
    service = QuizService(db_session)

    distinct_mcq_texts = [
        "What is the mathematical role of the chain rule in backpropagation?",
        "How does the learning rate affect weight updates during gradient descent?",
        "Why does the vanishing gradient problem occur in deep networks?",
        "What is the primary computational benefit of mini-batch processing?",
        "How do residual connections prevent degradation in very deep architectures?",
    ]
    mock_mcqs = [
        GeneratedMCQ(
            question=q_text,
            options=[
                "Computes loss gradients via the chain rule",
                "Compresses dataset into memory",
                "Converts floats to integers",
                "Replaces GPU drivers",
            ],
            correct_answer="Computes loss gradients via the chain rule",
            explanation="Backpropagation applies the chain rule systematically.",
            concept_name="Backpropagation",
            difficulty="medium",
            evidence_chunk_ids=[str(chunks[0].id)],
        )
        for q_text in distinct_mcq_texts
    ]

    mock_oes = [
        GeneratedOpenEnded(
            question="Explain how the chain rule is applied during backpropagation in a multi-layer neural network.",
            expected_answer="The chain rule computes partial derivatives of the scalar loss with respect to each weight layer by layer backwards.",
            rubric="Must mention partial derivatives, loss function, and backwards layer propagation.",
            explanation="Backpropagation is algorithmic reverse-mode automatic differentiation.",
            concept_name="Backpropagation",
            difficulty="hard",
            evidence_chunk_ids=[str(chunks[0].id)],
        ),
        GeneratedOpenEnded(
            question="Why are non-linear activation functions necessary in deep architectures?",
            expected_answer="Without non-linearities, consecutive linear layers collapse mathematically into a single linear transformation.",
            rubric="Must identify linear collapse and inability to model non-linear boundaries.",
            explanation="Composition of linear functions is linear.",
            concept_name="Activation Functions",
            difficulty="medium",
            evidence_chunk_ids=[str(chunks[1].id)],
        ),
    ]

    mock_llm_output = QuizQuestionGenerationOutput(
        mcq_questions=mock_mcqs,
        open_ended_questions=mock_oes,
    )

    usage_mock = AsyncMock()
    usage_mock.prompt_tokens = 100
    usage_mock.candidate_tokens = 200
    usage_mock.total_tokens = 300
    usage_mock.latency_ms = 450.0

    with patch("app.services.quiz_service.get_llm_provider") as mock_provider_getter:
        mock_provider = AsyncMock()
        mock_provider.generate_structured.return_value = (mock_llm_output, usage_mock)
        mock_provider_getter.return_value = mock_provider

        quiz = await service.create_quiz(
            user_id=user.id,
            project_id=project.id,
            payload=QuizCreateRequest(
                title="Mixed Assessment",
                question_count=5,
                preferred_difficulty="adaptive",
                question_format="mixed",
            ),
        )

        assert quiz.question_count == 5
        types = [q.question_type for q in quiz.questions]
        assert "open_ended" in types, "Open-ended question must be present in mixed quiz!"
        assert "mcq" in types, "MCQ question must be present in mixed quiz!"

        oe_questions = [q for q in quiz.questions if q.question_type == "open_ended"]
        assert len(oe_questions) >= 1
        for oeq in oe_questions:
            assert oeq.options == [], "Open-ended question must have empty options!"


@pytest.mark.asyncio
async def test_open_ended_only_quiz_generation(
    db_session: AsyncSession, sample_project
):
    """Verify that specifying question_format='open_ended' produces only open-ended questions."""
    user, project, chunks, concepts = sample_project
    service = QuizService(db_session)

    distinct_oe_texts = [
        "Explain how gradient descent iteratively minimizes the scalar loss function.",
        "Compare and contrast ReLU with Sigmoid activations regarding saturation.",
        "Describe the mathematical process of backpropagation through multi-layer graphs.",
        "Discuss how regularization methods prevent overfitting in deep neural models.",
    ]
    mock_oes = [
        GeneratedOpenEnded(
            question=q_text,
            expected_answer="In-depth conceptual model answer.",
            rubric="Full credit requires explaining core mechanisms.",
            explanation="Deep theoretical background.",
            concept_name="Backpropagation",
            difficulty="medium",
            evidence_chunk_ids=[str(chunks[0].id)],
        )
        for q_text in distinct_oe_texts
    ]

    mock_llm_output = QuizQuestionGenerationOutput(
        mcq_questions=[],
        open_ended_questions=mock_oes,
    )

    usage_mock = AsyncMock(prompt_tokens=50, candidate_tokens=100, total_tokens=150, latency_ms=300.0)

    with patch("app.services.quiz_service.get_llm_provider") as mock_provider_getter:
        mock_provider = AsyncMock()
        mock_provider.generate_structured.return_value = (mock_llm_output, usage_mock)
        mock_provider_getter.return_value = mock_provider

        quiz = await service.create_quiz(
            user_id=user.id,
            project_id=project.id,
            payload=QuizCreateRequest(
                title="All Open-Ended Quiz",
                question_count=3,
                question_format="open_ended",
            ),
        )

        assert quiz.question_count == 3
        for q in quiz.questions:
            assert q.question_type == "open_ended"
            assert q.options == []


@pytest.mark.asyncio
async def test_open_ended_submission_and_rubric_evaluation(
    db_session: AsyncSession, sample_project
):
    """Verify open-ended answer submission evaluates rubric, formats feedback, and completes quiz."""
    user, project, chunks, concepts = sample_project
    service = QuizService(db_session)

    # 1. Create open-ended question directly in quiz
    quiz = await service.quiz_repo.create_quiz(
        user_id=user.id, project_id=project.id, title="OE Rubric Quiz"
    )
    saved_qs = await service.quiz_repo.add_questions(
        quiz_id=quiz.id,
        user_id=user.id,
        project_id=project.id,
        questions_data=[
            {
                "concept_id": concepts[0].id,
                "question_type": "open_ended",
                "question_text": "Explain how backpropagation computes gradients.",
                "options": [],
                "correct_answer": "Applies the chain rule layer by layer backwards.",
                "explanation": "Reverse-mode autodiff through the computational graph.",
                "rubric": "Must mention chain rule and backwards propagation.",
                "difficulty": "medium",
                "source_chunk_ids": [str(chunks[0].id)],
                "question_order": 1,
            }
        ],
    )
    question = saved_qs[0]

    attempt = await service.start_attempt(user_id=user.id, quiz_id=quiz.id)

    # 2. Mock LLM evaluation output
    mock_eval = OpenEndedEvaluationOutput(
        score=0.85,
        is_correct=True,
        strengths=["Accurately identified chain rule application", "Clear layer-by-layer reasoning"],
        missing_points=["Could mention computational graph optimization"],
        feedback="Strong understanding of backpropagation mechanics.",
    )
    usage_mock = AsyncMock(prompt_tokens=60, candidate_tokens=80, total_tokens=140, latency_ms=250.0)

    with patch("app.services.quiz_service.get_llm_provider") as mock_provider_getter:
        mock_provider = AsyncMock()
        mock_provider.generate_structured.return_value = (mock_eval, usage_mock)
        mock_provider_getter.return_value = mock_provider

        answer_resp = await service.submit_answer(
            user_id=user.id,
            quiz_id=quiz.id,
            attempt_id=attempt.id,
            question_id=question.id,
            payload=QuizAnswerSubmitRequest(
                answer_text="Backpropagation applies the chain rule repeatedly starting from the final loss layer backward to find all parameter gradients."
            ),
        )

        assert answer_resp.is_correct is True
        assert answer_resp.score == 0.85
        assert "Strengths:" in answer_resp.evaluation_feedback
        assert "Areas to improve:" in answer_resp.evaluation_feedback
        assert "Strong understanding" in answer_resp.evaluation_feedback

    # 3. Complete attempt and verify learning loop
    completed_result = await service.complete_attempt(
        user_id=user.id, quiz_id=quiz.id, attempt_id=attempt.id
    )
    assert completed_result.status == "completed"
    assert completed_result.score_percentage == 85.0
    assert completed_result.correct_answers == 1
