import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { emptyUsage, type UsageTotals } from "./pricing";

export type Db = SupabaseClient<Database>;

export interface ToolCallLog {
  tool: string;
  input: unknown;
  ms: number;
  ok: boolean;
  error?: string;
}

/**
 * Everything a retrieval/agent operation needs. `db` is either a user-scoped
 * client (RLS enforced — the web app) or a service-role client (MCP server,
 * evals); in both cases every query ALSO filters by `ownerId` explicitly, so
 * isolation never depends on which client was passed in.
 */
export interface RequestContext {
  db: Db;
  ownerId: string;
  usage: UsageTotals;
  toolCalls: ToolCallLog[];
  retrievedChunkIds: Set<string>;
  signal?: AbortSignal;
}

export function createContext(db: Db, ownerId: string, signal?: AbortSignal): RequestContext {
  return { db, ownerId, usage: emptyUsage(), toolCalls: [], retrievedChunkIds: new Set(), signal };
}

export function addLlmUsage(
  ctx: RequestContext,
  model: string,
  usage: { inputTokens?: number | undefined; outputTokens?: number | undefined } | undefined,
) {
  if (!usage) return;
  const t = (ctx.usage.llm[model] ??= { inputTokens: 0, outputTokens: 0 });
  t.inputTokens += usage.inputTokens ?? 0;
  t.outputTokens += usage.outputTokens ?? 0;
}
