import "server-only";

import { pickDays, type PickDay } from "@/lib/installs/calendar";
import type { createClient } from "@/lib/supabase/server";
import { addDays } from "@/lib/time";

type Client = Awaited<ReturnType<typeof createClient>>;

// Round 23: the open days Keenan can put a lead's install on, from
// tomorrow, with which are full (the lead's own day never counts against
// it). Read with his session; the database checks again when he saves.
export const OWNER_SPAN_DAYS = 120;

export async function ownerPickDays(supabase: Client, leadId: string | null, today: string): Promise<PickDay[]> {
  const from = addDays(today, 1);
  const to = addDays(from, OWNER_SPAN_DAYS - 1);
  const [{ data: rows }, { data: leads }, { data: settings }] = await Promise.all([
    supabase.from("install_days").select("day, open, job_limit").eq("open", true).gte("day", from).lte("day", to),
    supabase.from("leads").select("id, install_on").gte("install_on", from).lte("install_on", to).neq("status", "lost"),
    supabase.from("settings").select("install_jobs_per_day").eq("id", 1).maybeSingle(),
  ]);
  const booked = (leads ?? []).filter((lead) => lead.install_on).map((lead) => ({ id: lead.id, name: "", day: lead.install_on as string }));
  return pickDays(rows ?? [], booked, settings?.install_jobs_per_day ?? 1, from, leadId, OWNER_SPAN_DAYS);
}
