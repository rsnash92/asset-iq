import type { Db, RequestContext } from "./context";
import { costUsd } from "./pricing";

export type QueryKind = "chat" | "agent" | "search" | "eval";

/**
 * One query_logs row per request: tokens, cost, latency, retrieved chunk IDs,
 * errors. Logging must never break the user's request, so failures are swallowed.
 */
export async function logQuery(
  db: Db,
  ctx: RequestContext,
  row: { kind: QueryKind; query: string; latencyMs: number; error?: string | null; metadata?: Record<string, unknown> },
): Promise<void> {
  const models = Object.keys(ctx.usage.llm);
  const inputTokens = Object.values(ctx.usage.llm).reduce((s, t) => s + t.inputTokens, 0);
  const outputTokens = Object.values(ctx.usage.llm).reduce((s, t) => s + t.outputTokens, 0);
  const { error } = await db.from("query_logs").insert({
    user_id: ctx.ownerId,
    kind: row.kind,
    query: row.query.slice(0, 4000),
    retrieved_chunk_ids: [...ctx.retrievedChunkIds],
    model: models.join(",") || null,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    embedding_tokens: ctx.usage.embeddingTokens,
    cost_usd: costUsd(ctx.usage),
    latency_ms: Math.round(row.latencyMs),
    error: row.error ?? null,
    metadata: JSON.parse(
      JSON.stringify({
        ...row.metadata,
        usage_by_model: ctx.usage.llm,
        rerank_searches: ctx.usage.rerankSearches,
        tool_calls: ctx.toolCalls.length ? ctx.toolCalls : undefined,
      }),
    ),
  });
  if (error) console.error("[logQuery] failed to write query_logs:", error.message);
}
