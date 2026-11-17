import { describe, expect, it } from "vitest";
import { createContext } from "../src/context";
import { AppError } from "../src/errors";
import { AGENT_TOOLS, listAssets, runTool } from "../src/agent/tools";

/** Minimal chainable fake of the supabase-js query builder. */
function fakeDb(rows: unknown[], calls: string[][]) {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit", "gte", "lte"]) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, ...args.map(String)]);
      return builder;
    };
  }
  builder.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
  return { from: (t: string) => (calls.push(["from", t]), builder) } as never;
}

describe("agent tools", () => {
  it("exposes the five tools from the spec", () => {
    expect(AGENT_TOOLS.map((t) => t.name)).toEqual([
      "search_library", "list_assets", "get_document", "summarise_document", "draft_content",
    ]);
  });

  it("validates input and logs the failed call", async () => {
    const ctx = createContext(fakeDb([], []), "owner-1");
    await expect(runTool(ctx, listAssets, { content_type: "podcast" })).rejects.toBeInstanceOf(AppError);
    expect(ctx.toolCalls[0]).toMatchObject({ tool: "list_assets", ok: false, error: "invalid_input" });
  });

  it("list_assets always scopes to the owner and logs success", async () => {
    const calls: string[][] = [];
    const ctx = createContext(
      fakeDb([{ id: "d1", title: "T", content_type: "report", industry: "x", published_at: "2024-01-01", page_count: 3 }], calls),
      "owner-1",
    );
    const out = await runTool(ctx, listAssets, { content_type: "report" });
    expect(out.documents[0]).toMatchObject({ document_id: "d1", title: "T" });
    expect(calls).toContainEqual(["eq", "owner_id", "owner-1"]);
    expect(calls).toContainEqual(["eq", "status", "ready"]);
    expect(ctx.toolCalls[0]).toMatchObject({ tool: "list_assets", ok: true });
  });
});
