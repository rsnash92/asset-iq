"""Collapse result files into results/latest.json (read by the web /evals page) and SUMMARY.md."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

RESULTS = Path(__file__).resolve().parent.parent / "results"
RESERVED = {"latest.json"}


def load_runs(results_dir: Path = RESULTS) -> list[dict]:
    runs = []
    for path in sorted(results_dir.glob("*.json")):
        if path.name in RESERVED:
            continue
        data = json.loads(path.read_text())
        data["_file"] = path.name
        runs.append(data)
    return runs


def latest_per_config(runs: list[dict]) -> list[dict]:
    best: dict[str, dict] = {}
    for run in runs:
        cfg = run["config"]
        if cfg not in best or run["created_at"] > best[cfg]["created_at"]:
            best[cfg] = run
    order = {"vector": 0, "keyword": 1, "hybrid": 2}
    return sorted(
        best.values(),
        key=lambda r: (
            r["params"]["backend"] != "pgvector",
            order.get(r["params"]["mode"], 9),
            r["params"]["rerank"],
            r["config"],
        ),
    )


def to_latest_entry(run: dict) -> dict:
    p, a = run["params"], run["aggregates"]
    return {
        "config": run["config"],
        "backend": p["backend"],
        "mode": p["mode"],
        "rerank": p["rerank"],
        "k": p["k"],
        "n_questions": a["n_questions"],
        "retrieval": a["retrieval"],
        "answer": a["answer"],
        "cost_usd": a["cost_usd"],
        "latency_ms_p50": a["latency_ms_p50"],
        "latency_ms_p95": a["latency_ms_p95"],
        "run_file": run["_file"],
    }


def _fmt(x, pct: bool = False) -> str:
    if x is None:
        return "—"
    return f"{x * 100:.1f}%" if pct else f"{x:.3f}"


def render_markdown(entries: list[dict], generated_at: str) -> str:
    lines = [
        "# Eval summary",
        "",
        f"_Generated {generated_at} from the latest run of each config. "
        "Retrieval metrics are over answerable questions; answer metrics are LLM-as-judge._",
        "",
        "| Config | Backend | Mode | Rerank | Hit@5 (page) | Hit@5 (doc) | MRR | Faithfulness "
        "| Citation correctness | Refusal accuracy | p50 ms | p95 ms | Cost (USD) |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for e in entries:
        r, a = e["retrieval"], e["answer"] or {}
        lines.append(
            f"| {e['config']} | {e['backend']} | {e['mode']} | {'yes' if e['rerank'] else 'no'} "
            f"| {_fmt(r['hit_at_5'], True)} | {_fmt(r['doc_hit_at_5'], True)} | {_fmt(r['mrr'])} "
            f"| {_fmt(a.get('faithfulness'))} | {_fmt(a.get('citation_correctness'))} "
            f"| {_fmt(a.get('refusal_accuracy'), True)} "
            f"| {e['latency_ms_p50']:.0f} | {e['latency_ms_p95']:.0f} | {e['cost_usd']:.4f} |"
            if e["latency_ms_p50"] is not None
            else f"| {e['config']} | {e['backend']} | {e['mode']} | — | — | — | — | — | — | — | — | — | — |"
        )
    lines.append("")
    return "\n".join(lines)


def regenerate(results_dir: Path = RESULTS, now: datetime | None = None) -> dict:
    generated_at = (now or datetime.now(UTC)).isoformat(timespec="seconds")
    entries = [to_latest_entry(r) for r in latest_per_config(load_runs(results_dir))]
    latest = {"generated_at": generated_at, "runs": entries}
    (results_dir / "latest.json").write_text(json.dumps(latest, indent=2) + "\n")
    (results_dir / "SUMMARY.md").write_text(render_markdown(entries, generated_at))
    return latest


if __name__ == "__main__":
    out = regenerate()
    print(f"latest.json: {len(out['runs'])} configs")
