import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pymupdf as fitz
from langsmith import traceable

logger = logging.getLogger("ai_study_companion.services.pdf")


@dataclass
class ExtractedChunk:
    content: str
    page_number: int
    chunk_index: int
    section_heading: str | None = None
    content_type: str = "paragraph"


@dataclass
class ExtractionResult:
    page_count: int
    scanned_pages: list[int]
    chunks: list[ExtractedChunk]


# ==============================================================================
# LangSmith Safe Traceable Helpers
# ==============================================================================


@traceable(
    name="Read PDF",
    run_type="chain",
    process_inputs=lambda inputs: {
        "file_name": Path(str(inputs.get("file_path", ""))).name,
        "file_type": "application/pdf",
    },
    process_outputs=lambda res: {
        "file_type": "application/pdf",
        "page_count": res.get("page_count", 0),
        "file_size_bytes": res.get("file_size_bytes", 0),
        "status": "success",
    },
)
def _trace_read_pdf(file_path: Path) -> dict[str, Any]:
    file_size = file_path.stat().st_size
    try:
        doc = fitz.open(file_path)
    except Exception as e:
        raise ValueError(f"Corrupt or invalid PDF file: {e}") from e

    page_count = len(doc)
    if page_count == 0:
        doc.close()
        raise ValueError("PDF file contains 0 pages.")

    return {
        "doc": doc,
        "page_count": page_count,
        "file_size_bytes": file_size,
    }


@traceable(
    name="Extract Text",
    run_type="chain",
    process_inputs=lambda inputs: {
        "page_count": inputs.get("page_count", 0),
        "extraction_method": "PyMuPDF / fitz get_text('text')",
    },
    process_outputs=lambda res: {
        "page_count": res.get("page_count", 0),
        "pages_with_text": res.get("pages_with_text", 0),
        "pages_without_text": res.get("pages_without_text", 0),
        "extracted_character_count": res.get("extracted_character_count", 0),
        "extraction_method": "PyMuPDF / fitz get_text('text')",
        "status": "success",
    },
)
def _trace_extract_text(doc: fitz.Document) -> dict[str, Any]:
    pages_raw: list[tuple[int, str]] = []
    page_count = len(doc)
    for page_idx in range(page_count):
        page_num = page_idx + 1
        page = doc[page_idx]
        raw_text = page.get_text("text") or ""
        pages_raw.append((page_num, raw_text))

    pages_with_text = sum(1 for _, text in pages_raw if len(text.strip()) > 0)
    pages_without_text = page_count - pages_with_text
    total_chars = sum(len(text) for _, text in pages_raw)

    return {
        "pages_raw": pages_raw,
        "page_count": page_count,
        "pages_with_text": pages_with_text,
        "pages_without_text": pages_without_text,
        "extracted_character_count": total_chars,
    }


@traceable(
    name="Process Pages",
    run_type="chain",
    process_inputs=lambda inputs: {"total_pages": inputs.get("total_pages", 0)},
    process_outputs=lambda res: res,
)
def _trace_process_pages(
    total_pages: int,
    processed_count: int,
    scanned_count: int,
    total_text_size: int,
) -> dict[str, Any]:
    return {
        "total_pages": total_pages,
        "successfully_processed_pages": processed_count,
        "skipped_pages": scanned_count,
        "failed_pages": 0,
        "total_extracted_text_size": total_text_size,
    }


@traceable(
    name="Clean / Normalize Text",
    run_type="chain",
    process_inputs=lambda inputs: {
        "input_character_count": inputs.get("raw_total_chars", 0),
        "page_count": inputs.get("page_count", 0),
    },
    process_outputs=lambda res: res,
)
def _trace_clean_text(
    raw_total_chars: int,
    norm_total_chars: int,
    page_count: int,
) -> dict[str, Any]:
    diff = raw_total_chars - norm_total_chars
    reduction_pct = round((diff / max(1, raw_total_chars)) * 100, 2)
    return {
        "input_character_count": raw_total_chars,
        "output_character_count": norm_total_chars,
        "page_count": page_count,
        "reduction_pct": reduction_pct,
        "transformation": "whitespace_and_line_break_normalization",
    }


