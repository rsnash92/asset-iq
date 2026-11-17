import type { Db } from "../context";
import { AppError } from "../errors";
import { RETRIEVAL } from "../config";
import type { ChunkInput, ScoredChunk } from "../types";
import type { HybridSearchParams, VectorStore } from "./types";

/** pgvector literal: '[0.1,0.2,...]' — PostgREST casts text → vector. */
export function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}

export class PgVectorStore implements VectorStore {
  readonly name = "pgvector" as const;
  constructor(private readonly db: Db) {}

  async upsertChunks(chunks: ChunkInput[]): Promise<void> {
    if (chunks.length === 0) return;
    const { error } = await this.db.from("chunks").upsert(
      chunks.map((c) => ({
        id: c.id,
        document_id: c.documentId,
        owner_id: c.ownerId,
        chunk_index: c.chunkIndex,
        page_start: c.pageStart,
        page_end: c.pageEnd,
        content: c.content,
        token_count: c.tokenCount,
        embedding: toVectorLiteral(c.embedding),
      })),
    );
    if (error) throw new AppError("internal", `pgvector upsert failed: ${error.message}`);
  }

  async deleteByDocument(documentId: string): Promise<void> {
    const { error } = await this.db.from("chunks").delete().eq("document_id", documentId);
    if (error) throw new AppError("internal", `pgvector delete failed: ${error.message}`);
  }

  async hybridSearch(p: HybridSearchParams): Promise<ScoredChunk[]> {
    const f = p.filters ?? {};
    const { data, error } = await this.db.rpc("match_chunks_hybrid", {
      query_embedding: toVectorLiteral(p.embedding),
      query_text: p.text,
      match_count: p.k,
      filter_owner: p.ownerId,
      filter_content_type: f.contentTypes?.length ? f.contentTypes : undefined,
      filter_industry: f.industries?.length ? f.industries : undefined,
      filter_after: f.after,
      filter_before: f.before,
      filter_document_ids: f.documentIds?.length ? f.documentIds : undefined,
      search_mode: p.mode ?? "hybrid",
      candidate_count: RETRIEVAL.candidateCount,
      rrf_k: RETRIEVAL.rrfK,
    });
    if (error) throw new AppError("internal", `match_chunks_hybrid failed: ${error.message}`);
    return (data ?? []).map((r) => ({
      id: r.id,
      documentId: r.document_id,
      chunkIndex: r.chunk_index,
      pageStart: r.page_start,
      pageEnd: r.page_end,
      content: r.content,
      tokenCount: r.token_count,
      title: r.document_title,
      contentType: r.content_type,
      industry: r.industry,
      publishedAt: r.published_at,
      externalRef: r.external_ref,
      vectorRank: r.vector_rank,
      keywordRank: r.keyword_rank,
      vectorScore: r.vector_score,
      keywordScore: r.keyword_score,
      rrfScore: r.rrf_score,
      rerankScore: null,
    }));
  }
}
