# Decisions

One entry per non-obvious decision: **what** was chosen, **why**, and the **alternatives** considered.

## 2026-11-17 — PyMuPDF for per-page extraction

**What:** The ingest service extracts text with PyMuPDF (`page.get_text("blocks", sort=True)`), one string per 1-based page index.

**Why:** Citations point at pages, so extraction must be per page and faithful to reading order. PyMuPDF's block mode keeps layout grouping (one block ≈ one paragraph), which gives the chunker real paragraph boundaries; `sort=True` orders blocks top-to-bottom, left-to-right, which helps on HSE's two-column leaflets. Being a C library it is also fast: the 44-page HSG159 extracts and chunks in well under a second locally.

**Alternatives:** `pypdf` (pure Python, simpler licence, but flattens layout and loses paragraph breaks on many HSE PDFs); `pdfplumber` (great for tables, slower); a hosted parser (Unstructured, Azure Document Intelligence) — overkill for text PDFs and adds a paid dependency. Note: PyMuPDF is AGPL; fine for an open portfolio project, would need a commercial licence or a swap to `pypdf` in a closed product.

## 2026-11-17 — ~500-token chunks with 75-token sentence-aligned overlap

**What:** Chunks of at most 500 `cl100k_base` tokens, built greedily from sentence units (split on paragraphs first, then sentences, then bullets), with up to 75 tokens of *whole trailing sentences* carried into the next chunk. A single sentence longer than 500 tokens is the only thing ever hard-split. Each chunk records `page_start`/`page_end`.

**Why:** 500 tokens is large enough to hold a complete HSE guidance point (a question + its answer, a regulation + its explanation) and small enough that 6–8 chunks fit comfortably in the answer prompt with room for history. Splitting only at sentence boundaries keeps excerpts quotable for citations. Overlap protects facts that straddle a boundary; making it sentence-aligned means no chunk starts mid-sentence. On the real corpus this yields an average of ~475 tokens/chunk (e.g. HSG159: 44 pages → 39 chunks).

**Alternatives:** Fixed-size token windows (simpler, but cut sentences and produce ugly citation excerpts); page-per-chunk (pages vary from 200 to 3,000+ characters — too uneven); semantic chunking by embedding similarity (costs an embedding pass per sentence and is hard to reason about in evals). Chunk size is a config value so the eval suite can sweep it later.

## 2026-11-17 — tiktoken `cl100k_base` for token counting

**What:** Token counts (chunk sizing and `chunks.token_count`) use tiktoken's `cl100k_base`, the tokenizer of `text-embedding-3-small`.

**Why:** The hard limit that matters at ingest time is the embedding model's input; counting with its own tokenizer makes "≤ 500 tokens" exact for embeddings. Claude's tokenizer differs, but the answer prompt has ample headroom, so an approximate count there is fine. The encoding is pre-downloaded in the Docker image so containers don't fetch it at runtime.

**Alternatives:** Character heuristics (÷4) — off by 20–40% on regulation text with numbers and acronyms; Anthropic token counting API — a network call per chunk for no benefit at ingest.

## 2026-11-17 — Prefix the document title to each chunk before embedding

**What:** The text sent to the embedding model is `"{title}\n\n{chunk}"`; `chunks.content` stores the raw chunk.

**Why:** Many chunks are only meaningful in context — "You must provide them with information about the risks…" says nothing about *contractors* unless the vector knows it came from *Using contractors: a brief guide*. Title-prefixing is a cheap form of contextual retrieval that pulls such chunks towards queries about the document's topic. Storing raw content keeps citations and the full-text index clean (the title is not repeated in every `tsvector`, which would otherwise inflate keyword matches on title words).

