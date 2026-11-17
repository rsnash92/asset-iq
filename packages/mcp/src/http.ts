/**
 * Streamable HTTP transport (stateless). Each POST /mcp carries
 * `Authorization: Bearer <api key>`; we resolve the owner, build a server bound
 * to that owner, handle the single request, then dispose of it. Stateless mode
 * keeps horizontal scaling trivial — no sticky sessions.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { resolveApiKey } from "@asset-iq/core";
import { serviceDb } from "./db";
import { createMcpServer } from "./server";

const PORT = Number(process.env.MCP_PORT ?? 3333);
const MAX_BODY = 1024 * 1024;

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers }).end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY) throw new Error("body too large");
    chunks.push(c as Buffer);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined;
}

const rpcError = (code: number, message: string) => ({ jsonrpc: "2.0", error: { code, message }, id: null });

export function createHttpServer() {
  const db = serviceDb();
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/health") return send(res, 200, { ok: true });
    if (url.pathname !== "/mcp") return send(res, 404, { error: "not found" });
    if (req.method !== "POST") {
      // stateless server: no server-initiated SSE stream, no session to delete
      return send(res, 405, rpcError(-32000, "Method not allowed"), { allow: "POST" });
    }

    const key = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    const owner = key ? await resolveApiKey(db, key) : null;
    if (!owner) {
      return send(res, 401, rpcError(-32001, "Missing or invalid API key"), { "www-authenticate": 'Bearer realm="asset-iq"' });
    }

    let body: unknown;
    try {
      body = await readJson(req);
    } catch {
      return send(res, 400, rpcError(-32700, "Parse error"));
    }

    const server = createMcpServer(db, owner.ownerId);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (e) {
      console.error("[asset-iq-mcp] request failed:", e);
      if (!res.headersSent) send(res, 500, rpcError(-32603, "Internal error"));
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createHttpServer().listen(PORT, () => console.error(`[asset-iq-mcp] streamable HTTP on http://localhost:${PORT}/mcp`));
}
