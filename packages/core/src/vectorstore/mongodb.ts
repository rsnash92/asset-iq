import { MongoClient, type Collection, type Document } from "mongodb";
import { EMBEDDING_DIMS, env, RETRIEVAL } from "../config";
import { AppError } from "../errors";
import type { ChunkInput, ScoredChunk } from "../types";
import { reciprocalRankFusion, type Ranked } from "./rrf";
import type { HybridSearchParams, VectorStore } from "./types";

/**
 * MongoDB Atlas backend. Postgres stays the system of record (documents, auth,
 * logs); Mongo holds a denormalised mirror of chunks for vector + text search.
 *
 * Atlas cannot fuse $vectorSearch and $search in one stage on all tiers, so we
 * run both aggregations in parallel and fuse with the same RRF (k=60) as SQL.
 */
export const MONGO_VECTOR_INDEX = "chunks_vector";
export const MONGO_TEXT_INDEX = "chunks_text";

export interface MongoChunkDoc {
  _id: string;
  documentId: string;
  ownerId: string;
  chunkIndex: number;
  pageStart: number;
  pageEnd: number;
  content: string;
  tokenCount: number;
  embedding: number[];
  title: string;
  contentType: string;
  industry: string | null;
  publishedAt: Date | null;
  externalRef?: string | null;
}

/** Index definitions, applied by `scripts/mongo-setup.ts`. */
export const MONGO_INDEX_DEFINITIONS = [
  {
    name: MONGO_VECTOR_INDEX,
    type: "vectorSearch",
    definition: {
      fields: [
        { type: "vector", path: "embedding", numDimensions: EMBEDDING_DIMS, similarity: "cosine" },
        { type: "filter", path: "ownerId" },
        { type: "filter", path: "contentType" },
        { type: "filter", path: "industry" },
        { type: "filter", path: "publishedAt" },
        { type: "filter", path: "documentId" },
      ],
    },
  },
  {
    name: MONGO_TEXT_INDEX,
    type: "search",
    definition: {
      mappings: {
        dynamic: false,
        fields: {
          content: { type: "string", analyzer: "lucene.english" },
          ownerId: { type: "token" },
          contentType: { type: "token" },
          industry: { type: "token" },
          documentId: { type: "token" },
          publishedAt: { type: "date" },
        },
      },
    },
  },
] as const;

let clientPromise: Promise<MongoClient> | undefined;
async function getClient(): Promise<MongoClient> {
  const uri = env().MONGODB_URI;
  if (!uri) throw new AppError("not_implemented", "MONGODB_URI is not set", { userMessage: "The MongoDB backend isn't configured." });
  clientPromise ??= new MongoClient(uri, { serverSelectionTimeoutMS: 8_000 }).connect();
  return clientPromise;
}

export async function chunksCollection(): Promise<Collection<MongoChunkDoc>> {
  const client = await getClient();
  return client.db(env().MONGODB_DB).collection<MongoChunkDoc>("chunks");
}

export class MongoAtlasStore implements VectorStore {
  readonly name = "mongodb" as const;

