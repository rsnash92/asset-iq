import type { UIMessage } from "ai";
import type { NumberedSource } from "@asset-iq/core/prompts";

/** Retrieval details streamed to the client ahead of the answer (citations + debug panel). */
export interface SourcesData {
  standaloneQuery: string;
  reranked: boolean;
  backend: string;
  mode: string;
  timings: { embedMs: number; searchMs: number; rerankMs: number };
  sources: (NumberedSource & {
    contentType: string;
    industry: string | null;
    publishedAt: string | null;
    vectorRank: number | null;
    keywordRank: number | null;
    vectorScore: number | null;
    keywordScore: number | null;
    rrfScore: number;
    rerankScore: number | null;
  })[];
}

export type ChatUIMessage = UIMessage<never, { sources: SourcesData }>;
