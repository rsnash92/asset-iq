/**
 * Locate an excerpt inside a larger text, tolerant of whitespace differences
 * (chunk text is whitespace-normalised during ingestion). Returns [start, end)
 * offsets into `haystack`, or null.
 */
export function findExcerpt(haystack: string, excerpt: string): [number, number] | null {
  const words = excerpt.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // anchor on the first ~12 words, then extend to the last ~12 words if both found
  const head = new RegExp(words.slice(0, 12).map(esc).join("\\s+"));
  const tail = new RegExp(words.slice(-12).map(esc).join("\\s+"));
  const h = head.exec(haystack);
  if (!h) return null;
  tail.lastIndex = 0;
  const rest = haystack.slice(h.index);
  const t = tail.exec(rest);
  const end = t ? h.index + t.index + t[0].length : h.index + h[0].length;
  return [h.index, end];
}
