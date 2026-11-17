import { describe, expect, it } from "vitest";
import { findExcerpt } from "@/lib/highlight";
import { fileKind, safeFileName, UploadCompleteSchema, UploadInitSchema } from "@/lib/uploads";

describe("findExcerpt", () => {
  it("matches across whitespace differences", () => {
    const hay = "Intro.\n\nWorkers must  be trained\nbefore using ladders. Next part.";
    const r = findExcerpt(hay, "Workers must be trained before using ladders.");
    expect(r).not.toBeNull();
    expect(hay.slice(r![0], r![1])).toBe("Workers must  be trained\nbefore using ladders.");
  });
  it("returns null when absent", () => {
    expect(findExcerpt("abc", "xyz")).toBeNull();
  });
});

describe("uploads", () => {
  it("accepts only pdf/md/txt", () => {
    expect(fileKind("a.PDF")).toBe("pdf");
    expect(fileKind("notes.md")).toBe("md");
    expect(fileKind("evil.exe")).toBeNull();
    expect(fileKind("noext")).toBeNull();
  });
  it("sanitises file names (no traversal, ascii only)", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("Réport 2024 (final).pdf")).toBe("Report_2024_final_.pdf");
    expect(safeFileName("..hidden")).toBe("hidden");
  });
  it("enforces the 20 MB limit", () => {
    expect(UploadInitSchema.safeParse({ fileName: "a.pdf", size: 21 * 1024 * 1024 }).success).toBe(false);
    expect(UploadInitSchema.safeParse({ fileName: "a.pdf", size: 1024 }).success).toBe(true);
  });
  it("normalises optional metadata", () => {
    const r = UploadCompleteSchema.parse({ path: "u/d/a.pdf", title: " T ", contentType: "guide", industry: "Oil and Gas", publishedAt: "" });
    expect(r).toMatchObject({ title: "T", industry: "oil-and-gas", publishedAt: undefined });
  });
});
