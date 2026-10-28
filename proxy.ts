import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { parseViewAsCookie, refusedWhileViewing, VIEW_AS_COOKIE } from "@/lib/view-as";

// Runs before every matched request. Keeps the Supabase session fresh, sends
// signed-out visitors away from /app and signed-in visitors away from /login,
// and keeps View as read only. The database, not this file, is the real gate:
// Row Level Security decides what a user can read and write, and the app
// layout verifies the session with the Auth server.
export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  // View as: while this signed-in owner's View as cookie is set, nothing
  // under /app may change anything, so every server action is refused before
  // it runs. A cookie that is malformed or belongs to another account is
  // dropped instead. Whether the owner may view at all is decided by the
  // server on every request (lib/auth/profile.ts).
  const viewAsValue = request.cookies.get(VIEW_AS_COOKIE)?.value;
  if (viewAsValue !== undefined) {
    const viewAs = parseViewAsCookie(viewAsValue);
    if (!user || !viewAs || viewAs.ownerId !== user.sub) {
      response.cookies.delete(VIEW_AS_COOKIE);
    } else if (pathname.startsWith("/app") && refusedWhileViewing(request.method, pathname)) {
      return withCookies(
        new NextResponse("View as is read only. Exit it to make changes.", { status: 403 }),
        response,
      );
    }
  }

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
