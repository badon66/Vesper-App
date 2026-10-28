// The one-time owner session for the View as test, approved by Keenan on
// 2026-10-28 (CLAUDE.md, rule 10). View as is owner only and the database
// allows exactly one owner, so the test signs in as info@vesperlighting.ca:
//   - a magic link is generated through the Auth admin API and verified
//     here, on the server; it is never emailed and no password is used;
//   - the session is handed to the test browser as ordinary cookies;
//   - close() signs that one session out; the owner's other sessions stay.
// The walk-through only views screens and submits forms that are refused
// before anything saves, and it checks afterwards that nothing of the
// owner's changed.
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const OWNER_EMAIL = "info@vesperlighting.ca";

export async function openOwnerSession({ url, anonKey, admin, base, context }) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: OWNER_EMAIL });
  if (error || !data?.properties?.hashed_token) throw new Error(`owner link: ${error?.message ?? "no token"}`);

  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let verified = await client.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "email" });
  if (verified.error) {
    verified = await client.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" });
  }
  const session = verified.data?.session;
  if (verified.error || !session) throw new Error(`owner session: ${verified.error?.message ?? "none"}`);

  // Let @supabase/ssr write the session cookies exactly as the app expects.
  const jar = new Map();
  const ssr = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => (value ? jar.set(name, value) : jar.delete(name))),
    },
  });
  const stored = await ssr.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (stored.error) throw new Error(`owner cookies: ${stored.error.message}`);
  await context.addCookies([...jar].map(([name, value]) => ({ name, value, url: base })));

  return {
    userId: session.user.id,
    async close() {
      await client.auth.signOut({ scope: "local" });
    },
  };
}
