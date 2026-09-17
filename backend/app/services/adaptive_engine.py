"""Deterministic Multi-Signal Adaptive Selection Engine.

Computes explainable concept priority scores and difficulty distribution based on:
1. Mistake & Repeated Error Signals (boosts concepts learner struggled on)
2. Unseen Concept Signals (exploration bonus for concepts not yet assessed)
3. Recency Saturation Penalties (prevents recently mastered concepts from dominating)
4. Historical Learner Performance (calibrates question difficulty)
"""

import uuid
from dataclasses import dataclass
from typing import Any

from app.models.concept import Concept
from app.models.quiz import QuizAnswer


@dataclass(frozen=True)
class ConceptAdaptiveScore:
    concept_id: uuid.UUID
    concept_name: str
    base_score: float
    error_signal: float
    unseen_signal: float
    recency_penalty: float
    final_weight: float
    rationale: str


@dataclass(frozen=True)
class AdaptivePlan:
    selected_concepts: list[ConceptAdaptiveScore]
    recommended_difficulties: list[str]  # e.g. ["medium", "medium", "hard", "easy", "medium"]
    overall_accuracy: float | None
    total_history_answers: int


class AdaptiveEngine:
    """Deterministic selection algorithm for adaptive quiz question distribution."""

    @staticmethod
    def compute_plan(
        concepts: list[Concept],
        history: list[QuizAnswer],
        question_count: int = 5,
        preferred_difficulty: str | None = "adaptive",
        recent_questions: list[Any] | None = None,
        quiz_count: int = 0,
    ) -> AdaptivePlan:
        """Compute an explainable, deterministic adaptive plan for the next quiz."""
        if not concepts:
            return AdaptivePlan(
                selected_concepts=[],
                recommended_difficulties=["medium"] * question_count,
                overall_accuracy=None,
                total_history_answers=0,
            )

        # 1. Aggregate historical performance and question exposure by concept
        history_by_concept: dict[uuid.UUID, list[QuizAnswer]] = {c.id: [] for c in concepts}
        recent_question_ids: set[uuid.UUID] = set()

        for ans in history:
            recent_question_ids.add(ans.question_id)
            if ans.concept_id in history_by_concept:
                history_by_concept[ans.concept_id].append(ans)

        # Count recent question occurrences per concept (from immediate prior quizzes)
        recent_q_counts_by_concept: dict[uuid.UUID, int] = {c.id: 0 for c in concepts}
        if recent_questions:
            # Look at the most recent batch of questions
            for q in recent_questions[: max(question_count * 2, 10)]:
                c_id = getattr(q, "concept_id", None)
                if c_id and c_id in recent_q_counts_by_concept:
                    recent_q_counts_by_concept[c_id] += 1

        # Overall accuracy
        total_answers = len(history)
        correct_count = sum(1 for a in history if a.is_correct is True)
        overall_accuracy = (correct_count / total_answers) if total_answers > 0 else None

        # 2. Score each concept
        scored_concepts: list[ConceptAdaptiveScore] = []

        for concept in concepts:
            ans_list = history_by_concept.get(concept.id, [])
            base = 50.0
            error_bonus = 0.0
            unseen_bonus = 0.0
            recency_penalty = 0.0
            rationale_parts = []

            if not ans_list:
                # Unseen concept: high exploration priority
                unseen_bonus = 30.0
                rationale_parts.append("Never assessed: +30 exploration bonus")
            else:
                total_concept = len(ans_list)
                concept_mistakes = sum(1 for a in ans_list if a.is_correct is False)
                error_rate = concept_mistakes / total_concept

                # Mistake signal
                if error_rate > 0:
                    error_bonus = error_rate * 40.0
                    rationale_parts.append(
                        f"Mistake rate {error_rate:.0%}: +{error_bonus:.1f} error signal"
                    )

                # Repeated recent errors check (last 3 answers on this concept)
                recent_c_answers = ans_list[:3]
                recent_errors = sum(1 for a in recent_c_answers if a.is_correct is False)
                if recent_errors >= 2:
                    error_bonus += 15.0
                    rationale_parts.append("Repeated recent errors: +15 reinforcement signal")

                # Recency saturation penalty: if learner answered correctly in last 2 without errors
                if len(ans_list) >= 2 and all(a.is_correct is True for a in ans_list[:2]):
                    recency_penalty += 25.0
                    rationale_parts.append(
                        "Recently answered correctly: -25 recency saturation penalty"
                    )

            # Recency exposure penalty from recent quiz questions (even if not yet answered)
            recent_q_cnt = recent_q_counts_by_concept.get(concept.id, 0)
            if recent_q_cnt > 0:
                exposure_penalty = min(recent_q_cnt * 15.0, 30.0)
                recency_penalty += exposure_penalty
                rationale_parts.append(
                    f"Featured in recent quiz ({recent_q_cnt}x): -{exposure_penalty:.1f} exposure penalty"
                )

            final_weight = round(base + error_bonus + unseen_bonus - recency_penalty, 2)
            rationale_text = (
                "; ".join(rationale_parts) if rationale_parts else "Standard baseline priority"
            )

            scored_concepts.append(
                ConceptAdaptiveScore(
                    concept_id=concept.id,
                    concept_name=concept.name,
                    base_score=base,
                    error_signal=round(error_bonus, 2),
                    unseen_signal=round(unseen_bonus, 2),
                    recency_penalty=round(recency_penalty, 2),
                    final_weight=final_weight,
                    rationale=rationale_text,
                )
            )

        # Sort concepts by final_weight descending.
        # For concepts with tied weights, apply a rotating offset by quiz_count to ensure diverse coverage.
        from itertools import groupby

        scored_concepts.sort(key=lambda x: x.final_weight, reverse=True)
        ordered_concepts: list[ConceptAdaptiveScore] = []
        for _, group in groupby(scored_concepts, key=lambda x: x.final_weight):
            group_list = list(group)
            if len(group_list) > 1 and quiz_count > 0:
                # Rotate within tied group
                offset = quiz_count % len(group_list)
                group_list = group_list[offset:] + group_list[:offset]
            ordered_concepts.extend(group_list)

        # Cycle/pick concepts up to question_count
        selected: list[ConceptAdaptiveScore] = []
        for i in range(question_count):
            c = ordered_concepts[i % len(ordered_concepts)]
            selected.append(c)

        # 3. Determine difficulty distribution
        difficulties: list[str] = []
        if preferred_difficulty in ("easy", "medium", "hard"):
            difficulties = [preferred_difficulty] * question_count
        else:
            # Calibrate against overall accuracy
            if overall_accuracy is None:
                # Cold start: balanced mix starting easy/medium
                difficulties = ["easy", "medium", "medium", "easy", "medium"][:question_count]
                while len(difficulties) < question_count:
                    difficulties.append("medium")
            elif overall_accuracy < 0.50:
                # Learner is struggling: mostly easy, some medium
                difficulties = ["easy", "easy", "medium", "easy", "medium"][:question_count]
                while len(difficulties) < question_count:
                    difficulties.append("easy")
            elif overall_accuracy <= 0.80:
                # Proficient learner: balanced medium/hard
                difficulties = ["medium", "medium", "hard", "medium", "hard"][:question_count]
                while len(difficulties) < question_count:
                    difficulties.append("medium")
            else:
                # Advanced learner: mostly hard, some medium
                difficulties = ["hard", "hard", "medium", "hard", "medium"][:question_count]
                while len(difficulties) < question_count:
                    difficulties.append("hard")

        return AdaptivePlan(
            selected_concepts=selected,
            recommended_difficulties=difficulties,
            overall_accuracy=round(overall_accuracy, 2) if overall_accuracy is not None else None,
            total_history_answers=total_answers,
        )
