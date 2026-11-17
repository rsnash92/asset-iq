# Architecture

```
┌────────────────────────── Next.js app (apps/web) ────────────────────────┐
│  UI: Library · Chat · Agent · Evals · Usage · API keys                   │
│  API: /api/chat (stream) /api/answer (json) /api/agent (stream)          │
│       /api/search /api/documents[/:id[/complete|/reingest]] /api/keys    │
│  proxy.ts: session refresh + redirect to /login                          │
└───────────────┬───────────────────────────────┬──────────────────────────┘
                │ imports                       │
        ┌───────▼──────────────── packages/core ▼──────────────────────────┐
        │ retrieval.ts   embed → VectorStore.hybridSearch → rerank → top k │
        │ vectorstore/   PgVectorStore (RPC) | MongoAtlasStore (+ RRF in TS)│
        │ agent/tools.ts five tools (zod) ← adapters: ai-sdk.ts, MCP        │
        │ prompts · rewrite · pricing · logging · ratelimit · apikeys      │
        └───────▲──────────────────────────────────────────────────────────┘
                │ imports
        ┌───────┴───────┐
        │ packages/mcp  │  stdio + stateless streamable HTTP, API-key auth
        └───────────────┘

 Supabase (Auth · Storage · Postgres+pgvector)  ◄── services/ingest (FastAPI + local embedding model; POST /ingest, POST /embed)
   documents, chunks(fts, hnsw), query_logs,          claim_document → extract per page
   api_keys, rate_limits + RLS                         → chunk → embed → replace_document_chunks
   RPC: match_chunks_hybrid, consume_rate_limit,
        usage_summary, claim_document, replace_document_chunks
 MongoDB Atlas (optional mirror via `pnpm mongo:sync`)
 evals/ (Python) → /api/search + /api/answer → results/*.json, SUMMARY.md, latest.json → /evals page
```

## Chat request

1. `requireUser` (cookie session or `Authorization: Bearer <supabase token>`) → user-scoped client, RLS applies.
2. `enforceRateLimit('chat')` → 429 + `Retry-After` when exceeded.
3. Last 6 messages; if there's history, Haiku rewrites the question into a standalone query.
4. `retrieve()` → embed (local nomic model via the ingest service's `/embed`) → `match_chunks_hybrid` (vector top 50 + FTS top 50 → RRF) → optional Cohere rerank of 30 → top 8.
5. Excerpts numbered and delimited in the user turn; Sonnet streams the answer (`effort: low`).
6. A `data-sources` part is streamed first (citations + debug scores); text follows.
7. `onEnd` writes a `query_logs` row (tokens, cost, latency, chunk IDs).

## Ingestion

Upload → signed URL → Storage → `/complete` inserts `documents(status=pending)` and pings `POST /ingest`. The service (or its polling worker) claims the row with `FOR UPDATE SKIP LOCKED`, extracts text per page (PyMuPDF), rejects scanned/empty PDFs, chunks (~500 tokens, 75 overlap, sentence-aligned), embeds `title + chunk` in batches of 100 with backoff, and calls `replace_document_chunks` (atomic delete + insert + `status=ready`).

## Isolation

- Web: user-scoped Supabase client → RLS on every table and on storage paths.
- MCP / ingest / sync: service role, with explicit `owner_id` filters in every query (`filter_owner` in the search RPC). Integration tests check cross-owner reads fail on both paths.
