/** Same behavioural contract as the Mongo test, against local Supabase (pnpm db:start). */
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../src/database.types";
import type { Db } from "../src/context";
import { PgVectorStore, toVectorLiteral } from "../src/vectorstore/pgvector";

const URL_ = process.env.SUPABASE_URL ?? "http://127.0.0.1:55321";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const up = SERVICE ? await fetch(`${URL_}/auth/v1/health`, { headers: { apikey: SERVICE } }).then((r) => r.ok, () => false) : false;

const basis = (i: number) => Array.from({ length: 1536 }, (_, j) => (j === i ? 1 : j === i + 1 ? 0.1 : 0));

describe.skipIf(!up)("PgVectorStore (local Supabase)", () => {
  const admin = up ? createClient<Database>(URL_, SERVICE!, { auth: { persistSession: false } }) : (null as never);
  const store = new PgVectorStore(admin as unknown as Db);
  const users: string[] = [];
  let A = "";

  beforeAll(async () => {
    const mk = async () => {
      const { data, error } = await admin.auth.admin.createUser({ email: `pg-${crypto.randomUUID()}@test.local`, email_confirm: true });
      if (error) throw error;
      users.push(data.user.id);
      return data.user.id;
    };
    A = await mk();
    const B = await mk();
    const doc = async (owner: string, over: Partial<Database["public"]["Tables"]["documents"]["Insert"]> = {}) =>
      (await admin.from("documents").insert({ owner_id: owner, title: "Doc", storage_path: "x", content_type: "guide", industry: "construction", status: "ready", published_at: "2022-03-01", ...over }).select("id").single().throwOnError()).data!.id;
    const d1 = await doc(A);
    const d2 = await doc(A, { content_type: "report", industry: "manufacturing", published_at: "2025-01-01" });
    const dB = await doc(B);
    const ch = (document_id: string, owner_id: string, chunk_index: number, content: string, e: number[]) => ({
      document_id, owner_id, chunk_index, page_start: chunk_index + 1, page_end: chunk_index + 1, content, token_count: 10, embedding: toVectorLiteral(e),
    });
    await admin.from("chunks").insert([
      ch(d1, A, 0, "Ladders should be inspected before use.", basis(0)),
      ch(d1, A, 1, "Scaffold inspection must happen weekly by a competent person.", basis(10)),
      ch(d2, A, 0, "Noise at work in factories.", basis(20)),
      ch(dB, B, 0, "Scaffold inspection secrets of another tenant.", basis(0)),
    ]).throwOnError();
  });

  afterAll(async () => {
    for (const u of users) await admin.auth.admin.deleteUser(u);
  });

  it("vector mode ranks the nearest chunk first and never leaks other owners", async () => {
    const r = await store.hybridSearch({ ownerId: A, embedding: basis(0), text: "", k: 5, mode: "vector" });
    expect(r[0]!.content).toMatch(/^Ladders/);
    expect(r.some((c) => c.content.includes("another tenant"))).toBe(false);
    expect(r[0]!.vectorRank).toBe(1);
    expect(r[0]!.keywordRank).toBeNull();
  });

  it("hybrid fuses vector and keyword hits with RRF", async () => {
    const r = await store.hybridSearch({ ownerId: A, embedding: basis(0), text: "how often is scaffold inspection?", k: 5 });
    const scaffold = r.find((c) => c.content.startsWith("Scaffold"))!;
    expect(scaffold.keywordRank).toBe(1);
    expect(r[0]!.vectorRank === 1 || r[0]!.keywordRank === 1).toBe(true);
    expect(r.some((c) => c.content.includes("another tenant"))).toBe(false);
  });

  it("applies metadata filters", async () => {
    const r = await store.hybridSearch({
      ownerId: A, embedding: basis(0), text: "noise factories", k: 5,
      filters: { contentTypes: ["report"], industries: ["manufacturing"], after: "2024-01-01" },
    });
    expect(r.map((c) => c.content)).toEqual(["Noise at work in factories."]);
  });
});
