"""API Endpoints for AI Tutor and Grounded RAG.

Provides REST interfaces for submitting learner questions, listing conversations,
and retrieving multi-turn study session threads.
"""

import uuid

from fastapi import APIRouter, Depends, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.tutor import (
    TutorAnswer,
    TutorConversationResponse,
    TutorConversationSummary,
    TutorRequest,
)
from app.services.tutor_service import TutorService

router = APIRouter()


@router.post(
    "/projects/{project_id}/tutor",
    response_model=TutorAnswer,
    status_code=status.HTTP_200_OK,
    summary="Ask AI Tutor a question grounded in project learning materials",
)
async def ask_tutor(
    project_id: uuid.UUID,
    payload: TutorRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TutorAnswer:
    """Submit a question to the AI Tutor.

    Answers are strictly grounded in uploaded project materials with page-level citations.
    """
    service = TutorService(db)
    return await service.ask(
        user_id=current_user.id,
        project_id=project_id,
        payload=payload,
    )


@router.post(
    "/projects/{project_id}/tutor/stream",
    status_code=status.HTTP_200_OK,
    summary="Stream AI Tutor answer grounded in project materials via SSE",
)
async def ask_tutor_stream(
    project_id: uuid.UUID,
    payload: TutorRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Stream a grounded tutor response token-by-token using Server-Sent Events (SSE)."""
    service = TutorService(db)
    event_generator = service.ask_stream(
        user_id=current_user.id,
        project_id=project_id,
        payload=payload,
        request=request,
    )
    return StreamingResponse(
        event_generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get(
    "/projects/{project_id}/tutor/conversations",
    response_model=list[TutorConversationSummary],
    status_code=status.HTTP_200_OK,
    summary="List all tutor conversations for a project",
)
async def list_conversations(
    project_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[TutorConversationSummary]:
    """Retrieve all study session conversations for a project."""
    service = TutorService(db)
    return await service.list_conversations(
        user_id=current_user.id,
        project_id=project_id,
    )


@router.get(
    "/tutor/conversations/{conversation_id}",
    response_model=TutorConversationResponse,
    status_code=status.HTTP_200_OK,
    summary="Get full conversation history by ID",
)
async def get_conversation(
    conversation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TutorConversationResponse:
    """Fetch conversation details and messages with strict tenant isolation."""
    service = TutorService(db)
    return await service.get_conversation(
        user_id=current_user.id,
        conversation_id=conversation_id,
    )
