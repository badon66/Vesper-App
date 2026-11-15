import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getPublicEnv, getServerEnv } from "@/lib/env";
import type { Database } from "@/types/database";

// Service role client. It bypasses Row Level Security, so it is used only
// for Supabase Auth admin calls (create, ban and unban users) inside server
// actions that have already verified the caller is the active owner, and
// for removing leads 30 days after Keenan deleted them (lib/leads/purge.ts,
// run only from Keenan's own visits, round 20). Never use it to read or
// write app tables on behalf of anyone else's request.
export function createAdminClient() {
  const { NEXT_PUBLIC_SUPABASE_URL } = getPublicEnv();
  const { SUPABASE_SERVICE_ROLE_KEY } = getServerEnv();
  return createSupabaseClient<Database>(
    NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
