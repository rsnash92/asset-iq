import type { ChunkInput, Filters, ScoredChunk, SearchMode } from "../types";

export interface HybridSearchParams {
  ownerId: string;
  embedding: number[];
  text: string;
  filters?: Filters;
  k: number;
  /** defaults to 'hybrid'; 'vector' | 'keyword' exist for evals and debugging */
  mode?: SearchMode;
}

/**
 * The one seam between retrieval logic and the database. pgvector (Supabase) is
 * the default; MongoDB Atlas is a drop-in alternative selected by VECTOR_BACKEND.
 */
export interface VectorStore {
  readonly name: "pgvector" | "mongodb";
  upsertChunks(chunks: ChunkInput[]): Promise<void>;
  deleteByDocument(documentId: string): Promise<void>;
  hybridSearch(params: HybridSearchParams): Promise<ScoredChunk[]>;
}
