"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  NotAllowedError,
  ReadOnlyError,
  requireSalesSideForAction,
  requireSalesSideForRead,
  type SessionProfile,
} from "@/lib/auth/profile";
import type { SheetDraft } from "@/lib/booking/sheet";
import { type PhotoSlot } from "@/lib/leads/door";
import { COUNTED_QUESTIONS, type CountedQuestion } from "@/lib/leads/questions";
import { followUpLabel } from "@/lib/leads/attention";
import { openKnockSession } from "@/lib/leads/queries";
import { contactFor } from "@/lib/leads/contacts";
import { LEAD_FIELDS } from "@/lib/leads/fields";
import { insertLeadOnce, NOT_SAVED, readSaveKey } from "@/lib/leads/save-key";
import { leadColumnsFromValues, parseLeadForm, type LeadFormErrors } from "@/lib/leads/schema";
import { leadName, STATUS_LABELS } from "@/lib/leads/status";
import { isOwnPhotoPath, PHOTO_BUCKET } from "@/lib/photos";
import type { BoardSlot } from "@/lib/schedule/board";
import { distanceWarnings, formatKm } from "@/lib/schedule/distance";
import { isLive, LIVE_STATUSES } from "@/lib/schedule/meetings";
import { bookingMessage, errorCode } from "@/lib/schedule/messages";
import { bookingSettings, fetchBoard, meetingsOnDay } from "@/lib/schedule/queries";
import { createClient } from "@/lib/supabase/server";
import { calgaryDateOf, calgaryToday, formatTime } from "@/lib/time";
import { VIEW_AS_READ_ONLY } from "@/lib/view-as";

// The booking sheet's reads and writes (Keenan, 2026-11-02). Every one runs
// with the signed-in person's own session, so Row Level Security and the
// booking functions decide, exactly as for the rest of the app. While the
// owner views the app as someone (round 2), the reads read as that person,
// so he can click through, and every write is refused.

type Refused = { ok: false; error: string };

async function salesSide(): Promise<SessionProfile | Refused> {
  try {
    return await requireSalesSideForAction();
  } catch (e) {
    if (e instanceof ReadOnlyError) return { ok: false, error: VIEW_AS_READ_ONLY };
    if (e instanceof NotAllowedError) return { ok: false, error: "Not for your role." };
    throw e;
  }
}

// For the reads: who the sheet is for, the viewed person while viewing.
async function reader(): Promise<SessionProfile | Refused> {
  return (await viewer()).profile;
}

async function viewer(): Promise<{ profile: SessionProfile | Refused; viewingAs: boolean }> {
  try {
    return await requireSalesSideForRead();
  } catch (e) {
    if (e instanceof NotAllowedError) return { profile: { ok: false, error: "Not for your role." }, viewingAs: false };
    throw e;
  }
}

const refused = (value: unknown): value is Refused =>
  typeof value === "object" && value !== null && "ok" in value && (value as { ok: boolean }).ok === false;

const id = z.uuid();
const instant = z.iso.datetime({ offset: true });

const mine = (me: SessionProfile, lead: { created_by: string; assigned_to: string | null }) =>
  me.role === "owner" || lead.created_by === me.id || lead.assigned_to === me.id;

// ---------------------------------------------------------------- opening

export type SheetNotes = { door: string; after: string; book: string };
export type SheetContext =
  | { ok: true; board: BoardSlot[]; today: string; windowDays: number; asSales: boolean; notes: SheetNotes; holdMinutes: number }
  | Refused;

// What the sheet needs when it opens: the board for its time picker and the
// step notes behind "?".
export async function sheetContext(): Promise<SheetContext> {
  const { profile: me, viewingAs } = await viewer();
  if (refused(me)) return me;
  const supabase = await createClient();
  const asSales = me.role !== "owner";
  // While Keenan views the app as a setter, the board reads as theirs.
  const [settings, board, { data: notes }] = await Promise.all([
    bookingSettings(supabase),
    fetchBoard(supabase, me, viewingAs ? "owner" : me.role),
    supabase.from("settings_public").select("step_note_at_door, step_note_after_door, step_note_book").maybeSingle(),
  ]);
  return {
    ok: true,
    board,
    today: calgaryToday(),
    windowDays: settings.windowDays,
    asSales,
    holdMinutes: settings.holdMinutes,
    notes: {
      door: notes?.step_note_at_door ?? "",
      after: notes?.step_note_after_door ?? "",
      book: notes?.step_note_book ?? "",
    },
  };
}

