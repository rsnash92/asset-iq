import { env } from "../config";
import type { Db } from "../context";
import type { Backend } from "../types";
import { MongoAtlasStore } from "./mongodb";
import { PgVectorStore } from "./pgvector";
import type { VectorStore } from "./types";

export type { VectorStore, HybridSearchParams } from "./types";
export { PgVectorStore, toVectorLiteral } from "./pgvector";
export { MongoAtlasStore } from "./mongodb";
export { reciprocalRankFusion } from "./rrf";

export function getVectorStore(db: Db, backend: Backend = env().VECTOR_BACKEND): VectorStore {
  return backend === "mongodb" ? new MongoAtlasStore() : new PgVectorStore(db);
}
