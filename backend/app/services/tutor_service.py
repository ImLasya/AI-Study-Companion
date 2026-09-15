"""Grounded AI Tutor Domain Service.

Orchestrates multi-tenant verification, preflight material checks, pgvector retrieval,
context building, Google Gemini generation, citation validation, and message persistence.
"""

import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.gemini_provider import get_llm_provider
from app.ai.llm import LLMGenerationError
from app.ai.observability import log_ai_usage
from app.ai.prompts import TUTOR_SYSTEM_INSTRUCTION, build_tutor_user_prompt
from app.core.config import settings
from app.repositories.conversation_repository import ConversationRepository
from app.repositories.material_repository import MaterialRepository
from app.repositories.project_repository import ProjectRepository
from app.schemas.tutor import (
    TutorAnswer,
    TutorCitation,
    TutorConversationResponse,
    TutorConversationSummary,
    TutorMessageResponse,
    TutorRequest,
    TutorStructuredOutput,
)
from app.services.retrieval_service import RetrievalService


class TutorService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.project_repo = ProjectRepository(session)
        self.material_repo = MaterialRepository(session)
        self.conv_repo = ConversationRepository(session)
        self.retrieval_service = RetrievalService(session)

    async def ask(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        payload: TutorRequest,
    ) -> TutorAnswer:
        """Process a learner question through the grounded RAG pipeline."""
        # 1. Tenant & Project Validation
        project = await self.project_repo.get_by_id(user_id=user_id, project_id=project_id)
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )

        # 2. Conversation Loading / Creation
        conversation = None
        if payload.conversation_id:
            conversation = await self.conv_repo.get_conversation(
                user_id=user_id,
                conversation_id=payload.conversation_id,
            )
            if not conversation or conversation.project_id != project_id:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Conversation not found in this project",
                )
        else:
            # Generate a title from the first words of the question
            snippet = payload.question.strip()[:40]
            title = f"{snippet}..." if len(payload.question.strip()) > 40 else snippet
            conversation = await self.conv_repo.create_conversation(
                user_id=user_id,
                project_id=project_id,
                title=title,
            )

        # 3. Persist Learner Question Message
        await self.conv_repo.add_message(
            conversation_id=conversation.id,
            user_id=user_id,
            project_id=project_id,
            role="user",
            content=payload.question,
        )

        # 4. Preflight Material Readiness Check
        has_ready = await self.material_repo.has_ready_materials(
            user_id=user_id,
            project_id=project_id,
        )
        if not has_ready:
            guidance_text = (
                "Please upload and process learning materials for this project first "
                "before asking the AI Tutor."
            )
            assistant_msg = await self.conv_repo.add_message(
                conversation_id=conversation.id,
                user_id=user_id,
                project_id=project_id,
                role="assistant",
                content=guidance_text,
                grounded=False,
                insufficient_evidence=True,
                citations=[],
            )
            return TutorAnswer(
                conversation_id=conversation.id,
                message_id=assistant_msg.id,
                answer=guidance_text,
                grounded=False,
                insufficient_evidence=True,
                citations=[],
            )

        # 5. Semantic Vector Retrieval & Evidence Threshold Filtering
        retrieval_result = await self.retrieval_service.retrieve_relevant_chunks(
            user_id=user_id,
            project_id=project_id,
            question=payload.question,
        )

        # 6. Check Evidence Sufficiency
        if not retrieval_result.is_sufficient or not retrieval_result.accepted_chunks:
            fallback_text = (
                "The uploaded learning materials for this project do not contain "
                "enough relevant information to answer your question accurately."
            )
            assistant_msg = await self.conv_repo.add_message(
                conversation_id=conversation.id,
                user_id=user_id,
                project_id=project_id,
                role="assistant",
                content=fallback_text,
                grounded=False,
                insufficient_evidence=True,
                citations=[],
            )
            log_ai_usage(
                user_id=user_id,
                project_id=project_id,
                operation="tutor_insufficient_evidence",
                provider="gemini",
                model=settings.GEMINI_MODEL,
                latency_ms=0.0,
                success=True,
            )
            return TutorAnswer(
                conversation_id=conversation.id,
                message_id=assistant_msg.id,
                answer=fallback_text,
                grounded=False,
                insufficient_evidence=True,
                citations=[],
            )

        # 7. Build Grounded Context
        recent_history = await self.conv_repo.get_recent_messages(
            conversation_id=conversation.id,
            user_id=user_id,
            limit=settings.TUTOR_HISTORY_LIMIT,
        )
        # Exclude the message just added
        conv_turns = [
            {"role": m.role, "content": m.content}
            for m in recent_history[:-1]
            if m.role in ("user", "assistant")
        ]

        evidence_payload = [
            {
                "chunk_id": str(c.chunk_id),
                "page_number": c.page_number,
                "filename": c.filename,
                "content": c.content,
            }
            for c in retrieval_result.accepted_chunks
        ]

        user_prompt = build_tutor_user_prompt(
            question=payload.question,
            evidence_chunks=evidence_payload,
            conversation_history=conv_turns,
        )

        # 8. Call LLM Provider (Google Gemini)
        provider = get_llm_provider()
        try:
            structured_output, usage = await provider.generate_structured(
                system_instruction=TUTOR_SYSTEM_INSTRUCTION,
                user_prompt=user_prompt,
                response_schema=TutorStructuredOutput,
                temperature=0.2,
            )
        except LLMGenerationError as err:
            log_ai_usage(
                user_id=user_id,
                project_id=project_id,
                operation="tutor_generation",
                provider="gemini",
                model=settings.GEMINI_MODEL,
                latency_ms=0.0,
                success=False,
                error=str(err),
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="The AI Tutor is temporarily unavailable. Please try again in a moment.",
            ) from err

        # 9. Validate Citations against Actual Retrieved Database Chunks
        chunk_lookup = {str(c.chunk_id): c for c in retrieval_result.accepted_chunks}
        validated_citations: list[TutorCitation] = []
        seen_chunk_ids: set[str] = set()

        for raw_id in structured_output.citation_chunk_ids:
            clean_id = raw_id.strip()
            if clean_id in chunk_lookup and clean_id not in seen_chunk_ids:
                seen_chunk_ids.add(clean_id)
                db_chunk = chunk_lookup[clean_id]
                validated_citations.append(
                    TutorCitation(
                        chunk_id=db_chunk.chunk_id,
                        material_id=db_chunk.material_id,
                        filename=db_chunk.filename,
                        page_number=db_chunk.page_number,
                    )
                )

        # Invariant: If insufficient_evidence is True, citations must be empty
        final_grounded = structured_output.grounded and not structured_output.insufficient_evidence
        final_insufficient = structured_output.insufficient_evidence or not final_grounded
        if final_insufficient:
            validated_citations = []

        # 10. Persist Assistant Response
        assistant_msg = await self.conv_repo.add_message(
            conversation_id=conversation.id,
            user_id=user_id,
            project_id=project_id,
            role="assistant",
            content=structured_output.answer,
            grounded=final_grounded,
            insufficient_evidence=final_insufficient,
            citations=[c.model_dump(mode="json") for c in validated_citations],
        )

        # 11. AI Usage & Observability Logging
        log_ai_usage(
            user_id=user_id,
            project_id=project_id,
            operation="tutor",
            provider="gemini",
            model=settings.GEMINI_MODEL,
            latency_ms=usage.latency_ms,
            input_tokens=usage.prompt_tokens,
            output_tokens=usage.candidate_tokens,
            total_tokens=usage.total_tokens,
            success=True,
        )

        return TutorAnswer(
            conversation_id=conversation.id,
            message_id=assistant_msg.id,
            answer=structured_output.answer,
            grounded=final_grounded,
            insufficient_evidence=final_insufficient,
            citations=validated_citations,
        )

    async def list_conversations(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
    ) -> list[TutorConversationSummary]:
        """List all tutor conversations for a project."""
        project = await self.project_repo.get_by_id(user_id=user_id, project_id=project_id)
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )

        rows = await self.conv_repo.list_by_project(user_id=user_id, project_id=project_id)
        return [
            TutorConversationSummary(
                id=conv.id,
                project_id=conv.project_id,
                title=conv.title,
                created_at=conv.created_at,
                updated_at=conv.updated_at,
                message_count=count,
            )
            for conv, count in rows
        ]

    async def get_conversation(
        self,
        user_id: uuid.UUID,
        conversation_id: uuid.UUID,
    ) -> TutorConversationResponse:
        """Fetch a conversation and its messages with tenant isolation."""
        conv = await self.conv_repo.get_conversation(
            user_id=user_id,
            conversation_id=conversation_id,
        )
        if not conv:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation not found",
            )

        messages = [
            TutorMessageResponse(
                id=m.id,
                role=m.role,
                content=m.content,
                grounded=m.grounded,
                insufficient_evidence=m.insufficient_evidence,
                citations=[TutorCitation(**c) for c in (m.citations or [])],
                created_at=m.created_at,
            )
            for m in conv.messages
        ]

        return TutorConversationResponse(
            id=conv.id,
            project_id=conv.project_id,
            title=conv.title,
            created_at=conv.created_at,
            updated_at=conv.updated_at,
            messages=messages,
        )
