from __future__ import annotations

import hashlib
import json
from pathlib import Path

DATASET = Path(__file__).resolve().parent.parent / "dataset.jsonl"


def load(path: Path = DATASET) -> list[dict]:
    rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    ids = [r["id"] for r in rows]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate question ids in dataset")
    for r in rows:
        if r["answerable"] and not r["expected"]:
            raise ValueError(f"{r['id']}: answerable question without expected sources")
        if not r["answerable"] and r["expected"]:
            raise ValueError(f"{r['id']}: unanswerable question with expected sources")
    return rows


def fingerprint(path: Path = DATASET) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:12]
