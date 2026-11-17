#!/usr/bin/env bash
# Integration tests against the local stack: Supabase (pnpm db:start) and,
# optionally, local Atlas MongoDB (docker compose --profile mongo up -d mongodb).
set -euo pipefail
cd "$(dirname "$0")/.."
eval "$(pnpm exec supabase status -o env 2>/dev/null | grep -E '^(API_URL|SERVICE_ROLE_KEY)=')"
export SUPABASE_URL="${API_URL:?supabase is not running — pnpm db:start}"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export MONGODB_URI="${MONGODB_URI:-mongodb://assetiq:assetiq-local@localhost:27018/?directConnection=true}"
pnpm --filter @asset-iq/core test:integration
pnpm --filter @asset-iq/mcp test
