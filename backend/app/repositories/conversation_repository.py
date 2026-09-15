"""Tutor Conversation and Message Repository.

Enforces strict tenant isolation: all conversation and message queries
must filter by both entity ID and user_id.
"""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.conversation import TutorConversation, TutorMessage


class ConversationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_conversation(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        title: str = "Study Session",
    ) -> TutorConversation:
        """Create a new TutorConversation."""
        conversation = TutorConversation(
            id=uuid.uuid4(),
            user_id=user_id,
            project_id=project_id,
            title=title,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        self.session.add(conversation)
        await self.session.commit()
        await self.session.refresh(conversation)
        return conversation

    async def get_conversation(
        self,
        user_id: uuid.UUID,
        conversation_id: uuid.UUID,
    ) -> TutorConversation | None:
        """Fetch a conversation by ID with eager loaded messages, strictly scoped to user_id.

        ISOLATION BOUNDARY: WHERE id = :conversation_id AND user_id = :user_id
        """
        stmt = (
            select(TutorConversation)
            .options(selectinload(TutorConversation.messages))
            .where(
                TutorConversation.id == conversation_id,
                TutorConversation.user_id == user_id,
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_by_project(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
    ) -> list[tuple[TutorConversation, int]]:
        """List all conversations for a project with message counts, strictly scoped to user_id.

        ISOLATION BOUNDARY: WHERE project_id = :project_id AND user_id = :user_id
        """
        stmt = (
            select(
                TutorConversation,
                func.count(TutorMessage.id).label("message_count"),
            )
            .outerjoin(TutorMessage, TutorConversation.id == TutorMessage.conversation_id)
            .where(
                TutorConversation.project_id == project_id,
                TutorConversation.user_id == user_id,
            )
            .group_by(TutorConversation.id)
            .order_by(TutorConversation.updated_at.desc())
        )
        result = await self.session.execute(stmt)
        return [(row[0], int(row[1])) for row in result.all()]

    async def add_message(
        self,
        conversation_id: uuid.UUID,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        role: str,
        content: str,
        grounded: bool = False,
        insufficient_evidence: bool = False,
        citations: list[dict[str, Any]] | None = None,
    ) -> TutorMessage:
        """Add a user or assistant message to an existing conversation and update conversation timestamp."""
        message = TutorMessage(
            id=uuid.uuid4(),
            conversation_id=conversation_id,
            user_id=user_id,
            project_id=project_id,
            role=role,
            content=content,
            grounded=grounded,
            insufficient_evidence=insufficient_evidence,
            citations=citations or [],
            created_at=datetime.now(UTC),
        )
        self.session.add(message)

        # Update parent conversation updated_at
        stmt = select(TutorConversation).where(
            TutorConversation.id == conversation_id,
            TutorConversation.user_id == user_id,
        )
        res = await self.session.execute(stmt)
        conversation = res.scalar_one_or_none()
        if conversation:
            conversation.updated_at = datetime.now(UTC)

        await self.session.commit()
        await self.session.refresh(message)
        return message

    async def get_recent_messages(
        self,
        conversation_id: uuid.UUID,
        user_id: uuid.UUID,
        limit: int = 6,
    ) -> list[TutorMessage]:
        """Fetch the most recent N messages for a conversation in chronological order.

        ISOLATION BOUNDARY: WHERE conversation_id = :conversation_id AND user_id = :user_id
        """
        # Fetch latest N descending, then reverse to chronological order
        stmt = (
            select(TutorMessage)
            .where(
                TutorMessage.conversation_id == conversation_id,
                TutorMessage.user_id == user_id,
            )
            .order_by(TutorMessage.created_at.desc())
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        messages = list(result.scalars().all())
        messages.reverse()
        return messages
