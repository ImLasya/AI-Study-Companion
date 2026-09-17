"""Academic Concept Validation and Filtering.

Ensures that concepts used in quizzes, mastery, growth, and recommendations represent
substantive academic learning topics rather than document-structural meta-concepts
(e.g., SmartBook, Question Difficulty Levels, Preparation Strategies).
"""

FORBIDDEN_META_KEYWORDS = [
    "smartbook",
    "smart book",
    "smart question bank",
    "question difficulty",
    "difficulty level",
    "difficulty levels",
    "preparation strateg",
    "exam preparation",
    "preparation tip",
    "study strateg",
    "smart answer",
    "time to answer",
    "document structure",
    "table of content",
    "chapter index",
    "introduction section",
    "free video lesson",
    "pdf chapter",
    "level 1",
    "level 2",
    "level 3",
    "level i",
    "level ii",
    "level iii",
    "practice bank",
    "answer key",
]


def normalize_concept_name(name: str) -> str:
    """Normalize a concept name: lowercase, collapse whitespace, strip punctuation extremes."""
    if not name:
        return ""
    cleaned = " ".join(name.strip().split())
    return cleaned.lower()


def is_valid_academic_concept(name: str, description: str = "") -> bool:
    """Determine whether a concept is a genuine academic topic a student can study, practice, and master.

    Returns False for document structure, front-matter, and meta-concepts.
    """
    if not name or not name.strip():
        return False

    norm = normalize_concept_name(name)

    # Minimum length for a meaningful concept
    if len(norm) < 3:
        return False

    # Check for forbidden keywords in name
    for kw in FORBIDDEN_META_KEYWORDS:
        if kw in norm:
            return False

    # Check for generic single words that are not academic topics
    if norm in {"introduction", "overview", "index", "preface", "appendix", "summary", "notes"}:
        return False

    # Check description if provided
    if description:
        norm_desc = description.lower()
        if "testbook's online platform" in norm_desc or "next-generation practice resource" in norm_desc:
            return False

    return True
