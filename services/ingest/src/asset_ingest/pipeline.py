"""extract -> chunk -> embed -> replace chunks. One document at a time."""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass

from .chunker import chunk_pages
from .embeddings import Embedder, to_pgvector
from .errors import IngestError
from .extract import assert_has_text, extract_pages
from .supabase import SupabaseClient

log = logging.getLogger(__name__)


@dataclass
class IngestStats:
    document_id: str
    status: str
    pages: int = 0
    chunks: int = 0
    embedding_tokens: int = 0
    seconds: float = 0.0
    error: str | None = None


def embedding_text(title: str, content: str) -> str:
    """Title-prefixing: gives each chunk document-level context in vector space."""
    return f"{title}\n\n{content}"


async def process_document(
    doc: dict,
    db: SupabaseClient,
    embedder: Embedder,
    max_tokens: int = 500,
    overlap_tokens: int = 75,
) -> IngestStats:
    """Process a document that has already been claimed (status = processing)."""
    started = time.monotonic()
    doc_id = doc["id"]
    pages: list[str] = []
    try:
        data = await db.download(doc["storage_path"])
        # CPU-bound work off the event loop.
        pages = await asyncio.to_thread(extract_pages, data, doc.get("mime_type") or "application/pdf")
        assert_has_text(pages)
        chunks = await asyncio.to_thread(chunk_pages, pages, max_tokens, overlap_tokens)
        result = await embedder.embed([embedding_text(doc["title"], c.content) for c in chunks])
        payload = [
            {
                "chunk_index": c.chunk_index,
                "page_start": c.page_start,
                "page_end": c.page_end,
                "content": c.content,
                "token_count": c.token_count,
                "embedding": to_pgvector(v),
            }
            for c, v in zip(chunks, result.vectors, strict=True)
        ]
        await db.replace_chunks(doc_id, len(pages), payload)
        stats = IngestStats(
            doc_id, "ready", len(pages), len(chunks), result.total_tokens, time.monotonic() - started
        )
        log.info(
            "ingested %s: %d pages, %d chunks, %d tokens",
            doc_id,
            stats.pages,
            stats.chunks,
            stats.embedding_tokens,
        )
        return stats
    except Exception as exc:
        message = exc.user_message if isinstance(exc, IngestError) else IngestError.user_message
        log.exception("ingest failed for %s", doc_id)
        try:
            await db.mark_failed(doc_id, message, len(pages) or None)
        except Exception:
            log.exception("could not mark %s as failed", doc_id)
        return IngestStats(doc_id, "failed", len(pages), 0, 0, time.monotonic() - started, message)
