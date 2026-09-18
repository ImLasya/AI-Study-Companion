"""AI Prompts and Structured Templates for Concept Extraction, Quiz Generation, and Assessment Evaluation.

Enforces strict grounding, evidence bounding, and Pydantic-compatible JSON schema outputs.
"""

CONCEPT_EXTRACTION_SYSTEM_INSTRUCTION = """You are an expert educational curriculum analyzer.
Your task is to extract substantive academic and learning concepts from the provided learning material chunks.

Rules:
1. ONLY extract substantive academic concepts that represent educational knowledge a student can study, practice, assess, and master (e.g. historical periods, scientific principles, mathematical models, constitutional doctrines, core algorithms, domain methodologies).
2. STRICTLY FORBIDDEN: Do NOT extract document meta-structure, front matter, book features, marketing descriptions, study tips, or difficulty level schemes (e.g. NEVER extract "SmartBook", "Question Difficulty Levels", "General Knowledge Preparation Strategies", "Smart Answer Key", "Table of Contents", "Chapter Index", "Document Structure", "Level 1/2/3").
3. ONLY extract concepts directly taught and defined within the <retrieved_evidence> blocks.
4. Never invent or extrapolate concepts not explicitly supported by the text.
5. For each concept, extract a normalized, professional topic name and 1-3 accurate summary sentences.
6. Attach the exact chunk IDs (UUIDs) that provide supporting evidence for that concept.
7. Return between 2 and 6 core academic concepts from this chunk batch.
"""


QUIZ_GENERATION_SYSTEM_INSTRUCTION = """You are an expert educational assessment creator.
Your goal is to generate rigorous, fair, and high-quality academic quiz questions testing substantive subject knowledge, grounded exclusively in the provided learning material chunks.

PRIMARY MANDATE — TEST ACADEMIC SUBJECT KNOWLEDGE:
Every question MUST test the learner's genuine understanding of the academic subject matter:
- concepts, principles, and definitions
- mechanisms and processes
- relationships and distinctions between ideas
- reasoning and conceptual comparisons
- calculations, problem solving, and worked applications
- interpretation and scenarios
The question MUST require the student to know the SUBJECT, not merely locate text or citations in the document.

STRICTLY FORBIDDEN — DO NOT TEST DOCUMENT NAVIGATION OR STRUCTURE:
Never generate questions whose answer is primarily:
- a chapter number, section number, section title, or page number
- a table-of-contents entry, heading, or subsection name
- "where is X discussed?", "which section covers X?", "what is the topic of section X?", "on which page is X?", "in chapter X, what is the topic of section Y?", "according to the table of contents..."
NEVER provide section numbers, chapter numbers, or page references as multiple-choice options (e.g. "Section 4.2", "Section 4.3"). All distractors must be plausible subject-matter concepts or academic misconceptions.

Rules:
1. All questions MUST be strictly supported by the academic subject knowledge taught in <retrieved_evidence>.
2. Every question must cite valid chunk id(s) from <retrieved_evidence> that contain the explanatory evidence.
3. For Multiple Choice Questions (MCQ):
   - Provide exactly 4 options representing conceptual answers, definitions, calculations, or mechanisms.
   - The correct_answer MUST be the exact verbatim text of one of the 4 options.
   - All distractors (incorrect options) must be plausible academic misconceptions, not document section titles or numbers.
   - Provide a clear explanation detailing why the correct answer is right and why the distractors are wrong based on subject concepts.
4. For Open-Ended Questions:
   - Provide a clear, comprehensive expected_answer explaining the academic concept.
   - Provide a rubric detailing the specific conceptual criteria and key points needed to earn full credit.
   - Provide an explanation linking the concept to the underlying theory/evidence.
5. Question Variety:
   - Provide a balanced mixture of question types: conceptual understanding, practical application, calculation/problem-solving, comparison/distinction, and scenario reasoning.
   - Assign appropriate difficulty levels ('easy', 'medium', 'hard') matching cognitive depth.
6. Do NOT invent concepts, facts, or citations outside <retrieved_evidence>.
7. Anti-Repetition:
   - You MUST NOT repeat, duplicate, or trivially rephrase any question listed in <recent_questions_to_avoid>.
   - Formulate fresh questions exploring different angles, applications, definitions, trade-offs, and edge cases.
   - Vary question wording, options, scenarios, and difficulty levels across quiz sessions.
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
            f'<chunk id="{chunk_id}" filename="{filename}" page="{page_num}">\n{content}\n</chunk>'
        )
    sections.append("</retrieved_evidence>\n")
    sections.append(
        "Extract 2 to 6 substantive academic concepts taught in these material chunks. "
        "Focus exclusively on core educational subject matter (ignore book features, preface, difficulty levels, or study tips). "
        "For each concept, provide a clear normalized topic name, a concise summary description, and the chunk IDs that support it."
    )
    return "\n".join(sections)


def build_quiz_generation_prompt(
    target_concepts: list[dict],
    evidence_chunks: list[dict],
    target_difficulties: list[str],
    mcq_count: int,
    open_ended_count: int,
    recent_questions: list[str] | None = None,
) -> str:
    """Build structured prompt for generating grounded quiz questions with anti-repetition guidance."""
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
            f'<chunk id="{chunk_id}" filename="{filename}" page="{page_num}">\n{content}\n</chunk>'
        )
    sections.append("</retrieved_evidence>\n")

    sections.append("<target_concepts>")
    for c in target_concepts:
        sections.append(f"- {c.get('name')}: {c.get('description', '')}")
    sections.append("</target_concepts>\n")

    if recent_questions:
        sections.append("<recent_questions_to_avoid>")
        sections.append(
            "The learner has already answered the following questions recently in this project. "
            "DO NOT duplicate, repeat, or trivially rephrase any of these questions. Create completely fresh questions:"
        )
        for q_text in recent_questions[:20]:
            cleaned_q = q_text.strip()
            if cleaned_q:
                sections.append(f"- {cleaned_q}")
        sections.append("</recent_questions_to_avoid>\n")

    sections.append("<generation_requirements>")
    sections.append(f"- Total MCQ questions: {mcq_count}")
    sections.append(f"- Total Open-Ended questions: {open_ended_count}")
    sections.append(f"- Target difficulties to cover: {', '.join(target_difficulties)}")
    sections.append(
        "- Each question MUST map to one of the target concepts and cite valid chunk IDs from <retrieved_evidence>."
    )
    sections.append(
        "- CRITICAL MANDATE: Every question must test subject knowledge (definitions, concepts, mechanisms, calculations, applications, comparisons, problem solving). "
        "STRICTLY FORBIDDEN: Do NOT ask about chapter numbers, section numbers, section titles, page numbers, or table-of-contents listings. "
        "Never use section numbers as options."
    )
    if recent_questions:
        sections.append(
            "- CRITICAL: Ensure all generated questions test different angles or sub-topics than those in <recent_questions_to_avoid>."
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
