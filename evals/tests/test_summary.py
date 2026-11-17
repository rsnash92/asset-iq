import json
from datetime import UTC, datetime

from asset_evals import summary


def write_run(
    d, name, config, created, mode="hybrid", rerank=False, backend="pgvector", hit=0.8, answer=None
):
    run = {
        "config": config,
        "created_at": created,
        "params": {"config": config, "mode": mode, "rerank": rerank, "backend": backend, "k": 5},
        "aggregates": {
            "n_questions": 35,
            "retrieval": {"hit_at_5": hit, "doc_hit_at_5": hit + 0.1, "mrr": hit - 0.2},
            "answer": answer,
            "cost_usd": 0.01,
            "latency_ms_p50": 120.0,
            "latency_ms_p95": 300.0,
        },
        "questions": [],
    }
    (d / name).write_text(json.dumps(run))


def test_latest_per_config_and_outputs(tmp_path):
    write_run(
        tmp_path, "2026-11-01-pgvector-hybrid.json", "pgvector-hybrid", "2026-11-01T10:00:00+00:00", hit=0.5
    )
    write_run(
        tmp_path, "2026-11-02-pgvector-hybrid.json", "pgvector-hybrid", "2026-11-02T10:00:00+00:00", hit=0.9
    )
    write_run(
        tmp_path,
        "2026-11-02-pgvector-vector.json",
        "pgvector-vector",
        "2026-11-02T09:00:00+00:00",
        mode="vector",
        hit=0.7,
    )
    write_run(
        tmp_path,
        "2026-11-02-mongodb-hybrid.json",
        "mongodb-hybrid",
        "2026-11-02T11:00:00+00:00",
        backend="mongodb",
        answer={"faithfulness": 0.95, "citation_correctness": 0.9, "refusal_accuracy": 1.0},
    )
    (tmp_path / "latest.json").write_text("{}")  # must be ignored as input

    latest = summary.regenerate(tmp_path, now=datetime(2026, 11, 17, tzinfo=UTC))
    configs = [r["config"] for r in latest["runs"]]
    assert configs == ["pgvector-vector", "pgvector-hybrid", "mongodb-hybrid"]
    hybrid = latest["runs"][1]
    assert hybrid["retrieval"]["hit_at_5"] == 0.9
    assert hybrid["run_file"] == "2026-11-02-pgvector-hybrid.json"
    assert set(hybrid) == {
        "config",
        "backend",
        "mode",
        "rerank",
        "k",
        "n_questions",
        "retrieval",
        "answer",
        "cost_usd",
        "latency_ms_p50",
        "latency_ms_p95",
        "run_file",
    }
    assert json.loads((tmp_path / "latest.json").read_text())["generated_at"].startswith("2026-11-17")
    md = (tmp_path / "SUMMARY.md").read_text()
    assert "| pgvector-hybrid | pgvector | hybrid | no | 90.0% |" in md
    assert "| 0.950 | 0.900 | 100.0% |" in md
