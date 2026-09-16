"""API Endpoints for Adaptive Quiz, Assessment, and Concept Inventory.

Enforces strict tenant isolation: all requests require authentication and derive
user identity from JWT cookies.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.quiz import (
    ConceptResponse,
    QuizAnswerResponse,
    QuizAnswerSubmitRequest,
    QuizAttemptResponse,
    QuizCreateRequest,
    QuizResponse,
    QuizResultResponse,
)
from app.services.quiz_service import QuizService

router = APIRouter()


# ---------------------------------------------------------------------------
# Concept Inventory
# ---------------------------------------------------------------------------

@router.get(
    "/projects/{project_id}/concepts",
    response_model=list[ConceptResponse],
    status_code=status.HTTP_200_OK,
    summary="List extracted concepts for a project",
)
async def list_concepts(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ConceptResponse]:
    """Retrieve all core knowledge concepts identified for this project."""
    service = QuizService(db)
    concepts = await service.ensure_project_concepts(
        user_id=current_user.id,
        project_id=project_id,
        force_refresh=False,
    )
    return [
        ConceptResponse(
            id=c.id,
            project_id=c.project_id,
            name=c.name,
            description=c.description,
            source_chunk_ids=c.source_chunk_ids,
            created_at=c.created_at,
            updated_at=c.updated_at,
        )
        for c in concepts
    ]


@router.post(
    "/projects/{project_id}/concepts/extract",
    response_model=list[ConceptResponse],
    status_code=status.HTTP_200_OK,
    summary="Force extract/refresh concepts from project materials",
)
async def extract_concepts(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ConceptResponse]:
    """Extract and persist concepts grounded in project materials using Gemini."""
    service = QuizService(db)
    concepts = await service.ensure_project_concepts(
        user_id=current_user.id,
        project_id=project_id,
        force_refresh=True,
    )
    return [
        ConceptResponse(
            id=c.id,
            project_id=c.project_id,
            name=c.name,
            description=c.description,
            source_chunk_ids=c.source_chunk_ids,
            created_at=c.created_at,
            updated_at=c.updated_at,
        )
        for c in concepts
    ]


# ---------------------------------------------------------------------------
# Quiz Management & Question Generation
# ---------------------------------------------------------------------------

@router.post(
    "/projects/{project_id}/quizzes",
    response_model=QuizResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create/generate an adaptive quiz grounded in project materials",
)
async def create_quiz(
    project_id: uuid.UUID,
    payload: QuizCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QuizResponse:
    """Generate a multi-signal adaptive quiz tailored to the learner's performance."""
    service = QuizService(db)
    return await service.create_quiz(
        user_id=current_user.id,
        project_id=project_id,
        payload=payload,
    )


