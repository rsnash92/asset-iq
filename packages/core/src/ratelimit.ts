import { env } from "./config";
import type { Db } from "./context";
import { AppError } from "./errors";

/**
 * Postgres-backed fixed-window limiter (consume_rate_limit RPC). Chosen over
 * Upstash to avoid another paid service; one atomic upsert per request is cheap.
 * Fails OPEN on database errors — availability over strictness for a limiter.
 */
export async function enforceRateLimit(
  db: Db,
  bucket: "chat" | "agent" | "mcp" | "answer",
  opts: { userId?: string; limit?: number } = {},
): Promise<{ remaining: number; resetAt: string } | null> {
  const { RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_SECONDS } = env();
  const { data, error } = await db.rpc("consume_rate_limit", {
    p_bucket: bucket,
    p_limit: opts.limit ?? RATE_LIMIT_MAX,
    p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
    p_user_id: opts.userId,
  });
  if (error || !data?.[0]) {
    console.error("[ratelimit] check failed, allowing request:", error?.message);
    return null;
  }
  const row = data[0];
  if (!row.allowed) {
    throw new AppError("rate_limited", `rate limit exceeded for ${bucket}`, {
      details: { resetAt: row.reset_at },
    });
  }
  return { remaining: row.remaining, resetAt: row.reset_at };
}
