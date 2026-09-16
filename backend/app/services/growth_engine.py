"""Deterministic Growth Engine (Phase 5).

Evaluates trajectory of concept mastery over time without ML forecasting or LLM judgment.
Classifies concepts as improving, stable, needs_attention, or unassessed.
"""

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class SnapshotPoint:
    """Historical snapshot data point."""

    mastery_score: float
    recorded_at: datetime


@dataclass(frozen=True)
class ConceptGrowthAnalysis:
    """Growth trajectory classification and historical timeline for a concept."""

    concept_id: str
    concept_name: str
    current_score: float | None
    baseline_score: float | None
    delta: float
    status: str  # improving, stable, needs_attention, unassessed
    history: list[dict]  # list of {"recorded_at": ISO, "score": float}


def classify_concept_growth(
    concept_id: str,
    concept_name: str,
    current_score: float | None,
    evidence_count: int,
    snapshots: list[SnapshotPoint],
) -> ConceptGrowthAnalysis:
    """Classify concept trajectory deterministically from snapshot history.

    Rules:
    - If unassessed (no score or zero evidence): status = "unassessed", delta = 0.0.
    - If no historical snapshots:
        baseline = current_score, delta = 0.0
        status = "needs_attention" if current_score < 45.0 else "stable"
    - If historical snapshots exist:
        baseline = earliest snapshot score in the window
        delta = current_score - baseline
        if delta >= +5.0: "improving"
        else if delta <= -5.0 or current_score < 45.0: "needs_attention"
        else: "stable"
    """
    history_points = [
        {"recorded_at": s.recorded_at.isoformat(), "score": s.mastery_score}
        for s in sorted(snapshots, key=lambda s: s.recorded_at)
    ]

    if current_score is None or evidence_count == 0:
        return ConceptGrowthAnalysis(
            concept_id=concept_id,
            concept_name=concept_name,
            current_score=None,
            baseline_score=None,
            delta=0.0,
            status="unassessed",
            history=history_points,
        )

    if not snapshots:
        status = "needs_attention" if current_score < 45.0 else "stable"
        return ConceptGrowthAnalysis(
            concept_id=concept_id,
            concept_name=concept_name,
            current_score=current_score,
            baseline_score=current_score,
            delta=0.0,
            status=status,
            history=history_points,
        )

    earliest = min(snapshots, key=lambda s: s.recorded_at)
    baseline_score = earliest.mastery_score
    delta = round(current_score - baseline_score, 1)

    if delta >= 5.0:
        status = "improving"
    elif delta <= -5.0 or current_score < 45.0:
        status = "needs_attention"
    else:
        status = "stable"

    return ConceptGrowthAnalysis(
        concept_id=concept_id,
        concept_name=concept_name,
        current_score=current_score,
        baseline_score=baseline_score,
        delta=delta,
        status=status,
        history=history_points,
    )
