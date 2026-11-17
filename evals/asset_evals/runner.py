"""Run the dataset against the API and compute per-question + aggregate metrics."""

from __future__ import annotations

import time
from dataclasses import asdict, dataclass
from datetime import UTC, datetime

from . import metrics


@dataclass
class Params:
    config: str
    mode: str = "hybrid"
    rerank: bool = False
    backend: str = "pgvector"
    k: int = 5
    answers: bool = False


def _slim(result: dict, rank: int, expected: list[dict]) -> dict:
    keep = (
        "externalRef",
        "title",
        "pageStart",
        "pageEnd",
        "vectorRank",
        "keywordRank",
        "vectorScore",
        "keywordScore",
        "rrfScore",
        "rerankScore",
    )
    out = {"rank": rank, "chunkId": result.get("id"), **{k: result.get(k) for k in keep}}
    out["relevant"] = metrics.is_relevant(result, expected) if expected else False
    return out


def evaluate_question(q: dict, client, judge, params: Params) -> dict:
    expected = q["expected"]
    search_k = max(params.k, 5)
    started = time.monotonic()
    search = client.search(
        q["question"], k=search_k, mode=params.mode, rerank=params.rerank, backend=params.backend
    )
    latency = search.get("latencyMs") or (time.monotonic() - started) * 1000
    results = search.get("results", [])
    row: dict = {
        "id": q["id"],
        "question": q["question"],
        "answerable": q["answerable"],
        "expected": expected,
        "latency_ms": latency,
        "retrieved": [_slim(r, i, expected) for i, r in enumerate(results[:search_k], start=1)],
    }
    if q["answerable"]:
        row["hit_at_5"] = metrics.hit_at_k(results, expected, 5)
        row["doc_hit_at_5"] = metrics.hit_at_k(results, expected, 5, page_level=False)
        row["rr"] = metrics.reciprocal_rank(results, expected, params.k)
        row["first_relevant_rank"] = metrics.first_relevant_rank(results, expected, search_k)

    if params.answers:
        ans = client.answer(
            q["question"], k=params.k, mode=params.mode, rerank=params.rerank, backend=params.backend
        )
        verdict = judge.evaluate(
            q["question"], q["answerable"], ans.get("sources", []), ans.get("answer", "")
        )
        row["answer"] = {
            "text": ans.get("answer", ""),
            "refused_flag": ans.get("refused"),
            "sources": [
                {k: s.get(k) for k in ("n", "externalRef", "pageStart", "pageEnd")}
                for s in ans.get("sources", [])
            ],
            "usage": ans.get("usage", {}),
            "latency_ms": ans.get("latencyMs"),
            "judge": {
                **verdict.verdict.model_dump(),
                "refusal_correct": verdict.refusal_correct,
                "cost_usd": verdict.cost_usd,
            },
        }
    return row


def aggregate(rows: list[dict], params: Params) -> dict:
    answerable = [r for r in rows if r["answerable"]]
    retrieval = {
        "hit_at_5": metrics.mean(float(r["hit_at_5"]) for r in answerable),
        "doc_hit_at_5": metrics.mean(float(r["doc_hit_at_5"]) for r in answerable),
        "mrr": metrics.mean(r["rr"] for r in answerable),
    }
    answer = None
    cost = 0.0
    if params.answers:
        judged = [r["answer"] for r in rows if "answer" in r]
        answer = {
            "faithfulness": metrics.mean(a["judge"]["faithfulness"] for a in judged),
            "citation_correctness": metrics.mean(a["judge"]["citation_correctness"] for a in judged),
            "refusal_accuracy": metrics.mean(float(a["judge"]["refusal_correct"]) for a in judged),
        }
        cost = sum((a["usage"].get("costUsd") or 0.0) + a["judge"]["cost_usd"] for a in judged)
    latencies = [r["latency_ms"] for r in rows]
    return {
        "n_questions": len(rows),
        "n_answerable": len(answerable),
        "retrieval": retrieval,
        "answer": answer,
        "cost_usd": round(cost, 6),
        "latency_ms_p50": metrics.percentile(latencies, 50),
        "latency_ms_p95": metrics.percentile(latencies, 95),
    }


def run(dataset: list[dict], client, judge, params: Params, dataset_fingerprint: str = "", log=print) -> dict:
    rows = []
    for i, q in enumerate(dataset, start=1):
        row = evaluate_question(q, client, judge, params)
        mark = "" if not q["answerable"] else ("hit" if row["hit_at_5"] else "MISS")
        log(f"  [{i:2}/{len(dataset)}] {q['id']} {mark}")
        rows.append(row)
    return {
        "config": params.config,
        "created_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "params": {**asdict(params), "dataset": dataset_fingerprint},
        "aggregates": aggregate(rows, params),
        "questions": rows,
    }
