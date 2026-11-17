import { describe, expect, it } from "vitest";
import { costUsd, emptyUsage } from "../src/pricing";

describe("costUsd", () => {
  it("sums LLM and rerank costs; local embeddings are free", () => {
    const u = emptyUsage();
    u.llm["claude-sonnet-5-5"] = { inputTokens: 10_000, outputTokens: 500 }; // 0.02 + 0.005
    u.llm["claude-haiku-5-5"] = { inputTokens: 1_000, outputTokens: 100 }; // 0.0001 + 0.00005
    u.embeddingModel = "nomic-ai/nomic-embed-text-v1.5";
    u.embeddingTokens = 50_000; // local model: free
    u.rerankSearches = 1; // 0.002
    expect(costUsd(u)).toBeCloseTo(0.02715, 6);
  });
  it("treats unknown models as zero rather than guessing", () => {
    const u = emptyUsage();
    u.llm["mystery"] = { inputTokens: 1e6, outputTokens: 1e6 };
    expect(costUsd(u)).toBe(0);
  });
});
