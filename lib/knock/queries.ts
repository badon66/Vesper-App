import "server-only";
import { outToday, recentNeighbourhoods, type OutTodayRow } from "@/lib/knock/session";
import { namesById } from "@/lib/leads/queries";
import { createClient } from "@/lib/supabase/server";
import { calgaryDayStart, calgaryToday } from "@/lib/time";

type Client = Awaited<ReturnType<typeof createClient>>;

// A booking still on: booked or confirmed, or marked after the meeting. A
// move leaves the lead's new booking on; a cancel takes it off.
const STILL_ON = ["booked", "confirmed", "qualified", "not_qualified", "no_show"] as const;

export type SessionTally = { leads: number; bookings: number };

// How a session went beyond its counters: the leads saved while it ran
// (which is how a lead links to a session) and how many of them have a
// booking still on. Read only, so it is safe under View as.
export async function sessionTally(supabase: Client, sessionId: string): Promise<SessionTally> {
  const { data: leads } = await supabase.from("leads").select("id").eq("knock_session_id", sessionId).limit(500);
  const ids = (leads ?? []).map((lead) => lead.id);
  if (ids.length === 0) return { leads: 0, bookings: 0 };
  const { data: meetings } = await supabase
    .from("meetings")
    .select("lead_id")
    .in("lead_id", ids)
    .in("status", [...STILL_ON]);
  return { leads: ids.length, bookings: new Set((meetings ?? []).map((meeting) => meeting.lead_id)).size };
}

// The person's last session that ended today, with how it went, for the
// summary Session shows until the next start. Scoped to the person, so View
// as shows theirs.
export async function lastEndedToday(supabase: Client, userId: string): Promise<{
  neighbourhood: string;
  startedAt: string;
  endedAt: string;
  doors: number;
  conversations: number;
  leads: number;
  bookings: number;
} | null> {
  const { data } = await supabase
    .from("knock_sessions")
    .select("id, neighbourhood, started_at, ended_at, doors_knocked, conversations")
    .eq("user_id", userId)
    .not("ended_at", "is", null)
    .gte("started_at", calgaryDayStart(calgaryToday()))
    .order("ended_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.ended_at) return null;
  const tally = await sessionTally(supabase, data.id);
  return {
    neighbourhood: data.neighbourhood,
    startedAt: data.started_at,
    endedAt: data.ended_at,
    doors: data.doors_knocked,
    conversations: data.conversations,
    leads: tally.leads,
    bookings: tally.bookings,
  };
}

// The person's own recent neighbourhoods, newest first, for one-tap chips.
// Scoped to the person, so View as shows theirs.
export async function recentNeighbourhoodsOf(supabase: Client, userId: string): Promise<string[]> {
  const { data } = await supabase
    .from("knock_sessions")
    .select("neighbourhood")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(40);
  return recentNeighbourhoods(data ?? []);
}

// Everyone else who has knocked today in Calgary, with names. Setters read
// every knock session (they work as a team), so this is the same for a
// setter, for Keenan, and under View as.
export async function outTodayFor(supabase: Client, excludeId: string | null): Promise<OutTodayRow[]> {
  const { data } = await supabase
    .from("knock_sessions")
    .select("user_id, neighbourhood, started_at, ended_at, doors_knocked, conversations")
    .gte("started_at", calgaryDayStart(calgaryToday()))
    .order("started_at", { ascending: false })
    .limit(200);
  const sessions = data ?? [];
  const names = await namesById(
    supabase,
    sessions.map((session) => session.user_id),
  );
  return outToday(sessions, names, excludeId);
}
