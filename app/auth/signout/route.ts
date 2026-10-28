import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { VIEW_AS_COOKIE } from "@/lib/view-as";

const reasons = new Set(["deactivated", "no_profile", "session_ended"]);

// Signs the current user out and sends them to /login with a reason the
// login page can explain. A route handler is used because Server Components
// cannot clear cookies.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const url = new URL("/login", request.url);
  const reason = request.nextUrl.searchParams.get("reason");
  if (reason && reasons.has(reason)) url.searchParams.set("reason", reason);
  const response = NextResponse.redirect(url);
  response.cookies.delete(VIEW_AS_COOKIE);
  return response;
}