@router.get(
    "/projects/{project_id}/quizzes",
    response_model=list[QuizResponse],
    status_code=status.HTTP_200_OK,
    summary="List all quizzes for a project",
)
async def list_quizzes(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[QuizResponse]:
    """List all quizzes created for this project."""
    service = QuizService(db)
    return await service.list_quizzes(
        user_id=current_user.id,
        project_id=project_id,
    )


@router.get(
    "/projects/{project_id}/quizzes/{quiz_id}",
    response_model=QuizResponse,
    status_code=status.HTTP_200_OK,
    summary="Get quiz details with public questions (answers masked)",
)
async def get_quiz(
    project_id: uuid.UUID,
    quiz_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QuizResponse:
    """Fetch quiz details and public questions without exposing solutions."""
    service = QuizService(db)
    quiz = await service.get_quiz(user_id=current_user.id, quiz_id=quiz_id)
    if quiz.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz not found")
    return quiz


# ---------------------------------------------------------------------------
# Quiz Attempts & Answer Submission
# ---------------------------------------------------------------------------

@router.post(
    "/projects/{project_id}/quizzes/{quiz_id}/attempts",
    response_model=QuizAttemptResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Start a new quiz attempt",
)
async def start_attempt(
    project_id: uuid.UUID,
    quiz_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QuizAttemptResponse:
    """Initialize a new attempt session for the given quiz."""
    service = QuizService(db)
    quiz = await service.get_quiz(user_id=current_user.id, quiz_id=quiz_id)
    if quiz.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz not found")

    attempt = await service.start_attempt(user_id=current_user.id, quiz_id=quiz_id)
    return QuizAttemptResponse(
        id=attempt.id,
        quiz_id=attempt.quiz_id,
        project_id=attempt.project_id,
        started_at=attempt.started_at,
        completed_at=attempt.completed_at,
        score=attempt.score,
        total_questions=attempt.total_questions,
        correct_answers=attempt.correct_answers,
        status=attempt.status,
    )


@router.get(
    "/projects/{project_id}/quizzes/{quiz_id}/attempts/{attempt_id}",
    response_model=QuizAttemptResponse,
    status_code=status.HTTP_200_OK,
    summary="Get quiz attempt state",
)
async def get_attempt(
    project_id: uuid.UUID,
    quiz_id: uuid.UUID,
    attempt_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QuizAttemptResponse:
    """Retrieve attempt progress and status."""
    service = QuizService(db)
    attempt = await service.get_attempt(user_id=current_user.id, attempt_id=attempt_id)
    if attempt.quiz_id != quiz_id or attempt.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")

    return QuizAttemptResponse(
        id=attempt.id,
        quiz_id=attempt.quiz_id,
        project_id=attempt.project_id,
        started_at=attempt.started_at,
        completed_at=attempt.completed_at,
        score=attempt.score,
        total_questions=attempt.total_questions,
        correct_answers=attempt.correct_answers,
        status=attempt.status,
    )


@router.post(
    "/projects/{project_id}/quizzes/{quiz_id}/attempts/{attempt_id}/answers",
    response_model=QuizAnswerResponse,
    status_code=status.HTTP_200_OK,
    summary="Submit and evaluate an answer for a question in an attempt",
)
async def submit_answer(
    project_id: uuid.UUID,
    quiz_id: uuid.UUID,
    attempt_id: uuid.UUID,
    payload: QuizAnswerSubmitRequest,
    question_id: uuid.UUID | None = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QuizAnswerResponse:
    """Submit an MCQ or open-ended answer.
    MCQ is evaluated deterministically. Open-ended is assessed via Gemini against the rubric.
    """
    effective_qid = question_id or payload.question_id
    if not effective_qid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Question ID must be specified in query or request body",
        )

    service = QuizService(db)
    return await service.submit_answer(
        user_id=current_user.id,
        quiz_id=quiz_id,
        attempt_id=attempt_id,
        question_id=effective_qid,
        payload=payload,
    )


@router.post(
    "/projects/{project_id}/quizzes/{quiz_id}/attempts/{attempt_id}/questions/{question_id}/answers",
    response_model=QuizAnswerResponse,
    status_code=status.HTTP_200_OK,
    summary="Submit answer for a specific question ID (explicit route)",
)
async def submit_question_answer(
    project_id: uuid.UUID,
    quiz_id: uuid.UUID,
    attempt_id: uuid.UUID,
    question_id: uuid.UUID,
    payload: QuizAnswerSubmitRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QuizAnswerResponse:
    """Explicit route for submitting an answer for a specific question."""
    service = QuizService(db)
    return await service.submit_answer(
        user_id=current_user.id,
        quiz_id=quiz_id,
        attempt_id=attempt_id,
        question_id=question_id,
        payload=payload,
    )


@router.post(
    "/projects/{project_id}/quizzes/{quiz_id}/attempts/{attempt_id}/complete",
    response_model=QuizResultResponse,
    status_code=status.HTTP_200_OK,
    summary="Complete a quiz attempt and compute results and concept performance",
)
async def complete_attempt(
    project_id: uuid.UUID,
    quiz_id: uuid.UUID,
    attempt_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> QuizResultResponse:
    """Finalize the attempt and retrieve full results with revealed explanations and concept metrics."""
    service = QuizService(db)
    return await service.complete_attempt(
        user_id=current_user.id,
        quiz_id=quiz_id,
        attempt_id=attempt_id,
    )
