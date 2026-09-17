"""Tutor Context Service.

Assembles multi-session learner context (recent conversation, historical Q&As,
active weak concepts, and recent quiz mistakes) to provide persistent tutor
continuity across sessions while strictly respecting tenant boundaries and
token budgets.
"""

import logging
import uuid
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.concept import Concept
from app.models.conversation import TutorConversation, TutorMessage
from app.models.mastery import ConceptMastery
from app.models.quiz import QuizAnswer, QuizAttempt, QuizQuestion

logger = logging.getLogger("ai_study_companion.services.tutor_context")

# Max non-evidence context budget in characters (~1,500 tokens * 4 chars/token)
MAX_CONTEXT_CHAR_BUDGET = 6000


@dataclass
class PedagogicalContext:
    """Assembled pedagogical context for grounded tutoring."""

    conversation_turns: list[dict[str, Any]] = field(default_factory=list)
    historical_qas: list[dict[str, Any]] = field(default_factory=list)
    weak_concepts: list[dict[str, Any]] = field(default_factory=list)
    recent_mistakes: list[dict[str, Any]] = field(default_factory=list)
    total_chars: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "conversation_turns": self.conversation_turns,
            "historical_qas": self.historical_qas,
            "weak_concepts": self.weak_concepts,
            "recent_mistakes": self.recent_mistakes,
            "total_chars": self.total_chars,
        }


class TutorContextService:
    """Provides learner continuity context for Tutor conversations."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def assemble_context(
        self,
        user_id: uuid.UUID,
        project_id: uuid.UUID,
        conversation_id: uuid.UUID | None,
        history_limit: int = 6,
    ) -> PedagogicalContext:
        """Assemble multi-session context within the token budget and tenant boundary."""
        context = PedagogicalContext()

        # 1. Active conversation history (last N turns)
        if conversation_id:
            conv_stmt = (
                select(TutorConversation)
                .options(selectinload(TutorConversation.messages))
                .where(
                    TutorConversation.id == conversation_id,
                    TutorConversation.user_id == user_id,
                    TutorConversation.project_id == project_id,
                )
            )
            conv_res = await self.session.execute(conv_stmt)
            active_conv = conv_res.scalar_one_or_none()
            if active_conv and active_conv.messages:
                recent_msgs = active_conv.messages[-history_limit:]
                context.conversation_turns = [
                    {
                        "role": m.role,
                        "content": m.content,
                        "grounded": getattr(m, "grounded", False),
                    }
                    for m in recent_msgs
                ]

        # 2. Active weak concepts (mastery_score < 0.7 or lowest scores in this project)
        try:
            mastery_stmt = (
                select(ConceptMastery, Concept.name)
                .join(Concept, ConceptMastery.concept_id == Concept.id)
                .where(
                    ConceptMastery.user_id == user_id,
                    ConceptMastery.project_id == project_id,
                )
                .order_by(ConceptMastery.mastery_score.asc().nullsfirst())
                .limit(5)
            )
            mastery_res = await self.session.execute(mastery_stmt)
            for mastery, c_name in mastery_res.all():
                score = mastery.mastery_score
                if score is None or score < 0.7:  # treat < 70% as requiring attention
                    context.weak_concepts.append(
                        {
                            "concept_id": str(mastery.concept_id),
                            "name": c_name,
                            "mastery_score": round(score, 2) if score is not None else None,
                        }
                    )
        except Exception as e:
            logger.warning(f"Could not load weak concepts for tutor context: {e}")

        # 3. Recent quiz mistakes in this project
        try:
            mistakes_stmt = (
                select(QuizAnswer, QuizQuestion.question_text, Concept.name)
                .join(QuizAttempt, QuizAnswer.attempt_id == QuizAttempt.id)
                .join(QuizQuestion, QuizAnswer.question_id == QuizQuestion.id)
                .outerjoin(Concept, QuizQuestion.concept_id == Concept.id)
                .where(
                    QuizAttempt.project_id == project_id,
                    QuizAnswer.user_id == user_id,
                    QuizAnswer.is_correct.is_(False),
                )
                .order_by(desc(QuizAnswer.evaluated_at))
                .limit(3)
            )
            mistakes_res = await self.session.execute(mistakes_stmt)
            for ans, q_text, c_name in mistakes_res.all():
                context.recent_mistakes.append(
                    {
                        "question_text": q_text[:120] + "..." if len(q_text) > 120 else q_text,
                        "concept_name": c_name or "General",
                        "learner_answer": (ans.selected_answer or ans.answer_text or "")[:80],
                    }
                )
        except Exception as e:
            logger.warning(f"Could not load recent quiz mistakes for tutor context: {e}")

        # 4. Historical Q&As from earlier sessions in this project (excluding current conversation)
        try:
            hist_qas_stmt = (
                select(TutorMessage)
                .join(TutorConversation, TutorMessage.conversation_id == TutorConversation.id)
                .where(
                    TutorConversation.project_id == project_id,
                    TutorConversation.user_id == user_id,
                    TutorConversation.id != conversation_id if conversation_id else True,
                    TutorMessage.role == "user",
                )
                .order_by(desc(TutorMessage.created_at))
                .limit(4)
            )
            hist_msgs_res = await self.session.execute(hist_qas_stmt)
            user_msgs = hist_msgs_res.scalars().all()

            for u_msg in user_msgs:
                reply_stmt = (
                    select(TutorMessage)
                    .where(
                        TutorMessage.conversation_id == u_msg.conversation_id,
                        TutorMessage.role == "assistant",
                        TutorMessage.created_at >= u_msg.created_at,
                    )
                    .order_by(TutorMessage.created_at.asc())
                    .limit(1)
                )
                reply_res = await self.session.execute(reply_stmt)
                reply = reply_res.scalar_one_or_none()
                if reply:
                    snippet = reply.content[:150].strip() + "..." if len(reply.content) > 150 else reply.content.strip()
                    context.historical_qas.append(
                        {
                            "question": u_msg.content[:120].strip(),
                            "answer_snippet": snippet,
                        }
                    )
        except Exception as e:
            logger.warning(f"Could not load historical Q&As for tutor context: {e}")

        # 5. Enforce character budget (~1500 tokens)
        self._enforce_budget(context)
        return context

    def _enforce_budget(self, context: PedagogicalContext) -> None:
        """Prune non-essential historical context to stay strictly within MAX_CONTEXT_CHAR_BUDGET."""
        def calc_chars() -> int:
            chars = 0
            for t in context.conversation_turns:
                chars += len(t.get("content", ""))
            for w in context.weak_concepts:
                chars += len(w.get("name", "")) + 20
            for m in context.recent_mistakes:
                chars += len(m.get("question_text", "")) + len(m.get("learner_answer", ""))
            for h in context.historical_qas:
                chars += len(h.get("question", "")) + len(h.get("answer_snippet", ""))
            return chars

        while calc_chars() > MAX_CONTEXT_CHAR_BUDGET and context.historical_qas:
            context.historical_qas.pop()

        while calc_chars() > MAX_CONTEXT_CHAR_BUDGET and context.recent_mistakes:
            context.recent_mistakes.pop()

        while calc_chars() > MAX_CONTEXT_CHAR_BUDGET and len(context.conversation_turns) > 2:
            context.conversation_turns.pop(0)

        context.total_chars = calc_chars()
