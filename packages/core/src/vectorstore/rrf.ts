/**
 * Reciprocal Rank Fusion (Cormack, Clarke & Büttcher, 2009).
 *
 *   score(d) = Σ_i 1 / (k + rank_i(d))
 *
 * Rank-based, so it needs no score normalisation between a cosine similarity and
 * a BM25-style text score — the main reason it's the default fusion method.
 * The SQL implementation in match_chunks_hybrid is the same formula; this TS
 * version is used by the MongoDB store, which cannot fuse server-side.
 */
export interface Ranked<T> {
  id: string;
  item: T;
  score: number;
}

export interface Fused<T> {
  id: string;
  item: T;
  ranks: (number | null)[];
  scores: (number | null)[];
  rrfScore: number;
}

export function reciprocalRankFusion<T>(lists: Ranked<T>[][], k = 60): Fused<T>[] {
  const byId = new Map<string, Fused<T>>();
  lists.forEach((list, listIdx) => {
    list.forEach((entry, i) => {
      const rank = i + 1;
      let f = byId.get(entry.id);
      if (!f) {
        f = { id: entry.id, item: entry.item, ranks: lists.map(() => null), scores: lists.map(() => null), rrfScore: 0 };
        byId.set(entry.id, f);
      }
      // a list may (incorrectly) contain duplicates — only the best rank counts
      if (f.ranks[listIdx] == null) {
        f.ranks[listIdx] = rank;
        f.scores[listIdx] = entry.score;
        f.rrfScore += 1 / (k + rank);
      }
    });
  });
  return [...byId.values()].sort((a, b) => {
    if (b.rrfScore !== a.rrfScore) return b.rrfScore - a.rrfScore;
    // deterministic tie-break: best rank in the first list (vector), then id
    const ar = a.ranks[0] ?? Infinity;
    const br = b.ranks[0] ?? Infinity;
    return ar !== br ? ar - br : a.id.localeCompare(b.id);
  });
}
