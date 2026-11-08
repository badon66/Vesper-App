import "server-only";
import type { ContactViewer } from "@/lib/leads/contact-rules";
import { notesForLeads } from "@/lib/leads/notes";
import { contactsFor } from "@/lib/leads/contacts";
import { toBoardSlots, type BoardSlot } from "@/lib/schedule/board";
import { PHOTO_BUCKET } from "@/lib/photos";
import { createClient } from "@/lib/supabase/server";
import { addDays, calgaryDayStart } from "@/lib/time";
import type { Database } from "@/types/database";

type Client = Awaited<ReturnType<typeof createClient>>;

export type BookingSettings = {
  windowDays: number;
  cutoffMinutes: number;
  // Round 2: how long a hold lasts, and what Add 5 minutes adds.
  holdMinutes: number;
  slotMinutes: number;
  distanceKm: number;
};

// The booking settings everyone may read, through settings_public.
export async function bookingSettings(supabase: Client): Promise<BookingSettings> {
  const { data } = await supabase
    .from("settings_public")
    .select("booking_window_days, booking_cutoff_minutes, hold_minutes, meeting_slot_minutes, distance_warning_km")
    .maybeSingle();
  return {
    windowDays: data?.booking_window_days ?? 14,
    cutoffMinutes: data?.booking_cutoff_minutes ?? 30,
    holdMinutes: data?.hold_minutes ?? 5,
    slotMinutes: data?.meeting_slot_minutes ?? 45,
    distanceKm: Number(data?.distance_warning_km ?? 10),
  };
}

// The board as the person the screen is for sees it. While the owner views
// the app as a setter, the board is read with the setter's cutoff and their
// holds and bookings count as "mine" (CLAUDE.md, View as).
export async function fetchBoard(
  supabase: Client,
  forPerson: { id: string; role: string },
  realRole: string,
): Promise<BoardSlot[]> {
  const asSales = forPerson.role !== "owner";
  const viewingAsSomeone = realRole === "owner" && forPerson.role !== "owner";
  const { data } = await supabase.rpc("schedule_board", {
    p_as_sales: asSales,
    ...(viewingAsSomeone ? { p_viewer: forPerson.id } : {}),
  });
  return toBoardSlots(data);
}

export type ActiveHold = { startsAt: string; leadId: string | null; meetingId: string | null };

// The hold a person has right now, if its timer hasn't run out: it lasts
// holdMinutes from renewed_at (round 2).
export async function activeHoldOf(supabase: Client, personId: string, holdMinutes: number): Promise<ActiveHold | null> {
  const since = new Date(Date.now() - holdMinutes * 60_000).toISOString();
  const { data } = await supabase
    .from("slot_holds")
    .select("starts_at, lead_id, meeting_id")
    .eq("holder_id", personId)
    .is("released_at", null)
    .gt("renewed_at", since)
    .maybeSingle();
  return data ? { startsAt: new Date(data.starts_at).toISOString(), leadId: data.lead_id, meetingId: data.meeting_id } : null;
}

const MEETING_COLUMNS =
  "id, lead_id, host_id, setter_id, booked_by, starts_at, ends_at, status, photos_skipped, photos_skip_note, outcome_reason, outcome_note, outcome_at, outcome_by, rebooked_as, created_at";
// The counted questions come along so each card can say how complete the
// lead is ("5 of 6 collected", round 2 and round 6). Never the phone, email
// or notes: those come from lead_contacts (2026-11-04) and lead_notes
// (round 6), for the leads the viewer may see them on.
const LEAD_COLUMNS =
  "id, first_name, last_name, address_line, city, neighbourhood, phone_saved, lat, lng, position_source, position_accuracy_m, status, created_by, assigned_to, owns_home, wants_price, both_decision_makers, christmas_lights_now, looked_into_before, not_collected, setter_read, hot_buttons";

export type MeetingRow = Pick<
  Database["public"]["Tables"]["meetings"]["Row"],
  | "id"
  | "lead_id"
  | "host_id"
  | "setter_id"
  | "booked_by"
  | "starts_at"
  | "ends_at"
  | "status"
  | "photos_skipped"
  | "photos_skip_note"
  | "outcome_reason"
  | "outcome_note"
  | "outcome_at"
  | "outcome_by"
  | "rebooked_as"
  | "created_at"
