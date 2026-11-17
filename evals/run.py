"""Asset IQ eval runner.

    uv run python run.py --config pgvector-hybrid --mode hybrid
    uv run python run.py --config pgvector-hybrid-rerank --mode hybrid --rerank --answers

Signs in as the demo user, runs every dataset question through /api/search (and
/api/answer + an LLM judge with --answers), writes results/<date>-<config>.json
and regenerates results/latest.json + results/SUMMARY.md.

Env (from ../.env if present): ASSET_IQ_URL (default http://localhost:3000),
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, DEMO_USER_EMAIL,
DEMO_USER_PASSWORD, ANTHROPIC_API_KEY + FAST_MODEL (judge, only with --answers).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date
from pathlib import Path

from asset_evals import dataset, summary
from asset_evals.api import AssetIQClient, BackendUnavailable
from asset_evals.runner import Params, run

HERE = Path(__file__).parent


def load_env(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.split(" #", 1)[0].strip().strip('"').strip("'"))


def main(argv: list[str] | None = None) -> int:
    load_env(HERE.parent / ".env")
    load_env(HERE.parent / ".env.local")
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", required=True, help="name for this configuration, e.g. pgvector-hybrid")
    ap.add_argument("--mode", choices=["vector", "keyword", "hybrid"], default="hybrid")
    ap.add_argument("--rerank", action=argparse.BooleanOptionalAction, default=False)
    ap.add_argument("--backend", choices=["pgvector", "mongodb"], default="pgvector")
    ap.add_argument("--k", type=int, default=5)
    ap.add_argument("--answers", action="store_true", help="also generate answers and judge them")
    ap.add_argument("--limit", type=int, help="only the first N questions (smoke test)")
    args = ap.parse_args(argv)

    params = Params(args.config, args.mode, args.rerank, args.backend, args.k, args.answers)
    rows = dataset.load()
    if args.limit:
        rows = rows[: args.limit]

    env = os.environ
    supabase_url = env.get("NEXT_PUBLIC_SUPABASE_URL") or env.get("SUPABASE_URL")
    anon = env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    password = env.get("DEMO_USER_PASSWORD")
    if not (supabase_url and anon and password):
        print("Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and DEMO_USER_PASSWORD.")
        return 2

    judge = None
    if args.answers:
        import anthropic

        from asset_evals.judge import Judge

        judge = Judge(anthropic.Anthropic(timeout=120.0), env.get("FAST_MODEL", "claude-haiku-5-5"))

    client = AssetIQClient(
        env.get("ASSET_IQ_URL", "http://localhost:3000"),
        supabase_url,
        anon,
        env.get("DEMO_USER_EMAIL", "demo@asset-iq.local"),
        password,
    )
    print(
        f"{params.config}: {len(rows)} questions, mode={params.mode} rerank={params.rerank} "
        f"backend={params.backend} k={params.k} answers={params.answers}"
    )
    try:
        result = run(rows, client, judge, params, dataset.fingerprint())
    except BackendUnavailable as exc:
        print(f"SKIPPED: backend '{params.backend}' is not available ({exc}).")
        return 0

    out = summary.RESULTS / f"{date.today().isoformat()}-{params.config}.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(result, indent=2) + "\n")
    summary.regenerate()
    a = result["aggregates"]
    r = a["retrieval"]
    print(f"hit@5={r['hit_at_5']:.3f} doc_hit@5={r['doc_hit_at_5']:.3f} mrr={r['mrr']:.3f}  -> {out.name}")
    if a["answer"]:
        print("answer:", json.dumps(a["answer"]), f"cost=${a['cost_usd']:.4f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
