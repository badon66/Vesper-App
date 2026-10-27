import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
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

// For layouts and pages under /app. A signed-out visitor goes to /login. An
// ended session, a deactivated account, or a session with no profile row is
// signed out through a route handler because a Server Component cannot
// clear cookies.
export async function requireProfile(): Promise<SessionProfile> {
  const session = await getSession();
  if (session.status === "anonymous") redirect("/login");
  if (session.status === "ended") redirect("/auth/signout?reason=session_ended");
  if (session.status === "no_profile") redirect("/auth/signout?reason=no_profile");
  if (!session.profile.active) redirect("/auth/signout?reason=deactivated");
  return session.profile;
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
  return session.profile;
}
