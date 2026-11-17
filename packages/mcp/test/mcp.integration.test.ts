/**
 * Integration test against the LOCAL Supabase stack (pnpm db:start).
 * Exercises the real HTTP transport + API-key auth + owner isolation using tools
 * that need no LLM/embedding keys. Skipped automatically if Supabase isn't up.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createClient } from "@supabase/supabase-js";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateApiKey } from "@asset-iq/core";

const URL_ = process.env.SUPABASE_URL ?? "http://127.0.0.1:55321";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function supabaseUp() {
  if (!SERVICE) return false;
  try {
    const r = await fetch(`${URL_}/auth/v1/health`, { headers: { apikey: SERVICE }, signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

const up = await supabaseUp();

describe.skipIf(!up)("MCP server over streamable HTTP (local Supabase)", () => {
  const admin = up ? createClient(URL_, SERVICE!, { auth: { persistSession: false } }) : (null as never);
  const ids: string[] = [];
  let server: Server;
  let base: string;
  let keyA: string;
  let docA: string;

  beforeAll(async () => {
    process.env.SUPABASE_URL = URL_;
    const mk = async (tag: string) => {
      const { data, error } = await admin.auth.admin.createUser({ email: `mcp-${tag}-${Date.now()}@test.local`, email_confirm: true });
      if (error) throw error;
      ids.push(data.user.id);
      return data.user.id;
    };
    const a = await mk("a");
    const b = await mk("b");

    const k = generateApiKey();
    keyA = k.key;
    await admin.from("api_keys").insert({ owner_id: a, name: "test", key_prefix: k.prefix, key_hash: k.hash }).throwOnError();

    const vec = `[${new Array(1536).fill(0.01).join(",")}]`;
    const insDoc = async (owner: string, title: string) => {
      const { data } = await admin
        .from("documents")
        .insert({ owner_id: owner, title, storage_path: `${owner}/x.pdf`, content_type: "report", industry: "construction", status: "ready", published_at: "2024-05-01", page_count: 2 })
        .select("id")
        .single()
        .throwOnError();
      await admin
        .from("chunks")
        .insert([
          { document_id: data!.id, owner_id: owner, chunk_index: 0, page_start: 1, page_end: 1, content: `${title}: page one text about permits.`, token_count: 8, embedding: vec },
          { document_id: data!.id, owner_id: owner, chunk_index: 1, page_start: 2, page_end: 2, content: `${title}: page two text about scaffolds.`, token_count: 8, embedding: vec },
        ])
        .throwOnError();
      return data!.id as string;
    };
    docA = await insDoc(a, "Alpha report");
    await insDoc(b, "Bravo secret report");

    const { createHttpServer } = await import("../src/http");
    server = createHttpServer().listen(0);
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
  });

  afterAll(async () => {
    server?.close();
    for (const id of ids) await admin.auth.admin.deleteUser(id); // cascades docs/chunks/keys/logs
  });

  const connect = async (key: string) => {
    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(base), { requestInit: { headers: { Authorization: `Bearer ${key}` } } }));
    return client;
  };

  it("rejects requests without a valid key", async () => {
    const res = await fetch(base, { method: "POST", headers: { "content-type": "application/json", Authorization: "Bearer aiq_nope_nope_nope_nope_nope_nope" }, body: "{}" });
    expect(res.status).toBe(401);
  });

  it("lists the five shared tools", async () => {
    const c = await connect(keyA);
    const { tools } = await c.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["draft_content", "get_document", "list_assets", "search_library", "summarise_document"]);
    await c.close();
  });

  it("list_assets returns only the key owner's documents", async () => {
    const c = await connect(keyA);
    const res = (await c.callTool({ name: "list_assets", arguments: {} })) as { content: { text: string }[] };
    const out = JSON.parse(res.content[0]!.text) as { documents: { title: string }[] };
    expect(out.documents.map((d) => d.title)).toEqual(["Alpha report"]);
    await c.close();
  });

  it("get_document returns page-marked text for a page range", async () => {
    const c = await connect(keyA);
    const res = (await c.callTool({ name: "get_document", arguments: { document_id: docA, pages: { from: 2, to: 2 } } })) as { content: { text: string }[] };
    const out = JSON.parse(res.content[0]!.text) as { text: string; title: string };
    expect(out.title).toBe("Alpha report");
    expect(out.text).toContain("[p. 2]");
    expect(out.text).not.toContain("page one");
    await c.close();
  });

  it("cannot read another owner's document by id", async () => {
    const { data } = await admin.from("documents").select("id").eq("title", "Bravo secret report").single();
    const c = await connect(keyA);
    const res = (await c.callTool({ name: "get_document", arguments: { document_id: data!.id } })) as { isError?: boolean; content: { text: string }[] };
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toMatch(/isn't in your library/);
    await c.close();
  });

  it("logs each MCP tool call to query_logs", async () => {
    const owner = ids[0]!;
    const { data } = await admin.from("query_logs").select("kind,metadata").eq("user_id", owner);
    expect((data ?? []).some((r) => (r.metadata as { source?: string }).source === "mcp")).toBe(true);
  });
});
