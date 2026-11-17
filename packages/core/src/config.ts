import { z } from "zod";

/**
 * Server-side configuration, parsed lazily from process.env so that importing a
 * module never throws at build time — only using a missing value does.
 */
const EnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  CHAT_MODEL: z.string().default("claude-sonnet-5-5"),
  FAST_MODEL: z.string().default("claude-haiku-5-5"),
  EMBEDDING_MODEL: z.string().default("nomic-ai/nomic-embed-text-v1.5"),
  /** service that owns the embedding model (POST /embed); defaults to the ingest service */
  EMBEDDINGS_URL: z.string().optional(),
  COHERE_API_KEY: z.string().optional(),
  RERANK_MODEL: z.string().default("rerank-v3.5"),
  RERANK_ENABLED: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  VECTOR_BACKEND: z.enum(["pgvector", "mongodb"]).default("pgvector"),
  MONGODB_URI: z.string().optional(),
  MONGODB_DB: z.string().default("asset_iq"),
  INGEST_SERVICE_URL: z.string().optional(),
  INGEST_SHARED_SECRET: z.string().optional(),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(600),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;
export function env(): Env {
  cached ??= EnvSchema.parse(process.env);
  return cached;
}

/** Test helper: reset the memoised env after mutating process.env. */
export function resetEnvCache() {
  cached = undefined;
}

export function supabaseUrl(): string {
  const e = env();
  const url = e.SUPABASE_URL ?? e.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL is not set");
  return url;
}

/** Must match vector(768) in the schema and the ingest service's model. */
export const EMBEDDING_DIMS = 768;

/** Retrieval defaults (see docs/DECISIONS.md). */
export const RETRIEVAL = {
  /** chunks given to the answer model */
  answerK: 8,
  /** candidates handed to the reranker */
  rerankCandidates: 30,
  /** per-retriever candidate depth inside match_chunks_hybrid */
  candidateCount: 50,
  rrfK: 60,
} as const;

/** Timeouts for every external call (ms). */
export const TIMEOUTS = {
  embed: 15_000,
  rerank: 10_000,
  fastLlm: 20_000,
  chatLlm: 90_000,
  db: 15_000,
} as const;
