#!/usr/bin/env -S npx tsx
/**
 * stdio transport — for Claude Desktop / Claude Code. Auth: ASSET_IQ_API_KEY
 * (created on the web app's API keys page) is resolved to its owner at startup.
 * Never write to stdout here except via the transport: stdout IS the protocol.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolveApiKey } from "@asset-iq/core";
import { serviceDb } from "./db";
import { createMcpServer } from "./server";

async function main() {
  const key = process.env.ASSET_IQ_API_KEY;
  if (!key) {
    console.error("ASSET_IQ_API_KEY is not set. Create a key at /settings in the Asset IQ web app.");
    process.exit(1);
  }
  const db = serviceDb();
  const owner = await resolveApiKey(db, key);
  if (!owner) {
    console.error("ASSET_IQ_API_KEY is invalid or revoked.");
    process.exit(1);
  }
  const server = createMcpServer(db, owner.ownerId);
  await server.connect(new StdioServerTransport());
  console.error(`[asset-iq-mcp] stdio server ready (key ${key.slice(0, 10)}…)`);
}

main().catch((e) => {
  console.error("[asset-iq-mcp] fatal:", e);
  process.exit(1);
});
