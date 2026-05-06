import "server-only";

// Next.js-facing entry point for the service-role Supabase client. The actual
// implementation lives in `./admin-core` so that Node-only scripts (gc,
// migration) can reuse it without tripping the "server-only" guard, which is
// a Next bundler concept that doesn't resolve in plain Node.
export { getSupabaseAdminClient } from "./admin-core";
