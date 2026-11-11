import { NextResponse } from "next/server";

// What build is live (the update notice, Keenan, 2026-11-11). The id is the
// deploy's commit, or a build stamp, set in next.config.ts; it says nothing
// about the business. Never cached, so the answer is always the build that
// is serving now.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { build: process.env.NEXT_PUBLIC_APP_BUILD ?? null },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
