import { CohereClientV2 } from "cohere-ai";
import { env, TIMEOUTS } from "./config";
import type { RequestContext } from "./context";
import type { ScoredChunk } from "./types";

export function rerankAvailable(): boolean {
  return Boolean(env().COHERE_API_KEY);
}

/**
 * Cross-encoder rerank of the fused candidates. Optional and feature-flagged:
 * if Cohere is not configured or fails/times out, we fall back to RRF order —
 * reranking improves quality but must never take retrieval down.
 */
export async function rerank(
  ctx: RequestContext,
  query: string,
  candidates: ScoredChunk[],
  topN: number,
): Promise<{ chunks: ScoredChunk[]; reranked: boolean; error?: string }> {
  const key = env().COHERE_API_KEY;
  if (!key || candidates.length === 0) return { chunks: candidates.slice(0, topN), reranked: false };
  try {
    const client = new CohereClientV2({ token: key });
    const res = await client.rerank(
      {
        model: env().RERANK_MODEL,
        query,
        // title gives the cross-encoder the same context the embedding had
        documents: candidates.map((c) => `${c.title}\n\n${c.content}`),
        topN,
      },
      { timeoutInSeconds: TIMEOUTS.rerank / 1000, maxRetries: 1, abortSignal: ctx.signal },
    );
    ctx.usage.rerankSearches += 1;
    const chunks: ScoredChunk[] = [];
    for (const r of res.results) {
      const c = candidates[r.index];
      if (c) chunks.push({ ...c, rerankScore: r.relevanceScore });
    }
    return { chunks, reranked: true };
  } catch (e) {
    console.warn("[rerank] falling back to RRF order:", (e as Error).message);
    return { chunks: candidates.slice(0, topN), reranked: false, error: "rerank_failed" };
  }
}
