/**
 * USD per 1M tokens. Source: Anthropic public price list (Nov 2026).
 * Keep in config, not code paths, so cost reporting can be audited and updated.
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5-5": { input: 2.0, output: 10.0 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-opus-5-5": { input: 4.0, output: 20.0 },
};

/** Local open-source embeddings run on our own CPU: no per-token charge. */
export const EMBEDDING_PRICING: Record<string, number> = {
  "nomic-ai/nomic-embed-text-v1.5": 0,
};

/** Cohere Rerank is billed per search (1 query × ≤100 docs). */
export const RERANK_PRICE_PER_SEARCH = 0.002;

export interface UsageTotals {
  /** keyed by model id */
  llm: Record<string, { inputTokens: number; outputTokens: number }>;
  embeddingTokens: number;
  embeddingModel?: string;
  rerankSearches: number;
}

export function emptyUsage(): UsageTotals {
  return { llm: {}, embeddingTokens: 0, rerankSearches: 0 };
}

export function costUsd(u: UsageTotals): number {
  let total = 0;
  for (const [model, t] of Object.entries(u.llm)) {
    const p = MODEL_PRICING[model];
    if (!p) continue; // unknown model: reported as 0 rather than guessed
    total += (t.inputTokens * p.input + t.outputTokens * p.output) / 1_000_000;
  }
  if (u.embeddingModel) {
    total += (u.embeddingTokens * (EMBEDDING_PRICING[u.embeddingModel] ?? 0)) / 1_000_000;
  }
  total += u.rerankSearches * RERANK_PRICE_PER_SEARCH;
  return Math.round(total * 1e6) / 1e6;
}
