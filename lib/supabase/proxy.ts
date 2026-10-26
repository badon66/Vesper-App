import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getPublicEnv } from "@/lib/env";

export type SessionClaims = {
  sub: string;
  email?: string;
};

// Refreshes the Supabase session cookie on each request and reports whether
// there is a signed-in user. Used only by proxy.ts. This decodes the token
// locally; the app layout asks the Auth server, which is what catches a
// session the owner has ended.
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

  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) {
    return { response, user: null as SessionClaims | null };
  }
  const user: SessionClaims = {
    sub: claims.sub,
    email: typeof claims.email === "string" ? claims.email : undefined,
  };
  return { response, user };
}
