import { describe, expect, it } from "vitest";
import { textPipeline, vectorFilter, vectorPipeline } from "../src/vectorstore/mongodb";

const base = { ownerId: "u1", embedding: [0.1, 0.2], text: "contractor safety", k: 5 };

describe("mongodb pipelines", () => {
  it("always filters by owner", () => {
    expect(vectorFilter(base)).toEqual({ ownerId: { $eq: "u1" } });
    const search = textPipeline(base, 50)[0] as { $search: { compound: { filter: unknown[] } } };
    expect(search.$search.compound.filter[0]).toEqual({ equals: { path: "ownerId", value: "u1" } });
  });

  it("maps metadata filters into $vectorSearch and $search", () => {
    const p = { ...base, filters: { contentTypes: ["guide" as const], industries: ["construction"], after: "2020-01-01" } };
    const vf = vectorFilter(p) as { $and: unknown[] };
    expect(vf.$and).toHaveLength(4);
    const vs = vectorPipeline(p, 50)[0] as { $vectorSearch: { limit: number; numCandidates: number } };
    expect(vs.$vectorSearch.limit).toBe(50);
    expect(vs.$vectorSearch.numCandidates).toBeGreaterThanOrEqual(200);
    const ts = textPipeline(p, 50)[0] as { $search: { compound: { filter: Record<string, unknown>[] } } };
    expect(ts.$search.compound.filter.map((f) => Object.keys(f)[0])).toEqual(["equals", "in", "in", "range"]);
  });

  it("never returns the embedding vector to the app", () => {
    expect(vectorPipeline(base, 10).at(-1)).toEqual({ $project: { embedding: 0 } });
  });
});