@traceable(
    name="Chunk Document",
    run_type="chain",
    process_inputs=lambda inputs: {
        "target_chunk_size": inputs.get("chunk_size", 2400),
        "overlap": inputs.get("chunk_overlap", 400),
        "chunking_strategy": "page_aware_sentence_paragraph_lookback",
        "page_aware": True,
        "total_pages": inputs.get("page_count", 0),
    },
    process_outputs=lambda res: res,
)
def _trace_chunk_document(
    chunks: list[ExtractedChunk],
    page_count: int,
    chunk_size: int,
    chunk_overlap: int,
) -> dict[str, Any]:
    lengths = [len(c.content) for c in chunks]
    total_chunks = len(chunks)
    avg_chars = round(sum(lengths) / max(1, total_chunks), 1) if lengths else 0
    min_chars = min(lengths) if lengths else 0
    max_chars = max(lengths) if lengths else 0

    preview = []
    if chunks:
        c = chunks[0]
        preview.append({
            "chunk_id": f"chunk-{c.chunk_index}",
            "page": c.page_number,
            "preview": c.content[:100].strip(),
        })

    return {
        "chunking_strategy": "page_aware_sentence_paragraph_lookback",
        "target_chunk_size": chunk_size,
        "overlap": chunk_overlap,
        "page_aware": True,
        "total_pages": page_count,
        "total_chunks": total_chunks,
        "average_chunk_size": avg_chars,
        "min_chunk_size": min_chars,
        "max_chunk_size": max_chars,
        "preview": preview,
    }


# ==============================================================================
# Service Implementation
# ==============================================================================


