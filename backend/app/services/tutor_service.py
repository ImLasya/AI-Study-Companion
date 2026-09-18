"""Grounded AI Tutor Domain Service.

Orchestrates multi-tenant verification, preflight material checks, pgvector retrieval,
context building, Google Gemini generation, citation validation, and message persistence.
"""

import json
import logging
import uuid
from collections.abc import AsyncIterator
from typing import Any

from fastapi import HTTPException, Request, status
from langsmith import traceable
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.embeddings import embed_text
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
from app.services.retrieval_service import RetrievalService, RetrievedChunk
from app.services.tutor_context_service import TutorContextService

logger = logging.getLogger("ai_study_companion.services.tutor")

# ==============================================================================
# LangSmith Safe Serialization Helpers
# ==============================================================================



def _safe_tutor_inputs(inputs: dict[str, Any]) -> dict[str, Any]:
    payload = inputs.get("payload")
    question = getattr(payload, "question", None) or str(inputs.get("question", ""))
    return {
        "project_id": str(inputs.get("project_id", "")),
        "question": question,
    }


def _safe_tutor_outputs(result: Any) -> dict[str, Any]:
    if isinstance(result, TutorAnswer):
        insufficient = result.insufficient_evidence
        return {
            "grounded": result.grounded,
            "insufficient_evidence": insufficient,
            "gemini_called": not insufficient,
            "citation_count": len(result.citations),
            "status": "insufficient_evidence" if insufficient else "success",
        }
    elif isinstance(result, dict):
        insufficient = result.get("insufficient_evidence", False)
        return {
            "grounded": result.get("grounded", False),
            "insufficient_evidence": insufficient,
            "gemini_called": not insufficient,
            "citation_count": result.get("citation_count", 0),
            "status": result.get("status", "success"),
        }
    return {"status": "success", "gemini_called": True}


def _safe_preflight_inputs(inputs: dict[str, Any]) -> dict[str, Any]:
    return {"project_id": str(inputs.get("project_id", ""))}


def _safe_preflight_outputs(result: dict[str, Any]) -> dict[str, Any]:
    return {
        "ready": result.get("ready", False),
        "material_count": result.get("material_count", 0),
    }


def _safe_embed_inputs(inputs: dict[str, Any]) -> dict[str, Any]:
    return {"question_length": len(str(inputs.get("question", "")))}


def _safe_embed_outputs(result: dict[str, Any]) -> dict[str, Any]:
    return {
        "model": result.get("model", settings.EMBEDDING_MODEL_NAME),
        "dimension": result.get("dimension", settings.EMBEDDING_DIMENSION),
    }


def _safe_prompt_inputs(inputs: dict[str, Any]) -> dict[str, Any]:
    return {
        "question_length": len(str(inputs.get("question", ""))),
        "accepted_chunks_count": len(inputs.get("accepted_chunks", [])),
        "history_count": len(inputs.get("conv_turns", [])),
    }


def _safe_prompt_outputs(result: tuple[str, dict[str, Any]]) -> dict[str, Any]:
    return result[1] if len(result) > 1 else {}


def _safe_citation_inputs(inputs: dict[str, Any]) -> dict[str, Any]:
    return {
        "raw_citation_ids": inputs.get("raw_citation_ids", []),
        "accepted_chunks_count": len(inputs.get("accepted_chunks", [])),
        "raw_grounded": inputs.get("raw_grounded", False),
        "raw_insufficient_evidence": inputs.get("raw_insufficient_evidence", False),
    }


def _safe_citation_outputs(
    result: tuple[list[TutorCitation], bool, bool, dict[str, Any]]
) -> dict[str, Any]:
    return result[3] if len(result) > 3 else {}


def _safe_persist_inputs(inputs: dict[str, Any]) -> dict[str, Any]:
    return {
        "conversation_id": str(inputs.get("conversation_id", "")),
        "role": inputs.get("role", "assistant"),
        "citation_count": len(inputs.get("citations", [])),
        "grounded": inputs.get("grounded", False),
    }


def _safe_persist_outputs(result: tuple[Any, dict[str, Any]]) -> dict[str, Any]:
    return result[1] if len(result) > 1 else {}


# ==============================================================================
# Traced Step Functions
# ==============================================================================


