import { describe, expect, it } from "vitest";
import { citeToken, CITE_TOKEN_RE, stitchWithPageMarkers, stripOverlap } from "../src/agent/text";

describe("stripOverlap", () => {
  it("removes the shared overlap between consecutive chunks", () => {
    const prev = "First sentence here. The overlapping sentence is long enough.";
    const next = "The overlapping sentence is long enough. Then something new.";
    expect(stripOverlap(prev, next)).toBe("Then something new.");
  });
  it("returns next unchanged when there is no overlap", () => {
    expect(stripOverlap("abc def ghi", "completely different text here")).toBe("completely different text here");
  });
});

describe("stitchWithPageMarkers", () => {
  const chunks = [
    { chunkIndex: 1, pageStart: 2, pageEnd: 2, content: "Page two text. Shared overlap sentence goes here." },
    { chunkIndex: 0, pageStart: 1, pageEnd: 2, content: "Page one text." },
    { chunkIndex: 2, pageStart: 2, pageEnd: 3, content: "Shared overlap sentence goes here. And page three." },
  ];
  it("orders by chunk index, adds page markers, strips overlap", () => {
    const { text, truncated } = stitchWithPageMarkers(chunks, 10_000);
    expect(truncated).toBe(false);
    expect(text.startsWith("[p. 1]\nPage one text.")).toBe(true);
    expect(text).toContain("Page one text.\nPage two text."); // chunk 0 already spans p.2: no new marker
    expect(text).not.toContain("[p. 3]"); // chunk 2 starts on p.2, already open
    expect(text.match(/Shared overlap sentence/g)).toHaveLength(1);
  });
  it("truncates at the character budget", () => {
    const { truncated } = stitchWithPageMarkers(chunks, 30);
    expect(truncated).toBe(true);
  });
});

describe("cite tokens", () => {
  it("round-trips through the regex", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    const m = [...`See ${citeToken(id, 12)}.`.matchAll(CITE_TOKEN_RE)];
    expect(m[0]![1]).toBe(id);
    expect(m[0]![2]).toBe("12");
  });
});
