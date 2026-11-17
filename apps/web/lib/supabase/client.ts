"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@asset-iq/core/database.types";
import { publicSupabaseEnv } from "./env";

export function createClient() {
  const { url, anonKey } = publicSupabaseEnv();
  return createBrowserClient<Database>(url, anonKey);
}