**Alternatives:** LLM-generated per-chunk context (Anthropic's "contextual retrieval") — better, but costs an LLM call per chunk; a good Phase-4+ experiment measured by the eval suite. Adding the title to the FTS document too — rejected because every chunk of a document would then match the title's words equally.

## 2026-11-17 — Claim with `FOR UPDATE SKIP LOCKED`; trigger + polling worker

**What:** Documents are claimed through a `claim_document(p_document_id)` RPC that flips `pending → processing` in one `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED)`. `POST /ingest` claims a specific document; a background worker polls for any pending one. Rows stuck in `processing` for more than 15 minutes are reclaimable.

**Why:** Two entry points (an immediate trigger from the web app for low latency, and polling for resilience when the trigger is lost or the service was down) must never process the same document twice. `SKIP LOCKED` makes concurrent claimers skip each other instead of blocking, and Postgres becomes the queue — no Redis/SQS to run. The stale-claim timeout recovers from a crashed worker.

**Alternatives:** A real queue (SQS, Redis/RQ, Inngest) — more moving parts for a few hundred documents; Supabase database webhooks → service — no retry semantics we control; polling only — simplest, but adds up to `POLL_INTERVAL_SECONDS` of latency to every upload.

## 2026-11-17 — Atomic `replace_document_chunks` RPC

**What:** The service writes all chunks for a document in one RPC that deletes the old chunks, inserts the new ones and sets `status = 'ready'` inside a single transaction. Embeddings travel as pgvector text literals.

**Why:** Re-ingesting must be idempotent and must never expose a half-written document to search (old chunks deleted, new ones not yet inserted). One transaction gives exactly-once semantics per successful ingest. If a re-ingest fails, the document is marked `failed` and its previous chunks remain but are excluded from search (`match_chunks_hybrid` only returns chunks of `ready` documents).

**Alternatives:** Client-side delete + batched inserts through PostgREST (non-atomic, readers can see a gap); upsert on `(document_id, chunk_index)` (leaves orphan chunks when a new version has fewer chunks).

## 2026-11-17 — Embedding calls over plain httpx with backoff and jitter

**What:** The ingest service calls the OpenAI embeddings endpoint directly with `httpx`: batches of 100 inputs, 30 s timeout, up to 5 attempts on 408/409/429/5xx/transport errors with exponential backoff (1, 2, 4, 8 s) plus jitter, honouring `Retry-After`. Non-retryable 4xx errors fail fast. Vectors are re-ordered by `index` and dimension-checked.

**Why:** One small, fully testable function (mocked with `respx`) instead of a heavyweight SDK in the container; behaviour under failure is explicit and covered by tests.

**Alternatives:** The `openai` SDK (has its own retries, but less visible and adds a dependency); the Batch API (50% cheaper, but asynchronous with hours of latency — wrong for interactive uploads).

## 2026-11-17 — Sample corpus: UK HSE publications under the Open Government Licence

**What:** 38 HSE PDFs (752 pages): 19 INDG leaflets, 2 construction and 1 agriculture information sheets, 3 health-services sheets, 4 HSG guidance books, 3 Approved Codes of Practice, and 6 statistics reports (2023–2025 national summaries, 2025 construction/manufacturing/agriculture). Only `manifest.json` and `download.py` are committed; PDFs are fetched on demand.

**Why:** A realistic EHS-style B2B content library with varied lengths (2–141 pages), document types, industries and dates — enough to exercise filters ("reports", "manufacturing", "after 2020"), recency ("three most recent reports"), and keyword-heavy queries (RIDDOR, LOLER, CDM 2015, COSHH). Licence verification was done per file on 2026-11-17 and recorded as an evidence level in the manifest: `inline-ogl` (the PDF itself names the OGL), `crown-copyright-notice` (the PDF says © Crown copyright and points to hse.gov.uk/copyright.htm, which licenses Crown material under the OGL), or `hse-site-copyright-statement` (statistics PDFs without their own notice, covered by the site-wide statement). The one exclusion HSE lists — the *Health and Safety Law* poster suite — is not included. Only extracted text is indexed, so third-party images inside publications are never reproduced. The manifest pins each file's sha256; `download.py` warns if HSE revises a file, because eval page numbers were authored against the pinned versions.

**Alternatives:** Synthetic documents (no licence risk, but unrealistic and easy to overfit to); arXiv papers (licences vary per paper); scraping vendor whitepapers (copyrighted — ruled out). HSE's legacy RR research-report PDFs were considered for the "report" type, but their old URLs now 404; the statistics reports are current, dated and OGL.

## 2026-11-17 — Eval relevance is page-level, with a doc-level metric alongside

**What:** A retrieved chunk counts as relevant when it comes from an expected document (`external_ref` = manifest slug) **and** its `[page_start, page_end]` overlaps an expected page. `hit@5` and MRR use this page-level definition; `doc_hit@5` (document match only) is reported next to it. Expected pages are 1-based PDF page indices (not printed page labels) and were validated programmatically: every expected page contains the answer's key phrase, and any other page that also contains it was added.

**Why:** Citations promise a page, so the headline metric should reward retrieving the right *passage*, not just the right document — a 141-page book is "correct" for almost any construction question. The doc-level number separates "found the right source" from "found the right passage", which tells you whether to work on document routing (filters, titles) or on chunking. Keying on the manifest slug instead of database UUIDs keeps the dataset valid across re-seeds and across both vector backends.

**Alternatives:** Chunk-ID ground truth (breaks whenever chunking changes); exact page equality (penalises chunks spanning a page break); LLM-judged relevance for retrieval (non-deterministic and costs money on every run; reserved for answer quality).

## 2026-11-17 — LLM-as-judge with structured output; refusal derived from the verdict

**What:** With `--answers`, each answer is scored by Claude (`FAST_MODEL`, default Haiku 5.5) through the Anthropic SDK's `messages.parse` with a Pydantic schema: `declined`, `faithfulness` (0–1), `citation_correctness` (0–1, null when nothing is cited), `unsupported_claims`, `notes`. `refusal_correct` is computed as `declined == (question is unanswerable)`. Excerpts are wrapped in `<excerpt>` tags and the judge is told they are data. Scores are clamped to [0, 1].

**Why:** Structured output removes JSON-parsing failures from the eval loop. Deriving refusal correctness from a judged `declined` flag (rather than trusting the API's own `refused` flag, which is also recorded) catches answers that hedge or partially answer. A cheap model keeps a full 35-question judged run at a few cents; the rubric is narrow (support checking against given text), which small models do reliably.

**Alternatives:** Ragas/DeepEval (more metrics, heavier dependency, opaque prompts); a larger judge model (more expensive; worth spot-checking against on a sample); string-matching against reference answers (brittle for free-text answers — reference answers are kept in the dataset for human review instead).

## 2026-11-17 — Shared logic lives in `packages/core`, not `apps/web/lib`

**What:** Retrieval, vector stores, prompts, cost/logging, rate limiting and the five agent tools live in a workspace package `@asset-iq/core` (TypeScript source, transpiled by Next via `transpilePackages`, run by `tsx` in the MCP server). `apps/web/lib` keeps only web concerns (Supabase SSR clients, auth, HTTP error mapping, chat UI types).

**Why:** The spec requires the MCP server to reuse the agent's tool logic with no duplication. Importing from `apps/web/lib` into `packages/mcp` would couple a server package to a Next app. A core package makes the boundary explicit and testable on its own.

**Alternatives:** Keep logic in `apps/web/lib` and import across workspaces via path aliases (works, but couples build systems); publish compiled JS (extra build step for no benefit in a monorepo).

## 2026-11-17 — One SQL function for hybrid search; filters before ranking; OR-ed full-text query

**What:** `match_chunks_hybrid` runs the vector and full-text retrievers as separate CTEs over the *filtered* candidate set (owner, status=ready, type, industry, dates, document ids), takes the top 50 of each, and fuses them with RRF (k=60). The full-text side converts `plainto_tsquery` lexemes from AND to OR and ranks with `ts_rank_cd`. A `search_mode` argument (`vector` | `keyword` | `hybrid`) lets evals compare configurations through the same code path.

**Why:** Filtering *after* the top-50 cut could return nothing for a selective filter. AND semantics make natural-language questions match almost nothing ("how often should scaffolds be inspected" rarely contains every term); OR + cover-density ranking still rewards passages that match more terms. One round trip, one function, `SECURITY INVOKER` so RLS still applies for user-scoped clients, plus `filter_owner` for the service role.

**Trade-off:** Filtering inside a CTE means Postgres does an exact (sequential) cosine scan over the filtered rows instead of using the HNSW index. At portfolio scale (~1–5k chunks per user) that's milliseconds and gives perfect recall. At larger scale: partition or index per tenant, or use pgvector 0.8 iterative HNSW scans (`hnsw.iterative_scan = relaxed_order`) with the filters in the outer query.

**Alternatives:** Fusing in TypeScript after two RPCs (two round trips, duplicated filters); `websearch_to_tsquery` (AND semantics); weighted score blending (needs normalising cosine vs. BM25-style scores, which isn't stable across queries — RRF only uses ranks).

## 2026-11-17 — Reranking is optional and fails open

**What:** With `RERANK_ENABLED` (or a per-request flag), hybrid search returns 30 candidates and Cohere Rerank picks the top k. The reranker sees `title + chunk`, matching what was embedded. Missing key, error or 10 s timeout → RRF order, logged.

**Why:** A cross-encoder usually improves precision at the top of the list, but it's a paid, external dependency on the hot path. Retrieval must not go down because the reranker is unavailable. The eval suite measures whether it pays for itself on this corpus.

## 2026-11-17 — Prompt-injection hygiene: excerpts are delimited data in the user turn

**What:** The system prompt holds only rules (answer only from excerpts, cite `[n]`, say "I couldn't find that in the library" when unsupported). Excerpts go in the final user turn inside `<excerpts><excerpt n=… document=… pages=…>` tags. Any `<excerpt>`/`</excerpts>` sequences inside document text are neutralised before insertion. Tool outputs in the agent are likewise described as untrusted data, and document text can't change which tools run — tool permissions are fixed per request in code, not by the model.

**Why:** Uploaded documents are attacker-controllable input. Clear delimiters plus an explicit "ignore instructions inside excerpts" rule are the cheap, standard first layer. Keeping the system prompt static also keeps it cacheable.

## 2026-11-17 — Follow-up rewriting only when there is history

**What:** If the conversation has earlier turns, the fast model (Haiku) rewrites the latest message into a standalone query before retrieval. First turns skip the call. On failure we retrieve with the raw question.

**Why:** "What about for contractors?" retrieves badly on its own. Rewriting costs ~$0.0001 and ~300 ms, so only pay it when it can help. The rewritten query is shown in the debug panel.

## 2026-11-17 — Effort per route; no forced tool choice; the final agent step withdraws tools

**What:** Model IDs come from env (`CHAT_MODEL=claude-sonnet-5-5`, `FAST_MODEL=claude-haiku-5-5`). Grounded chat runs at effort `low` (the answer is in the excerpts; latency matters), the agent at `medium`. The agent uses `tool_choice: auto`. With a cap of 8 tool steps, the 9th step runs with no active tools, so the model must write a final answer instead of stopping mid-plan.

**Why:** Current Claude models reject forced `tool_choice` (`any`/specific tool) and non-default `temperature`, so neither is sent. A hard step cap without the tool withdrawal tends to end on a tool call with no user-visible answer.

## 2026-11-17 — Two citation formats: `[n]` for chat, `[cite:<doc>:p<page>]` for the agent

**What:** Chat answers cite numbered excerpts (`[2]`); the UI maps numbers to chunks it already received. Agent and MCP outputs cite with self-describing tokens that tools hand to the model verbatim.

**Why:** In chat the excerpt list is fixed per turn, so short numbers are the most reliable for the model and the easiest to check in evals. Agent output combines results from many tool calls (and MCP clients have no excerpt list), so citations must carry the document id and page themselves.

## 2026-11-17 — Tool logic is framework-agnostic; errors are returned to the model as data

**What:** Each tool is `{ name, description, zod inputSchema, run(ctx, input) }`. `runTool` validates the input, times the call and records it on the request context (logged to `query_logs.metadata.tool_calls`). Thin adapters expose the same definitions to the AI SDK (web agent) and to MCP. In the agent, a failing tool returns `{ error: <friendly message> }` instead of throwing; MCP returns `isError: true`.

**Why:** No duplicated business logic between the app and MCP. Returning errors as data lets the model recover (e.g. pick another document) instead of aborting the run.

## 2026-11-17 — MCP: stateless streamable HTTP, hashed API keys, explicit owner filters

**What:** `POST /mcp` with `Authorization: Bearer aiq_…`. Each request resolves the key (SHA-256 lookup; revocable; `last_used_at` tracked), builds a server bound to that owner, handles one JSON-RPC message, and disposes of it. Stdio mode reads `ASSET_IQ_API_KEY` at startup. Both use the service-role client, and every query filters `owner_id` explicitly (and `match_chunks_hybrid` takes `filter_owner`). An integration test proves one key can't read another owner's document.

**Why:** Stateless mode needs no sticky sessions, so it scales horizontally. A 192-bit random key doesn't need a slow password KDF: SHA-256 is enough because it can't be brute-forced like a password.

**Trade-off:** Stdio mode needs the service-role key on the machine running it, so it's for local/self-hosted use. For other users, point MCP clients at the hosted HTTP endpoint, which only needs their own API key.

## 2026-11-17 — Uploads go straight to Storage via signed upload URLs

**What:** `POST /api/documents` validates name/type/size and returns a signed upload URL for `<owner>/<document_id>/<file>`. The browser uploads directly, then `POST /api/documents/:id/complete` checks the object exists, is ≤ 20 MB and (for PDFs) starts with `%PDF`, then inserts the row and nudges the ingest service. The bucket itself also enforces the size and MIME allow-list, and storage RLS restricts paths to the owner's folder.

**Why:** Vercel functions cap request bodies at ~4.5 MB, below the 20 MB limit. Signed URLs also keep large files off the app server. The ingest nudge is best-effort, because the service's polling worker is the safety net.

## 2026-11-17 — Postgres-backed fixed-window rate limiter that fails open

**What:** The `consume_rate_limit(bucket, limit, window)` RPC does one atomic upsert per request. Chat and agent requests are limited to 30 per 10 minutes per user; `/api/answer` (used by evals) has its own bucket of 100; MCP has its own. A 429 includes `Retry-After`. If the limiter's database call fails, the request is allowed.

**Why:** No extra paid service (Upstash), and one more cheap query on a database we already hit. A fixed window allows up to 2× bursts at window edges, which is acceptable here. Failing open puts availability ahead of strictness, because the limiter guards cost, not security.

## 2026-11-17 — Cost and latency logged per request

**What:** Every chat, agent, search and MCP request writes one `query_logs` row: tokens by model, embedding tokens, rerank searches, chunk IDs, latency, error, and cost computed from a pricing table in `packages/core/src/pricing.ts`. Unknown models are costed at 0, not guessed. Eval traffic sends `x-asset-iq-eval` and is logged as `kind='eval'`, so it stays out of product metrics. The Usage page shows per-kind totals and p50/p95 latency from the `usage_summary` RPC.

## 2026-11-17 — MongoDB Atlas is a mirrored index; Postgres stays the system of record

**What:** `MongoAtlasStore` implements the same `VectorStore` interface. It runs `$vectorSearch` and Atlas Search `$search` in parallel, applies the same filters (owner always) in both, and fuses them with the same RRF in TypeScript. `pnpm mongo:sync` mirrors ready chunks (with denormalised document metadata) from Postgres into Mongo and creates the indexes. Local development and CI use the free `mongodb/mongodb-atlas-local` image, and the same behavioural integration tests run against both backends.

**Why:** Auth, documents, logs and RLS stay in one place, and only the retrieval engine changes. That keeps the comparison fair (same chunks, same embeddings). Atlas can't fuse vector and text search in one stage on every tier, so fusion happens in the app.

**Alternatives:** Dual-writing from the ingest service (tighter freshness, but two writers to keep consistent); Mongo as the primary store (would move auth/RLS concerns into app code).

## 2026-11-17 — Source viewer: native PDF viewer with `#page=` plus a highlighted excerpt panel

**What:** Citation chips open `/documents/:id?page=N&chunk=<id>`. PDFs render in the browser's built-in viewer via a signed URL with `#page=N`. A side panel shows the exact cited chunk highlighted, plus the indexed text for that page. Markdown/text files render inline with the excerpt wrapped in `<mark>`.

**Why:** Robust, zero extra JavaScript, works in every browser. Highlighting inside the PDF canvas would need pdf.js with a custom text layer and fuzzy matching against layout-dependent text — the natural next step if the demo calls for it.

## 2026-11-17 — Local Supabase on ports 553xx

**What:** `supabase/config.toml` moves the local stack from 543xx to 553xx.

**Why:** Other projects on the same machine already use the default ports. Using a distinct range lets them run side by side.
