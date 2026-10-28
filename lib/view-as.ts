// View as: the owner sees the app exactly as another member sees it, read
// only. The cookie only names who the owner is looking at. The server decides
// on every request whether to honour it (lib/auth/profile.ts), and proxy.ts
// refuses every request that could change something while it is set.

export const VIEW_AS_COOKIE = "vesper_view_as";
export const VIEW_AS_MAX_AGE_SECONDS = 2 * 60 * 60;
export const VIEW_AS_EXIT_PATH = "/app/view-as/exit";
export const VIEW_AS_READ_ONLY = "View as is read only. Exit it to make changes.";

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

// While View as is on, only reading is allowed. Server actions are POSTs, so
// refusing everything but GET and HEAD refuses every action; leaving View as
// is the one exception.
export function refusedWhileViewing(method: string, pathname: string): boolean {
  if (method === "GET" || method === "HEAD") return false;
  return pathname !== VIEW_AS_EXIT_PATH;
}

export const viewAsCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: VIEW_AS_MAX_AGE_SECONDS,
};