>;
export type MeetingLead = Pick<
  Database["public"]["Tables"]["leads"]["Row"],
  | "id"
  | "first_name"
  | "last_name"
  | "address_line"
  | "city"
  | "neighbourhood"
  | "phone_saved"
  | "lat"
  | "lng"
  | "position_source"
  | "position_accuracy_m"
  | "status"
  | "created_by"
  | "assigned_to"
  | "owns_home"
  | "wants_price"
  | "both_decision_makers"
  | "christmas_lights_now"
  | "looked_into_before"
  | "not_collected"
  // Round 3: Keenan sees these on his Meetings page and Home.
  | "setter_read"
  | "hot_buttons"
> & {
  // The phone, only on a lead the viewer may contact (contact privacy), and
  // the setter's notes on the same leads (round 6).
  phone: string | null;
  notes: string | null;
};
export type MeetingWithLead = MeetingRow & { lead: MeetingLead };

// Meetings starting between two moments, with their leads. setterId keeps
// a setter's own screens to their own bookings, which View as relies on.
// viewer adds the phone of the leads that person may contact; without it no
// phone comes along at all.
export async function meetingsBetween(
  supabase: Client,
  fromIso: string,
  toIso: string,
  opts: { setterId?: string; leadId?: string; viewer?: ContactViewer } = {},
): Promise<MeetingWithLead[]> {
  let query = supabase
    .from("meetings")
    .select(`${MEETING_COLUMNS}, lead:leads!meetings_lead_id_fkey(${LEAD_COLUMNS})`)
    .gte("starts_at", fromIso)
    .lt("starts_at", toIso)
    .order("starts_at")
    .order("created_at");
  if (opts.setterId) query = query.eq("setter_id", opts.setterId);
  if (opts.leadId) query = query.eq("lead_id", opts.leadId);
  const { data } = await query;
  const meetings = ((data ?? []) as unknown as (MeetingRow & { lead: Omit<MeetingLead, "phone" | "notes"> | null })[]).filter(
    (meeting): meeting is MeetingRow & { lead: Omit<MeetingLead, "phone" | "notes"> } => meeting.lead !== null,
  );
  const ids = meetings.map((meeting) => meeting.lead.id);
  const [contacts, notes] = opts.viewer
    ? await Promise.all([contactsFor(supabase, opts.viewer, ids), notesForLeads(supabase, opts.viewer, ids)])
    : [new Map(), new Map()];
  return meetings.map((meeting) => ({
    ...meeting,
    lead: { ...meeting.lead, phone: contacts.get(meeting.lead.id)?.phone ?? null, notes: notes.get(meeting.lead.id)?.notes ?? null },
  }));
}

// One Calgary evening's meetings.
export function meetingsOnDay(supabase: Client, day: string, opts: { setterId?: string; viewer?: ContactViewer } = {}) {
  return meetingsBetween(supabase, calgaryDayStart(day), calgaryDayStart(addDays(day, 1)), opts);
}

// A lead's meetings, newest first.
export async function meetingsForLead(supabase: Client, leadId: string): Promise<MeetingRow[]> {
  const { data } = await supabase
    .from("meetings")
    .select(MEETING_COLUMNS)
    .eq("lead_id", leadId)
    .order("starts_at", { ascending: false })
    .order("created_at", { ascending: false });
  return (data ?? []) as MeetingRow[];
}

// The guided photos of some leads, with short-lived links, by lead.
export async function slotPhotoLinks(
  supabase: Client,
  leadIds: string[],
): Promise<Map<string, { slot: string; url: string }[]>> {
  const byLead = new Map<string, { slot: string; url: string }[]>();
  if (leadIds.length === 0) return byLead;
  const { data: rows } = await supabase
    .from("lead_photos")
    .select("lead_id, storage_path, slot")
    .in("lead_id", leadIds)
    .in("slot", ["front", "left_corner", "right_corner", "soffit"]);
  const paths = (rows ?? []).map((row) => row.storage_path);
  if (paths.length === 0) return byLead;
  const { data: signed } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600);
  const urlByPath = new Map((signed ?? []).flatMap((item) => (item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [])));
  const order = ["front", "left_corner", "right_corner", "soffit"];
  for (const row of rows ?? []) {
    const url = urlByPath.get(row.storage_path);
    if (!url || !row.slot) continue;
    const list = byLead.get(row.lead_id) ?? [];
    list.push({ slot: row.slot, url });
    byLead.set(row.lead_id, list);
  }
  for (const list of byLead.values()) list.sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot));
  return byLead;
}

// How many of the Front, Left corner and Right corner photos a lead has.
export async function guidedPhotoCount(supabase: Client, leadId: string): Promise<number> {
  const { data } = await supabase
    .from("lead_photos")
    .select("slot")
    .eq("lead_id", leadId)
    .in("slot", ["front", "left_corner", "right_corner"]);
  return new Set((data ?? []).map((row) => row.slot)).size;
}
