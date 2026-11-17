import "server-only";
import {
  ANSWER_SYSTEM_PROMPT,
  buildGroundedUserMessage,
  numberSources,
  retrieve,
  rewriteFollowUp,
  type Backend,
  type Filters,
  type RequestContext,
  type SearchMode,
  type Turn,
} from "@asset-iq/core";
import type { ModelMessage, UIMessage } from "ai";
import type { SourcesData } from "./chat-types";

/** Conversation memory: the last 6 messages (≈3 exchanges) are sent to the model. */
export const HISTORY_MESSAGES = 6;

export function uiMessagesToTurns(messages: UIMessage[]): Turn[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      text: m.parts
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("\n")
        .trim(),
    }))
    .filter((t) => t.text.length > 0);
}

export interface GroundedPrep {
  system: string;
  messages: ModelMessage[];
  sourcesData: SourcesData;
}

/**
 * Shared by /api/chat (streamed) and /api/answer (JSON, for evals):
 * rewrite follow-up → retrieve → number excerpts → build model messages.
 */
export async function prepareGroundedAnswer(
  ctx: RequestContext,
  turns: Turn[],
  opts: { filters?: Filters; k?: number; mode?: SearchMode; rerank?: boolean; backend?: Backend } = {},
): Promise<GroundedPrep> {
  const recent = turns.slice(-HISTORY_MESSAGES);
  const question = recent.at(-1)!.text;
  const standaloneQuery = await rewriteFollowUp(ctx, recent);
  const r = await retrieve(ctx, { query: standaloneQuery, ...opts });
  const numbered = numberSources(r.chunks);

  const history: ModelMessage[] = recent.slice(0, -1).map((t) => ({ role: t.role, content: t.text }));
  const messages: ModelMessage[] = [...history, { role: "user", content: buildGroundedUserMessage(question, numbered) }];

  return {
    system: ANSWER_SYSTEM_PROMPT,
    messages,
    sourcesData: {
      standaloneQuery,
      reranked: r.reranked,
      backend: r.backend,
      mode: r.mode,
      timings: r.timings,
      sources: numbered.map((s, i) => {
        const c = r.chunks[i]!;
        return {
          ...s,
          contentType: c.contentType,
          industry: c.industry,
          publishedAt: c.publishedAt,
          vectorRank: c.vectorRank,
          keywordRank: c.keywordRank,
          vectorScore: c.vectorScore,
          keywordScore: c.keywordScore,
          rrfScore: c.rrfScore,
          rerankScore: c.rerankScore,
        };
      }),
    },
  };
}
