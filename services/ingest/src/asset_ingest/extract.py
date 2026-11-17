"""Per-page text extraction (PyMuPDF for PDFs; Markdown/text are a single page)."""

import pymupdf

from .errors import ScannedDocumentError, UnsupportedFileError

PDF_TYPES = {"application/pdf"}
TEXT_TYPES = {"text/markdown", "text/x-markdown", "text/plain"}

MIN_TOTAL_CHARS = 200
MIN_AVG_CHARS_PER_PAGE = 20


def extract_pages(data: bytes, mime_type: str) -> list[str]:
    """Return one string per page (index 0 == page 1)."""
    if mime_type in PDF_TYPES or data[:5] == b"%PDF-":
        return _extract_pdf(data)
    if mime_type in TEXT_TYPES:
        return [data.decode("utf-8", errors="replace")]
    raise UnsupportedFileError(mime_type)


def _extract_pdf(data: bytes) -> list[str]:
    try:
        doc = pymupdf.open(stream=data, filetype="pdf")
    except Exception as exc:  # corrupt / not a PDF
        raise UnsupportedFileError("unreadable pdf") from exc
    pages: list[str] = []
    with doc:
        for page in doc:
            # "blocks" keeps PyMuPDF's layout grouping: one block ≈ one paragraph.
            blocks = page.get_text("blocks", sort=True)
            texts = [b[4].strip() for b in blocks if b[6] == 0 and b[4].strip()]
            pages.append("\n\n".join(texts))
    return pages


def assert_has_text(pages: list[str]) -> None:
    """Reject empty / scanned documents (image-only PDFs extract ~no text)."""
    total = sum(len(p.strip()) for p in pages)
    if not pages or total < MIN_TOTAL_CHARS or total / len(pages) < MIN_AVG_CHARS_PER_PAGE:
        raise ScannedDocumentError(f"{total} chars over {len(pages)} pages")
