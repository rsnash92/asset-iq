import { AppError, generateApiKey } from "@asset-iq/core";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { errorResponse, json, parseJson } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { db, userId } = await requireUser(req);
    const { data, error } = await db
      .from("api_keys")
      .select("id,name,key_prefix,created_at,last_used_at,revoked_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new AppError("internal", error.message);
    return json({ keys: data });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Create an MCP API key. The plaintext is returned exactly once. */
export async function POST(req: Request) {
  try {
    const { db, userId } = await requireUser(req);
    const { name } = await parseJson(req, z.object({ name: z.string().trim().min(1).max(100) }));
    const k = generateApiKey();
    const { data, error } = await db
      .from("api_keys")
      .insert({ owner_id: userId, name, key_prefix: k.prefix, key_hash: k.hash })
      .select("id,name,key_prefix,created_at")
      .single();
    if (error) throw new AppError("internal", error.message);
    return json({ key: k.key, record: data }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
