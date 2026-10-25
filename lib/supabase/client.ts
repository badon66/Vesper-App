import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env";

// Supabase client for Client Components. Reads go through this client and
// are gated by Row Level Security. Writes go through Server Actions.
export function createClient() {
  const env = getPublicEnv();
  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
