"""Adaptive Quiz and Assessment Service.

Orchestrates:
1. One-time concept extraction and persistence
2. Multi-signal adaptive question generation with server-side evidence validation
3. Deterministic MCQ evaluation (zero unnecessary LLM calls)
4. Semantic open-ended assessment via Google Gemini with fallback protection
5. Activity event tracking and AI metrics logging
"""

import string
import time
import uuid
from typing import Any

from fastapi import HTTPException, status
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.gemini_provider import get_llm_provider
from app.ai.llm import LLMGenerationError
from app.ai.observability import log_ai_usage
from app.ai.quiz_prompts import (
    CONCEPT_EXTRACTION_SYSTEM_INSTRUCTION,
    OPEN_ENDED_EVALUATION_SYSTEM_INSTRUCTION,
    QUIZ_GENERATION_SYSTEM_INSTRUCTION,
    build_concept_extraction_prompt,
    build_open_ended_evaluation_prompt,
    build_quiz_generation_prompt,
)
from app.ai.tracing import traceable
from app.core.config import settings
from app.models.concept import Concept
from app.models.quiz import QuizAttempt, QuizQuestion
from app.repositories.concept_repository import ConceptRepository
from app.repositories.event_repository import EventRepository
from app.repositories.material_repository import MaterialRepository
from app.repositories.project_repository import ProjectRepository
from app.repositories.quiz_repository import QuizRepository
from app.schemas.quiz import (
    ConceptExtractionOutput,
    ConceptPerformance,
    OpenEndedEvaluationOutput,
    QuizAnswerResponse,
    QuizAnswerSubmitRequest,
    QuizCreateRequest,
    QuizQuestionGenerationOutput,
    QuizQuestionPublicResponse,
    QuizResponse,
    QuizResultResponse,
)
from app.services.adaptive_engine import AdaptiveEngine
from app.services.concept_validator import is_valid_academic_concept, normalize_concept_name
from app.services.question_validator import (
    is_toc_or_metadata_chunk,
    validate_quiz_question_quality,
)
from app.services.retrieval_service import RetrievalService



def normalize_question_text(text: str) -> str:
    """Normalize question text for deduplication: lowercase, strip punctuation, collapse whitespace."""
    if not text:
        return ""
    t = text.lower().strip()
    t = t.translate(str.maketrans("", "", string.punctuation))
    return " ".join(t.split())


def calculate_word_similarity(text1: str, text2: str) -> float:
    """Compute token-level Jaccard similarity between two question strings."""
    tokens1 = set(normalize_question_text(text1).split())
    tokens2 = set(normalize_question_text(text2).split())
    if not tokens1 or not tokens2:
        return 0.0
    intersection = tokens1.intersection(tokens2)
    union = tokens1.union(tokens2)
    return len(intersection) / len(union)


def is_duplicate_question(
    candidate: str,
    existing_list: list[str],
    similarity_threshold: float = 0.80,
) -> bool:
    """Check if candidate question duplicates any question in existing_list.

    Detects:
    1. Exact text match
    2. Normalized text match (punctuation & whitespace agnostic)
    3. High token-level Jaccard similarity (>= similarity_threshold)
    """
    if not candidate or not candidate.strip():
        return True

    norm_cand = normalize_question_text(candidate)
    cand_tokens = set(norm_cand.split())

    for ex in existing_list:
        if not ex or not ex.strip():
            continue
        # Exact match
        if candidate.strip().lower() == ex.strip().lower():
            return True
        # Normalized match
        norm_ex = normalize_question_text(ex)
        if norm_cand == norm_ex:
            return True
        # Token-level Jaccard similarity
        ex_tokens = set(norm_ex.split())
        if cand_tokens and ex_tokens:
            jaccard = len(cand_tokens & ex_tokens) / len(cand_tokens | ex_tokens)
            if jaccard >= similarity_threshold:
                return True

    return False


