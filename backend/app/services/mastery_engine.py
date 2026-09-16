"""Deterministic Mastery Engine (Phase 5).

Pure, unit-testable mathematical engine calculating concept mastery and confidence
from historical QuizAnswer evidence.

No database or LLM calls are made inside this engine.
"""

import math
from dataclasses import dataclass
from datetime import datetime

DIFFICULTY_WEIGHTS: dict[str, float] = {
    "easy": 0.8,
    "medium": 1.0,
    "hard": 1.3,
}

RECENCY_DECAY_LAMBDA: float = 0.85


@dataclass(frozen=True)
class AnswerEvidence:
    """Structured evidence item extracted from a persisted QuizAnswer."""

    score: float | None
    difficulty: str
    is_correct: bool | None
    evaluated_at: datetime | None = None


@dataclass(frozen=True)
class ConceptMasteryEstimate:
    """Calculated mastery estimate and confidence."""

    mastery_score: float | None  # None indicates unassessed
    confidence: float  # 0.0 to 1.0
    confidence_level: str  # unassessed, low, medium, high
    evidence_count: int
    is_assessed: bool


def is_answer_mastery_eligible(answer: AnswerEvidence) -> bool:
    """Determine whether an answer is valid, evaluated, and eligible to contribute to mastery.

    Incomplete, abandoned, unsubmitted, or failed evaluations do not contribute.
    """
    if answer.score is None or answer.is_correct is None:
        return False
    # Score must be bounded in [0.0, 1.0]
    if not (0.0 <= answer.score <= 1.0):
        return False
    return True


def calculate_concept_mastery(
    answers: list[AnswerEvidence],
    recency_decay: float = RECENCY_DECAY_LAMBDA,
) -> ConceptMasteryEstimate:
    """Compute mastery score and confidence deterministically from answer evidence.

    Rules:
    1. Filter for mastery-eligible answers only.
    2. If no eligible evidence exists, return unassessed (mastery_score=None, confidence=0.0).
    3. Order chronologically ascending.
    4. Weight recent answers more heavily than old ones using exponential index decay:
       w_recency = recency_decay ** (N - 1 - i), where i is 0-indexed chronological position.
    5. Weight harder questions more than easier ones (easy: 0.8, medium: 1.0, hard: 1.3).
    6. Combine weights: W_i = w_recency_i * w_difficulty_i.
    7. Compute weighted average of partial credit scores (score in [0.0, 1.0]).
    8. Scale to percentage (0.0 to 100.0).
    9. Compute confidence asymptotically based on evidence count:
       confidence = round(1.0 - math.exp(-N / 5.0), 2).
    """
    # 1. Filter eligible answers
    eligible = [a for a in answers if is_answer_mastery_eligible(a)]
    n = len(eligible)

    if n == 0:
        return ConceptMasteryEstimate(
            mastery_score=None,
            confidence=0.0,
            confidence_level="unassessed",
            evidence_count=0,
            is_assessed=False,
        )

    # 2. Chronological sort (if evaluated_at provided)
    if any(a.evaluated_at is not None for a in eligible):
        eligible = sorted(
            eligible,
            key=lambda a: a.evaluated_at or datetime.min,
        )

    # 3. Calculate weighted mastery
    weighted_score_sum = 0.0
    total_weight = 0.0

    for i, a in enumerate(eligible):
        recency_weight = recency_decay ** (n - 1 - i)
        diff_weight = DIFFICULTY_WEIGHTS.get(a.difficulty.lower(), 1.0)
        combined_weight = recency_weight * diff_weight

        # a.score is verified to be non-None and in [0.0, 1.0]
        score_val = float(a.score) if a.score is not None else 0.0
        weighted_score_sum += combined_weight * score_val
        total_weight += combined_weight

    raw_accuracy = weighted_score_sum / total_weight if total_weight > 0 else 0.0
    mastery_score = round(max(0.0, min(100.0, raw_accuracy * 100.0)), 1)

    # 4. Asymptotic confidence calculation
    confidence = round(max(0.0, min(1.0, 1.0 - math.exp(-n / 5.0))), 2)

    if confidence < 0.40:
        confidence_level = "low"
    elif confidence < 0.75:
        confidence_level = "medium"
    else:
        confidence_level = "high"

    return ConceptMasteryEstimate(
        mastery_score=mastery_score,
        confidence=confidence,
        confidence_level=confidence_level,
        evidence_count=n,
        is_assessed=True,
    )
