// View as: the owner sees the app exactly as another member sees it, and
// can click through it (round 2, Keenan, 2026-11-03), with nothing ever
// saved. The cookie only names who the owner is looking at. The server
// decides on every request whether to honour it (lib/auth/profile.ts); every
// server action's own guard refuses a write while it is set, and proxy.ts
// refuses every other request that could change something.

export const VIEW_AS_COOKIE = "vesper_view_as";
export const VIEW_AS_MAX_AGE_SECONDS = 2 * 60 * 60;
export const VIEW_AS_EXIT_PATH = "/app/view-as/exit";
// What a refused write says while viewing: calmly, never as an error.
export const VIEW_AS_READ_ONLY = "View as: nothing was saved.";
export const VIEW_AS_NOTHING_SAVED = VIEW_AS_READ_ONLY;

export function isViewAsRefusal(message: string | null | undefined): boolean {
  return message === VIEW_AS_READ_ONLY;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ViewAsCookie = { ownerId: string; targetId: string };

// The cookie holds "<owner id>:<viewed person id>", so a cookie left behind
// by one account is recognised as foreign by any other.
export function viewAsCookieValue(ownerId: string, targetId: string): string {
  return `${ownerId}:${targetId}`;
}

export function parseViewAsCookie(value: string | null | undefined): ViewAsCookie | null {
  if (!value) return null;
  const parts = value.split(":");
  if (parts.length !== 2) return null;
  const [ownerId, targetId] = parts.map((part) => part.toLowerCase());
  if (!UUID.test(ownerId) || !UUID.test(targetId) || ownerId === targetId) return null;
  return { ownerId, targetId };
}

// While View as is on, nothing may change. Reading is allowed. A server
// action is let through to its own guard (round 2): every action that writes
// refuses while viewing, and one that only reads reads as the viewed person,
// which is what lets Keenan click through. Any other request that isn't a
// read is refused here; leaving View as is the one exception.
export function refusedWhileViewing(method: string, pathname: string, serverAction = false): boolean {
  if (method === "GET" || method === "HEAD") return false;
  if (serverAction) return false;
  return pathname !== VIEW_AS_EXIT_PATH;
}

export const viewAsCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: VIEW_AS_MAX_AGE_SECONDS,
};
