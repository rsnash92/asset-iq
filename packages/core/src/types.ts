import { z } from "zod";

export const CONTENT_TYPES = ["whitepaper", "case_study", "webinar", "ebook", "guide", "report", "other"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

/** Canonical industry key: "Oil and Gas" -> "oil-and-gas". Same rule as the upload form. */
export function normaliseIndustry(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const FiltersSchema = z
  .object({
    contentTypes: z.array(z.enum(CONTENT_TYPES)).max(7).optional(),
    industries: z.array(z.string().min(1).max(60).transform(normaliseIndustry)).max(20).optional(),
    after: isoDate.optional(),
    before: isoDate.optional(),
    documentIds: z.array(z.string().uuid()).max(50).optional(),
  })
  .strict();
export type Filters = z.infer<typeof FiltersSchema>;

export const SearchModeSchema = z.enum(["vector", "keyword", "hybrid"]);
export type SearchMode = z.infer<typeof SearchModeSchema>;

export const BackendSchema = z.enum(["pgvector", "mongodb"]);
export type Backend = z.infer<typeof BackendSchema>;

/** A chunk as written by ingestion (also the shape mirrored into MongoDB). */
export interface ChunkInput {
  id: string;
  documentId: string;
  ownerId: string;
  chunkIndex: number;
  pageStart: number;
  pageEnd: number;
  content: string;
  tokenCount: number;
  embedding: number[];
  /** denormalised document metadata, needed for filtering in stores without joins */
  title: string;
  contentType: string;
  industry: string | null;
  publishedAt: string | null;
}

/** A retrieved chunk with document metadata and every score we have for debugging. */
export interface ScoredChunk {
  id: string;
  documentId: string;
  chunkIndex: number;
  pageStart: number;
  pageEnd: number;
  content: string;
  tokenCount: number;
  title: string;
  contentType: string;
  industry: string | null;
  publishedAt: string | null;
  externalRef?: string | null;
  vectorRank: number | null;
  keywordRank: number | null;
  vectorScore: number | null;
  keywordScore: number | null;
  rrfScore: number;
  rerankScore: number | null;
}

export interface DocumentSummary {
  id: string;
  title: string;
  contentType: string;
  industry: string | null;
  publishedAt: string | null;
  pageCount: number | null;
  status: string;
  createdAt: string;
}