export type SheetLead =
  | {
      ok: true;
      draft: SheetDraft;
      name: string;
      bookable: boolean;
      notBookableReason: string | null;
      photos: Partial<Record<PhotoSlot, string>>;
    }
  | Refused;

// A lead to book, as the sheet's draft, with signed links to its guided photos.
export async function sheetLead(leadId: string): Promise<SheetLead> {
  const me = await reader();
  if (refused(me)) return me;
  const leadIdParsed = id.safeParse(leadId);
  if (!leadIdParsed.success) return { ok: false, error: "That lead was not found." };
  const supabase = await createClient();
  const [{ data: lead }, { data: photoRows }, { data: live }] = await Promise.all([
    supabase.from("leads").select(LEAD_FIELDS).eq("id", leadIdParsed.data).maybeSingle(),
    supabase.from("lead_photos").select("storage_path, slot, created_at").eq("lead_id", leadIdParsed.data).not("slot", "is", null).order("created_at"),
    supabase.from("meetings").select("id").eq("lead_id", leadIdParsed.data).in("status", ["booked", "confirmed"]),
  ]);
  if (!lead) return { ok: false, error: "That lead was not found." };
  if (!mine(me, lead)) return { ok: false, error: "You can only book your own leads." };
  // Their own lead, or Keenan: its phone comes from lead_contacts (2026-11-04).
  const contact = await contactFor(supabase, me, lead.id);

  // The newest photo in each slot.
  const latest = new Map<string, string>();
  for (const row of photoRows ?? []) if (row.slot) latest.set(row.slot, row.storage_path);
  const paths = [...latest.values()];
  const { data: signed } = paths.length > 0 ? await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600) : { data: [] };
  const urlByPath = new Map((signed ?? []).flatMap((item) => (item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [])));
  const photos: Partial<Record<PhotoSlot, string>> = {};
  for (const [slot, path] of latest) {
    const url = urlByPath.get(path);
    if (url) photos[slot as PhotoSlot] = url;
  }

  const statusOk = lead.status === "new" || lead.status === "follow_up";
  const notBookableReason = !statusOk
    ? `This lead is at ${STATUS_LABELS[lead.status]}, so it can't be booked.`
    : (live ?? []).length > 0
      ? "This lead already has a meeting booked. Move that booking instead."
      : null;

  return {
    ok: true,
    name: leadName(lead),
    bookable: notBookableReason === null,
    notBookableReason,
    photos,
    draft: {
      leadId: lead.id,
      first_name: lead.first_name,
      last_name: lead.last_name ?? "",
      phone: contact.phone ?? "",
      owns_home: lead.owns_home,
      wants_price: lead.wants_price,
      christmas_lights_now: lead.christmas_lights_now,
      looked_into_before: lead.looked_into_before,
      areas_wanted: lead.areas_wanted,
      install_timing: lead.install_timing,
      everyone: lead.both_decision_makers,
      not_collected: (lead.not_collected ?? []).filter((item): item is CountedQuestion =>
        (COUNTED_QUESTIONS as string[]).includes(item),
      ),
      address_line: lead.address_line,
      city: lead.city,
      postal_code: lead.postal_code ?? "",
      neighbourhood: lead.neighbourhood ?? "",
      lat: lead.lat,
      lng: lead.lng,
      place_id: lead.place_id,
      position_source: lead.position_source,
      position_accuracy_m: lead.position_accuracy_m,
      soffit_colour: lead.soffit_colour,
      soffit_note: lead.soffit_note ?? "",
      photo_slots: Object.keys(photos) as PhotoSlot[],
      photo_paths: {},
      skip: null,
      skip_note: "",
      house_type: lead.house_type,
      setter_read: lead.setter_read,
      hot_buttons: lead.hot_buttons ?? [],
      confirm_by: lead.confirm_by,
      extras: true,
    },
  };
}

export type BookableLead = { id: string; name: string; address: string; status: string };