class PDFProcessingService:
    # Target chunk size: ~500-800 tokens (~2000-3200 characters assuming ~4 chars per token)
    # Overlap: ~100 tokens (~400 characters)
    CHUNK_SIZE_CHARS: int = 2400
    CHUNK_OVERLAP_CHARS: int = 400
    MIN_CHUNK_CHARS: int = 50

    def extract_and_chunk(self, file_path: Path) -> ExtractionResult:
        """Extract text from PDF file and segment into page-aware deterministic chunks."""
        if not file_path.exists():
            raise FileNotFoundError(f"PDF file not found at: {file_path}")

        # 1. Read PDF (Traced Node)
        pdf_meta = _trace_read_pdf(file_path=file_path)
        doc: fitz.Document = pdf_meta["doc"]
        page_count: int = pdf_meta["page_count"]

        # 2. Extract Text (Traced Node)
        extracted = _trace_extract_text(doc)
        pages_raw: list[tuple[int, str]] = extracted["pages_raw"]

        all_chunks: list[ExtractedChunk] = []
        scanned_pages: list[int] = []
        global_chunk_index = 0
        raw_total_chars = 0
        norm_total_chars = 0
        current_section_heading: str | None = None

        # 3. Clean and process pages with table and structural awareness
        for page_idx in range(page_count):
            page_number = page_idx + 1
            page = doc[page_idx]

            # Detect Tables using PyMuPDF find_tables if present
            table_chunks_for_page: list[str] = []
            try:
                if hasattr(page, "find_tables"):
                    tabs = page.find_tables()
                    if tabs and tabs.tables:
                        for tab in tabs.tables:
                            extracted_table = tab.extract()
                            if extracted_table and len(extracted_table) >= 2:
                                header = [str(c or "").strip().replace("\n", " ") for c in extracted_table[0]]
                                if any(header) and len(header) > 1:
                                    header_line = "| " + " | ".join(header) + " |"
                                    sep_line = "| " + " | ".join("---" for _ in header) + " |"
                                    row_lines = [
                                        "| " + " | ".join(str(c or "").strip().replace("\n", " ") for c in row) + " |"
                                        for row in extracted_table[1:]
                                    ]
                                    md_table = "\n".join([header_line, sep_line] + row_lines)
                                    if len(md_table) >= self.MIN_CHUNK_CHARS:
                                        table_chunks_for_page.append(md_table)
            except Exception as tab_err:
                logger.debug(f"Table detection gracefully bypassed on page {page_number}: {tab_err}")

            raw_text = page.get_text("text") or ""
            raw_total_chars += len(raw_text)
            normalized_text = self._normalize_whitespace(raw_text)
            norm_total_chars += len(normalized_text)

            detected_heading = self._detect_section_heading(normalized_text)
            if detected_heading:
                current_section_heading = detected_heading

            # Detect empty or scanned page (unless tables were found)
            if len(normalized_text) < self.MIN_CHUNK_CHARS and not table_chunks_for_page:
                logger.warning(
                    f"Page {page_number} has very little text ({len(normalized_text)} chars). "
                    "Page may be scanned or image-only."
                )
                scanned_pages.append(page_number)
                if not normalized_text:
                    continue

            # Add detected tables as first-class chunks with content_type="table"
            for tbl_text in table_chunks_for_page:
                all_chunks.append(
                    ExtractedChunk(
                        content=tbl_text,
                        page_number=page_number,
                        chunk_index=global_chunk_index,
                        section_heading=current_section_heading,
                        content_type="table",
                    )
                )
                global_chunk_index += 1

            # Deterministic chunking within this page boundary
            page_chunks = self._chunk_page_text(normalized_text)
            for chunk_text in page_chunks:
                chunk_type = self._classify_content_type(chunk_text)
                all_chunks.append(
                    ExtractedChunk(
                        content=chunk_text,
                        page_number=page_number,
                        chunk_index=global_chunk_index,
                        section_heading=current_section_heading,
                        content_type=chunk_type,
                    )
                )
                global_chunk_index += 1

        doc.close()

        # 4. Process Pages (Traced Node)
        _ = _trace_process_pages(
            total_pages=page_count,
            processed_count=page_count - len(scanned_pages),
            scanned_count=len(scanned_pages),
            total_text_size=norm_total_chars,
        )

        # 5. Clean / Normalize Text (Traced Node)
        _ = _trace_clean_text(
            raw_total_chars=raw_total_chars,
            norm_total_chars=norm_total_chars,
            page_count=page_count,
        )

        # 6. Chunk Document (Traced Node)
        _ = _trace_chunk_document(
            chunks=all_chunks,
            page_count=page_count,
            chunk_size=self.CHUNK_SIZE_CHARS,
            chunk_overlap=self.CHUNK_OVERLAP_CHARS,
        )

        return ExtractionResult(
            page_count=page_count,
            scanned_pages=scanned_pages,
            chunks=all_chunks,
        )

    def _normalize_whitespace(self, text: str) -> str:
        """Normalize line breaks and remove redundant spaces while preserving sentence separation."""
        # Replace non-breaking spaces
        text = text.replace("\xa0", " ")
        # Replace multiple newlines with single paragraph break
        text = re.sub(r"\r\n|\r", "\n", text)
        text = re.sub(r"\n{2,}", "\n\n", text)
        # Normalize excessive horizontal whitespace
        text = re.sub(r"[ \t]+", " ", text)
        return text.strip()

    def _chunk_page_text(self, text: str) -> list[str]:
        """Deterministically split text into chunks respecting sentence/paragraph boundaries where possible."""
        if len(text) <= self.CHUNK_SIZE_CHARS:
            return [text]

        chunks: list[str] = []
        start = 0
        total_len = len(text)

        while start < total_len:
            end = start + self.CHUNK_SIZE_CHARS

            if end >= total_len:
                chunk = text[start:].strip()
                if len(chunk) >= self.MIN_CHUNK_CHARS or not chunks:
                    chunks.append(chunk)
                break

            # Attempt to split at a natural boundary (paragraph or sentence) within the lookback window
            lookback_limit = max(start + self.CHUNK_OVERLAP_CHARS, end - 300)
            split_pos = -1

            # 1. Look for paragraph break
            p_break = text.rfind("\n\n", lookback_limit, end)
            if p_break != -1:
                split_pos = p_break + 2
            else:
                # 2. Look for sentence boundary (period/question/exclamation followed by space)
                m = re.search(r"[.!?]\s", text[lookback_limit:end])
                if m:
                    split_pos = lookback_limit + m.end()

            # Fallback: split at nearest whitespace
            if split_pos == -1:
                sp_break = text.rfind(" ", lookback_limit, end)
                if sp_break != -1:
                    split_pos = sp_break + 1
                else:
                    split_pos = end

            chunk = text[start:split_pos].strip()
            if chunk:
                chunks.append(chunk)

            # Advance start with overlap
            start = max(start + 1, split_pos - self.CHUNK_OVERLAP_CHARS)

        return chunks

    def _detect_section_heading(self, text: str) -> str | None:
        """Heuristic to detect section headings (e.g. Chapter 1, Section 2, # Heading, ALL CAPS title)."""
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        for line in lines[:3]:
            if line.startswith("#"):
                return line.lstrip("#").strip()
            if re.match(r"^(?:section|chapter|\d+(\.\d+)*)\s+[\w\s]{3,60}$", line, re.IGNORECASE):
                return line
            if len(line) <= 60 and line.isupper() and not line.endswith("."):
                return line
        return None

    def _classify_content_type(self, text: str) -> str:
        """Classify chunk content into paragraph, heading, list, or code_block."""
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        if not lines:
            return "paragraph"
        if len(lines) == 1 and (lines[0].startswith("#") or (len(lines[0]) <= 80 and not lines[0].endswith("."))):
            return "heading"
        if "```" in text or re.search(r"^\s*(def |class |import |for |while |const |let |function )", text, re.MULTILINE):
            return "code_block"
        list_lines = sum(1 for line in lines if re.match(r"^[-*•]\s+|\d+[\.\)]\s+", line))
        if list_lines >= 2 and (list_lines / len(lines)) >= 0.4:
            return "list"
        return "paragraph"


pdf_service = PDFProcessingService()

