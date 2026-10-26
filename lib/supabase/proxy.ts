import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "@/lib/env";

export type SessionClaims = {
  sub: string;
  email?: string;
  // Set on accounts the admin created; cleared when the person picks their
  // own password on first sign-in.
  mustSetPassword: boolean;
};

// Refreshes the Supabase session cookie on each request and reports whether
// there is a signed-in user. Used only by proxy.ts.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const env = getPublicEnv();

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getClaims verifies the JWT locally when the project uses asymmetric
  // signing keys, so this is cheap enough to run on every matched request.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) {
    return { response, user: null as SessionClaims | null };
  }

  const meta = (claims as { user_metadata?: unknown }).user_metadata;
  const mustSetPassword =
    typeof meta === "object" &&
    meta !== null &&
    (meta as Record<string, unknown>).must_set_password === true;

  const user: SessionClaims = {
    sub: claims.sub,
    email: typeof claims.email === "string" ? claims.email : undefined,
    mustSetPassword,
  };
  return { response, user };
}
