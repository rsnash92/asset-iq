/**
 * Mirror chunks from Postgres (system of record) into MongoDB Atlas, then make
 * sure the search indexes exist. Idempotent: upserts by chunk id and removes
 * Mongo chunks whose document no longer exists or is not ready.
 *
 *   pnpm --filter @asset-iq/core mongo:sync          # all users
 *   pnpm --filter @asset-iq/core mongo:sync <ownerId> # one user
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/database.types";
import { supabaseUrl } from "../src/config";
import { chunksCollection, MongoAtlasStore } from "../src/vectorstore/mongodb";
import { ensureMongoIndexes } from "../src/vectorstore/mongo-admin";
import type { ChunkInput } from "../src/types";

const PAGE = 500;

function parseVector(v: unknown): number[] {
  if (Array.isArray(v)) return v as number[];
  return JSON.parse(String(v)) as number[];
}

async function main() {
  const owner = process.argv[2];
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
  const pg = createClient<Database>(supabaseUrl(), key, { auth: { persistSession: false } });
  const store = new MongoAtlasStore();
  const col = await chunksCollection();
  await ensureMongoIndexes(col);

  let docsQ = pg.from("documents").select("id,owner_id,title,content_type,industry,published_at,external_ref").eq("status", "ready");
  if (owner) docsQ = docsQ.eq("owner_id", owner);
  const { data: docs, error } = await docsQ;
  if (error) throw error;

  let total = 0;
  for (const d of docs ?? []) {
    for (let from = 0; ; from += PAGE) {
      const { data: rows, error: e } = await pg
        .from("chunks")
        .select("id,chunk_index,page_start,page_end,content,token_count,embedding")
        .eq("document_id", d.id)
        .order("chunk_index")
        .range(from, from + PAGE - 1);
      if (e) throw e;
      if (!rows?.length) break;
      const batch: ChunkInput[] = rows.map((r) => ({
        id: r.id,
        documentId: d.id,
        ownerId: d.owner_id,
        chunkIndex: r.chunk_index,
        pageStart: r.page_start,
        pageEnd: r.page_end,
        content: r.content,
        tokenCount: r.token_count,
        embedding: parseVector(r.embedding),
        title: d.title,
        contentType: d.content_type,
        industry: d.industry,
        publishedAt: d.published_at,
      }));
      await store.upsertChunks(batch);
      // externalRef is denormalised too so eval results map identically on both backends
      if (d.external_ref) await col.updateMany({ documentId: d.id }, { $set: { externalRef: d.external_ref } });
      total += batch.length;
      if (rows.length < PAGE) break;
    }
  }

  const keep = (docs ?? []).map((d) => d.id);
  const removed = await col.deleteMany({ ...(owner ? { ownerId: owner } : {}), documentId: { $nin: keep } });
  console.log(`mongo-sync: upserted ${total} chunks from ${docs?.length ?? 0} documents; removed ${removed.deletedCount} stale chunks`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
