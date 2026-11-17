import { describe, expect, it } from "vitest";
import { costUsd, emptyUsage } from "../src/pricing";

describe("costUsd", () => {
  it("sums LLM, embedding and rerank costs", () => {
    const u = emptyUsage();
    u.llm["claude-sonnet-5-5"] = { inputTokens: 10_000, outputTokens: 500 }; // 0.02 + 0.005
    u.llm["claude-haiku-5-5"] = { inputTokens: 1_000, outputTokens: 100 }; // 0.0001 + 0.00005
    u.embeddingModel = "text-embedding-3-small";
    u.embeddingTokens = 50_000; // 0.001
    u.rerankSearches = 1; // 0.002
    expect(costUsd(u)).toBeCloseTo(0.02815, 6);
  });
  it("treats unknown models as zero rather than guessing", () => {
    const u = emptyUsage();
    u.llm["mystery"] = { inputTokens: 1e6, outputTokens: 1e6 };
    expect(costUsd(u)).toBe(0);
  });
});
