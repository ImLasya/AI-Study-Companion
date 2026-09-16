"""System instructions and prompt templates for Recommendation Generation (Phase 5)."""

import json

RECOMMENDATION_SYSTEM_INSTRUCTION = """You are an adaptive pedagogical advisor in an AI Study Companion.
Your goal is to recommend the single most impactful, targeted next action for a learner.

Guidelines:
1. Ground recommendations ONLY in the provided diagnostic summary (learning goal, weak concepts, recent errors, and available materials).
2. Do not invent concepts. You MUST choose target_concept_id exclusively from the provided Candidate Concepts list, or return null if it is a general study recommendation.
3. Be specific, actionable, encouraging, and clear. State exactly what to do (e.g., 'Review X with the AI Tutor', 'Take a 3-question quiz on Y', 'Read Section Z of material M').
4. State the explicit reasoning ('Why am I seeing this?') so the learner understands why this was chosen.
5. Recommendation types allowed: 'review_concept', 'practice_quiz', 'study_material', 'explore_topic'.
"""


def build_recommendation_prompt(
    learning_goal: str,
    candidate_concepts: list[
        dict
    ],  # list of {"id": str, "name": str, "mastery": float | None, "status": str}
    recent_errors: list[dict],  # list of {"concept_name": str, "question": str, "explanation": str}
    available_materials: list[str],
) -> str:
    """Construct structured diagnostic prompt for recommendation generation."""
    prompt_payload = {
        "project_learning_goal": learning_goal or "General Mastery",
        "candidate_concepts": candidate_concepts,
        "recent_errors": recent_errors[:5],
        "available_materials": available_materials[:5],
    }

    return f"""Analyze the learner's diagnostic profile below and generate the single best next recommendation.

Diagnostic Profile:
{json.dumps(prompt_payload, indent=2)}

Select an appropriate recommendation_type, write an action-oriented title and body, reference the matching target_concept_id (or null), and explain your reasoning clearly.
"""