// "Existing lead instead": the person's own New and Follow up leads (every
// one, for Keenan), newest first.
export async function sheetBookableLeads(): Promise<{ ok: true; leads: BookableLead[] } | Refused> {
  const me = await reader();
  if (refused(me)) return me;
  const supabase = await createClient();
  let query = supabase
    .from("leads")
    .select("id, first_name, last_name, address_line, neighbourhood, status, follow_up_on, created_at")
    .in("status", ["new", "follow_up"])
    .order("created_at", { ascending: false })
    .limit(100);
  if (me.role !== "owner") query = query.or(`created_by.eq.${me.id},assigned_to.eq.${me.id}`);
  const { data } = await query;
  const today = calgaryToday();
  // Like Leads: follow-ups by their day, the most overdue first, then New
  // leads, the newest first.
  const rows = [...(data ?? [])].sort((a, b) => {
    const rank = (lead: typeof a) => (lead.status === "follow_up" ? 0 : 1);
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    if (a.status === "follow_up") return (a.follow_up_on ?? "9999").localeCompare(b.follow_up_on ?? "9999");
    return b.created_at.localeCompare(a.created_at);
  });
  return {
    ok: true,
    leads: rows.map((lead) => ({
      id: lead.id,
      name: leadName(lead),
      address: [lead.address_line, lead.neighbourhood].filter(Boolean).join(", "),
      status: lead.status === "follow_up" && lead.follow_up_on ? `Follow up, ${followUpLabel(lead.follow_up_on, today).toLowerCase()}` : STATUS_LABELS[lead.status],
    })),
  };
}

// ---------------------------------------------------------------- saving

export type SheetSave = { ok: true; leadId: string } | { ok: false; error: string; errors?: LeadFormErrors };


// Saves the person as a lead the moment they have a first name and an
// address, and every screen after that. The same validation as New lead.
export async function saveSheetLead(leadId: string | null, input: Record<string, unknown>): Promise<SheetSave> {
  const me = await salesSide();
  if (refused(me)) return me;
  const parsed = parseLeadForm(input);
  if (!parsed.ok) {
    const first = Object.values(parsed.errors)[0];
    return { ok: false, error: first ?? "Some answers need a look.", errors: parsed.errors };
  }
  const columns = leadColumnsFromValues(parsed.values);
  const supabase = await createClient();

  if (!leadId) {
    // A new person's first save carries the save key the phone made for
    // them (2026-11-04): a try after a lost answer gets back the lead the
    // first try made, and this save brings it up to date, never a copy.
    const saveKey = readSaveKey(input.save_key);
    if (!saveKey.ok) return { ok: false, error: NOT_SAVED };
    const session = await openKnockSession(supabase, me.id);
    const first = await insertLeadOnce(supabase, me.id, saveKey.key, {
      ...columns,
      first_name: parsed.values.first_name,
      address_line: parsed.values.address_line,
      created_by: me.id,
      status: "new",
      knock_session_id: session?.id ?? null,
    });
    if (!first.ok) return { ok: false, error: first.error };
    if (first.again) {
      const updated = await updateSheetLead(supabase, first.leadId, columns);
      if (!updated.ok) return updated;
    }
    // Round 3: the photos taken before this first save, uploaded to the
    // setter's own folder, go into their slots now. A try after a lost
    // answer adds only the ones the lead doesn't have yet.
    const attached = await attachSlotPhotos(supabase, me.id, first.leadId, parsed.values.slot_photos);
    if (!attached) return { ok: false, error: "The photos didn't attach. Try again." };
    revalidatePath("/app/leads");
    return { ok: true, leadId: first.leadId };
  }

  const existing = id.safeParse(leadId);
  if (!existing.success) return { ok: false, error: "That lead was not found." };
  return updateSheetLead(supabase, existing.data, columns);
}

async function attachSlotPhotos(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  leadId: string,
  photos: { slot: PhotoSlot; path: string }[],
): Promise<boolean> {
  if (photos.length === 0) return true;
  if (photos.some((photo) => !isOwnPhotoPath(photo.path, userId))) return false;
  const { data: have } = await supabase.from("lead_photos").select("storage_path").eq("lead_id", leadId);
  const known = new Set((have ?? []).map((row) => row.storage_path));
  const fresh = photos.filter((photo) => !known.has(photo.path));
  if (fresh.length === 0) return true;
  const { error } = await supabase.from("lead_photos").insert(fresh.map((photo) => ({ lead_id: leadId, storage_path: photo.path, slot: photo.slot })));
  return !error;
}

// A saved lead's save from the sheet: only the sheet's own columns. An
// existing lead's email, notes and source are never touched from the sheet.
// Its house type is (round 3: the house step asks it).
async function updateSheetLead(
  supabase: Awaited<ReturnType<typeof createClient>>,
  leadId: string,
  columns: ReturnType<typeof leadColumnsFromValues>,
): Promise<SheetSave> {
  const { email: _email, notes: _notes, source: _source, ...update } = columns;
  void _email;
  void _notes;
  void _source;
  const { data, error } = await supabase.from("leads").update(update).eq("id", leadId).select("id");
  if (error) {
    return { ok: false, error: error.code === "42501" ? "You can only change your own leads." : "The lead could not be saved. Try again." };
  }
  if (!data || data.length === 0) return { ok: false, error: "You can only change your own leads." };
  revalidatePath("/app/leads");
  revalidatePath(`/app/leads/${leadId}`);
  return { ok: true, leadId };
}

