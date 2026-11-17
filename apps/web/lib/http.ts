import "server-only";
import { AppError, errorBody, toAppError } from "@asset-iq/core";
import type { z } from "zod";

export function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

/** Map any thrown error to a safe JSON response (no stack traces leave the server). */
export function errorResponse(e: unknown): Response {
  const err = toAppError(e);
  if (err.status >= 500) console.error(`[api] ${err.code}: ${err.message}`, err.cause ?? "");
  const headers: Record<string, string> = {};
  if (err.code === "rate_limited" && typeof err.details?.resetAt === "string") {
    headers["Retry-After"] = String(Math.max(1, Math.ceil((Date.parse(err.details.resetAt) - Date.now()) / 1000)));
  }
  return Response.json(errorBody(err), { status: err.status, headers });
}

export async function parseJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new AppError("invalid_input", "body is not JSON", { userMessage: "Request body must be JSON." });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError("invalid_input", parsed.error.message, {
      userMessage: "Some fields were invalid.",
      details: { issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
    });
  }
  return parsed.data;
}
