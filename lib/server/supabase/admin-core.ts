// Service-role Supabase client. Bypasses RLS — only use from trusted server
// contexts (Next.js server code, migration script, scheduled GC job).
//
// This file deliberately does NOT import "server-only" so that Node-only
// scripts (scripts/gc.ts, scripts/migrate-state-to-supabase.ts) can pull in
// the same client without crashing in a no-bundler context. The Next.js app
// imports the sibling `./admin` module instead, which re-exports from here
// behind a "server-only" barrier so client bundles still fail loudly.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getSupabaseAdminClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  cached = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return cached;
}
