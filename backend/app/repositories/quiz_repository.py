"""Quiz, Question, Attempt, and Answer Persistence Repository.

Enforces strict tenant isolation: all queries filter by entity ID and user_id.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.quiz import Quiz, QuizAnswer, QuizAttempt, QuizQuestion


class QuizRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_quiz(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        title: str = "Adaptive Quiz",
    ) -> Quiz:
        """Create a new Quiz record."""
        quiz = Quiz(
            id=uuid.uuid4(),
            user_id=user_id,
            project_id=project_id,
            title=title,
            status="active",
            created_at=datetime.now(UTC),
        )
        self.session.add(quiz)
        await self.session.commit()
        await self.session.refresh(quiz)
        return quiz

    async def list_quizzes(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
    ) -> list[Quiz]:
        """List all quizzes for a project, newest first, with questions loaded."""
        stmt = (
            select(Quiz)
            .options(
                selectinload(Quiz.questions).selectinload(QuizQuestion.concept),
            )
            .where(
                Quiz.project_id == project_id,
                Quiz.user_id == user_id,
            )
            .order_by(Quiz.created_at.desc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_quiz(
        self,
        user_id: uuid.UUID,
        quiz_id: uuid.UUID,
    ) -> Quiz | None:
        """Fetch a quiz by ID with questions eagerly loaded, scoped to user."""
        stmt = (
            select(Quiz)
            .options(
                selectinload(Quiz.questions).selectinload(QuizQuestion.concept),
            )
            .where(
                Quiz.id == quiz_id,
                Quiz.user_id == user_id,
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def add_questions(
        self,
        quiz_id: uuid.UUID,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        questions_data: list[dict],
    ) -> list[QuizQuestion]:
        """Bulk insert questions into a quiz."""
        questions: list[QuizQuestion] = []
        for idx, q in enumerate(questions_data, start=1):
            question = QuizQuestion(
                id=uuid.uuid4(),
                quiz_id=quiz_id,
                user_id=user_id,
                project_id=project_id,
                concept_id=q.get("concept_id"),
                question_type=q["question_type"],
                question_text=q["question_text"],
                options=q.get("options", []),
                correct_answer=q["correct_answer"],
                explanation=q["explanation"],
                rubric=q.get("rubric"),
                difficulty=q.get("difficulty", "medium"),
                source_chunk_ids=q.get("source_chunk_ids", []),
                question_order=q.get("question_order", idx),
                created_at=datetime.now(UTC),
            )
            self.session.add(question)
            questions.append(question)

        await self.session.commit()
        for quest in questions:
            await self.session.refresh(quest)
        return questions

    async def get_question(
        self,
        user_id: uuid.UUID,
        question_id: uuid.UUID,
    ) -> QuizQuestion | None:
        """Fetch a single question scoped to the authenticated user."""
        stmt = (
            select(QuizQuestion)
            .options(selectinload(QuizQuestion.concept))
            .where(
                QuizQuestion.id == question_id,
                QuizQuestion.user_id == user_id,
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def create_attempt(
        self,
        quiz_id: uuid.UUID,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        total_questions: int,
    ) -> QuizAttempt:
        """Create a new attempt for a quiz."""
        attempt = QuizAttempt(
            id=uuid.uuid4(),
            quiz_id=quiz_id,
            user_id=user_id,
            project_id=project_id,
            started_at=datetime.now(UTC),
            total_questions=total_questions,
            correct_answers=0,
            status="in_progress",
        )
        self.session.add(attempt)
        await self.session.commit()
        await self.session.refresh(attempt)
        return attempt

    async def get_attempt(
        self,
        user_id: uuid.UUID,
        attempt_id: uuid.UUID,
    ) -> QuizAttempt | None:
        """Fetch an attempt with its answers eagerly loaded, scoped to user."""
        stmt = (
            select(QuizAttempt)
            .options(
                selectinload(QuizAttempt.answers).selectinload(QuizAnswer.question),
                selectinload(QuizAttempt.answers).selectinload(QuizAnswer.concept),
            )
            .where(
                QuizAttempt.id == attempt_id,
                QuizAttempt.user_id == user_id,
            )
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_attempts_by_quiz(
        self,
        user_id: uuid.UUID,
        quiz_id: uuid.UUID,
    ) -> list[QuizAttempt]:
        """Fetch all attempts for a specific quiz, newest first."""
        stmt = (
            select(QuizAttempt)
            .where(
                QuizAttempt.quiz_id == quiz_id,
                QuizAttempt.user_id == user_id,
            )
            .order_by(QuizAttempt.started_at.desc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def record_answer(
        self,
        attempt_id: uuid.UUID,
        question: QuizQuestion,
        user_id: uuid.UUID,
        selected_answer: str | None,
        answer_text: str | None,
        is_correct: bool,
        score: float,
        evaluation_feedback: str | None,
    ) -> QuizAnswer:
        """Record an answer for a question within an active attempt.
        Updates attempt correct_answers count atomically.
        """
        # Check if answer already recorded for this question in this attempt
        stmt = select(QuizAnswer).where(
            QuizAnswer.attempt_id == attempt_id,
            QuizAnswer.question_id == question.id,
            QuizAnswer.user_id == user_id,
        )
        res = await self.session.execute(stmt)
        existing = res.scalar_one_or_none()
        if existing:
            existing.selected_answer = selected_answer
            existing.answer_text = answer_text
            existing.is_correct = is_correct
            existing.score = score
            existing.evaluation_feedback = evaluation_feedback
            existing.evaluated_at = datetime.now(UTC)
            await self.session.commit()
            await self.session.refresh(existing)
            return existing

        answer = QuizAnswer(
            id=uuid.uuid4(),
            attempt_id=attempt_id,
            question_id=question.id,
            user_id=user_id,
            concept_id=question.concept_id,
            difficulty=question.difficulty,
            selected_answer=selected_answer,
            answer_text=answer_text,
            is_correct=is_correct,
            score=score,
            evaluation_feedback=evaluation_feedback,
            evaluated_at=datetime.now(UTC),
        )
        self.session.add(answer)

        # Update attempt running correct count
        if is_correct:
            attempt_stmt = select(QuizAttempt).where(
                QuizAttempt.id == attempt_id,
                QuizAttempt.user_id == user_id,
            )
            att_res = await self.session.execute(attempt_stmt)
            attempt = att_res.scalar_one_or_none()
            if attempt:
                attempt.correct_answers += 1

        await self.session.commit()
        await self.session.refresh(answer)
        return answer

    async def complete_attempt(
        self,
        attempt_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> QuizAttempt | None:
        """Finalize attempt, compute final percentage score, and mark completed."""
        stmt = (
            select(QuizAttempt)
            .options(
                selectinload(QuizAttempt.answers).selectinload(QuizAnswer.question),
                selectinload(QuizAttempt.answers).selectinload(QuizAnswer.concept),
            )
            .where(
                QuizAttempt.id == attempt_id,
                QuizAttempt.user_id == user_id,
            )
        )
        result = await self.session.execute(stmt)
        attempt = result.scalar_one_or_none()
        if not attempt:
            return None

        # Query answers directly to guarantee fresh loaded collection
        answers_stmt = (
            select(QuizAnswer)
            .options(
                selectinload(QuizAnswer.question),
                selectinload(QuizAnswer.concept),
            )
            .where(
                QuizAnswer.attempt_id == attempt_id,
                QuizAnswer.user_id == user_id,
            )
        )
        answers_res = await self.session.execute(answers_stmt)
        answers = list(answers_res.scalars().all())

        # Compute normalized score percentage based on sum of answer scores
        if attempt.total_questions > 0:
            total_earned = sum(a.score or (1.0 if a.is_correct else 0.0) for a in answers)
            score_pct = round((total_earned / attempt.total_questions) * 100.0, 1)
        else:
            score_pct = 0.0

        attempt.score = score_pct
        attempt.status = "completed"
        attempt.completed_at = datetime.now(UTC)

        await self.session.commit()
        refreshed = await self.get_attempt(user_id=user_id, attempt_id=attempt_id)
        if refreshed:
            refreshed.answers = answers
        return refreshed or attempt

    async def get_project_learner_history(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        limit: int = 50,
    ) -> list[QuizAnswer]:
        """Fetch recent answer history for this learner in this project.
        Provides the multi-signal inputs for the Adaptive Engine.
        """
        stmt = (
            select(QuizAnswer)
            .join(QuizAttempt, QuizAnswer.attempt_id == QuizAttempt.id)
            .where(
                QuizAttempt.project_id == project_id,
                QuizAnswer.user_id == user_id,
            )
            .order_by(QuizAnswer.evaluated_at.desc())
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
