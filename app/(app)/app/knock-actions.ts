"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  NotAllowedError,
  ReadOnlyError,
  requireSalesSideForAction,
  type SessionProfile,
} from "@/lib/auth/profile";
import { sessionTally } from "@/lib/knock/queries";
import { fixedStart } from "@/lib/knock/session";
import { createClient } from "@/lib/supabase/server";
import { calgaryDateOf, calgaryDayStart } from "@/lib/time";
import { VIEW_AS_READ_ONLY } from "@/lib/view-as";

export type KnockState = { ok?: boolean; error?: string };
export type KnockBumpResult =
  | { ok: true; doors: number; conversations: number }
  | { ok: false; error: string; fatal: boolean };

// What End knocking shows (Keenan, 2026-11-05).
export type KnockSummary = {
  neighbourhood: string;
  startedAt: string;
  endedAt: string;
  doors: number;
  conversations: number;
  leads: number;
  bookings: number;
  // Round 4: it was still open at midnight and ended itself.
  automatic: boolean;
};
export type KnockEndResult = { ok: true; summary: KnockSummary } | { ok: false; error: string };
export type KnockFixResult = { ok: true; startedAt: string } | { ok: false; error: string };

// Session and Home both show the session, so both are drawn again.
function redrawSession() {
  revalidatePath("/app/session");
  revalidatePath("/app");
}

// Who is acting, or the message to show instead.
async function salesSide(): Promise<SessionProfile | string> {
  try {
    return await requireSalesSideForAction();
  } catch (e) {
    if (e instanceof ReadOnlyError) return VIEW_AS_READ_ONLY;
    if (e instanceof NotAllowedError) return "Not for your role.";
    throw e;
  }
}

const neighbourhoodSchema = z
  .string()
  .trim()
  .min(1, { error: "Enter the neighbourhood." })
  .max(80, { error: "That neighbourhood name is too long." });

export async function startKnockSession(
  _previous: KnockState,
  formData: FormData,
): Promise<KnockState> {
  const me = await salesSide();
  if (typeof me === "string") return { error: me };
  const parsed = neighbourhoodSchema.safeParse(formData.get("neighbourhood") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter the neighbourhood." };

  const supabase = await createClient();
  await supabase.rpc("close_my_stale_knock_sessions");
  const { error } = await supabase
    .from("knock_sessions")
    .insert({ neighbourhood: parsed.data, user_id: me.id });
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "You already have a session running. End it first."
          : "The session could not start. Check your signal and try again.",
    };
  }
  redrawSession();
  return { ok: true };
}

const bumpSchema = z.object({
  session: z.uuid(),
  doors: z.number().int().min(-100).max(100),
  conversations: z.number().int().min(-100).max(100),
});

// Adds taps to the counters in one atomic database call. Fast taps are
// batched by the page and never lost.
export async function bumpKnockSession(
  sessionId: string,
  doors: number,
  conversations: number,
): Promise<KnockBumpResult> {
  const me = await salesSide();
  if (typeof me === "string") return { ok: false, error: me, fatal: true };
  const parsed = bumpSchema.safeParse({ session: sessionId, doors, conversations });
  if (!parsed.success) return { ok: false, error: "That tap could not be counted.", fatal: true };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bump_knock_session", {
    p_session: parsed.data.session,
    p_doors: parsed.data.doors,
    p_conversations: parsed.data.conversations,
  });
  if (error) return { ok: false, error: "Not saved yet. Retrying.", fatal: false };
  const row = data?.[0];
  if (!row) {
    return { ok: false, error: "This session has ended. Reload the page to start a new one.", fatal: true };
  }
  return { ok: true, doors: row.doors_knocked, conversations: row.conversations };
}

const ENDED = "This session has ended. Reload the page to start a new one.";

// Fixes the start time of the person's own running session, for a setter who
// tapped Start late: any time earlier that day, never in the future. A
// session's end can't come before its start, so only a running one changes.
export async function fixKnockStart(sessionId: string, hhmm: string): Promise<KnockFixResult> {
  const me = await salesSide();
  if (typeof me === "string") return { ok: false, error: me };
  const id = z.uuid().safeParse(sessionId);
  if (!id.success) return { ok: false, error: "That session was not found." };

  const supabase = await createClient();
  const { data: session, error: readError } = await supabase
    .from("knock_sessions")
    .select("id, started_at")
    .eq("id", id.data)
    .eq("user_id", me.id)
    .is("ended_at", null)
    .maybeSingle();
  if (readError) return { ok: false, error: "The start time could not be saved. Check your signal and try again." };
  if (!session) return { ok: false, error: ENDED };
  const day = calgaryDateOf(session.started_at);
  // Never back into an earlier session today.
  const { data: earlier, error: earlierError } = await supabase
    .from("knock_sessions")
    .select("ended_at")
    .eq("user_id", me.id)
    .neq("id", session.id)
    .not("ended_at", "is", null)
    .gte("started_at", calgaryDayStart(day))
    .lte("started_at", session.started_at)
    .order("ended_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (earlierError) return { ok: false, error: "The start time could not be saved. Check your signal and try again." };
  const fixed = fixedStart(day, String(hhmm ?? ""), Date.now(), earlier?.ended_at ?? null);
  if (!fixed.ok) return fixed;
  const { data, error } = await supabase
    .from("knock_sessions")
    .update({ started_at: fixed.startsAt })
    .eq("id", session.id)
    .eq("user_id", me.id)
    .is("ended_at", null)
    .select("started_at");
  if (error) return { ok: false, error: "The start time could not be saved. Check your signal and try again." };
  if (!data || data.length === 0) return { ok: false, error: ENDED };
  redrawSession();
  return { ok: true, startedAt: data[0].started_at };
}

// Ends the person's own running session and says how it went: time out,
// doors, conversations, leads and bookings. A session already ended (on
// another phone, say) still gets its summary.
export async function endKnockSession(sessionId: string): Promise<KnockEndResult> {
  const me = await salesSide();
  if (typeof me === "string") return { ok: false, error: me };
  const id = z.uuid().safeParse(sessionId);
  if (!id.success) return { ok: false, error: "That session was not found." };

  const supabase = await createClient();
  const columns = "neighbourhood, started_at, ended_at, doors_knocked, conversations, ended_automatically";
  const { data, error } = await supabase
    .from("knock_sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", id.data)
    .eq("user_id", me.id)
    .is("ended_at", null)
    .select(columns);
  if (error) return { ok: false, error: "The session could not end. Check your signal and try again." };
  let row = data?.[0] ?? null;
  if (!row) {
    const { data: already } = await supabase
      .from("knock_sessions")
      .select(columns)
      .eq("id", id.data)
      .eq("user_id", me.id)
      .maybeSingle();
    if (!already?.ended_at) return { ok: false, error: "That session was not found." };
    row = already;
  }
  const tally = await sessionTally(supabase, id.data);
  redrawSession();
  return {
    ok: true,
    summary: {
      neighbourhood: row.neighbourhood,
      startedAt: row.started_at,
      endedAt: row.ended_at ?? new Date().toISOString(),
      doors: row.doors_knocked,
      conversations: row.conversations,
      leads: tally.leads,
      bookings: tally.bookings,
      // Ended here by the person, or already ended itself at midnight.
      automatic: row.ended_automatically,
    },
  };
}
