// The update notice (Keenan, 2026-11-11): a quiet line when a newer build
// of Vesper is live, "Vesper updated. Reopen to get the latest." Every build
// carries its own id (next.config.ts puts the deploy's commit, or a stamp,
// in NEXT_PUBLIC_APP_BUILD); the app asks /api/version what is live when it
// comes back to the foreground and now and then while open, and shows the
// line when the answer differs. It never interrupts a booking or a meeting:
// meeting mode has its own layout without it, and the line stays hidden
// while the booking sheet is open.

export const UPDATE_WORDS = "Vesper updated. Reopen to get the latest.";

// How often to ask while the app stays open, and the least time between
// two asks (a flurry of visibility changes asks once).
export const UPDATE_POLL_MS = 10 * 60 * 1000;
export const UPDATE_MIN_GAP_MS = 30 * 1000;

// True when the live build is known, this app's build is known, and they
// differ. Unknown on either side means no notice: never a false alarm.
export function newerBuildLive(current: string | null | undefined, live: string | null | undefined): boolean {
  const here = (current ?? "").trim();
  const there = (live ?? "").trim();
  return here !== "" && there !== "" && here !== there;
}

// Whether the line may show right now: not on a meeting route, not while
// the booking sheet is open.
export function noticeAllowed({ path, sheetOpen }: { path: string; sheetOpen: boolean }): boolean {
  if (sheetOpen) return false;
  return !path.startsWith("/meeting");
}

// The live build from /api/version's answer, or null when it isn't usable.
export function liveBuildFrom(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const build = (body as { build?: unknown }).build;
  return typeof build === "string" && build.trim() !== "" ? build.trim() : null;
}
