import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Db } from "./context";

const PREFIX = "aiq_";

/** Generate a new API key. The plaintext is shown once; only the hash is stored. */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = PREFIX + randomBytes(24).toString("base64url");
  return { key, prefix: key.slice(0, 10), hash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function looksLikeApiKey(key: string): boolean {
  return key.startsWith(PREFIX) && key.length >= 30 && key.length <= 80;
}

/**
 * Resolve an API key to its owner using the service-role client. SHA-256 of a
 * 192-bit random key needs no salt/KDF: it is not guessable like a password.
 */
export async function resolveApiKey(serviceDb: Db, key: string): Promise<{ ownerId: string; keyId: string } | null> {
  if (!looksLikeApiKey(key)) return null;
  const hash = hashApiKey(key);
  const { data, error } = await serviceDb
    .from("api_keys")
    .select("id,owner_id,key_hash,revoked_at")
    .eq("key_hash", hash)
    .maybeSingle();
  if (error || !data || data.revoked_at) return null;
  // defence in depth: constant-time compare even though we looked up by hash
  if (!timingSafeEqual(Buffer.from(data.key_hash), Buffer.from(hash))) return null;
  void serviceDb.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id).then();
  return { ownerId: data.owner_id, keyId: data.id };
}
