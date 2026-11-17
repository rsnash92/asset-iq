"""Token-aware, boundary-respecting chunker with page tracking.

Algorithm
---------
1. Each page is normalised into paragraphs; each paragraph is split into sentences.
   Every sentence becomes a *unit* that remembers its page and whether it starts a
   new paragraph.
2. A unit longer than ``max_tokens`` (rare: tables, run-on lists) is hard-split
   by tokens — the only place a boundary can fall mid-sentence.
3. Units are packed greedily into chunks of at most ``max_tokens``.
4. When a chunk is emitted, the next chunk starts with the trailing *whole
   sentences* of the previous chunk totalling at most ``overlap_tokens``, so
   context carries across boundaries without cutting a sentence in half.
5. ``page_start``/``page_end`` are the min/max pages of the units in the chunk,
   so a chunk spanning a page break cites both pages.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache

import tiktoken

from .text import normalise_page

# Sentence boundary: terminal punctuation (optionally followed by closing quotes or
# brackets) + whitespace + something that looks like a sentence start. Bullets
# ("•", "▪", "–") also start a new unit because PDF lists are flattened into one line.
_SENTENCE_SPLIT = re.compile(
    r"(?:(?<=[.!?])|(?<=[.!?][\"'’”)\]]))\s+(?=[A-Z0-9\"'‘“(\[])"
    r"|\s+(?=[•▪●–] )"
)


@lru_cache(maxsize=1)
def _encoding() -> tiktoken.Encoding:
    return tiktoken.get_encoding("cl100k_base")


def count_tokens(text: str) -> int:
    return len(_encoding().encode(text, disallowed_special=()))


@dataclass(frozen=True)
class Unit:
    text: str
    page: int
    tokens: int
    starts_paragraph: bool


@dataclass(frozen=True)
class Chunk:
    chunk_index: int
    page_start: int
    page_end: int
    content: str
    token_count: int


def split_sentences(paragraph: str) -> list[str]:
    return [s.strip() for s in _SENTENCE_SPLIT.split(paragraph) if s and s.strip()]


def _hard_split(text: str, max_tokens: int) -> list[str]:
    enc = _encoding()
    ids = enc.encode(text, disallowed_special=())
    return [enc.decode(ids[i : i + max_tokens]).strip() for i in range(0, len(ids), max_tokens)]


def build_units(pages: list[str], max_tokens: int) -> list[Unit]:
    """Turn raw page texts (index 0 == page 1) into sentence units."""
    units: list[Unit] = []
    for page_no, page_text in enumerate(pages, start=1):
        for paragraph in normalise_page(page_text):
            first = True
            for sentence in split_sentences(paragraph):
                tokens = count_tokens(sentence)
                pieces = [sentence] if tokens <= max_tokens else _hard_split(sentence, max_tokens)
                for piece in pieces:
                    if not piece:
                        continue
                    units.append(Unit(piece, page_no, count_tokens(piece), first))
                    first = False
    return units


def _join(units: list[Unit]) -> str:
    out: list[str] = []
    for i, u in enumerate(units):
        if i > 0:
            out.append("\n\n" if u.starts_paragraph else " ")
        out.append(u.text)
    return "".join(out)


def _sep_cost(unit: Unit, is_first: bool) -> int:
    # "\n\n" is its own token; a joining space merges into the next word's token.
    return 0 if is_first else (1 if unit.starts_paragraph else 0)


def _cost(units: list[Unit]) -> int:
    return sum(u.tokens + _sep_cost(u, i == 0) for i, u in enumerate(units))


def _overlap_tail(units: list[Unit], overlap_tokens: int) -> list[Unit]:
    tail: list[Unit] = []
    total = 0
    for u in reversed(units):
        if total + u.tokens > overlap_tokens:
            break
        tail.insert(0, u)
        total += u.tokens
    # Never carry the whole previous chunk forward (would loop forever on tiny chunks).
    return tail if len(tail) < len(units) else tail[1:]


def chunk_pages(
    pages: list[str],
    max_tokens: int = 500,
    overlap_tokens: int = 75,
) -> list[Chunk]:
    if overlap_tokens >= max_tokens:
        raise ValueError("overlap_tokens must be smaller than max_tokens")

    units = build_units(pages, max_tokens)
    chunks: list[Chunk] = []
    current: list[Unit] = []
    current_tokens = 0
    fresh_since_emit = 0  # units added since the last emit (excludes overlap carry-over)

    def emit() -> None:
        nonlocal current, current_tokens, fresh_since_emit
        content = _join(current)
        chunks.append(
            Chunk(
                chunk_index=len(chunks),
                page_start=min(u.page for u in current),
                page_end=max(u.page for u in current),
                content=content,
                token_count=count_tokens(content),
            )
        )
        current = _overlap_tail(current, overlap_tokens)
        current_tokens = _cost(current)
        fresh_since_emit = 0

    for unit in units:
        cost = unit.tokens + _sep_cost(unit, not current)
        if current and current_tokens + cost > max_tokens:
            if fresh_since_emit > 0:
                emit()
            else:
                # Only overlap carry-over in the buffer and it doesn't fit: drop it.
                current, current_tokens = [], 0
            # Recompute against the (possibly overlap-seeded) buffer.
            while current and current_tokens + unit.tokens + _sep_cost(unit, False) > max_tokens:
                current.pop(0)
                current_tokens = _cost(current)
            cost = unit.tokens + _sep_cost(unit, not current)
        current.append(unit)
        current_tokens += cost
        fresh_since_emit += 1

    if current and fresh_since_emit > 0:
        emit()
    return chunks
