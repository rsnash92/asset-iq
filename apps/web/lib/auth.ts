import "server-only";
import { AppError, createContext, type Db, type RequestContext } from "@asset-iq/core";
import { createClient, createClientForToken } from "@/lib/supabase/server";

/**
 * Resolve the caller for an API route. Browser requests use the session cookie;
 * scripts (evals) may send `Authorization: Bearer <supabase access token>`.
 * Either way the returned `db` is user-scoped, so RLS applies to every query.
 */
export async function requireUser(req: Request): Promise<{ db: Db; userId: string; ctx: RequestContext }> {
  const header = req.headers.get("authorization");
  const bearer = header?.match(/^Bearer\s+(.+)$/i)?.[1];
  const db = (bearer ? createClientForToken(bearer) : await createClient()) as unknown as Db;
  const { data, error } = await db.auth.getUser(bearer);
  if (error || !data.user) throw new AppError("unauthenticated", "no valid session");
  return { db, userId: data.user.id, ctx: createContext(db, data.user.id, req.signal) };
}
