import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  AGENT_TOOLS,
  AppError,
  createContext,
  enforceRateLimit,
  logQuery,
  runTool,
  type Db,
} from "@asset-iq/core";

export const SERVER_INFO = { name: "asset-iq", version: "0.1.0" } as const;

const READ_ONLY = new Set(["search_library", "list_assets", "get_document"]);

/**
 * Build an MCP server bound to one library owner. Tools are the SAME definitions
 * the web agent uses (core/agent/tools.ts) — only the transport differs.
 */
export function createMcpServer(db: Db, ownerId: string): McpServer {
  const server = new McpServer(SERVER_INFO, {
    instructions:
      "Asset IQ gives you search and drafting tools over the user's B2B content library. Cite sources using the [cite:<document_id>:p<page>] tokens returned by tools, and never invent documents.",
  });

  for (const def of AGENT_TOOLS) {
    server.registerTool(
      def.name,
      {
        description: def.description,
        inputSchema: def.inputSchema as never,
        annotations: { readOnlyHint: READ_ONLY.has(def.name), openWorldHint: false },
      },
      (async (args: unknown) => {
        const started = Date.now();
        const ctx = createContext(db, ownerId);
        try {
          await enforceRateLimit(db, "mcp", { userId: ownerId });
          const out = await runTool(ctx, def as never, args);
          await logQuery(db, ctx, { kind: "agent", query: `[mcp] ${def.name} ${JSON.stringify(args).slice(0, 500)}`, latencyMs: Date.now() - started, metadata: { source: "mcp", tool: def.name } });
          return { content: [{ type: "text" as const, text: JSON.stringify(out, null, 2) }] };
        } catch (e) {
          const err = e instanceof AppError ? e : new AppError("internal", String((e as Error)?.message ?? e));
          await logQuery(db, ctx, { kind: "agent", query: `[mcp] ${def.name}`, latencyMs: Date.now() - started, error: err.message, metadata: { source: "mcp", tool: def.name } });
          return { isError: true, content: [{ type: "text" as const, text: err.userMessage }] };
        }
      }) as never,
    );
  }
  return server;
}
