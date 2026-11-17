#!/usr/bin/env bash
# Standard comparison matrix. Requires the web app running (pnpm dev) and a seeded demo user.
# Pass --answers to also generate + judge answers (costs a few cents).
set -euo pipefail
cd "$(dirname "$0")"
EXTRA=("$@")

uv run python run.py --config pgvector-vector        --mode vector --no-rerank "${EXTRA[@]}"
uv run python run.py --config pgvector-hybrid        --mode hybrid --no-rerank "${EXTRA[@]}"
uv run python run.py --config pgvector-keyword       --mode keyword --no-rerank "${EXTRA[@]}"
# Rerank falls back to RRF order without a Cohere key, so only run (and label) it when one is set.
if grep -qE '^COHERE_API_KEY=.+' ../.env 2>/dev/null || [ -n "${COHERE_API_KEY:-}" ]; then
  uv run python run.py --config pgvector-hybrid-rerank --mode hybrid --rerank "${EXTRA[@]}"
else
  echo "skipping pgvector-hybrid-rerank: COHERE_API_KEY not set"
fi
# Skips cleanly (exit 0) if the MongoDB backend isn't configured (API returns 501).
uv run python run.py --config mongodb-hybrid --backend mongodb --mode hybrid --no-rerank "${EXTRA[@]}"

echo
cat results/SUMMARY.md
