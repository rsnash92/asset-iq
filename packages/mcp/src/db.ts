import { createClient } from "@supabase/supabase-js";
import { supabaseUrl, type Database, type Db } from "@asset-iq/core";

/**
 * The MCP server authenticates callers with API keys, not Supabase sessions, so it
 * uses the service-role client and relies on core's explicit owner_id filtering
 * (every query in core/agent/tools.ts and match_chunks_hybrid's filter_owner).
 */
export function serviceDb(): Db {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for the MCP server");
  return createClient<Database>(supabaseUrl(), key, { auth: { persistSession: false, autoRefreshToken: false } }) as unknown as Db;
}
