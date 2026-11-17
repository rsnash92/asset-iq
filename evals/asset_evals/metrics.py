"""Retrieval metrics. Pure functions over plain dicts so they are trivially testable.

A retrieved chunk is *relevant* to a question when it comes from an expected
document (matched on ``externalRef`` = manifest slug) AND its page range
``[pageStart, pageEnd]`` intersects that document's expected pages. Doc-level
variants ignore pages.
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Sequence


def _ranges_intersect(start: int, end: int, pages: Iterable[int]) -> bool:
    return any(start <= p <= end for p in pages)


def is_relevant(result: dict, expected: Sequence[dict], page_level: bool = True) -> bool:
    ref = result.get("externalRef")
    for exp in expected:
        if ref != exp["external_ref"]:
            continue
        if not page_level:
            return True
        if _ranges_intersect(int(result["pageStart"]), int(result["pageEnd"]), exp["pages"]):
            return True
    return False


def first_relevant_rank(
    results: Sequence[dict], expected: Sequence[dict], k: int, page_level: bool = True
) -> int | None:
    for rank, result in enumerate(results[:k], start=1):
        if is_relevant(result, expected, page_level):
            return rank
    return None


def hit_at_k(results: Sequence[dict], expected: Sequence[dict], k: int, page_level: bool = True) -> bool:
    return first_relevant_rank(results, expected, k, page_level) is not None


def reciprocal_rank(results: Sequence[dict], expected: Sequence[dict], k: int) -> float:
    rank = first_relevant_rank(results, expected, k)
    return 1.0 / rank if rank else 0.0


def mean(values: Iterable[float]) -> float | None:
    vals = [float(v) for v in values if v is not None]
    return sum(vals) / len(vals) if vals else None


def percentile(values: Iterable[float], q: float) -> float | None:
    """Linear-interpolated percentile (q in 0..100), same as numpy's default."""
    vals = sorted(float(v) for v in values if v is not None)
    if not vals:
        return None
    if len(vals) == 1:
        return vals[0]
    pos = (len(vals) - 1) * q / 100
    lo, hi = math.floor(pos), math.ceil(pos)
    return vals[lo] + (vals[hi] - vals[lo]) * (pos - lo)
