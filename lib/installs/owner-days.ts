import "server-only";

import { earliestDay, pickDays, type PickDay, type TrackKind } from "@/lib/installs/calendar";
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

// The calendar as it stands from a day for a span: Keenan's open days, the
// jobs booked on them and the numbers in Settings. Read once, in the same
// round as the rest of a page, then shaped for a lead (meetingPickDays).
export type InstallCalendar = {
  rows: { day: string; open: boolean; job_limit: number | null }[];
  booked: { id: string; name: string; day: string }[];
  defaultLimit: number;
  leadDays: { white: number; colour: number };
};

export async function installCalendar(supabase: Client, from: string, span: number): Promise<InstallCalendar> {
  const to = addDays(from, span - 1);
  const [{ data: rows }, { data: leads }, { data: settings }] = await Promise.all([
    supabase.from("install_days").select("day, open, job_limit").eq("open", true).gte("day", from).lte("day", to),
    supabase.from("leads").select("id, install_on").gte("install_on", from).lte("install_on", to).neq("status", "lost"),
    supabase.from("settings").select("install_jobs_per_day, install_lead_days_white, install_lead_days_colour").eq("id", 1).maybeSingle(),
  ]);
  return {
    rows: rows ?? [],
    booked: (leads ?? []).filter((lead) => lead.install_on).map((lead) => ({ id: lead.id, name: "", day: lead.install_on as string })),
    defaultLimit: settings?.install_jobs_per_day ?? 1,
    leadDays: { white: settings?.install_lead_days_white ?? 3, colour: settings?.install_lead_days_colour ?? 7 },
  };
}

// What the meeting's Pick a day offers this lead: the open days from the
// earliest for their track (white 3 days out, any other colour 7), nine
// weeks of them, the same as their link shows.
export function meetingPickDays(calendar: InstallCalendar, leadId: string, today: string, kind: TrackKind): { earliest: string; days: PickDay[] } {
  const earliest = earliestDay(today, kind, calendar.leadDays);
  return { earliest, days: pickDays(calendar.rows, calendar.booked, calendar.defaultLimit, earliest, leadId) };
}
