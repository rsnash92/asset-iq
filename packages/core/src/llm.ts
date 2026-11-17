import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { embed } from "ai";
import { env, TIMEOUTS } from "./config";
import { AppError } from "./errors";
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

function embeddingModel() {
  const key = env().OPENAI_API_KEY;
  if (!key) throw new AppError("not_configured", "OPENAI_API_KEY is not set");
  return createOpenAI({ apiKey: key }).embedding(env().EMBEDDING_MODEL);
}

/**
 * Embed a search query with the SAME model the ingestion service used for chunks.
 * Retries are handled by the SDK (maxRetries); the whole call is bounded by a timeout.
 */
export async function embedQuery(ctx: RequestContext, text: string): Promise<number[]> {
  try {
    const { embedding, usage } = await embed({
      model: embeddingModel(),
      value: text,
      maxRetries: 2,
      abortSignal: AbortSignal.any([AbortSignal.timeout(TIMEOUTS.embed), ...(ctx.signal ? [ctx.signal] : [])]),
    });
    ctx.usage.embeddingTokens += usage?.tokens ?? 0;
    ctx.usage.embeddingModel = env().EMBEDDING_MODEL;
    return embedding;
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("provider_unavailable", `embedding failed: ${(e as Error).message}`, { cause: e });
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
