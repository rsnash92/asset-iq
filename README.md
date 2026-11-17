# Asset IQ

**AI search and assistant for a B2B content library.** Ask questions in plain English and get streamed answers with page-level citations. An agent can find, filter, summarise and draft from your documents, and the same tools are exposed to Claude Desktop/Code through an MCP server. Retrieval is hybrid (pgvector + Postgres full-text, fused with Reciprocal Rank Fusion, optional Cohere rerank). An eval suite measures it, and the vector backend can be swapped between pgvector and MongoDB Atlas.

> 🎥 Demo video: _TODO_ · 🌐 Live demo: _TODO_ · 📸 Screenshot: _TODO_

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the diagram and request flows.

| Layer | Choice |
|---|---|
| App + API | Next.js 16 (App Router), TypeScript, Tailwind, shadcn/ui, Vercel AI SDK |
| Models | Claude Sonnet 5.5 (answers, agent), Claude Haiku 5.5 (query rewriting, judging) — env-configurable |
| Embeddings | Local open-source `nomic-embed-text-v1.5` (768-d, fastembed/ONNX) in the ingest service — no API key, no per-call cost; the same service embeds queries via `POST /embed` |
| Data | Supabase: Auth (magic link), Storage, Postgres + pgvector + FTS, RLS everywhere |
| Ingestion | Python 3.12, FastAPI, PyMuPDF, tiktoken — Docker |
| Alt. vector store | MongoDB Atlas Vector Search + Atlas Search |
| Agent tools | `search_library`, `list_assets`, `get_document`, `summarise_document`, `draft_content` — shared by the web agent and MCP |
| Tests | Vitest, pytest, Playwright; integration tests against real Supabase and Atlas-local |

## Key design decisions

All decisions, with alternatives, are in [docs/DECISIONS.md](docs/DECISIONS.md). Highlights:

- **Chunking:** ~500 tokens, 75-token sentence-aligned overlap, with page ranges kept for citations.
- **Local embeddings:** an open-source model runs inside the ingest service and serves query embeddings too, so indexing and querying can't drift and there's no per-token cost.
- **Title-prefixing:** each chunk is embedded as `title + chunk`, so short passages keep their document context.
- **Hybrid + RRF:** vector and full-text retrievers run separately over the *filtered* set and are fused by rank (k=60). This avoids normalising incomparable scores, and the full-text query ORs its terms.
- **Reranking:** Cohere rerank of the top 30, feature-flagged and failing open.
- **pgvector vs MongoDB:** one `VectorStore` interface. Postgres stays the system of record and Mongo is a mirrored index, so the comparison is fair.

## Eval results

_TODO — run `evals/compare.sh` once provider keys are configured; results land in [evals/results/SUMMARY.md](evals/results/SUMMARY.md) and on the `/evals` page._

| Config | Hit@5 (page) | Hit@5 (doc) | MRR | Faithfulness | Citation correctness | Refusal accuracy |
|---|---|---|---|---|---|---|
| pgvector · vector-only | – | – | – | – | – | – |
| pgvector · hybrid | – | – | – | – | – | – |
| pgvector · hybrid + rerank | – | – | – | – | – | – |
| MongoDB · hybrid | – | – | – | – | – | – |

## Cost and latency per query

_TODO — from `query_logs` (Usage page / `usage_summary` RPC): median and p95 latency and cost per chat, agent and search request._

## Run locally

Prereqs: Node 22 + pnpm 10, Docker, [uv](https://docs.astral.sh/uv/). The Supabase CLI is a pinned dev dependency.

```bash
pnpm install
pnpm db:start                       # local Supabase on :55321 (migrations applied)
cp .env.example .env                # fill keys; local Supabase keys from `pnpm db:status`
ln -s ../../.env apps/web/.env.local
docker compose up -d ingest         # ingestion + embedding service on :8000 (model baked into the image)
pnpm dev                            # http://localhost:3000 — sign-in emails land in Mailpit (:55324)
```

Seed the sample corpus (38 UK HSE publications, Open Government Licence v3.0). Only the manifest is committed; the PDFs are downloaded:

```bash
pnpm seed                           # download.py + seed.py for DEMO_USER_EMAIL
```

Optional MongoDB backend:

```bash
docker compose --profile mongo up -d mongodb
# .env: MONGODB_URI=mongodb://assetiq:assetiq-local@localhost:27018/?directConnection=true
pnpm mongo:sync                     # mirror chunks + create search indexes
```

Checks:

```bash
pnpm lint && pnpm typecheck && pnpm test     # unit tests
pnpm test:integration                         # pgvector, RLS, MCP, Atlas against local stack
pnpm test:e2e                                 # Playwright smoke (E2E_FULL=1 for ingest + answer)
(cd services/ingest && uv run pytest) ; (cd evals && uv run pytest)
```

## Connect the MCP server

1. In the app, open **API keys** and create a key (shown once).
2. **Claude Desktop** (`claude_desktop_config.json`), stdio. This needs the service-role key, so it's for self-hosted/local use:

```json
{
  "mcpServers": {
    "asset-iq": {
      "command": "pnpm",
      "args": ["--silent", "--dir", "/path/to/asset-iq", "mcp:stdio"],
      "env": {
        "ASSET_IQ_API_KEY": "aiq_…",
        "SUPABASE_URL": "http://127.0.0.1:55321",
        "SUPABASE_SERVICE_ROLE_KEY": "…",
        "INGEST_SERVICE_URL": "http://localhost:8000",
        "INGEST_SHARED_SECRET": "…",
        "ANTHROPIC_API_KEY": "…"
      }
    }
  }
}
```

3. **Streamable HTTP** (hosted; clients need only their API key). Run `pnpm mcp:http` (port 3333), then:

```bash
claude mcp add --transport http asset-iq http://localhost:3333/mcp --header "Authorization: Bearer aiq_…"
```

## What I'd do next in production

- Sync permissions from source systems (SharePoint/Drive ACLs) instead of per-uploader ownership.
- Incremental re-indexing on document change, with content hashes per chunk so unchanged chunks aren't re-embedded.
- OCR for scanned PDFs (currently rejected with a clear message).
- SSO (SAML/OIDC) and org-level tenancy.
- In-PDF highlight with pdf.js; prompt caching for the static system prompt; HNSW iterative scans or per-tenant partitions at larger scale.

---

Sample corpus: contains public sector information published by the Health and Safety Executive and licensed under the Open Government Licence v3.0.
