import { NextResponse, type NextRequest } from "next/server";
import { VIEW_AS_COOKIE } from "@/lib/view-as";

// Leaves View as and goes back to People. It only clears the View as cookie,
// so it is safe for anyone to call, and it is the one request proxy.ts lets
// through while View as is on.
export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/app/admin/people", request.url), 303);
  response.cookies.delete(VIEW_AS_COOKIE);
  return response;
}
