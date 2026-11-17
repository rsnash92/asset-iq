import { createAnthropic } from "@ai-sdk/anthropic";
import { EMBEDDING_DIMS, env, TIMEOUTS } from "./config";
import { AppError } from "./errors";
import { retry } from "./util";
import type { RequestContext } from "./context";

export function chatModelId() {
  return env().CHAT_MODEL;
}
export function fastModelId() {
  return env().FAST_MODEL;
}

function anthropic() {
  const key = env().ANTHROPIC_API_KEY;
  if (!key) throw new AppError("not_configured", "ANTHROPIC_API_KEY is not set");
  return createAnthropic({ apiKey: key });
}

/** Sonnet: grounded answers, agent loop, drafting. */
export function chatModel() {
  return anthropic()(chatModelId());
}

/** Haiku: query rewriting and other cheap transforms. */
export function fastModel() {
  return anthropic()(fastModelId());
}

/**
 * Embed a search query with the SAME local model (nomic-embed-text-v1.5) the
 * ingestion service used for chunks. The ingest service owns the model and
 * exposes POST /embed, so prefixes and normalisation can never drift between
 * indexing and querying. Retries transient failures; bounded by a timeout.
 */
export async function embedQuery(ctx: RequestContext, text: string): Promise<number[]> {
  const { EMBEDDINGS_URL, INGEST_SERVICE_URL, INGEST_SHARED_SECRET } = env();
  const base = EMBEDDINGS_URL ?? INGEST_SERVICE_URL;
  if (!base || !INGEST_SHARED_SECRET) {
    throw new AppError("not_configured", "EMBEDDINGS_URL/INGEST_SERVICE_URL and INGEST_SHARED_SECRET are required for query embeddings");
  }
  try {
    const vector = await retry(
      async () => {
        const res = await fetch(new URL("/embed", base), {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${INGEST_SHARED_SECRET}` },
          body: JSON.stringify({ texts: [text.slice(0, 8000)], kind: "query" }),
          signal: AbortSignal.any([AbortSignal.timeout(TIMEOUTS.embed), ...(ctx.signal ? [ctx.signal] : [])]),
        });
        if (!res.ok) {
          const err = new Error(`embed service returned ${res.status}`) as Error & { status: number };
          err.status = res.status;
          throw err;
        }
        const body = (await res.json()) as { embeddings: number[][] };
        return body.embeddings[0];
      },
      { retries: 2, baseMs: 200, shouldRetry: (e) => !((e as { status?: number }).status && (e as { status: number }).status < 500) },
    );
    if (!vector || vector.length !== EMBEDDING_DIMS) {
      throw new Error(`expected ${EMBEDDING_DIMS}-d query embedding, got ${vector?.length ?? 0}`);
    }
    ctx.usage.embeddingModel = env().EMBEDDING_MODEL;
    return vector;
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("provider_unavailable", `query embedding failed: ${(e as Error).message}`, { cause: e });
  }
}

/**
 * Per-route effort for Claude (adaptive thinking is on by default on current
 * models). Grounded Q&A over provided excerpts doesn't need deep reasoning, so
 * chat runs at 'low' for latency; the agent plans multi-step work at 'medium'.
 */
export type Effort = "low" | "medium" | "high";
export function anthropicOptions(effort: Effort) {
  return { anthropic: { effort } };
}
