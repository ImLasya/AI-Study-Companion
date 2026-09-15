"""PDF text extraction and page-aware chunking service using PyMuPDF.

Extracts text page-by-page, preserving 1-indexed page numbers for future citations.
Applies deterministic chunking (~500-800 token character/word approximation)
with reasonable overlap while strictly maintaining page boundaries.
"""

import logging
import re
from dataclasses import dataclass
from pathlib import Path

import fitz  # PyMuPDF

logger = logging.getLogger("ai_study_companion.services.pdf")


@dataclass
class ExtractedChunk:
    content: str
    page_number: int
    chunk_index: int


@dataclass
class ExtractionResult:
    page_count: int
    scanned_pages: list[int]
    chunks: list[ExtractedChunk]


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

        try:
            doc = fitz.open(file_path)
        except Exception as e:
            raise ValueError(f"Corrupt or invalid PDF file: {e}") from e

        page_count = len(doc)
        if page_count == 0:
            doc.close()
            raise ValueError("PDF file contains 0 pages.")

        all_chunks: list[ExtractedChunk] = []
        scanned_pages: list[int] = []
        global_chunk_index = 0

        for page_idx in range(page_count):
            page_number = page_idx + 1  # 1-indexed
            page = doc[page_idx]
            raw_text = page.get_text("text") or ""
            normalized_text = self._normalize_whitespace(raw_text)

            # Detect empty or scanned page (very little or no extractable text)
            if len(normalized_text) < self.MIN_CHUNK_CHARS:
                logger.warning(
                    f"Page {page_number} has very little text ({len(normalized_text)} chars). "
                    "Page may be scanned or image-only."
                )
                scanned_pages.append(page_number)
                if not normalized_text:
                    continue

            # Deterministic chunking within this page boundary
            page_chunks = self._chunk_page_text(normalized_text)
            for chunk_text in page_chunks:
                all_chunks.append(
                    ExtractedChunk(
                        content=chunk_text,
                        page_number=page_number,
                        chunk_index=global_chunk_index,
                    )
                )
                global_chunk_index += 1

        doc.close()
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


pdf_service = PDFProcessingService()
