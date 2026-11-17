/** Pure helpers for reconstructing document text from overlapping chunks. */

export interface PageChunk {
  chunkIndex: number;
  pageStart: number;
  pageEnd: number;
  content: string;
}

/**
 * Chunks overlap by ~75 tokens. When stitching consecutive chunks back together
 * we drop the longest prefix of `next` that `prev` already ends with.
 */
export function stripOverlap(prev: string, next: string, maxOverlapChars = 1200): string {
  const max = Math.min(maxOverlapChars, prev.length, next.length);
  for (let k = max; k >= 20; k--) {
    if (prev.endsWith(next.slice(0, k))) return next.slice(k).replace(/^\s+/, "");
  }
  return next;
}

/** Stitch chunks (sorted by chunkIndex) into text with page markers like "[p. 3]". */
export function stitchWithPageMarkers(chunks: PageChunk[], maxChars: number): { text: string; truncated: boolean } {
  const sorted = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
  let out = "";
  let prev = "";
  let lastPage = -1;
  for (const c of sorted) {
    const body = prev ? stripOverlap(prev, c.content) : c.content;
    const marker = c.pageStart !== lastPage ? `\n\n[p. ${c.pageStart}]\n` : "\n";
    const piece = marker + body;
    if (out.length + piece.length > maxChars) {
      return { text: out.trim(), truncated: true };
    }
    out += piece;
    prev = c.content;
    lastPage = c.pageEnd;
  }
  return { text: out.trim(), truncated: false };
}

export function citeToken(documentId: string, page: number): string {
  return `[cite:${documentId}:p${page}]`;
}

export const CITE_TOKEN_RE = /\[cite:([0-9a-f-]{36}):p(\d+)\]/g;
