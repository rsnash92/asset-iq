import type { Collection } from "mongodb";
import { MONGO_INDEX_DEFINITIONS, type MongoChunkDoc } from "./mongodb";

/** Create the collection + Atlas Vector Search / Atlas Search indexes (idempotent), then wait until queryable. */
export async function ensureMongoIndexes(col: Collection<MongoChunkDoc>, timeoutMs = 120_000): Promise<void> {
  const db = col.db;
  const exists = await db.listCollections({ name: col.collectionName }).hasNext();
  if (!exists) await db.createCollection(col.collectionName);
  await col.createIndex({ ownerId: 1, documentId: 1 });

  const existing = new Set((await col.listSearchIndexes().toArray()).map((i) => i.name as string));
  for (const def of MONGO_INDEX_DEFINITIONS) {
    if (!existing.has(def.name)) {
      await col.createSearchIndex({ name: def.name, type: def.type, definition: def.definition as never });
    }
  }
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const idx = (await col.listSearchIndexes().toArray()) as { name: string; queryable?: boolean }[];
    const ready = MONGO_INDEX_DEFINITIONS.every((d) => idx.find((i) => i.name === d.name)?.queryable === true);
    if (ready) return;
    if (Date.now() > deadline) throw new Error("timed out waiting for Atlas search indexes to become queryable");
    await new Promise((r) => setTimeout(r, 1000));
  }
}
