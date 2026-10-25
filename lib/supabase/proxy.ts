import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "@/lib/env";

export type SessionClaims = {
  sub: string;
  email?: string;
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
  const user: SessionClaims | null = claims
    ? { sub: claims.sub, email: typeof claims.email === "string" ? claims.email : undefined }
    : null;

  return { response, user };
}
