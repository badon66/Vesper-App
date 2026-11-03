import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { parseViewAsCookie, refusedWhileViewing, VIEW_AS_COOKIE } from "@/lib/view-as";

// Runs before every matched request. Keeps the Supabase session fresh, sends
// signed-out visitors away from /app and signed-in visitors away from /login,
// and keeps View as read only. The database, not this file, is the real gate:
// Row Level Security decides what a user can read and write, and the app
// layout verifies the session with the Auth server.
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // The customer quote link (2026-11-02): public, never indexed, no
  // referrer, never cached, and no session work: the page reads as an
  // anonymous caller whoever opens it.
  if (isQuotePath(pathname)) {
    return withQuoteHeaders(NextResponse.next());
  }
  // On the quote domain only quote pages answer; everything else is not
  // found there, the app included.
  if (QUOTE_ONLY_HOSTS.has(hostOf(request))) {
    return quoteHostAllows(pathname)
      ? NextResponse.next()
      : withQuoteHeaders(new NextResponse("Not found", { status: 404 }));
  }
  if (!(pathname === "/login" || pathname.startsWith("/app") || pathname.startsWith("/meeting"))) {
    return NextResponse.next();
  }

  const { response, user } = await updateSession(request);

  // View as: while this signed-in owner's View as cookie is set, nothing
  // under /app may change anything. Server actions go on to their own guard,
  // which refuses every write while viewing (round 2: Keenan clicks
  // through, nothing is saved); any other request that isn't a read is
  // refused here. A cookie that is malformed or belongs to another account
  // is dropped instead. Whether the owner may view at all is decided by the
  // server on every request (lib/auth/profile.ts).
  const viewAsValue = request.cookies.get(VIEW_AS_COOKIE)?.value;
  if (viewAsValue !== undefined) {
    const viewAs = parseViewAsCookie(viewAsValue);
    if (!user || !viewAs || viewAs.ownerId !== user.sub) {
      response.cookies.delete(VIEW_AS_COOKIE);
    } else if (
      (pathname.startsWith("/app") || pathname.startsWith("/meeting")) &&
      refusedWhileViewing(request.method, pathname, request.headers.has("next-action"))
    ) {
      return withCookies(
        new NextResponse("View as: nothing was saved.", { status: 403 }),
        response,
      );
    }
  }

  if (!user && (pathname.startsWith("/app") || pathname.startsWith("/meeting"))) {
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

// Hosts that serve only the customer's quote pages. Links are built from
// QUOTE_BASE_URL, which points here once the domain is live.
const QUOTE_ONLY_HOSTS = new Set(["quote.vesperlighting.ca"]);

function hostOf(request: NextRequest): string {
  return (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").toLowerCase().split(":")[0];
}

function isQuotePath(pathname: string): boolean {
  return pathname.startsWith("/q/");
}

// What the quote domain serves besides quote pages: the icons the page
// links to. Build files never reach this file (see the matcher).
function quoteHostAllows(pathname: string): boolean {
  return isQuotePath(pathname) || /^\/(icon|apple-icon)[^/]*\.png$/.test(pathname) || pathname === "/favicon.ico";
}

function withQuoteHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

// A redirect is a new response, so any refreshed session cookies on the
// original response have to be copied across or the user is logged out.
function withCookies(target: NextResponse, source: NextResponse) {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
  return target;
}

// Every request except build files and the worker: the quote domain has to
// be able to turn away anything that isn't a quote page.
export const config = {
  matcher: ["/((?!_next/static|_next/image|sw\\.js|icons/).*)"],
};
