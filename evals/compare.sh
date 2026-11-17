#!/usr/bin/env bash
# Standard comparison matrix. Requires the web app running (pnpm dev) and a seeded demo user.
# Pass --answers to also generate + judge answers (costs a few cents).
set -euo pipefail
cd "$(dirname "$0")"
EXTRA=("$@")

uv run python run.py --config pgvector-vector        --mode vector --no-rerank "${EXTRA[@]}"
uv run python run.py --config pgvector-hybrid        --mode hybrid --no-rerank "${EXTRA[@]}"
uv run python run.py --config pgvector-hybrid-rerank --mode hybrid --rerank    "${EXTRA[@]}"
# Skips cleanly (exit 0) if the MongoDB backend isn't configured (API returns 501).
uv run python run.py --config mongodb-hybrid --backend mongodb --mode hybrid --no-rerank "${EXTRA[@]}"

echo
cat results/SUMMARY.md
