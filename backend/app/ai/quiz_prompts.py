"""AI Prompts and Structured Templates for Concept Extraction, Quiz Generation, and Assessment Evaluation.

Enforces strict grounding, evidence bounding, and Pydantic-compatible JSON schema outputs.
"""

CONCEPT_EXTRACTION_SYSTEM_INSTRUCTION = """You are an expert educational curriculum analyzer.
Your task is to extract the core, distinct conceptual topics from the provided learning material chunks.

Rules:
1. ONLY extract concepts directly taught and defined within the <retrieved_evidence> blocks.
2. Never invent or extrapolate concepts not explicitly supported by the text.
3. For each concept, extract 1-3 accurate summary sentences.
4. Attach the exact chunk IDs (UUIDs) that provide supporting evidence for that concept.
5. Return between 3 and 8 concepts that represent the fundamental building blocks of the material.
"""


QUIZ_GENERATION_SYSTEM_INSTRUCTION = """You are an expert educational assessment creator.
Your goal is to generate rigorous, fair, and high-quality quiz questions grounded exclusively in the provided learning material chunks.

Rules:
1. All questions MUST be strictly answerable from the provided <retrieved_evidence>.
2. Every question must cite the valid chunk id(s) from <retrieved_evidence> that contain the evidence.
3. For Multiple Choice Questions (MCQ):
   - Provide exactly 4 options.
   - The correct_answer MUST be the exact verbatim text of one of the 4 options.
   - All distractors (incorrect options) must be plausible misconceptions, not absurd or obviously false answers.
   - Provide a clear explanation detailing why the correct answer is right and why the distractors are wrong based on the evidence.
4. For Open-Ended Questions:
   - Provide a clear, comprehensive expected_answer.
   - Provide a rubric detailing the specific criteria and key points needed to earn full credit.
   - Provide an explanation linking the concept to the evidence.
5. Assign appropriate difficulty levels ('easy', 'medium', 'hard') matching the cognitive depth required.
6. Do NOT invent concepts, facts, or citations outside <retrieved_evidence>.
"""


OPEN_ENDED_EVALUATION_SYSTEM_INSTRUCTION = """You are an objective academic evaluator.
Your role is to assess a learner's open-ended answer against an authoritative model answer, evaluation rubric, and verified source evidence.

Rules:
1. Evaluate whether the learner's response demonstrates conceptual understanding according to the rubric.
2. Assign a normalized score between 0.0 (completely inaccurate/missing) and 1.0 (exemplary).
3. Mark `is_correct` as True if the score is >= 0.70, or False if below 0.70.
4. List specific strengths (key correct claims made by the learner).
5. List missing points (required criteria from the rubric that were omitted or flawed).
6. Provide helpful, encouraging, constructive pedagogical feedback directly explaining how to improve.
7. Be fair: allow for alternative phrasings and synonyms that convey the same technical meaning.
8. If the learner wrote "I don't know", gibberish, or irrelevant content, score 0.0 and mark is_correct=False.
"""


def build_concept_extraction_prompt(evidence_chunks: list[dict]) -> str:
    """Build structured prompt for extracting concepts from material chunks."""
    sections = [
        "Please analyze the following learning material chunks and extract the primary concepts.\n",
        "<retrieved_evidence>",
    ]
    for chunk in evidence_chunks:
        chunk_id = chunk.get("chunk_id")
        page_num = chunk.get("page_number", 1)
        filename = chunk.get("filename", "document.pdf")
        content = chunk.get("content", "").strip()
        sections.append(
            f'<chunk id="{chunk_id}" filename="{filename}" page="{page_num}">\n'
            f"{content}\n"
            f"</chunk>"
        )
    sections.append("</retrieved_evidence>\n")
    sections.append(
        "Extract 3 to 8 core concepts taught in this material. "
        "For each concept, provide its name, a concise summary description, and the chunk IDs that support it."
    )
    return "\n".join(sections)


def build_quiz_generation_prompt(
    target_concepts: list[dict],
    evidence_chunks: list[dict],
    target_difficulties: list[str],
    mcq_count: int,
    open_ended_count: int,
) -> str:
    """Build structured prompt for generating grounded quiz questions."""
    sections = [
        "Please generate an adaptive quiz grounded exclusively in the provided document evidence.\n",
        "<retrieved_evidence>",
    ]
    for chunk in evidence_chunks:
        chunk_id = chunk.get("chunk_id")
        page_num = chunk.get("page_number", 1)
        filename = chunk.get("filename", "document.pdf")
        content = chunk.get("content", "").strip()
        sections.append(
            f'<chunk id="{chunk_id}" filename="{filename}" page="{page_num}">\n'
            f"{content}\n"
            f"</chunk>"
        )
    sections.append("</retrieved_evidence>\n")

    sections.append("<target_concepts>")
    for c in target_concepts:
        sections.append(f"- {c.get('name')}: {c.get('description', '')}")
    sections.append("</target_concepts>\n")

    sections.append("<generation_requirements>")
    sections.append(f"- Total MCQ questions: {mcq_count}")
    sections.append(f"- Total Open-Ended questions: {open_ended_count}")
    sections.append(f"- Target difficulties to cover: {', '.join(target_difficulties)}")
    sections.append(
        "- Each question MUST map to one of the target concepts and cite valid chunk IDs from <retrieved_evidence>."
    )
    sections.append("</generation_requirements>")

    return "\n".join(sections)


def build_open_ended_evaluation_prompt(
    question: str,
    expected_answer: str,
    rubric: str,
    learner_answer: str,
    evidence_chunks: list[dict] | None = None,
) -> str:
    """Build structured prompt for evaluating learner open-ended answers."""
    sections = [
        "Please evaluate the learner's response based on the criteria below.\n",
        f"<question>\n{question.strip()}\n</question>\n",
        f"<model_answer>\n{expected_answer.strip()}\n</model_answer>\n",
        f"<evaluation_rubric>\n{rubric.strip()}\n</evaluation_rubric>\n",
        f"<learner_submission>\n{learner_answer.strip()}\n</learner_submission>\n",
    ]

    if evidence_chunks:
        sections.append("<source_evidence>")
        for chunk in evidence_chunks:
            sections.append(f"- {chunk.get('content', '').strip()}")
        sections.append("</source_evidence>\n")

    sections.append(
        "Evaluate the submission according to the rubric. Provide a score from 0.0 to 1.0, "
        "mark is_correct (True if score >= 0.70), identify strengths, missing points, and pedagogical feedback."
    )
    return "\n".join(sections)
