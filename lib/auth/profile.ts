import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { parseViewAsCookie, VIEW_AS_COOKIE } from "@/lib/view-as";
import type { Database } from "@/types/database";

export type SessionProfile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "email" | "full_name" | "phone" | "role" | "active"
>;

type SessionLookup =
  | { status: "anonymous" }
  | { status: "ended" }
  | { status: "no_profile"; userId: string }
  | { status: "ok"; profile: SessionProfile };

// Looked up once per request and shared by the layout, the page and any
// server action in that request. The token is decoded locally first; if it
// carries a session, the Auth server is asked whether that session still
// exists, which is what makes a password reset or deactivation take effect
// at once instead of when the token expires.
export const getSession = cache(async (): Promise<SessionLookup> => {
  const supabase = await createClient();
  const { data: decoded } = await supabase.auth.getClaims();
  if (!decoded?.claims.sub) return { status: "anonymous" };

  const { data: verified, error } = await supabase.auth.getUser();
  if (error || !verified.user) return { status: "ended" };
  const userId = verified.user.id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, phone, role, active")
    .eq("id", userId)
    .maybeSingle();
  if (!profile) return { status: "no_profile", userId };
  return { status: "ok", profile };
});

// The person actually signed in. A signed-out visitor goes to /login. An
// ended session, a deactivated account, or a session with no profile row is
// signed out through a route handler because a Server Component cannot
// clear cookies.
export async function requireRealProfile(): Promise<SessionProfile> {
  const session = await getSession();
  if (session.status === "anonymous") redirect("/login");
  if (session.status === "ended") redirect("/auth/signout?reason=session_ended");
  if (session.status === "no_profile") redirect("/auth/signout?reason=no_profile");
  if (!session.profile.active) redirect("/auth/signout?reason=deactivated");
  return session.profile;
}

export type Viewer = {
  // Who the screen is for: the signed-in person, or the person the owner is
  // viewing as.
  profile: SessionProfile;
  // The person actually signed in.
  real: SessionProfile;
  // True while the owner is viewing as someone. Everything is read only.
  viewingAs: boolean;
  // The View as cookie is set for this owner but no longer applies, for
  // example because that person was deactivated. Writes stay refused until
  // the owner exits, so the layout offers Exit.
  viewAsEnded: boolean;
};

// The owner's View as cookie names the member being viewed. It is honoured
// only for the active owner's own session, and only for an active member who
// is not the owner. Checked on every request; nothing about the viewed person
// is used except their profile row, read with the owner's own session.
async function viewAsCookieFor(real: SessionProfile) {
  if (real.role !== "owner") return null;
  const parsed = parseViewAsCookie((await cookies()).get(VIEW_AS_COOKIE)?.value);
  return parsed && parsed.ownerId === real.id ? parsed : null;
}

export const getViewer = cache(async (): Promise<Viewer> => {
  const real = await requireRealProfile();
  const cookie = await viewAsCookieFor(real);
  if (!cookie) return { profile: real, real, viewingAs: false, viewAsEnded: false };
  const supabase = await createClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("id, email, full_name, phone, role, active")
    .eq("id", cookie.targetId)
    .maybeSingle();
  if (!target || target.role === "owner" || !target.active) {
    return { profile: real, real, viewingAs: false, viewAsEnded: true };
  }
  return { profile: target, real, viewingAs: true, viewAsEnded: false };
});

// For layouts and pages under /app: the person the screen is for. While the
// owner is viewing as someone, that is the person being viewed, so every
// screen shows what they would see (CLAUDE.md, View as).
export async function requireProfile(): Promise<SessionProfile> {
  return (await getViewer()).profile;
}

export class ReadOnlyError extends Error {
  constructor() {
    super("View as is read only");
    this.name = "ReadOnlyError";
  }
}

// Server actions always act as the person actually signed in, and refuse
// while the owner is viewing as someone. proxy.ts refuses those requests
// first; this is the second lock.
async function refuseWhileViewing(real: SessionProfile) {
  if (await viewAsCookieFor(real)) throw new ReadOnlyError();
}

export class NotOwnerError extends Error {
  constructor() {
    super("Not for your role");
    this.name = "NotOwnerError";
  }
}

// For server actions that only the owner may run. Throws instead of
// redirecting so the action can hand a plain message back to the form.
export async function requireOwnerForAction(): Promise<SessionProfile> {
  const session = await getSession();
  if (
    session.status !== "ok" ||
    !session.profile.active ||
    session.profile.role !== "owner"
  ) {
    throw new NotOwnerError();
  }
  await refuseWhileViewing(session.profile);
  return session.profile;
}

// The sales side of the app (leads, knock sessions) is for active owners and
// sales associates. Crew has no screens there yet.
export function isSalesSide(profile: SessionProfile): boolean {
  return profile.active && (profile.role === "owner" || profile.role === "sales");
}

export class NotAllowedError extends Error {
  constructor() {
    super("Not for your role");
    this.name = "NotAllowedError";
  }
}

// For server actions on leads and knock sessions.
export async function requireSalesSideForAction(): Promise<SessionProfile> {
  const session = await getSession();
  if (session.status !== "ok" || !isSalesSide(session.profile)) {
    throw new NotAllowedError();
  }
  await refuseWhileViewing(session.profile);
  return session.profile;
}
