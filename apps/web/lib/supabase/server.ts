import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createJsClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@asset-iq/core/database.types";
import { publicSupabaseEnv } from "./env";

/** User-scoped client bound to the session cookie (RLS enforced). */
export async function createClient() {
  const { url, anonKey } = publicSupabaseEnv();
  const cookieStore = await cookies();
  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // called from a Server Component — the proxy refreshes the session instead
        }
      },
    },
  });
}

/** User-scoped client from a raw access token (Authorization: Bearer …) — used by evals/CLI. */
export function createClientForToken(accessToken: string) {
  const { url, anonKey } = publicSupabaseEnv();
  return createJsClient<Database>(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Service-role client: bypasses RLS. Only for storage cleanup and admin paths; never per-user reads. */
export function createServiceClient() {
  const { url } = publicSupabaseEnv();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createJsClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
