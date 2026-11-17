import { logQuery, retrieve } from "@asset-iq/core";
import { requireUser } from "@/lib/auth";
import { errorResponse, json, parseJson } from "@/lib/http";
import { SearchBodySchema } from "@/lib/schemas";

export const runtime = "nodejs";

/** Search-only mode for the UI and the eval runner. Returns every score for debugging. */
export async function POST(req: Request) {
  const started = Date.now();
  let user: Awaited<ReturnType<typeof requireUser>> | undefined;
  let query = "";
  try {
    user = await requireUser(req);
    const body = await parseJson(req, SearchBodySchema);
    query = body.query;
    const r = await retrieve(user.ctx, { query: body.query, filters: body.filters, k: body.k ?? 8, mode: body.mode, rerank: body.rerank, backend: body.backend });
    const latencyMs = Date.now() - started;
    await logQuery(user.db, user.ctx, {
      kind: req.headers.get("x-asset-iq-eval") ? "eval" : "search",
      query,
      latencyMs,
      metadata: { mode: r.mode, backend: r.backend, reranked: r.reranked, timings: r.timings },
    });
    return json({
      results: r.chunks,
      reranked: r.reranked,
      backend: r.backend,
      mode: r.mode,
      timings: r.timings,
      latencyMs,
    });
  } catch (e) {
    if (user) await logQuery(user.db, user.ctx, { kind: "search", query, latencyMs: Date.now() - started, error: String((e as Error).message) });
    return errorResponse(e);
  }
}
