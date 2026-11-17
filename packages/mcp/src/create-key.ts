/**
 * CLI: create an API key for a user by email (local/dev convenience; the web app's
 * /settings page is the normal path). Usage: pnpm --filter @asset-iq/mcp create-key demo@asset-iq.local
 */
import { generateApiKey } from "@asset-iq/core";
import { serviceDb } from "./db";

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("usage: create-key <email> [name]");
  const db = serviceDb();
  const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error(`no user with email ${email}`);
  const k = generateApiKey();
  const ins = await db.from("api_keys").insert({ owner_id: user.id, name: process.argv[3] ?? "cli", key_prefix: k.prefix, key_hash: k.hash });
  if (ins.error) throw ins.error;
  console.log(k.key);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