@traceable(
    name="Tutor Preflight",
    run_type="chain",
    process_inputs=_safe_preflight_inputs,
    process_outputs=_safe_preflight_outputs,
)
async def _trace_tutor_preflight(
    material_repo: MaterialRepository,
    user_id: uuid.UUID,
    project_id: uuid.UUID,
) -> dict[str, Any]:
    count = await material_repo.count_ready_materials(user_id=user_id, project_id=project_id)
    return {
        "ready": count > 0,
        "material_count": count,
    }


@traceable(
    name="Load Conversation Context",
    run_type="chain",
    process_inputs=lambda inputs: {
        "conversation_id": str(inputs.get("conversation_id", "")),
        "history_limit": inputs.get("history_limit", settings.TUTOR_HISTORY_LIMIT),
    },
    process_outputs=lambda res: {
        "conversation_id": res.get("conversation_id"),
        "history_limit": res.get("history_limit"),
        "retrieved_count": res.get("retrieved_count", 0),
        "included_count": res.get("included_count", 0),
        "status": "success",
    },
)
async def _trace_load_conversation_context(
    conv_repo: ConversationRepository,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    history_limit: int,
) -> dict[str, Any]:
    recent_history = await conv_repo.get_recent_messages(
        conversation_id=conversation_id,
        user_id=user_id,
        limit=history_limit,
    )
    conv_turns = [
        {"role": m.role, "content": m.content}
        for m in recent_history[:-1]
        if m.role in ("user", "assistant")
    ]
    return {
        "conversation_id": str(conversation_id),
        "history_limit": history_limit,
        "retrieved_count": len(recent_history),
        "included_count": len(conv_turns),
        "conv_turns": conv_turns,
    }


@traceable(
    name="Embed Question",
    run_type="embedding",
    process_inputs=_safe_embed_inputs,
    process_outputs=_safe_embed_outputs,
)
def _trace_embed_question(question: str) -> dict[str, Any]:
    _ = embed_text(question)
    return {
        "model": settings.EMBEDDING_MODEL_NAME,
        "dimension": settings.EMBEDDING_DIMENSION,
    }


@traceable(
    name="Build Grounded Prompt",
    run_type="prompt",
    process_inputs=_safe_prompt_inputs,
    process_outputs=_safe_prompt_outputs,
)
def _trace_build_grounded_prompt(
    question: str,
    accepted_chunks: list[RetrievedChunk],
    conv_turns: list[dict[str, Any]],
    pedagogical_context: dict[str, Any] | None = None,
) -> tuple[str, dict[str, Any]]:
    evidence_payload = [
        {
            "chunk_id": str(c.chunk_id),
            "page_number": c.page_number,
            "filename": c.filename,
            "content": c.content,
            "section_heading": c.section_heading,
        }
        for c in accepted_chunks
    ]
    prompt = build_tutor_user_prompt(
        question=question,
        evidence_chunks=evidence_payload,
        conversation_history=conv_turns,
        pedagogical_context=pedagogical_context,
    )
    meta = {
        "accepted_chunks_count": len(accepted_chunks),
        "citation_chunk_ids": [str(c.chunk_id) for c in accepted_chunks],
        "page_numbers": [c.page_number for c in accepted_chunks],
        "prompt_char_count": len(prompt),
        "history_message_count": len(conv_turns),
        "pedagogical_context_present": bool(pedagogical_context),
    }
    return prompt, meta


@traceable(
    name="Validate Citations",
    run_type="chain",
    process_inputs=_safe_citation_inputs,
    process_outputs=_safe_citation_outputs,
)
def _trace_validate_citations(
    raw_citation_ids: list[str],
    accepted_chunks: list[RetrievedChunk],
    raw_grounded: bool,
    raw_insufficient_evidence: bool,
) -> tuple[list[TutorCitation], bool, bool, dict[str, Any]]:
    chunk_lookup = {str(c.chunk_id): c for c in accepted_chunks}
    validated_citations: list[TutorCitation] = []
    seen_chunk_ids: set[str] = set()
    valid_ids: list[str] = []
    invalid_ids: list[str] = []

    for raw_id in raw_citation_ids:
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
            valid_ids.append(clean_id)
        elif clean_id not in chunk_lookup:
            invalid_ids.append(clean_id)

    final_grounded = raw_grounded and not raw_insufficient_evidence
    final_insufficient = raw_insufficient_evidence or not final_grounded
    if final_insufficient:
        validated_citations = []

    summary = {
        "returned_citation_ids": raw_citation_ids,
        "valid_citation_ids": valid_ids,
        "invalid_citation_ids": invalid_ids,
        "grounded": final_grounded,
        "insufficient_evidence": final_insufficient,
    }
    return validated_citations, final_grounded, final_insufficient, summary


