/**
 * Runs against a real Atlas engine: `docker compose --profile mongo up -d mongodb`
 * (mongodb/mongodb-atlas-local supports $vectorSearch and $search). Skipped if
 * MONGODB_URI is unset or unreachable.
 */
import { MongoClient } from "mongodb";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetEnvCache } from "../src/config";
import { chunksCollection, MongoAtlasStore } from "../src/vectorstore/mongodb";
import { ensureMongoIndexes } from "../src/vectorstore/mongo-admin";
import type { ChunkInput } from "../src/types";

const URI = process.env.MONGODB_URI;
async function reachable() {
  if (!URI) return false;
  const c = new MongoClient(URI, { serverSelectionTimeoutMS: 2000 });
  try {
    await c.connect();
    await c.db("admin").command({ ping: 1 });
    return true;
  } catch {
    return false;
  } finally {
    await c.close();
  }
}
const up = await reachable();

const basis = (i: number) => Array.from({ length: 768 }, (_, j) => (j === i ? 1 : j === i + 1 ? 0.1 : 0));
const chunk = (over: Partial<ChunkInput> & Pick<ChunkInput, "id" | "ownerId" | "content" | "embedding">): ChunkInput => ({
  documentId: "doc-1", chunkIndex: 0, pageStart: 1, pageEnd: 1, tokenCount: 10, title: "Doc", contentType: "guide",
  industry: "construction", publishedAt: "2022-03-01", ...over,
});

describe.skipIf(!up)("MongoAtlasStore (local Atlas)", () => {
  const store = new MongoAtlasStore();

  beforeAll(async () => {
    process.env.MONGODB_DB = "asset_iq_test";
    resetEnvCache();
    const col = await chunksCollection();
    await col.deleteMany({});
    await ensureMongoIndexes(col);
    await store.upsertChunks([
      chunk({ id: "a1", ownerId: "A", content: "Ladders should be inspected before use.", embedding: basis(0) }),
      chunk({ id: "a2", ownerId: "A", chunkIndex: 1, pageStart: 2, pageEnd: 2, content: "Scaffold inspection must happen weekly by a competent person.", embedding: basis(10) }),
      chunk({ id: "a3", ownerId: "A", documentId: "doc-2", content: "Noise at work in factories.", embedding: basis(20), contentType: "report", industry: "manufacturing", publishedAt: "2025-01-01" }),
      chunk({ id: "b1", ownerId: "B", content: "Scaffold inspection secrets of another tenant.", embedding: basis(0) }),
    ]);
    // Atlas Search and Vector Search indexes sync independently and eventually: wait
    // until BOTH can see all three of owner A's chunks before asserting on rankings.
    const deadline = Date.now() + 120_000;
    for (;;) {
      const [kw, vec] = await Promise.all([
        store.hybridSearch({ ownerId: "A", embedding: basis(0), text: "scaffold inspection noise ladders", k: 5, mode: "keyword" }),
        store.hybridSearch({ ownerId: "A", embedding: basis(0), text: "", k: 5, mode: "vector" }),
      ]);
      if (kw.length >= 3 && vec.length >= 3) break;
      if (Date.now() > deadline) throw new Error(`indexes not in sync: keyword=${kw.length} vector=${vec.length}`);
      await new Promise((res) => setTimeout(res, 1000));
    }
  });

  afterAll(async () => {
    const col = await chunksCollection();
    await col.drop().catch(() => undefined);
  });

  it("vector mode ranks the nearest chunk first and never leaks other owners", async () => {
    const r = await store.hybridSearch({ ownerId: "A", embedding: basis(0), text: "", k: 5, mode: "vector" });
    expect(r[0]!.id).toBe("a1");
    expect(r.every((c) => c.id.startsWith("a"))).toBe(true);
    expect(r[0]!.vectorRank).toBe(1);
    expect(r[0]!.keywordRank).toBeNull();
  });

  it("hybrid fuses vector and keyword hits with RRF", async () => {
    const r = await store.hybridSearch({ ownerId: "A", embedding: basis(0), text: "scaffold inspection", k: 5 });
    const ids = r.map((c) => c.id);
    expect(ids).toContain("a1"); // vector hit
    expect(ids).toContain("a2"); // keyword hit
    expect(ids).not.toContain("b1"); // other tenant, despite matching both
    const a2 = r.find((c) => c.id === "a2")!;
    expect(a2.keywordRank).toBe(1);
    expect(a2.rrfScore).toBeGreaterThan(0);
  });

  it("applies metadata filters in both retrievers", async () => {
    const r = await store.hybridSearch({
      ownerId: "A", embedding: basis(0), text: "noise factories", k: 5,
      filters: { contentTypes: ["report"], industries: ["manufacturing"], after: "2024-01-01" },
    });
    expect(r.map((c) => c.id)).toEqual(["a3"]);
    expect(r[0]!.publishedAt).toBe("2025-01-01");
  });

  it("deleteByDocument removes a document's chunks", async () => {
    await store.deleteByDocument("doc-2");
    const col = await chunksCollection();
    expect(await col.countDocuments({ documentId: "doc-2" })).toBe(0);
  });
});
