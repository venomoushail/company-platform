import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

let browserClient: SupabaseClient<Database> | null = null;

export function getSupabaseBrowserConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;

  return { url, anonKey };
}

export function createBrowserSupabaseClient() {
  const config = getSupabaseBrowserConfig();

  if (!config) return null;

  browserClient ??= createClient<Database>(config.url, config.anonKey);

  return browserClient;
}
