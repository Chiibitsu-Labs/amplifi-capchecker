import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "./config";

let client: SupabaseClient | null = null;

/**
 * Server-side Supabase client using the service-role key. This bypasses RLS,
 * so it must only ever run in server contexts (API routes / cron), never the
 * browser. Lazily constructed so importing this module doesn't require env
 * vars to be present (e.g. during build).
 */
export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        // Next.js persists fetch() responses in its Data Cache even on
        // force-dynamic routes, which would serve stale check-in data on the
        // dashboard. Capacity data must always be live.
        fetch: (url, init) => fetch(url, { ...init, cache: "no-store" }),
      },
    });
  }
  return client;
}
