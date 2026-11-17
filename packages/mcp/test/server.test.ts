import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import type { Db } from "@asset-iq/core";
import { createMcpServer } from "../src/server";

/** Fake db: rate-limit RPC allows, inserts succeed, documents query returns nothing. */
function fakeDb(): Db {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit", "gte", "lte", "insert", "maybeSingle"]) builder[m] = () => builder;
  builder.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
  return {
    from: () => builder,
    rpc: async () => ({ data: [{ allowed: true, remaining: 29, reset_at: new Date().toISOString() }], error: null }),
  } as unknown as Db;
}

async function connected() {
  const server = createMcpServer(fakeDb(), "owner-1");
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "t", version: "1" });
  await client.connect(b);
  return client;
}

describe("createMcpServer", () => {
  it("registers the five shared tools with JSON schemas and read-only hints", async () => {
    const c = await connected();
    const { tools } = await c.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(Object.keys(byName).sort()).toEqual(["draft_content", "get_document", "list_assets", "search_library", "summarise_document"]);
    expect(byName.search_library!.inputSchema.required).toContain("query");
    expect(byName.list_assets!.annotations?.readOnlyHint).toBe(true);
    expect(byName.draft_content!.annotations?.readOnlyHint).toBe(false);
  });

  it("returns tool errors as isError results, not protocol failures", async () => {
    const c = await connected();
    const res = (await c.callTool({ name: "get_document", arguments: { document_id: "00000000-0000-0000-0000-000000000000" } })) as {
      isError?: boolean;
      content: { text: string }[];
    };
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toMatch(/isn't in your library/);
  });
});
