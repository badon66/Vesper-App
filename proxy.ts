import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

// Runs before every matched request. Keeps the Supabase session fresh, sends
// signed-out visitors away from /app and signed-in visitors away from /login.
// The database, not this file, is the real gate: Row Level Security decides
// what a user can read and write, and the app layout verifies the session
// with the Auth server.
export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  if (!user && pathname.startsWith("/app")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${pathname}${search}`);
    return withCookies(NextResponse.redirect(url), response);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/app";
    url.search = "";
    return withCookies(NextResponse.redirect(url), response);
  }

  return response;
}

// A redirect is a new response, so any refreshed session cookies on the
// original response have to be copied across or the user is logged out.
function withCookies(target: NextResponse, source: NextResponse) {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
  return target;
}

export const config = {
  matcher: ["/login", "/app/:path*"],
};