// ---------------------------------------------------------------- booking

export type SheetBook =
  | { ok: true; meetingId: string }
  | { ok: false; code: string; message: string; problems?: string[] };

const bookSchema = z.object({
  leadId: id,
  startsAt: instant,
  everyone: z.boolean(),
  skip: z.enum(["homeowner_said_no", "other"]).nullable(),
  skipNote: z.string().trim().max(300),
});

export async function bookFromSheet(input: {
  leadId: string;
  startsAt: string;
  everyone: boolean;
  skip: "homeowner_said_no" | "other" | null;
  skipNote: string;
}): Promise<SheetBook> {
  const me = await salesSide();
  if (refused(me)) return { ok: false, code: "not_allowed", message: me.error };
  const parsed = bookSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid", message: "Pick a time and a lead first." };
  const values = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("book_meeting", {
    p_lead_id: values.leadId,
    p_starts_at: values.startsAt,
    p_everyone_deciding_present: values.everyone,
    ...(values.skip ? { p_photos_skipped: values.skip } : {}),
    ...(values.skipNote ? { p_photos_skip_note: values.skipNote } : {}),
  });
  if (error || !data) {
    const code = error ? errorCode(error) : "unknown";
    return {
      ok: false,
      code,
      message: error ? bookingMessage(error) : "That didn't book. Try again.",
      problems: code === "not_ready" ? (error?.details ?? "").split(",").filter(Boolean) : undefined,
    };
  }
  revalidatePath("/app");
  revalidatePath("/app/schedule");
  revalidatePath("/app/leads");
  revalidatePath("/app/pay");
  revalidatePath(`/app/leads/${values.leadId}`);
  return { ok: true, meetingId: data as string };
}

// Whether a lead now has its booking at a time (2026-11-03). Book asks when
// its answer never arrived (no signal, or too slow), and when a try after
// that is refused: the booking may have gone through anyway, and then the
// setter sees it booked rather than an error. Read only, as the person the
// sheet is for; every sales user can already see every booking.
export type SheetBookedAt = { ok: true; booked: boolean } | Refused;

export async function sheetBookedAt(input: { leadId: string; startsAt: string }): Promise<SheetBookedAt> {
  const me = await reader();
  if (refused(me)) return me;
  const leadIdParsed = id.safeParse(input?.leadId);
  const at = instant.safeParse(input?.startsAt);
  if (!leadIdParsed.success || !at.success) return { ok: false, error: "That booking was not found." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meetings")
    .select("id")
    .eq("lead_id", leadIdParsed.data)
    .eq("starts_at", at.data)
    .in("status", [...LIVE_STATUSES])
    .limit(1);
  if (error) return { ok: false, error: "That couldn't be checked. Try again." };
  return { ok: true, booked: (data ?? []).length > 0 };
}

// The straight-line distance warning for a lead at a time, for the Book screen.
export async function sheetDistanceWarnings(leadId: string, startsAt: string): Promise<string[]> {
  const me = await reader();
  if (refused(me)) return [];
  const leadIdParsed = id.safeParse(leadId);
  const at = instant.safeParse(startsAt);
  if (!leadIdParsed.success || !at.success) return [];
  const supabase = await createClient();
  const [{ data: lead }, settings, evening] = await Promise.all([
    supabase.from("leads").select("lat, lng").eq("id", leadIdParsed.data).maybeSingle(),
    bookingSettings(supabase),
    meetingsOnDay(supabase, calgaryDateOf(at.data)),
  ]);
  if (!lead || lead.lat === null || lead.lng === null) return [];
  const others = evening
    .filter((meeting) => isLive(meeting.status) || meeting.status === "qualified" || meeting.status === "not_qualified")
    .filter((meeting) => meeting.lead_id !== leadIdParsed.data)
    .map((meeting) => ({ startsAt: meeting.starts_at, lat: meeting.lead.lat, lng: meeting.lead.lng, neighbourhood: meeting.lead.neighbourhood }));
  return distanceWarnings({ lat: lead.lat, lng: lead.lng }, at.data, others, settings.distanceKm).map(
    (warning) =>
      `This address is ${formatKm(warning.km)} in a straight line from the ${formatTime(warning.meeting.startsAt)} meeting${
        warning.meeting.neighbourhood ? ` in ${warning.meeting.neighbourhood}` : ""
      }.`,
  );
}
