/**
 * Typed application errors. `userMessage` is safe to show in the UI; `message`
 * (and any cause) stays server-side. Routes map these to HTTP responses.
 */
export type ErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "invalid_input"
  | "rate_limited"
  | "provider_unavailable"
  | "not_configured"
  | "not_implemented"
  | "internal";

const STATUS: Record<ErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  invalid_input: 400,
  rate_limited: 429,
  provider_unavailable: 503,
  not_configured: 503,
  not_implemented: 501,
  internal: 500,
};

const DEFAULT_USER_MESSAGE: Record<ErrorCode, string> = {
  unauthenticated: "Please sign in to continue.",
  forbidden: "You don't have access to that.",
  not_found: "We couldn't find that.",
  invalid_input: "That request wasn't valid.",
  rate_limited: "You're sending requests too quickly. Please wait a moment and try again.",
  provider_unavailable: "An AI provider is temporarily unavailable. Please try again shortly.",
  not_configured: "This feature isn't configured on the server yet.",
  not_implemented: "This isn't available yet.",
  internal: "Something went wrong on our side.",
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly userMessage: string;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    opts: { userMessage?: string; cause?: unknown; details?: Record<string, unknown> } = {},
  ) {
    super(message, { cause: opts.cause });
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.userMessage = opts.userMessage ?? DEFAULT_USER_MESSAGE[code];
    this.details = opts.details;
  }
}

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  return new AppError("internal", err instanceof Error ? err.message : String(err), { cause: err });
}

/** Public JSON body for an error — never includes stack traces or raw provider messages. */
export function errorBody(err: AppError) {
  return { error: { code: err.code, message: err.userMessage, ...(err.details ? { details: err.details } : {}) } };
}
