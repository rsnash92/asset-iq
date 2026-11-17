import { describe, expect, it } from "vitest";
import { collectTitles, stepLabel } from "@/components/agent/step-label";

const titles = new Map([["d1", "Managing contractors"]]);

describe("stepLabel", () => {
  it("describes in-flight and finished searches", () => {
    expect(stepLabel("search_library", "input-available", { query: "permits" }, undefined, titles)).toBe("Searching library for “permits”…");
    expect(stepLabel("search_library", "output-available", { query: "permits" }, { results: [1, 2] }, titles)).toBe(
      "Searched library for “permits” — 2 passages",
    );
  });
  it("names the document and page range when reading", () => {
    expect(stepLabel("get_document", "input-available", { document_id: "d1", pages: { from: 3, to: 5 } }, undefined, titles)).toBe(
      "Reading “Managing contractors” pp. 3–5…",
    );
  });
  it("flags tool errors returned as data", () => {
    expect(stepLabel("list_assets", "output-available", {}, { error: "boom" }, titles)).toContain("failed: boom");
  });
});

describe("collectTitles", () => {
  it("finds document titles anywhere in tool outputs", () => {
    const m = collectTitles([{ results: [{ document_id: "a", title: "A" }] }, { documents: [{ document_id: "b", title: "B" }] }, undefined]);
    expect(Object.fromEntries(m)).toEqual({ a: "A", b: "B" });
  });
});