class QuizService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.project_repo = ProjectRepository(session)
        self.material_repo = MaterialRepository(session)
        self.concept_repo = ConceptRepository(session)
        self.quiz_repo = QuizRepository(session)
        self.event_repo = EventRepository(session)

    # ------------------------------------------------------------------------
    # 1. Concept Extraction & Persistence (One-Time / Incremental)
    # ------------------------------------------------------------------------
    @traceable(
        name="Extract Concepts",
        run_type="chain",
        process_inputs=lambda inputs: {
            "material_id": str(inputs.get("material_id", "")),
            "project_id": str(inputs.get("project_id", "")),
        },
        process_outputs=lambda res: {
            "extracted_count": len(res) if isinstance(res, list) else 0,
            "status": "success",
        },
    )
    async def extract_material_concepts_incremental(
        self,
        material_id: uuid.UUID,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
    ) -> list[Concept]:
        """Extract concepts specifically from newly processed material chunks, deduping against existing project concepts."""
        chunks = await self.material_repo.get_chunks_by_material(material_id)
        if not chunks:
            return []

        existing_concepts = await self.concept_repo.list_by_project(user_id, project_id)
        existing_normalized = {normalize_concept_name(c.name) for c in existing_concepts}

        context_chunks = [
            {
                "chunk_id": str(c.id),
                "material_id": str(material_id),
                "filename": "document.pdf",
                "page_number": c.page_number,
                "content": c.content,
            }
            for c in chunks[:15]
        ]
        valid_chunk_ids = {c["chunk_id"] for c in context_chunks}

        provider = get_llm_provider()
        prompt = build_concept_extraction_prompt(context_chunks)
        start_time = time.perf_counter()

        try:
            raw_output, usage = await provider.generate_structured(
                system_instruction=CONCEPT_EXTRACTION_SYSTEM_INSTRUCTION,
                user_prompt=prompt,
                response_schema=ConceptExtractionOutput,
                temperature=0.2,
                feature="concept_extraction",
                tags=["concept_extraction"],
                metadata={"project_id": str(project_id)},
            )
            latency_ms = usage.latency_ms or ((time.perf_counter() - start_time) * 1000.0)
            await log_ai_usage(
                user_id=user_id,
                project_id=project_id,
                operation="concept_extraction",
                provider="gemini",
                model=settings.GEMINI_MODEL,
                latency_ms=latency_ms,
                input_tokens=usage.prompt_tokens,
                output_tokens=usage.candidate_tokens,
                total_tokens=usage.total_tokens,
                success=True,
                session=self.session,
            )
        except Exception as err:
            latency_ms = (time.perf_counter() - start_time) * 1000.0
            await log_ai_usage(
                user_id=user_id,
                project_id=project_id,
                operation="concept_extraction",
                provider="gemini",
                model=settings.GEMINI_MODEL,
                latency_ms=latency_ms,
                success=False,
                error=str(err),
                session=self.session,
            )
            raise

        concepts_to_create = []
        for item in raw_output.concepts:
            if not is_valid_academic_concept(item.name, item.description):
                continue
            normalized = normalize_concept_name(item.name)
            if normalized in existing_normalized:
                continue
            existing_normalized.add(normalized)
            filtered_chunks = [cid for cid in item.source_chunk_ids if cid in valid_chunk_ids]
            concepts_to_create.append(
                {
                    "name": item.name.strip(),
                    "description": item.description.strip(),
                    "source_chunk_ids": filtered_chunks,
                }
            )

        if not concepts_to_create:
            return []

        return await self.concept_repo.create_concepts(user_id, project_id, concepts_to_create)

    async def ensure_project_concepts(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        force_refresh: bool = False,
    ) -> list[Concept]:
        """Fetch existing concepts or extract and persist them via scalable batch extraction of valid academic concepts."""
        if not force_refresh:
            existing = await self.concept_repo.list_by_project(user_id, project_id)
            valid_existing = [c for c in existing if is_valid_academic_concept(c.name, c.description)]
            if valid_existing:
                return existing

        # Check material readiness
        has_ready = await self.material_repo.has_ready_materials(user_id, project_id)
        if not has_ready:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Please upload and process learning materials for this project first.",
            )

        # Retrieve material chunks for extraction context
        materials = await self.material_repo.list_by_project(user_id, project_id)
        ready_materials = [m for m in materials if m.status == "ready"]

        all_chunks = []
        for m in ready_materials:
            chunks = await self.material_repo.get_chunks_by_material(m.id)
            for c in chunks:
                all_chunks.append(
                    {
                        "chunk_id": str(c.id),
                        "material_id": str(m.id),
                        "filename": m.filename,
                        "page_number": c.page_number,
                        "content": c.content,
                    }
                )

        if not all_chunks:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No processed material chunks found for concept extraction.",
            )

        # Partition into substantive chunks (skipping promotional / front-matter / TOC if possible)
        substantive_chunks = []
        for c in all_chunks:
            if is_toc_or_metadata_chunk(c["content"]):
                continue
            text_lower = c["content"].lower()
            if any(
                marker in text_lower
                for marker in [
                    "free video lessons",
                    "smart answer key",
                    "time to answer (tta)",
                    "unique features of smartbook",
                ]
            ):
                continue
            substantive_chunks.append(c)


        if not substantive_chunks:
            substantive_chunks = all_chunks

        # Scalable batch extraction across the document (up to 5 batches of 22 chunks each)
        BATCH_SIZE = 22
        MAX_BATCHES = 5
        batches = [
            substantive_chunks[i : i + BATCH_SIZE]
            for i in range(0, len(substantive_chunks), BATCH_SIZE)
        ][:MAX_BATCHES]

        provider = get_llm_provider()
        candidate_concepts: dict[str, dict] = {}
        valid_chunk_ids = {c["chunk_id"] for c in all_chunks}

        for batch_idx, batch_chunks in enumerate(batches):
            prompt = build_concept_extraction_prompt(batch_chunks)
            start_time = time.perf_counter()
            try:
                raw_output, usage = await provider.generate_structured(
                    system_instruction=CONCEPT_EXTRACTION_SYSTEM_INSTRUCTION,
                    user_prompt=prompt,
                    response_schema=ConceptExtractionOutput,
                    temperature=0.2,
                    feature="concept_extraction",
                    tags=["concept_extraction", f"batch_{batch_idx}"],
                    metadata={"project_id": str(project_id)},
                )
                latency_ms = usage.latency_ms or ((time.perf_counter() - start_time) * 1000.0)
                await log_ai_usage(
                    user_id=user_id,
                    project_id=project_id,
                    operation="concept_extraction",
                    provider="gemini",
                    model=settings.GEMINI_MODEL,
                    latency_ms=latency_ms,
                    input_tokens=usage.prompt_tokens,
                    output_tokens=usage.candidate_tokens,
                    total_tokens=usage.total_tokens,
                    success=True,
                    session=self.session,
                )
            except Exception as err:
                logger.warning(f"Batch {batch_idx} concept extraction warning: {err}")
                continue

            for item in raw_output.concepts:
                c_name = item.name.strip()
                c_desc = item.description.strip()
                # Strict academic validation: filter out meta-concepts
                if not is_valid_academic_concept(c_name, c_desc):
                    logger.info(f"Filtered out meta-concept from batch: {c_name}")
                    continue

                norm_key = normalize_concept_name(c_name)
                # Deduplicate against existing candidate_concepts
                matched_key = None
                for ex_key in candidate_concepts.keys():
                    if norm_key == ex_key or calculate_word_similarity(norm_key, ex_key) >= 0.70:
                        matched_key = ex_key
                        break

                filtered_cids = [cid for cid in item.source_chunk_ids if cid in valid_chunk_ids]
                if not filtered_cids and batch_chunks:
                    filtered_cids = [str(batch_chunks[0]["chunk_id"])]

                if matched_key:
                    existing_cids = set(candidate_concepts[matched_key]["source_chunk_ids"])
                    existing_cids.update(filtered_cids)
                    candidate_concepts[matched_key]["source_chunk_ids"] = list(existing_cids)
                    if len(c_desc) > len(candidate_concepts[matched_key]["description"]):
                        candidate_concepts[matched_key]["description"] = c_desc
                else:
                    candidate_concepts[norm_key] = {
                        "name": c_name,
                        "description": c_desc,
                        "source_chunk_ids": filtered_cids,
                    }

        concepts_to_create = list(candidate_concepts.values())
        if not concepts_to_create:
            concepts_to_create.append(
                {
                    "name": "General Subject Matter",
                    "description": "Core concepts and principles discussed in uploaded project materials.",
                    "source_chunk_ids": [str(all_chunks[0]["chunk_id"])],
                }
            )

        return await self.concept_repo.create_concepts(user_id, project_id, concepts_to_create)

    # ------------------------------------------------------------------------
    # 2. Adaptive Quiz Creation & Question Generation
    # ------------------------------------------------------------------------
    async def create_quiz(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        payload: QuizCreateRequest,
    ) -> QuizResponse:
        """Generate an adaptive quiz grounded in project materials."""
        # Validate project
        project = await self.project_repo.get_by_id(user_id=user_id, project_id=project_id)
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )

        # 1. Ensure concepts are persisted (one-time or retrieved)
        all_concepts = await self.ensure_project_concepts(user_id, project_id)
        # Filter strictly for valid academic concepts (exclude meta/document concepts)
        valid_concepts = [c for c in all_concepts if is_valid_academic_concept(c.name, c.description)]
        if not valid_concepts:
            all_concepts = await self.ensure_project_concepts(user_id, project_id, force_refresh=True)
            valid_concepts = [c for c in all_concepts if is_valid_academic_concept(c.name, c.description)]
        if not valid_concepts:
            valid_concepts = all_concepts

        if not valid_concepts:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unable to generate quiz: no valid learning concepts available for this project.",
            )

        # 2. Retrieve learner history & recent questions for adaptive engine
        history = await self.quiz_repo.get_project_learner_history(user_id, project_id, limit=50)
        recent_questions = await self.quiz_repo.get_recent_project_questions(user_id, project_id, limit=50)
        existing_quizzes = await self.quiz_repo.list_quizzes(user_id, project_id)
        recent_q_texts = [q.question_text for q in recent_questions]

        # 3. Compute deterministic adaptive plan with diverse concept rotation over valid academic concepts
        count = payload.question_count or settings.QUIZ_QUESTION_COUNT
        plan = AdaptiveEngine.compute_plan(
            concepts=valid_concepts,
            history=history,
            question_count=count,
            preferred_difficulty=payload.preferred_difficulty,
            recent_questions=recent_questions,
            quiz_count=len(existing_quizzes),
        )

        # 4. Semantic Evidence Gathering via RetrievalService with strict anti-TOC filtering
        materials = await self.material_repo.list_by_project(user_id, project_id)
        ready_materials = [m for m in materials if m.status == "ready"]
        all_chunks_dict = {}
        for m in ready_materials:
            chunks = await self.material_repo.get_chunks_by_material(m.id)
            for c in chunks:
                all_chunks_dict[str(c.id)] = {
                    "chunk_id": str(c.id),
                    "material_id": str(m.id),
                    "filename": m.filename,
                    "page_number": c.page_number,
                    "content": c.content,
                }

        retrieval_service = RetrievalService(self.session)
        evidence_chunks = []
        selected_chunk_ids = set()


        # For each selected concept in the adaptive plan, retrieve genuine explanatory body chunks
        for score in plan.selected_concepts:
            query = f"{score.concept_name}: {score.rationale}"
            try:
                ret_result = await retrieval_service.retrieve_relevant_chunks(
                    user_id=user_id,
                    project_id=project_id,
                    question=query,
                    top_k=4,
                )
                for rc in ret_result.accepted_chunks:
                    cid_str = str(rc.chunk_id)
                    if cid_str in selected_chunk_ids:
                        continue
                    if is_toc_or_metadata_chunk(rc.content):
                        logger.info(f"Quiz evidence: skipped TOC/metadata chunk {cid_str} on page {rc.page_number}")
                        continue
                    if getattr(rc, "content_type", "") in ("toc", "index", "metadata", "bibliography"):
                        continue
                    if len(rc.content.strip()) < 100:
                        continue
                    selected_chunk_ids.add(cid_str)
                    evidence_chunks.append({
                        "chunk_id": cid_str,
                        "material_id": str(rc.material_id),
                        "filename": rc.filename,
                        "page_number": rc.page_number,
                        "content": rc.content,
                    })
            except Exception as err:
                logger.warning(f"Error retrieving evidence for concept '{score.concept_name}': {err}")

        # Also inspect source_chunk_ids of valid concepts, keeping only non-TOC substantive chunks
        for score in plan.selected_concepts:
            c_obj = next((c for c in valid_concepts if c.id == score.concept_id), None)
            if c_obj and c_obj.source_chunk_ids:
                for cid in c_obj.source_chunk_ids:
                    if cid in all_chunks_dict and cid not in selected_chunk_ids:
                        c_data = all_chunks_dict[cid]
                        if not is_toc_or_metadata_chunk(c_data["content"]) and len(c_data["content"].strip()) >= 100:
                            selected_chunk_ids.add(cid)
                            evidence_chunks.append(c_data)

        # Fill with substantive general chunks if needed (rotating by quiz count to vary context)
        chunk_items = list(all_chunks_dict.items())
        if chunk_items and len(evidence_chunks) < 6:
            chunk_offset = len(existing_quizzes) % len(chunk_items)
            rotated_chunks = chunk_items[chunk_offset:] + chunk_items[:chunk_offset]
            for cid, c_data in rotated_chunks:
                if len(evidence_chunks) >= 12:
                    break
                if cid not in selected_chunk_ids:
                    if not is_toc_or_metadata_chunk(c_data["content"]) and len(c_data["content"].strip()) >= 150:
                        selected_chunk_ids.add(cid)
                        evidence_chunks.append(c_data)

        if not evidence_chunks:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No substantive explanatory evidence chunks available to generate quiz questions.",
            )

        # 5. Question Generation via Gemini with Anti-Repetition Guidance
        # Allocate: majority MCQ, at least 1 open-ended if count >= 3
        open_ended_count = 1 if count >= 3 else 0
        mcq_count = count - open_ended_count
        # Request buffer MCQs in case some candidates are duplicates or fail quality checks
        mcq_request_count = mcq_count + (2 if mcq_count >= 2 else 1)

        concept_payloads = [
            {"name": s.concept_name, "description": s.rationale} for s in plan.selected_concepts
        ]
        prompt = build_quiz_generation_prompt(
            target_concepts=concept_payloads,
            evidence_chunks=evidence_chunks,
            target_difficulties=plan.recommended_difficulties,
            mcq_count=mcq_request_count,
            open_ended_count=open_ended_count,
            recent_questions=recent_q_texts[:20],
        )

        provider = get_llm_provider()
        start_time = time.perf_counter()
        try:
            raw_output, usage = await provider.generate_structured(
                system_instruction=QUIZ_GENERATION_SYSTEM_INSTRUCTION,
                user_prompt=prompt,
                response_schema=QuizQuestionGenerationOutput,
                temperature=0.5,
                feature="quiz_generation",
                tags=["quiz"],
                metadata={"project_id": str(project_id)},
            )
            latency_ms = usage.latency_ms or ((time.perf_counter() - start_time) * 1000.0)
            await log_ai_usage(
                user_id=user_id,
                project_id=project_id,
                operation="quiz_question_generation",
                provider="gemini",
                model=settings.GEMINI_MODEL,
                latency_ms=latency_ms,
                input_tokens=usage.prompt_tokens,
                output_tokens=usage.candidate_tokens,
                total_tokens=usage.total_tokens,
                success=True,
                session=self.session,
            )
        except LLMGenerationError as err:
            latency_ms = (time.perf_counter() - start_time) * 1000.0
            await log_ai_usage(
                user_id=user_id,
                project_id=project_id,
                operation="quiz_question_generation",
                provider="gemini",
                model=settings.GEMINI_MODEL,
                latency_ms=latency_ms,
                success=False,
                error=str(err),
                session=self.session,
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="AI question generation failed. Please try again in a moment.",
            ) from err

        # 6. Validate & Deduplicate generated questions against recent history
        concept_lookup = {c.name.lower(): c.id for c in valid_concepts}
        default_concept_id = valid_concepts[0].id
        valid_chunk_ids_set = set(all_chunks_dict.keys())

        accepted_questions: list[dict] = []
        accepted_texts: list[str] = []

        # Process MCQs
        for mcq in raw_output.mcq_questions:
            q_text = mcq.question.strip()
            if not q_text or len(mcq.options) != 4:
                continue

            # Deterministic question quality check (reject chapter/section/TOC questions)
            is_valid, reason = validate_quiz_question_quality(q_text, options=mcq.options, concept_name=mcq.concept_name)
            if not is_valid:
                logger.warning(f"Quiz generation: rejected low-quality/navigation MCQ: '{q_text}' (Reason: {reason})")
                continue

            # Duplicate prevention check
            if is_duplicate_question(q_text, recent_q_texts + accepted_texts):
                logger.info(f"Quiz generation: rejected duplicate MCQ: '{q_text}'")
                continue

            # Validate correct_answer matches one of the options
            matched_option = next(
                (
                    opt
                    for opt in mcq.options
                    if opt.strip().lower() == mcq.correct_answer.strip().lower()
                ),
                None,
            )
            if not matched_option:
                matched_option = mcq.options[0]

            # Validate evidence chunks (reject fabricated)
            valid_evidence = [cid for cid in mcq.evidence_chunk_ids if cid in valid_chunk_ids_set]
            if not valid_evidence and evidence_chunks:
                valid_evidence = [str(evidence_chunks[0]["chunk_id"])]

            c_id = concept_lookup.get(mcq.concept_name.strip().lower(), default_concept_id)

            accepted_questions.append(
                {
                    "concept_id": c_id,
                    "question_type": "mcq",
                    "question_text": q_text,
                    "options": mcq.options,
                    "correct_answer": matched_option,
                    "explanation": mcq.explanation.strip(),
                    "rubric": None,
                    "difficulty": mcq.difficulty,
                    "source_chunk_ids": valid_evidence,
                }
            )
            accepted_texts.append(q_text)

        # Process Open-Ended
        for oeq in raw_output.open_ended_questions:
            q_text = oeq.question.strip()
            if not q_text:
                continue

            # Deterministic question quality check (reject chapter/section/TOC questions)
            is_valid, reason = validate_quiz_question_quality(q_text, options=None, concept_name=oeq.concept_name)
            if not is_valid:
                logger.warning(f"Quiz generation: rejected low-quality/navigation Open-Ended: '{q_text}' (Reason: {reason})")
                continue

            # Duplicate prevention check
            if is_duplicate_question(q_text, recent_q_texts + accepted_texts):
                logger.info(f"Quiz generation: rejected duplicate Open-Ended: '{q_text}'")
                continue

            valid_evidence = [cid for cid in oeq.evidence_chunk_ids if cid in valid_chunk_ids_set]
            if not valid_evidence and evidence_chunks:
                valid_evidence = [str(evidence_chunks[0]["chunk_id"])]

            c_id = concept_lookup.get(oeq.concept_name.strip().lower(), default_concept_id)

            accepted_questions.append(
                {
                    "concept_id": c_id,
                    "question_type": "open_ended",
                    "question_text": q_text,
                    "options": [],
                    "correct_answer": oeq.expected_answer.strip(),
                    "explanation": oeq.explanation.strip(),
                    "rubric": oeq.rubric.strip(),
                    "difficulty": oeq.difficulty,
                    "source_chunk_ids": valid_evidence,
                }
            )
            accepted_texts.append(q_text)

        # 7. Safe Reinforcement & Replenishment:
        # If generated questions fell short due to duplicate or quality rejection,
        # first check valid historical project questions prioritizing reinforcement & unseen concepts.
        if len(accepted_questions) < count:
            all_project_questions = await self.quiz_repo.get_all_project_questions(
                user_id=user_id, project_id=project_id
            )

            error_concept_ids = {
                score.concept_id for score in plan.selected_concepts if score.error_signal > 0
            }
            unseen_concept_ids = {
                score.concept_id for score in plan.selected_concepts if score.unseen_signal > 0
            }

            # Filter candidate questions not currently in accepted_texts
            candidate_pool = [
                q
                for q in all_project_questions
                if not is_duplicate_question(q.question_text, accepted_texts)
            ]

            # Prefer candidates not in immediate recent quiz history
            immediate_recent_ids = {q.id for q in recent_questions[:count]}
            non_recent_candidates = [q for q in candidate_pool if q.id not in immediate_recent_ids]

            pool_to_use = non_recent_candidates if non_recent_candidates else candidate_pool

            # Sort: reinforcement concepts first, unseen concepts second, oldest creation date third
            def fallback_priority(q: QuizQuestion) -> tuple[int, Any]:
                rank = 2
                if q.concept_id in error_concept_ids:
                    rank = 0
                elif q.concept_id in unseen_concept_ids:
                    rank = 1
                return (rank, q.created_at)

            pool_to_use.sort(key=fallback_priority)

            for fallback_q in pool_to_use:
                if len(accepted_questions) >= count:
                    break
                # Strictly validate that historical question is substantive, not TOC navigation
                is_valid, reason = validate_quiz_question_quality(fallback_q.question_text, fallback_q.options)
                if not is_valid:
                    logger.info(f"Quiz fallback: rejected historical question '{fallback_q.question_text}' (Reason: {reason})")
                    continue
                accepted_questions.append(
                    {
                        "concept_id": fallback_q.concept_id or default_concept_id,
                        "question_type": fallback_q.question_type,
                        "question_text": fallback_q.question_text,
                        "options": fallback_q.options,
                        "correct_answer": fallback_q.correct_answer,
                        "explanation": fallback_q.explanation,
                        "rubric": fallback_q.rubric,
                        "difficulty": fallback_q.difficulty,
                        "source_chunk_ids": fallback_q.source_chunk_ids,
                    }
                )
                accepted_texts.append(fallback_q.question_text)

        # If still short of count after historical pool, trigger a focused secondary generation pass
        if len(accepted_questions) < count:
            needed_mcqs = count - len(accepted_questions)
            logger.info(f"Quiz generation: performing secondary replenishment pass for {needed_mcqs} questions.")
            retry_prompt = build_quiz_generation_prompt(
                target_concepts=concept_payloads,
                evidence_chunks=evidence_chunks,
                target_difficulties=plan.recommended_difficulties,
                mcq_count=needed_mcqs + 1,
                open_ended_count=0,
                recent_questions=recent_q_texts + accepted_texts,
            )
            try:
                retry_output, _ = await provider.generate_structured(
                    system_instruction=QUIZ_GENERATION_SYSTEM_INSTRUCTION,
                    user_prompt=retry_prompt,
                    response_schema=QuizQuestionGenerationOutput,
                    temperature=0.6,
                    feature="quiz_generation_replenishment",
                    tags=["quiz", "replenishment"],
                    metadata={"project_id": str(project_id)},
                )
                for mcq in retry_output.mcq_questions:
                    if len(accepted_questions) >= count:
                        break
                    q_text = mcq.question.strip()
                    if not q_text or len(mcq.options) != 4:
                        continue
                    is_valid, _ = validate_quiz_question_quality(q_text, options=mcq.options, concept_name=mcq.concept_name)
                    if not is_valid or is_duplicate_question(q_text, recent_q_texts + accepted_texts):
                        continue
                    matched_opt = next(
                        (opt for opt in mcq.options if opt.strip().lower() == mcq.correct_answer.strip().lower()),
                        mcq.options[0],
                    )
                    v_ev = [cid for cid in mcq.evidence_chunk_ids if cid in valid_chunk_ids_set]
                    if not v_ev and evidence_chunks:
                        v_ev = [str(evidence_chunks[0]["chunk_id"])]
                    c_id = concept_lookup.get(mcq.concept_name.strip().lower(), default_concept_id)
                    accepted_questions.append({
                        "concept_id": c_id,
                        "question_type": "mcq",
                        "question_text": q_text,
                        "options": mcq.options,
                        "correct_answer": matched_opt,
                        "explanation": mcq.explanation.strip(),
                        "rubric": None,
                        "difficulty": mcq.difficulty,
                        "source_chunk_ids": v_ev,
                    })
                    accepted_texts.append(q_text)
            except Exception as retry_err:
                logger.warning(f"Secondary replenishment generation pass failed: {retry_err}")


        # Absolute safety check: if still empty
        if not accepted_questions:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Unable to assemble valid questions from AI output. Please retry.",
            )

        # Assign consecutive 1-indexed question order
        final_questions_data = []
        for idx, q_data in enumerate(accepted_questions[:count], start=1):
            q_data["question_order"] = idx
            final_questions_data.append(q_data)

        # 8. Persist Quiz & Questions
        quiz = await self.quiz_repo.create_quiz(
            user_id=user_id,
            project_id=project_id,
            title=payload.title or "Adaptive Quiz",
        )
        saved_questions = await self.quiz_repo.add_questions(
            quiz_id=quiz.id,
            user_id=user_id,
            project_id=project_id,
            questions_data=final_questions_data,
        )

        # 9. Record Activity Event
        await self.event_repo.record_event(
            user_id=user_id,
            project_id=project_id,
            event_type="quiz_created",
            payload={
                "quiz_id": str(quiz.id),
                "title": quiz.title,
                "question_count": len(saved_questions),
            },
        )

        return await self.get_quiz(user_id=user_id, quiz_id=quiz.id)

    async def get_quiz(self, user_id: uuid.UUID, quiz_id: uuid.UUID) -> QuizResponse:
        """Fetch quiz metadata and public questions (correct answers hidden)."""
        quiz = await self.quiz_repo.get_quiz(user_id=user_id, quiz_id=quiz_id)
        if not quiz:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz not found")

        public_questions = [
            QuizQuestionPublicResponse(
                id=q.id,
                quiz_id=q.quiz_id,
                concept_id=q.concept_id,
                question_type=q.question_type,
                question_text=q.question_text,
                options=q.options,
                difficulty=q.difficulty,
                question_order=q.question_order,
                concept_name=q.concept.name if q.concept else None,
            )
            for q in quiz.questions
        ]

        return QuizResponse(
            id=quiz.id,
            project_id=quiz.project_id,
            title=quiz.title,
            status=quiz.status,
            created_at=quiz.created_at,
            completed_at=quiz.completed_at,
            question_count=len(public_questions),
            questions=public_questions,
        )

    async def list_quizzes(self, user_id: uuid.UUID, project_id: uuid.UUID) -> list[QuizResponse]:
        """List all quizzes for a project."""
        project = await self.project_repo.get_by_id(user_id=user_id, project_id=project_id)
        if not project:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )
        quizzes = await self.quiz_repo.list_quizzes(user_id=user_id, project_id=project_id)
        res = []
        for q in quizzes:
            public_questions = [
                QuizQuestionPublicResponse(
                    id=quest.id,
                    quiz_id=quest.quiz_id,
                    concept_id=quest.concept_id,
                    question_type=quest.question_type,
                    question_text=quest.question_text,
                    options=quest.options,
                    difficulty=quest.difficulty,
                    question_order=quest.question_order,
                    concept_name=quest.concept.name if quest.concept else None,
                )
                for quest in q.questions
            ]
            res.append(
                QuizResponse(
                    id=q.id,
                    project_id=q.project_id,
                    title=q.title,
                    status=q.status,
                    created_at=q.created_at,
                    completed_at=q.completed_at,
                    question_count=len(public_questions),
                    questions=public_questions,
                )
            )
        return res

    # ------------------------------------------------------------------------
    # 3. Quiz Attempt Lifecycle & Answer Submission
    # ------------------------------------------------------------------------
    async def start_attempt(
        self,
        user_id: uuid.UUID,
        quiz_id: uuid.UUID,
    ) -> QuizAttempt:
        """Start a new attempt on a quiz."""
        quiz = await self.quiz_repo.get_quiz(user_id=user_id, quiz_id=quiz_id)
        if not quiz:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz not found")

        attempt = await self.quiz_repo.create_attempt(
            quiz_id=quiz.id,
            user_id=user_id,
            project_id=quiz.project_id,
            total_questions=len(quiz.questions),
        )

        await self.event_repo.record_event(
            user_id=user_id,
            project_id=quiz.project_id,
            event_type="quiz_started",
            payload={"quiz_id": str(quiz.id), "attempt_id": str(attempt.id)},
        )
        return attempt

    async def get_attempt(
        self,
        user_id: uuid.UUID,
        attempt_id: uuid.UUID,
    ) -> QuizAttempt:
        """Retrieve attempt state."""
        attempt = await self.quiz_repo.get_attempt(user_id=user_id, attempt_id=attempt_id)
        if not attempt:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Quiz attempt not found"
            )
        return attempt

    async def submit_answer(
        self,
        user_id: uuid.UUID,
        quiz_id: uuid.UUID,
        attempt_id: uuid.UUID,
        question_id: uuid.UUID,
        payload: QuizAnswerSubmitRequest,
    ) -> QuizAnswerResponse:
        """Evaluate and persist an answer for a question in an active attempt."""
        # 1. Authorize attempt & quiz
        attempt = await self.get_attempt(user_id=user_id, attempt_id=attempt_id)
        if attempt.quiz_id != quiz_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Attempt does not match quiz"
            )
        if attempt.status != "in_progress":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Attempt is already completed"
            )

        # 2. Authorize question
        question = await self.quiz_repo.get_question(user_id=user_id, question_id=question_id)
        if not question or question.quiz_id != quiz_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")

        # 3. Evaluate answer
        if question.question_type == "mcq":
            # Deterministic backend MCQ evaluation
            selected = (payload.selected_answer or "").strip()
            if not selected:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Selected option is required for MCQ",
                )

            # Check exact match or option letter/index match
            is_correct = False
            correct_norm = question.correct_answer.strip().lower()
            if selected.lower() == correct_norm:
                is_correct = True
            elif len(selected) == 1 and selected.upper() in ("A", "B", "C", "D"):
                # Handle letter index
                letter_idx = ord(selected.upper()) - ord("A")
                if 0 <= letter_idx < len(question.options):
                    is_correct = question.options[letter_idx].strip().lower() == correct_norm

            score = 1.0 if is_correct else 0.0
            feedback = question.explanation

        elif question.question_type == "open_ended":
            # Semantic evaluation via Google Gemini
            learner_text = (payload.answer_text or "").strip()
            if not learner_text:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Answer text is required for open-ended question",
                )

            # Load evidence chunks if available
            evidence_chunks = []
            if question.source_chunk_ids:
                all_chunks = await self.material_repo.search_chunks_by_vector(
                    project_id=attempt.project_id,
                    query_embedding=[0.0] * 384,
                    limit=5,
                )
                evidence_chunks = [{"content": c[0].content} for c in all_chunks]

            eval_prompt = build_open_ended_evaluation_prompt(
                question=question.question_text,
                expected_answer=question.correct_answer,
                rubric=question.rubric or "Evaluate based on conceptual correctness and depth.",
                learner_answer=learner_text,
                evidence_chunks=evidence_chunks,
            )

            provider = get_llm_provider()
            start_time = time.perf_counter()
            try:
                eval_output, usage = await provider.generate_structured(
                    system_instruction=OPEN_ENDED_EVALUATION_SYSTEM_INSTRUCTION,
                    user_prompt=eval_prompt,
                    response_schema=OpenEndedEvaluationOutput,
                    temperature=0.1,
                    feature="quiz_evaluation",
                    tags=["quiz", "evaluation"],
                    metadata={"project_id": str(attempt.project_id)},
                )
                latency_ms = usage.latency_ms or ((time.perf_counter() - start_time) * 1000.0)
                await log_ai_usage(
                    user_id=user_id,
                    project_id=attempt.project_id,
                    operation="open_ended_evaluation",
                    provider="gemini",
                    model=settings.GEMINI_MODEL,
                    latency_ms=latency_ms,
                    input_tokens=usage.prompt_tokens,
                    output_tokens=usage.candidate_tokens,
                    total_tokens=usage.total_tokens,
                    success=True,
                    session=self.session,
                )
                score = round(max(0.0, min(1.0, eval_output.score)), 2)
                is_correct = eval_output.is_correct or (
                    score >= settings.QUIZ_OPEN_ENDED_PASSING_SCORE
                )

                # Format detailed feedback
                feedback_parts = [eval_output.feedback]
                if eval_output.strengths:
                    feedback_parts.append(
                        "\nStrengths:\n" + "\n".join(f"- {s}" for s in eval_output.strengths)
                    )
                if eval_output.missing_points:
                    feedback_parts.append(
                        "\nAreas to improve:\n"
                        + "\n".join(f"- {m}" for m in eval_output.missing_points)
                    )
                feedback = "\n".join(feedback_parts)

            except LLMGenerationError as err:
                latency_ms = (time.perf_counter() - start_time) * 1000.0
                await log_ai_usage(
                    user_id=user_id,
                    project_id=attempt.project_id,
                    operation="open_ended_evaluation",
                    provider="gemini",
                    model=settings.GEMINI_MODEL,
                    latency_ms=latency_ms,
                    success=False,
                    error=str(err),
                    session=self.session,
                )
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="AI answer evaluation is temporarily unavailable. Please try again.",
                ) from err
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported question type"
            )

        # 4. Persist QuizAnswer
        answer = await self.quiz_repo.record_answer(
            attempt_id=attempt_id,
            question=question,
            user_id=user_id,
            selected_answer=payload.selected_answer,
            answer_text=payload.answer_text,
            is_correct=is_correct,
            score=score,
            evaluation_feedback=feedback,
        )

        # 5. Record Activity Event
        await self.event_repo.record_event(
            user_id=user_id,
            project_id=attempt.project_id,
            event_type="question_answered",
            payload={
                "attempt_id": str(attempt.id),
                "question_id": str(question.id),
                "is_correct": is_correct,
                "score": score,
            },
        )

        return QuizAnswerResponse(
            id=answer.id,
            attempt_id=answer.attempt_id,
            question_id=answer.question_id,
            concept_id=answer.concept_id,
            difficulty=answer.difficulty,
            selected_answer=answer.selected_answer,
            answer_text=answer.answer_text,
            is_correct=answer.is_correct,
            score=answer.score,
            evaluation_feedback=answer.evaluation_feedback,
            evaluated_at=answer.evaluated_at,
            correct_answer=question.correct_answer,
            explanation=question.explanation,
        )

    async def complete_attempt(
        self,
        user_id: uuid.UUID,
        quiz_id: uuid.UUID,
        attempt_id: uuid.UUID,
    ) -> QuizResultResponse:
        """Complete an attempt and calculate final score and concept-level performance."""
        attempt = await self.get_attempt(user_id=user_id, attempt_id=attempt_id)
        if attempt.quiz_id != quiz_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="Attempt does not match quiz"
            )

        completed_attempt = await self.quiz_repo.complete_attempt(
            attempt_id=attempt.id, user_id=user_id
        )
        if not completed_attempt:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found")

        # Concept breakdown
        concepts = await self.concept_repo.list_by_project(user_id, completed_attempt.project_id)
        c_map: dict[uuid.UUID | None, str] = {c.id: c.name for c in concepts}

        concept_stats: dict[uuid.UUID | None, dict[str, Any]] = {}
        for ans in completed_attempt.answers:
            cid = ans.concept_id
            if cid not in concept_stats:
                concept_stats[cid] = {
                    "total": 0,
                    "correct": 0,
                    "name": c_map.get(cid, "General Knowledge"),
                }
            concept_stats[cid]["total"] += 1
            if ans.is_correct:
                concept_stats[cid]["correct"] += 1

        concept_performance = [
            ConceptPerformance(
                concept_id=cid,
                concept_name=info["name"],
                total_questions=info["total"],
                correct_questions=info["correct"],
                accuracy_percentage=round((info["correct"] / info["total"]) * 100.0, 1)
                if info["total"] > 0
                else 0.0,
            )
            for cid, info in concept_stats.items()
        ]

        # Assemble answer responses with revealed answers
        answer_responses = [
            QuizAnswerResponse(
                id=a.id,
                attempt_id=a.attempt_id,
                question_id=a.question_id,
                concept_id=a.concept_id,
                difficulty=a.difficulty,
                selected_answer=a.selected_answer,
                answer_text=a.answer_text,
                is_correct=a.is_correct,
                score=a.score,
                evaluation_feedback=a.evaluation_feedback,
                evaluated_at=a.evaluated_at,
                correct_answer=a.question.correct_answer if a.question else "",
                explanation=a.question.explanation if a.question else "",
            )
            for a in completed_attempt.answers
        ]

        # Record activity event
        await self.event_repo.record_event(
            user_id=user_id,
            project_id=completed_attempt.project_id,
            event_type="quiz_completed",
            payload={
                "attempt_id": str(completed_attempt.id),
                "quiz_id": str(quiz_id),
                "score": completed_attempt.score,
                "correct_answers": completed_attempt.correct_answers,
                "total_questions": completed_attempt.total_questions,
            },
        )

        # Trigger event-driven mastery recomputation and recommendations (Celery / inline fallback)
        try:
            from app.workers.tasks import process_quiz_completed

            process_quiz_completed.delay(
                str(user_id),
                str(completed_attempt.project_id),
                str(completed_attempt.id),
            )
        except Exception:
            # Fallback to direct synchronous execution when worker broker is unavailable (e.g. testing)
            try:
                from app.services.mastery_service import MasteryService

                mastery_service = MasteryService(self.session)
                await mastery_service.process_quiz_completion(
                    user_id=user_id,
                    project_id=completed_attempt.project_id,
                    attempt_id=completed_attempt.id,
                )
            except Exception as m_err:
                logger.warning(f"Inline mastery processing warning: {m_err}", exc_info=True)

        return QuizResultResponse(
            attempt_id=completed_attempt.id,
            quiz_id=completed_attempt.quiz_id,
            project_id=completed_attempt.project_id,
            status=completed_attempt.status,
            started_at=completed_attempt.started_at,
            completed_at=completed_attempt.completed_at,
            score_percentage=completed_attempt.score or 0.0,
            total_questions=completed_attempt.total_questions,
            correct_answers=completed_attempt.correct_answers,
            answers=answer_responses,
            concept_performance=concept_performance,
        )
