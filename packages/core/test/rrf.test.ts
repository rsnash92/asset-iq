import { describe, expect, it } from "vitest";
import { reciprocalRankFusion } from "../src/vectorstore/rrf";

const list = (...ids: string[]) => ids.map((id, i) => ({ id, item: id, score: 1 - i * 0.1 }));

describe("reciprocalRankFusion", () => {
  it("rewards items that appear in both lists", () => {
    const fused = reciprocalRankFusion([list("a", "b", "c"), list("c", "d")], 60);
    expect(fused[0]!.id).toBe("c"); // rank 3 + rank 1 beats rank 1 alone
    expect(fused[0]!.rrfScore).toBeCloseTo(1 / 63 + 1 / 61, 10);
    expect(fused[0]!.ranks).toEqual([3, 1]);
  });

  it("keeps per-list ranks and scores, null when absent", () => {
    const fused = reciprocalRankFusion([list("a"), list("b")], 60);
    const a = fused.find((f) => f.id === "a")!;
    expect(a.ranks).toEqual([1, null]);
    expect(a.scores).toEqual([1, null]);
  });

  it("breaks ties deterministically by first-list rank", () => {
    const fused = reciprocalRankFusion([list("x", "y"), list("y", "x")], 60);
    expect(fused.map((f) => f.id)).toEqual(["x", "y"]);
  });

  it("ignores duplicate ids within a list", () => {
    const fused = reciprocalRankFusion([[...list("a"), ...list("a")]], 60);
    expect(fused).toHaveLength(1);
    expect(fused[0]!.rrfScore).toBeCloseTo(1 / 61, 10);
  });

  it("degenerates to the single list order (vector-only mode)", () => {
    const fused = reciprocalRankFusion([list("a", "b", "c"), []], 60);
    expect(fused.map((f) => f.id)).toEqual(["a", "b", "c"]);
  });
});
