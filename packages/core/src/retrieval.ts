import { EMBEDDING_DIMS, env, RETRIEVAL } from "./config";
import type { RequestContext } from "./context";
import { embedQuery } from "./llm";
import { rerank } from "./rerank";
import type { Backend, Filters, ScoredChunk, SearchMode } from "./types";
import { getVectorStore } from "./vectorstore";

export interface RetrieveParams {
  query: string;
  filters?: Filters;
  k?: number;
  mode?: SearchMode;
  /** undefined → RERANK_ENABLED env flag */
  rerank?: boolean;
  backend?: Backend;
}

export interface RetrieveResult {
  chunks: ScoredChunk[];
  reranked: boolean;
  backend: Backend;
  mode: SearchMode;
  timings: { embedMs: number; searchMs: number; rerankMs: number };
}

/**
 * query → embed → VectorStore.hybridSearch → (optional) rerank top 30 → top k.
 * The single retrieval path used by chat, the agent's search tool, MCP and evals.
 */
export async function retrieve(ctx: RequestContext, p: RetrieveParams): Promise<RetrieveResult> {
  const k = p.k ?? RETRIEVAL.answerK;
  const mode = p.mode ?? "hybrid";
  const useRerank = p.rerank ?? env().RERANK_ENABLED;
  const backend = p.backend ?? env().VECTOR_BACKEND;
  const store = getVectorStore(ctx.db, backend);

  const t0 = Date.now();
  const embedding = mode === "keyword" ? new Array<number>(EMBEDDING_DIMS).fill(0) : await embedQuery(ctx, p.query);
  const t1 = Date.now();
  const candidates = await store.hybridSearch({
    ownerId: ctx.ownerId,
    embedding,
    text: p.query,
    filters: p.filters,
    k: useRerank ? Math.max(RETRIEVAL.rerankCandidates, k) : k,
    mode,
  });
  const t2 = Date.now();

  let chunks = candidates.slice(0, k);
  let reranked = false;
  if (useRerank) {
    const r = await rerank(ctx, p.query, candidates, k);
    chunks = r.chunks;
    reranked = r.reranked;
  }
  const t3 = Date.now();

  for (const c of chunks) ctx.retrievedChunkIds.add(c.id);
  return {
    chunks,
    reranked,
    backend,
    mode,
    timings: { embedMs: t1 - t0, searchMs: t2 - t1, rerankMs: t3 - t2 },
  };
}
