import "server-only";
import { createClient } from "@/lib/supabase/server";
import { calgaryDayStart, calgaryToday } from "@/lib/time";

type Client = Awaited<ReturnType<typeof createClient>>;

// Names for profile ids, deactivated people included, so old leads and
// timelines still say who did what.
export async function namesById(
  supabase: Client,
  ids: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const wanted = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  const names = new Map<string, string>();
  if (wanted.length === 0) return names;
  const { data } = await supabase.from("profile_names").select("id, full_name").in("id", wanted);
  for (const row of data ?? []) {
    if (row.id && row.full_name) names.set(row.id, row.full_name);
  }
  return names;
}

export async function lostReasons(supabase: Client): Promise<string[]> {
  const { data } = await supabase.from("settings_public").select("lost_reasons").maybeSingle();
  return data?.lost_reasons ?? [];
}

export type OpenKnockSession = {
  id: string;
  neighbourhood: string;
  started_at: string;
  doors_knocked: number;
  conversations: number;
};

// The person's knock session that is open now. Only a session started today
// in Calgary counts: one left open from an earlier day is closed on the
// person's next visit and never shows as running. A pure read, so it is safe
// while the owner views the app as someone (CLAUDE.md, View as).
export async function openKnockSession(
  supabase: Client,
  userId: string,
): Promise<OpenKnockSession | null> {
  const { data } = await supabase
    .from("knock_sessions")
    .select("id, neighbourhood, started_at, doors_knocked, conversations")
    .eq("user_id", userId)
    .is("ended_at", null)
    .gte("started_at", calgaryDayStart(calgaryToday()))
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

// Closes the signed-in person's sessions left open from an earlier day, at
// their last tap. A write, so it runs only for the person themselves, never
// while the owner is viewing as someone.
export async function closeMyStaleKnockSessions(supabase: Client): Promise<void> {
  await supabase.rpc("close_my_stale_knock_sessions");
}

export type DueFollowUp = {
  id: string;
  first_name: string;
  last_name: string | null;
  address_line: string;
  neighbourhood: string | null;
  follow_up_on: string | null;
};

// The person's own follow-ups due today or overdue, oldest date first.
// Scoped to the person explicitly, not by Row Level Security alone, so View
// as shows exactly what they would see.
export async function followUpsDue(supabase: Client, userId: string, today: string): Promise<DueFollowUp[]> {
  const { data } = await supabase
    .from("leads")
    .select("id, first_name, last_name, address_line, neighbourhood, follow_up_on")
    .or(`created_by.eq.${userId},assigned_to.eq.${userId}`)
    .eq("status", "follow_up")
    .lte("follow_up_on", today)
    .order("follow_up_on", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(50);
  return data ?? [];
}

export async function lastNeighbourhood(supabase: Client, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("knock_sessions")
    .select("neighbourhood")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.neighbourhood ?? null;
}
