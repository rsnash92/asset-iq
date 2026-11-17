# Evals

- `dataset.jsonl` — 30 answerable questions (expected document slug + 1-based PDF pages, validated
  against the extracted text) and 5 unanswerable questions on plausible but absent topics.
- `run.py` — runs the dataset through `/api/search` (and `/api/answer` + an LLM judge with `--answers`).
- `compare.sh` — the standard matrix: vector vs hybrid vs hybrid+rerank on pgvector, hybrid on MongoDB.
- `results/` — one JSON per run (`<date>-<config>.json`), plus `latest.json` (read by the app's
  `/evals` page) and `SUMMARY.md`, regenerated after every run.

```bash
uv run python run.py --config pgvector-hybrid --mode hybrid
./compare.sh              # retrieval only (free apart from query embeddings)
./compare.sh --answers    # + answers judged by FAST_MODEL (a few cents)
uv run pytest && uv run ruff check .
```

Metrics: **hit@5** (a top-5 chunk from an expected document overlaps an expected page), **doc hit@5**
(document only), **MRR@k**; with `--answers`, **faithfulness**, **citation correctness** and **refusal
accuracy** from an LLM judge (see `docs/DECISIONS.md`).

Requires the web app running (`ASSET_IQ_URL`, default `http://localhost:3000`), a seeded demo user
(`DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD`) and `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
