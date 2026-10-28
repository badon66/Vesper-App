import "server-only";
import { createClient } from "@/lib/supabase/server";

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

// The person's open knock session, after closing any left open from an
// earlier Calgary day.
export async function openKnockSession(
  supabase: Client,
  userId: string,
): Promise<OpenKnockSession | null> {
  await supabase.rpc("close_my_stale_knock_sessions");
  const { data } = await supabase
    .from("knock_sessions")
    .select("id, neighbourhood, started_at, doors_knocked, conversations")
    .eq("user_id", userId)
    .is("ended_at", null)
    .maybeSingle();
  return data ?? null;
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