  async upsertChunks(chunks: ChunkInput[]): Promise<void> {
    if (chunks.length === 0) return;
    const col = await chunksCollection();
    await col.bulkWrite(
      chunks.map((c) => ({
        replaceOne: {
          filter: { _id: c.id },
          replacement: {
            _id: c.id,
            documentId: c.documentId,
            ownerId: c.ownerId,
            chunkIndex: c.chunkIndex,
            pageStart: c.pageStart,
            pageEnd: c.pageEnd,
            content: c.content,
            tokenCount: c.tokenCount,
            embedding: c.embedding,
            title: c.title,
            contentType: c.contentType,
            industry: c.industry,
            publishedAt: c.publishedAt ? new Date(c.publishedAt) : null,
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }

  async deleteByDocument(documentId: string): Promise<void> {
    const col = await chunksCollection();
    await col.deleteMany({ documentId });
  }

  async hybridSearch(p: HybridSearchParams): Promise<ScoredChunk[]> {
    const col = await chunksCollection();
    const mode = p.mode ?? "hybrid";
    const n = RETRIEVAL.candidateCount;

    const [vector, keyword] = await Promise.all([
      mode === "keyword" ? [] : col.aggregate<MongoChunkDoc & { score: number }>(vectorPipeline(p, n)).toArray(),
      mode === "vector" ? [] : col.aggregate<MongoChunkDoc & { score: number }>(textPipeline(p, n)).toArray(),
    ]);

    const toRanked = (rows: (MongoChunkDoc & { score: number })[]): Ranked<MongoChunkDoc>[] =>
      rows.map((r) => ({ id: r._id, item: r, score: r.score }));

    return reciprocalRankFusion([toRanked(vector), toRanked(keyword)], RETRIEVAL.rrfK)
      .slice(0, p.k)
      .map((f) => ({
        id: f.id,
        documentId: f.item.documentId,
        chunkIndex: f.item.chunkIndex,
        pageStart: f.item.pageStart,
        pageEnd: f.item.pageEnd,
        content: f.item.content,
        tokenCount: f.item.tokenCount,
        title: f.item.title,
        contentType: f.item.contentType,
        industry: f.item.industry,
        publishedAt: f.item.publishedAt ? f.item.publishedAt.toISOString().slice(0, 10) : null,
        externalRef: f.item.externalRef ?? null,
        vectorRank: f.ranks[0] ?? null,
        keywordRank: f.ranks[1] ?? null,
        vectorScore: f.scores[0] ?? null,
        keywordScore: f.scores[1] ?? null,
        rrfScore: f.rrfScore,
        rerankScore: null,
      }));
  }
}

const PROJECT_WITHOUT_EMBEDDING = { embedding: 0 } as const;

export function vectorFilter(p: HybridSearchParams): Document {
  const f = p.filters ?? {};
  const and: Document[] = [{ ownerId: { $eq: p.ownerId } }];
  if (f.contentTypes?.length) and.push({ contentType: { $in: f.contentTypes } });
  if (f.industries?.length) and.push({ industry: { $in: f.industries } });
  if (f.documentIds?.length) and.push({ documentId: { $in: f.documentIds } });
  if (f.after) and.push({ publishedAt: { $gte: new Date(f.after) } });
  if (f.before) and.push({ publishedAt: { $lte: new Date(f.before) } });
  return and.length === 1 ? and[0]! : { $and: and };
}

export function vectorPipeline(p: HybridSearchParams, limit: number): Document[] {
  return [
    {
      $vectorSearch: {
        index: MONGO_VECTOR_INDEX,
        path: "embedding",
        queryVector: p.embedding,
        numCandidates: Math.max(limit * 10, 200),
        limit,
        filter: vectorFilter(p),
      },
    },
    { $set: { score: { $meta: "vectorSearchScore" } } },
    { $project: PROJECT_WITHOUT_EMBEDDING },
  ];
}

export function textPipeline(p: HybridSearchParams, limit: number): Document[] {
  const f = p.filters ?? {};
  const filter: Document[] = [{ equals: { path: "ownerId", value: p.ownerId } }];
  if (f.contentTypes?.length) filter.push({ in: { path: "contentType", value: f.contentTypes } });
  if (f.industries?.length) filter.push({ in: { path: "industry", value: f.industries } });
  if (f.documentIds?.length) filter.push({ in: { path: "documentId", value: f.documentIds } });
  if (f.after || f.before) {
    filter.push({
      range: {
        path: "publishedAt",
        ...(f.after ? { gte: new Date(f.after) } : {}),
        ...(f.before ? { lte: new Date(f.before) } : {}),
      },
    });
  }
  return [
    { $search: { index: MONGO_TEXT_INDEX, compound: { must: [{ text: { query: p.text, path: "content" } }], filter } } },
    { $limit: limit },
    { $set: { score: { $meta: "searchScore" } } },
    { $project: PROJECT_WITHOUT_EMBEDDING },
  ];
}
