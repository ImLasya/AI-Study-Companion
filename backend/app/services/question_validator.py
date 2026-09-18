"""Question Quality and Evidence Validation for Educational Quizzes.

Enforces:
1. Strict academic subject-matter testing (understanding, definitions, mechanisms, calculations, applications).
2. Deterministic rejection of document navigation, TOC, section/chapter numbers, and page references.
3. Accurate detection and filtering of Table of Contents and document metadata chunks.
"""

import re
from collections.abc import Sequence

# Regex patterns that indicate document-navigation / document-structure questions
BANNED_QUESTION_PATTERNS = [
    r"\bwhich\s+section\b",
    r"\bwhich\s+chapter\b",
    r"\bwhat\s+section\b",
    r"\bwhat\s+chapter\b",
    r"\bwhat\s+page\b",
    r"\bwhich\s+page\b",
    r"\bon\s+what\s+page\b",
    r"\bon\s+which\s+page\b",
    r"\bwhere\s+is\b",
    r"\bwhere\s+in\s+the\s+(?:book|text|document|pdf|chapter|material)\b",
    r"\baccording\s+to\s+the\s+table\s+of\s+contents\b",
    r"\bas\s+listed\s+in\s+the\s+table\s+of\s+contents\b",
    r"\btable\s+of\s+contents\b",
    r"\btopic\s+of\s+section\b",
    r"\btitle\s+of\s+section\b",
    r"\bname\s+of\s+section\b",
    r"\bdiscussed\s+in\s+which\s+section\b",
    r"\bcovered\s+in\s+which\s+section\b",
    r"\bmentioned\s+in\s+which\s+section\b",
    r"\bwhich\s+part\s+of\s+the\s+book\b",
    r"\bin\s+chapter\s+\d+.*topic\s+of\s+section\b",
    r"\bsection\s+\d+(\.\d+)*\s+(?:covers|discusses|introduces|presents|is\s+titled)\b",
    r"\bwhat\s+is\s+covered\s+in\s+section\b",
    r"\bwhat\s+is\s+discussed\s+in\s+section\b",
    r"\bwhich\s+section\s+covers\b",
    r"\bwhich\s+chapter\s+discusses\b",
    r"\bwhich\s+chapter\s+covers\b",
]

# Compiled regex for fast matching
_BANNED_QUESTION_REGEX = re.compile(
    "|".join(f"(?:{p})" for p in BANNED_QUESTION_PATTERNS),
    re.IGNORECASE,
)

# Regex pattern matching options that are section/chapter/page labels rather than concepts
_BANNED_OPTION_REGEX = re.compile(
    r"^(?:section|chapter|page|part)\s+\d+(\.\d+)*$",
    re.IGNORECASE,
)


def is_toc_or_metadata_chunk(text: str) -> bool:
    """Determine whether a text chunk consists primarily of Table of Contents or document metadata.

    Returns True if the chunk should NOT be used as evidence for academic question generation.
    """
    if not text or not text.strip():
        return True

    cleaned_text = text.strip()

    # 1. Dot leader patterns with trailing numbers (universal TOC indicator, e.g. '. . . . . 56' or '...... 122')
    if re.search(r"(?:\.\s*){3,}\d+", cleaned_text) or re.search(r"(\. ?){4,}", cleaned_text):
        return True

    # 2. Check heading lines for explicit TOC markers
    lines = [line.strip() for line in cleaned_text.splitlines() if line.strip()]
    if not lines:
        return True

    first_few_lines = [line_text.lower() for line_text in lines[:5]]
    for marker in ("contents", "table of contents", "brief contents", "index", "bibliography", "list of figures", "list of tables"):
        if any(marker == line_text or line_text.startswith(f"{marker}\n") or line_text.startswith(f"{marker} ") for line_text in first_few_lines):
            return True

    # 3. Ratio of section-listing lines (e.g., '1.1 Introduction ... 8', '3.4 Marginal Probability')
    toc_indicator_lines = 0
    for line in lines:
        # Match lines like "3.4 Marginal Probability" or "Chapter 3 Probability ... 56"
        if re.match(r"^(?:chapter\s+\d+|\d+(\.\d+)*\s+[A-Za-z\s\-:,\?]+(?:\s+\d+)?)$", line, re.IGNORECASE):
            toc_indicator_lines += 1
        elif re.match(r"^(?:section\s+\d+|part\s+[ivxlc\d]+)\b", line, re.IGNORECASE):
            toc_indicator_lines += 1

    if len(lines) >= 3 and (toc_indicator_lines / len(lines)) >= 0.35:
        return True

    # 4. Short front matter / metadata checks (e.g. copyright page, book title alone)
    words = cleaned_text.split()
    if len(words) < 25 and any(
        kw in cleaned_text.lower()
        for kw in ("contents", "isbn", "all rights reserved", "printed in", "published by", "author", "website")
    ):
        return True

    return False


def validate_quiz_question_quality(
    question_text: str,
    options: Sequence[str] | None = None,
    concept_name: str | None = None,
) -> tuple[bool, str]:
    """Validate that a generated or cached quiz question tests substantive academic subject knowledge.

    Rejects:
    1. Questions asking about document structure (chapter/section numbers, titles, page numbers, TOC).
    2. Questions with options that are section numbers (e.g. 'Section 4.2', 'Chapter 3').
    3. Empty, excessively short, or malformed questions.

    Returns:
        (is_valid: bool, reason: str)
    """
    if not question_text or not question_text.strip():
        return False, "Question text is empty."

    cleaned_q = question_text.strip()

    # Minimum length for a meaningful academic question
    if len(cleaned_q) < 15:
        return False, f"Question text is too short ({len(cleaned_q)} chars)."

    # 1. Check for banned document navigation patterns in question text
    match = _BANNED_QUESTION_REGEX.search(cleaned_q)
    if match:
        matched_phrase = match.group(0)
        return False, f"Question tests document navigation/metadata (matched: '{matched_phrase}')."

    # 2. Check options for section/chapter numbers
    if options:
        section_option_count = 0
        for opt in options:
            cleaned_opt = opt.strip()
            if _BANNED_OPTION_REGEX.match(cleaned_opt):
                section_option_count += 1

        if section_option_count >= 2:
            return False, f"Options contain document section/chapter numbers ({section_option_count} options matched)."

        # Also check if any option is verbatim a section navigation pattern
        for opt in options:
            if re.match(r"^section\s+\d+(\.\d+)*$", opt.strip(), re.IGNORECASE):
                return False, f"Option '{opt}' is a document section reference."

    # 3. Optional concept relevancy sanity check
    if concept_name and len(concept_name.strip()) >= 4:
        pass  # Reserved for semantic relevance checks if needed

    return True, "valid"
