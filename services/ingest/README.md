# Asset IQ — ingestion service

FastAPI service that turns uploaded documents into searchable chunks:
**claim → download → extract (per page) → chunk → embed → atomic replace**.

- `POST /ingest {"document_id": "<uuid>"}` — `Authorization: Bearer $INGEST_SHARED_SECRET`. Returns 202; work runs in the background.
- Polling worker (on by default) picks up any `pending` document, so a lost trigger never strands an upload.
- `GET /health`

Run locally:

```bash
uv sync
uv run uvicorn asset_ingest.app:app --reload --port 8000   # reads ../../.env via env vars
uv run pytest && uv run ruff check .
```

or `docker compose up ingest` from the repo root.

Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `EMBEDDING_MODEL`,
`INGEST_SHARED_SECRET`, `POLL_INTERVAL_SECONDS` (5), `WORKER_ENABLED` (true).

Design notes live in [`docs/DECISIONS.md`](../../docs/DECISIONS.md).
