"""Adaptive Quiz and Assessment Service.

Orchestrates:
1. One-time concept extraction and persistence
2. Multi-signal adaptive question generation with server-side evidence validation
3. Deterministic MCQ evaluation (zero unnecessary LLM calls)
4. Semantic open-ended assessment via Google Gemini with fallback protection
5. Activity event tracking and AI metrics logging
"""

import time
import uuid
from typing import Any

from fastapi import HTTPException, status
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
from app.core.config import settings
from app.models.concept import Concept
from app.models.quiz import QuizAttempt
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
    async def ensure_project_concepts(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        force_refresh: bool = False,
    ) -> list[Concept]:
        """Fetch existing concepts or extract and persist them if not yet present."""
        if not force_refresh:
            existing = await self.concept_repo.list_by_project(user_id, project_id)
            if existing:
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

        # Limit context to top 15 chunks to stay bounded
        context_chunks = all_chunks[:15]
        valid_chunk_ids = {c["chunk_id"] for c in all_chunks}

        provider = get_llm_provider()
        prompt = build_concept_extraction_prompt(context_chunks)

        start_time = time.perf_counter()
        try:
            raw_output, usage = await provider.generate_structured(
                system_instruction=CONCEPT_EXTRACTION_SYSTEM_INSTRUCTION,
                user_prompt=prompt,
                response_schema=ConceptExtractionOutput,
                temperature=0.2,
            )
            latency_ms = usage.latency_ms or ((time.perf_counter() - start_time) * 1000.0)
            log_ai_usage(
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
            )
        except LLMGenerationError as err:
            latency_ms = (time.perf_counter() - start_time) * 1000.0
            log_ai_usage(
                user_id=user_id,
                project_id=project_id,
                operation="concept_extraction",
                provider="gemini",
                model=settings.GEMINI_MODEL,
                latency_ms=latency_ms,
                success=False,
                error=str(err),
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="AI concept extraction failed. Please try again in a moment.",
            ) from err

        # Filter fabricated chunk IDs
        concepts_to_create = []
        for item in raw_output.concepts:
            filtered_chunks = [cid for cid in item.source_chunk_ids if cid in valid_chunk_ids]
            concepts_to_create.append(
                {
                    "name": item.name.strip(),
                    "description": item.description.strip(),
                    "source_chunk_ids": filtered_chunks,
                }
            )

        if not concepts_to_create:
            # Fallback if model output was empty
            concepts_to_create.append(
                {
                    "name": "General Subject Matter",
                    "description": "Core concepts and principles discussed in uploaded project materials.",
                    "source_chunk_ids": [str(context_chunks[0]["chunk_id"])],
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
        concepts = await self.ensure_project_concepts(user_id, project_id)
        if not concepts:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unable to generate quiz: no concepts available for this project.",
            )

        # 2. Retrieve learner history for adaptive engine
        history = await self.quiz_repo.get_project_learner_history(user_id, project_id, limit=50)

        # 3. Compute deterministic adaptive plan
        count = payload.question_count or settings.QUIZ_QUESTION_COUNT
        plan = AdaptiveEngine.compute_plan(
            concepts=concepts,
            history=history,
            question_count=count,
            preferred_difficulty=payload.preferred_difficulty,
        )

        # 4. Collect supporting chunks for selected concepts
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

        # Select evidence chunks: target concept sources + first chunks
        evidence_chunks = []
        selected_chunk_ids = set()
        for score in plan.selected_concepts:
            c_obj = next((c for c in concepts if c.id == score.concept_id), None)
            if c_obj and c_obj.source_chunk_ids:
                for cid in c_obj.source_chunk_ids:
                    if cid in all_chunks_dict and cid not in selected_chunk_ids:
                        selected_chunk_ids.add(cid)
                        evidence_chunks.append(all_chunks_dict[cid])

        # Fill with general chunks if needed
        for cid, c_data in all_chunks_dict.items():
            if len(evidence_chunks) >= 10:
                break
            if cid not in selected_chunk_ids:
                selected_chunk_ids.add(cid)
                evidence_chunks.append(c_data)

        if not evidence_chunks:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No evidence chunks available to generate quiz questions.",
            )

        # 5. Question Generation via Gemini
        # Allocate: majority MCQ, at least 1 open-ended if count >= 3
        open_ended_count = 1 if count >= 3 else 0
        mcq_count = count - open_ended_count

        concept_payloads = [{"name": s.concept_name, "description": s.rationale} for s in plan.selected_concepts]
        prompt = build_quiz_generation_prompt(
            target_concepts=concept_payloads,
            evidence_chunks=evidence_chunks,
            target_difficulties=plan.recommended_difficulties,
            mcq_count=mcq_count,
            open_ended_count=open_ended_count,
        )

        provider = get_llm_provider()
        start_time = time.perf_counter()
        try:
            raw_output, usage = await provider.generate_structured(
                system_instruction=QUIZ_GENERATION_SYSTEM_INSTRUCTION,
                user_prompt=prompt,
                response_schema=QuizQuestionGenerationOutput,
                temperature=0.3,
            )
            latency_ms = usage.latency_ms or ((time.perf_counter() - start_time) * 1000.0)
            log_ai_usage(
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
            )
        except LLMGenerationError as err:
            latency_ms = (time.perf_counter() - start_time) * 1000.0
            log_ai_usage(
                user_id=user_id,
                project_id=project_id,
                operation="quiz_question_generation",
                provider="gemini",
                model=settings.GEMINI_MODEL,
                latency_ms=latency_ms,
                success=False,
                error=str(err),
            )
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="AI question generation failed. Please try again in a moment.",
            ) from err

        # 6. Validate generated questions & chunk IDs server-side
        concept_lookup = {c.name.lower(): c.id for c in concepts}
        default_concept_id = concepts[0].id

        valid_chunk_ids_set = set(all_chunks_dict.keys())
        questions_data = []
        q_order = 1

        # Process MCQs
        for mcq in raw_output.mcq_questions:
            # Validate options count
            if len(mcq.options) != 4:
                continue
            # Validate correct_answer matches one of the options
            matched_option = next((opt for opt in mcq.options if opt.strip().lower() == mcq.correct_answer.strip().lower()), None)
            if not matched_option:
                # If model returned "A" or "Option 1", match index or first option
                matched_option = mcq.options[0]

            # Validate evidence chunks (reject fabricated)
            valid_evidence = [cid for cid in mcq.evidence_chunk_ids if cid in valid_chunk_ids_set]
            if not valid_evidence and evidence_chunks:
                valid_evidence = [str(evidence_chunks[0]["chunk_id"])]

            c_id = concept_lookup.get(mcq.concept_name.strip().lower(), default_concept_id)

            questions_data.append(
                {
                    "concept_id": c_id,
                    "question_type": "mcq",
                    "question_text": mcq.question.strip(),
                    "options": mcq.options,
                    "correct_answer": matched_option,
                    "explanation": mcq.explanation.strip(),
                    "rubric": None,
                    "difficulty": mcq.difficulty,
                    "source_chunk_ids": valid_evidence,
                    "question_order": q_order,
                }
            )
            q_order += 1

        # Process Open-Ended
        for oeq in raw_output.open_ended_questions:
            valid_evidence = [cid for cid in oeq.evidence_chunk_ids if cid in valid_chunk_ids_set]
            if not valid_evidence and evidence_chunks:
                valid_evidence = [str(evidence_chunks[0]["chunk_id"])]

            c_id = concept_lookup.get(oeq.concept_name.strip().lower(), default_concept_id)

            questions_data.append(
                {
                    "concept_id": c_id,
                    "question_type": "open_ended",
                    "question_text": oeq.question.strip(),
                    "options": [],
                    "correct_answer": oeq.expected_answer.strip(),
                    "explanation": oeq.explanation.strip(),
                    "rubric": oeq.rubric.strip(),
                    "difficulty": oeq.difficulty,
                    "source_chunk_ids": valid_evidence,
                    "question_order": q_order,
                }
            )
            q_order += 1

        if not questions_data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Unable to assemble valid questions from AI output. Please retry.",
            )

        # 7. Persist Quiz & Questions
        quiz = await self.quiz_repo.create_quiz(
            user_id=user_id,
            project_id=project_id,
            title=payload.title or "Adaptive Quiz",
        )
        saved_questions = await self.quiz_repo.add_questions(
            quiz_id=quiz.id,
            user_id=user_id,
            project_id=project_id,
            questions_data=questions_data,
        )

        # 8. Record Activity Event
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
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz attempt not found")
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
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Attempt does not match quiz")
        if attempt.status != "in_progress":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Attempt is already completed")

        # 2. Authorize question
        question = await self.quiz_repo.get_question(user_id=user_id, question_id=question_id)
        if not question or question.quiz_id != quiz_id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")

        # 3. Evaluate answer
        if question.question_type == "mcq":
            # Deterministic backend MCQ evaluation
            selected = (payload.selected_answer or "").strip()
            if not selected:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Selected option is required for MCQ")

            # Check exact match or option letter/index match
            is_correct = False
            correct_norm = question.correct_answer.strip().lower()
            if selected.lower() == correct_norm:
                is_correct = True
            elif len(selected) == 1 and selected.upper() in ("A", "B", "C", "D"):
                # Handle letter index
                letter_idx = ord(selected.upper()) - ord("A")
                if 0 <= letter_idx < len(question.options):
                    is_correct = (question.options[letter_idx].strip().lower() == correct_norm)

            score = 1.0 if is_correct else 0.0
            feedback = question.explanation

        elif question.question_type == "open_ended":
            # Semantic evaluation via Google Gemini
            learner_text = (payload.answer_text or "").strip()
            if not learner_text:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Answer text is required for open-ended question")

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
                )
                latency_ms = usage.latency_ms or ((time.perf_counter() - start_time) * 1000.0)
                log_ai_usage(
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
                )
                score = round(max(0.0, min(1.0, eval_output.score)), 2)
                is_correct = eval_output.is_correct or (score >= settings.QUIZ_OPEN_ENDED_PASSING_SCORE)

                # Format detailed feedback
                feedback_parts = [eval_output.feedback]
                if eval_output.strengths:
                    feedback_parts.append("\nStrengths:\n" + "\n".join(f"- {s}" for s in eval_output.strengths))
                if eval_output.missing_points:
                    feedback_parts.append("\nAreas to improve:\n" + "\n".join(f"- {m}" for m in eval_output.missing_points))
                feedback = "\n".join(feedback_parts)

            except LLMGenerationError as err:
                latency_ms = (time.perf_counter() - start_time) * 1000.0
                log_ai_usage(
                    user_id=user_id,
                    project_id=attempt.project_id,
                    operation="open_ended_evaluation",
                    provider="gemini",
                    model=settings.GEMINI_MODEL,
                    latency_ms=latency_ms,
                    success=False,
                    error=str(err),
                )
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="AI answer evaluation is temporarily unavailable. Please try again.",
                ) from err
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported question type")

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
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Attempt does not match quiz")

        completed_attempt = await self.quiz_repo.complete_attempt(attempt_id=attempt.id, user_id=user_id)
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