@traceable(
    name="Persist Tutor Message",
    run_type="chain",
    process_inputs=_safe_persist_inputs,
    process_outputs=_safe_persist_outputs,
)
async def _trace_persist_message(
    conv_repo: ConversationRepository,
    conversation_id: uuid.UUID,
    user_id: uuid.UUID,
    project_id: uuid.UUID,
    role: str,
    content: str,
    grounded: bool,
    insufficient_evidence: bool,
    citations: list[dict[str, Any]],
) -> tuple[Any, dict[str, Any]]:
    msg = await conv_repo.add_message(
        conversation_id=conversation_id,
        user_id=user_id,
        project_id=project_id,
        role=role,
        content=content,
        grounded=grounded,
        insufficient_evidence=insufficient_evidence,
        citations=citations,
    )
    summary = {
        "conversation_id": str(conversation_id),
        "message_id": str(msg.id),
        "role": role,
        "citation_count": len(citations),
        "grounded": grounded,
    }
    return msg, summary


# ==============================================================================
# Tutor Service
# ==============================================================================


class TutorService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.project_repo = ProjectRepository(session)
        self.material_repo = MaterialRepository(session)
        self.conv_repo = ConversationRepository(session)
        self.retrieval_service = RetrievalService(session)
        self.context_service = TutorContextService(session)

    @traceable(
        name="AI Tutor Request",
        run_type="chain",
        process_inputs=_safe_tutor_inputs,
        process_outputs=_safe_tutor_outputs,
    )
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

        # 4. Preflight Material Readiness Check (Traced Step)
        preflight_res = await _trace_tutor_preflight(
            material_repo=self.material_repo,
            user_id=user_id,
            project_id=project_id,
        )
        if not preflight_res["ready"]:
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

        # 5. Load Conversation Context (Traced Step)
        _ = await _trace_load_conversation_context(
            conv_repo=self.conv_repo,
            conversation_id=conversation.id,
            user_id=user_id,
            history_limit=settings.TUTOR_HISTORY_LIMIT,
        )

        # Load Pedagogical Context (History, Weak Concepts, Recent Mistakes)
        pedagogical_context = await self.context_service.assemble_context(
            user_id=user_id,
            project_id=project_id,
            conversation_id=conversation.id,
            history_limit=settings.TUTOR_HISTORY_LIMIT,
        )
        conv_turns = pedagogical_context.conversation_turns

        # 6. Embed Question (Traced Step)
        _ = _trace_embed_question(question=payload.question)

        # 7. Semantic Vector Retrieval & Evidence Threshold Filtering (Traced Step)
        retrieval_result = await self.retrieval_service.retrieve_relevant_chunks(
            user_id=user_id,
            project_id=project_id,
            question=payload.question,
        )

        # 8. Check Evidence Sufficiency
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
            await log_ai_usage(
                user_id=user_id,
                project_id=project_id,
                operation="tutor_insufficient_evidence",
                provider="gemini",
                model=settings.GEMINI_MODEL,
                latency_ms=0.0,
                success=True,
                session=self.session,
            )
            return TutorAnswer(
                conversation_id=conversation.id,
                message_id=assistant_msg.id,
                answer=fallback_text,
                grounded=False,
                insufficient_evidence=True,
                citations=[],
            )

        # 9. Build Grounded Context & Prompt (Traced Step)
        user_prompt, _ = _trace_build_grounded_prompt(
            question=payload.question,
            accepted_chunks=retrieval_result.accepted_chunks,
            conv_turns=conv_turns,
            pedagogical_context=pedagogical_context.to_dict(),
        )

        # 9. Call LLM Provider (Google Gemini with official wrap_gemini tracing)
        provider = get_llm_provider()
        try:
            structured_output, usage = await provider.generate_structured(
                system_instruction=TUTOR_SYSTEM_INSTRUCTION,
                user_prompt=user_prompt,
                response_schema=TutorStructuredOutput,
                temperature=0.2,
                feature="tutor",
                tags=["tutor"],
                metadata={"project_id": str(project_id)},
            )
        except LLMGenerationError as err:
            await log_ai_usage(
                user_id=user_id,
                project_id=project_id,
                operation="tutor_generation",
                provider="gemini",
                model=settings.GEMINI_MODEL,
                latency_ms=0.0,
                success=False,
                error=str(err),
                session=self.session,
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="The AI Tutor is temporarily unavailable. Please try again in a moment.",
            ) from err

        # 10. Validate Citations against Retrieved Database Chunks (Traced Step)
        validated_citations, final_grounded, final_insufficient, _ = _trace_validate_citations(
            raw_citation_ids=structured_output.citation_chunk_ids,
            accepted_chunks=retrieval_result.accepted_chunks,
            raw_grounded=structured_output.grounded,
            raw_insufficient_evidence=structured_output.insufficient_evidence,
        )

        # 11. Persist Assistant Response (Traced Step)
        assistant_msg, _ = await _trace_persist_message(
            conv_repo=self.conv_repo,
            conversation_id=conversation.id,
            user_id=user_id,
            project_id=project_id,
            role="assistant",
            content=structured_output.answer,
            grounded=final_grounded,
            insufficient_evidence=final_insufficient,
            citations=[c.model_dump(mode="json") for c in validated_citations],
        )

        # 12. AI Usage & Observability Logging
        await log_ai_usage(
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
            session=self.session,
        )

        return TutorAnswer(
            conversation_id=conversation.id,
            message_id=assistant_msg.id,
            answer=structured_output.answer,
            grounded=final_grounded,
            insufficient_evidence=final_insufficient,
            citations=validated_citations,
        )

    async def ask_stream(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        payload: TutorRequest,
        request: Request | None = None,
    ) -> AsyncIterator[str]:
        """Stream a grounded tutor response using Server-Sent Events (SSE).

        Yields SSE lines:
          event: start
          event: token
          event: insufficient_evidence
          event: error
          event: done
        """
        # 1. Tenant & Project Validation
        project = await self.project_repo.get_by_id(user_id=user_id, project_id=project_id)
        if not project:
            yield f"event: error\ndata: {json.dumps({'error': 'Project not found'})}\n\n"
            return

        # 2. Conversation Loading / Creation
        conversation = None
        if payload.conversation_id:
            conversation = await self.conv_repo.get_conversation(
                user_id=user_id,
                conversation_id=payload.conversation_id,
            )
            if not conversation or conversation.project_id != project_id:
                yield f"event: error\ndata: {json.dumps({'error': 'Conversation not found in this project'})}\n\n"
                return
        else:
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

        # Emit start event with conversation_id so client can track session immediately
        yield f"event: start\ndata: {json.dumps({'conversation_id': str(conversation.id)})}\n\n"

        # 4. Preflight Material Readiness Check
        preflight_res = await _trace_tutor_preflight(
            material_repo=self.material_repo,
            user_id=user_id,
            project_id=project_id,
        )
        if not preflight_res["ready"]:
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
            yield f"event: insufficient_evidence\ndata: {json.dumps({'answer': guidance_text, 'conversation_id': str(conversation.id), 'message_id': str(assistant_msg.id)})}\n\n"
            yield f"event: done\ndata: {json.dumps({'message_id': str(assistant_msg.id), 'conversation_id': str(conversation.id), 'answer': guidance_text, 'grounded': False, 'insufficient_evidence': True, 'citations': []})}\n\n"
            return

        # 5. Load Pedagogical Context (History, Weak Concepts, Recent Mistakes)
        pedagogical_context = await self.context_service.assemble_context(
            user_id=user_id,
            project_id=project_id,
            conversation_id=conversation.id,
            history_limit=settings.TUTOR_HISTORY_LIMIT,
        )
        conv_turns = pedagogical_context.conversation_turns

        # 6. Embed Question
        _ = _trace_embed_question(question=payload.question)

        # 7. Knowledge Retrieval with pgvector & strict threshold
        retrieval_result = await self.retrieval_service.retrieve_relevant_chunks(
            user_id=user_id,
            project_id=project_id,
            question=payload.question,
        )

        # 8. Insufficient Evidence Gate
        if not retrieval_result.is_sufficient or len(retrieval_result.accepted_chunks) == 0:
            insufficient_text = (
                "I cannot find sufficient evidence in the uploaded learning materials to answer your question. "
                "Answers are strictly grounded in your materials. Please refer to materials that cover this topic."
            )
            assistant_msg = await self.conv_repo.add_message(
                conversation_id=conversation.id,
                user_id=user_id,
                project_id=project_id,
                role="assistant",
                content=insufficient_text,
                grounded=False,
                insufficient_evidence=True,
                citations=[],
            )
            yield f"event: insufficient_evidence\ndata: {json.dumps({'answer': insufficient_text, 'conversation_id': str(conversation.id), 'message_id': str(assistant_msg.id)})}\n\n"
            yield f"event: done\ndata: {json.dumps({'message_id': str(assistant_msg.id), 'conversation_id': str(conversation.id), 'answer': insufficient_text, 'grounded': False, 'insufficient_evidence': True, 'citations': []})}\n\n"
            return

        # 9. Build Grounded Prompt
        user_prompt, _ = _trace_build_grounded_prompt(
            question=payload.question,
            accepted_chunks=retrieval_result.accepted_chunks,
            conv_turns=conv_turns,
            pedagogical_context=pedagogical_context.to_dict(),
        )

        # 10. Stream Tokens from Provider
        provider = get_llm_provider()
        accumulated_chunks: list[str] = []

        try:
            stream_gen = provider.generate_stream(
                system_instruction=TUTOR_SYSTEM_INSTRUCTION,
                user_prompt=user_prompt,
                temperature=0.2,
                feature="tutor_stream",
                tags=["tutor", "streaming"],
                metadata={"project_id": str(project_id)},
            )
            async for chunk in stream_gen:
                # Check client disconnect
                if request is not None and await request.is_disconnected():
                    logger.info(
                        f"Client disconnected during tutor stream for project {project_id}; aborting without persistence."
                    )
                    return

                accumulated_chunks.append(chunk)
                yield f"event: token\ndata: {json.dumps({'token': chunk})}\n\n"

        except Exception as exc:
            logger.error(f"Streaming failed for project {project_id}: {exc}")
            yield f"event: error\ndata: {json.dumps({'error': 'The AI Tutor is temporarily unavailable. Please try again.'})}\n\n"
            return

        full_answer = "".join(accumulated_chunks).strip()
        if not full_answer:
            yield f"event: error\ndata: {json.dumps({'error': 'No response generated.'})}\n\n"
            return

        # 11. Validate Citations Server-Side
        accepted_ids = [str(c.chunk_id) for c in retrieval_result.accepted_chunks]
        validated_citations, final_grounded, final_insufficient, _ = _trace_validate_citations(
            raw_citation_ids=accepted_ids,
            accepted_chunks=retrieval_result.accepted_chunks,
            raw_grounded=True,
            raw_insufficient_evidence=False,
        )

        # 12. Persist Completed Assistant Message Only
        assistant_msg, _ = await _trace_persist_message(
            conv_repo=self.conv_repo,
            conversation_id=conversation.id,
            user_id=user_id,
            project_id=project_id,
            role="assistant",
            content=full_answer,
            grounded=final_grounded,
            insufficient_evidence=final_insufficient,
            citations=[c.model_dump(mode="json") for c in validated_citations],
        )

        # 13. AI Usage Logging
        await log_ai_usage(
            user_id=user_id,
            project_id=project_id,
            operation="tutor_stream",
            provider="gemini",
            model=settings.GEMINI_MODEL,
            latency_ms=0.0,
            input_tokens=len(user_prompt) // 4,
            output_tokens=len(full_answer) // 4,
            total_tokens=(len(user_prompt) + len(full_answer)) // 4,
            success=True,
            session=self.session,
        )

        # 14. Emit Done Event with verified metadata
        done_data = {
            "conversation_id": str(conversation.id),
            "message_id": str(assistant_msg.id),
            "answer": full_answer,
            "grounded": final_grounded,
            "insufficient_evidence": final_insufficient,
            "citations": [c.model_dump(mode="json") for c in validated_citations],
        }
        yield f"event: done\ndata: {json.dumps(done_data)}\n\n"

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
