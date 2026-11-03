"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  NotAllowedError,
  NotOwnerError,
  ReadOnlyError,
  requireOwnerForAction,
  requireSalesSideForAction,
  type SessionProfile, requireSalesSideForRead} from "@/lib/auth/profile";
import type { PhotoSlot } from "@/lib/leads/door";
import { lostReasons, namesById, openKnockSession } from "@/lib/leads/queries";
import {
  leadColumnsFromValues,
  leadFormDataToInput,
  parseLeadForm,
  type LeadFormErrors,
} from "@/lib/leads/schema";
import { followUpDateFor } from "@/lib/leads/attention";
import { canChangeStatus, leadName, STATUS_LABELS } from "@/lib/leads/status";
import { trackColourChoiceSchema } from "@/lib/leads/track-colour";
import { GPS_MAX_ACCURACY_M, inCalgaryArea, NEARBY_LEAD_M } from "@/lib/geo";
import { isOwnPhotoPath, MAX_PHOTOS_PER_FORM } from "@/lib/photos";
import { kmBetween } from "@/lib/schedule/distance";
import { createClient } from "@/lib/supabase/server";
import { calgaryToday, formatDate } from "@/lib/time";
import { VIEW_AS_READ_ONLY } from "@/lib/view-as";
import { Constants } from "@/types/database";

export type LeadFormState = { error?: string; errors?: LeadFormErrors };
export type SimpleState = { ok?: boolean; error?: string };
export type DuplicateLead = {
  id: string;
  name: string;
  status: string;
  addedBy: string;
  addedOn: string;
};

const NOT_YOURS = "You can only change your own leads.";
const NOT_FOR_ROLE = "Not for your role.";

// Who is acting, or the message to show instead.
async function salesSide(): Promise<SessionProfile | string> {
  try {
    return await requireSalesSideForAction();
  } catch (e) {
    if (e instanceof ReadOnlyError) return VIEW_AS_READ_ONLY;
    if (e instanceof NotAllowedError) return NOT_FOR_ROLE;
    throw e;
  }
}

// For the actions that only read: every setter may see every lead, and
// while Keenan views the app as someone they read for him too (round 2).
async function canRead(): Promise<boolean> {
  try {
    await requireSalesSideForRead();
    return true;
  } catch (e) {
    if (e instanceof NotAllowedError) return false;
    throw e;
  }
}

// Saves a new lead as New, linked to the setter's open knock session, with
// the photos already uploaded from the form.
export async function createLead(
  _previous: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const me = await salesSide();
  if (typeof me === "string") return { error: me };

  const parsed = parseLeadForm(leadFormDataToInput(formData));
  if (!parsed.ok) return { error: "Some fields need a look.", errors: parsed.errors };
  const { values } = parsed;
  const photos = [
    ...values.slot_photos.map(({ slot, path }) => ({ storage_path: path, slot })),
    ...values.photo_paths.map((path) => ({ storage_path: path, slot: null })),
  ];
  if (photos.some((photo) => !isOwnPhotoPath(photo.storage_path, me.id))) {
    return { error: "A photo did not upload properly. Remove it and take it again." };
  }

  const supabase = await createClient();
  const session = await openKnockSession(supabase, me.id);
  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      ...leadColumnsFromValues(values),
      first_name: values.first_name,
      address_line: values.address_line,
      created_by: me.id,
      status: "new",
      knock_session_id: session?.id ?? null,
    })
    .select("id")
    .single();
  if (error || !lead) {
    return { error: "The lead could not be saved. Check your signal and try again." };
  }

  let photosFailed = false;
  if (photos.length > 0) {
    const { error: photoError } = await supabase
      .from("lead_photos")
      .insert(photos.map((photo) => ({ lead_id: lead.id, ...photo })));
    photosFailed = Boolean(photoError);
  }

  revalidatePath("/app/leads");

  // Save and book (Keenan, 2026-11-02): the lead page opens the booking
  // sheet for it, on the times, skipping everything already filled in.
  if (formData.get("intent") === "book") {
    redirect(`/app/leads/${lead.id}?book=1${photosFailed ? "&photos=failed" : ""}`);
  }
  if (photosFailed) redirect(`/app/leads/${lead.id}?photos=failed`);
  // While a setter is knocking, the next thing is the next door: back to
  // Home and its counters (2026-11-03). Otherwise to Leads.
  redirect(session && me.role === "sales" ? `/app?added=${lead.id}` : `/app/leads?added=${lead.id}`);
}

export async function updateLead(
  _previous: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const me = await salesSide();
  if (typeof me === "string") return { error: me };
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "That lead was not found." };

  const parsed = parseLeadForm(leadFormDataToInput(formData));
  if (!parsed.ok) return { error: "Some fields need a look.", errors: parsed.errors };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .update(leadColumnsFromValues(parsed.values))
    .eq("id", id.data)
    .select("id");
  if (error) {
    return { error: error.code === "42501" ? NOT_YOURS : "The lead could not be saved. Try again." };
  }
  if (!data || data.length === 0) return { error: NOT_YOURS };

  revalidatePath("/app/leads");
  revalidatePath(`/app/leads/${id.data}`);
  redirect(`/app/leads/${id.data}`);
}

const statusSchema = z.object({
  id: z.uuid(),
  status: z.enum(Constants.public.Enums.lead_status),
  lost_reason: z.string().trim().max(200).optional(),
  follow_up: z.string().max(20).optional(),
  follow_up_date: z.string().max(20).optional(),
});

// Error codes from the leads guard and its checks, in plain words.
function statusSaveError(code: string | undefined): string {
  if (code === "42501") return "That status isn't yours to set.";
  if (code === "22023") return "Pick today or a later day.";
  if (code === "23514") return "Pick when to follow up.";
  return "The status could not be saved. Try again.";
}

export async function changeLeadStatus(
  _previous: SimpleState,
  formData: FormData,
): Promise<SimpleState> {
  const me = await salesSide();
  if (typeof me === "string") return { error: me };
  const parsed = statusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    lost_reason: formData.get("lost_reason") ?? undefined,
    follow_up: formData.get("follow_up") ?? undefined,
    follow_up_date: formData.get("follow_up_date") ?? undefined,
  });
  if (!parsed.success) return { error: "Pick a status." };
  const { id, status } = parsed.data;

  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("id, status, created_by, assigned_to, follow_up_on")
    .eq("id", id)
    .maybeSingle();
  if (!lead) return { error: "That lead was not found." };
  const mine = me.role === "owner" || lead.created_by === me.id || lead.assigned_to === me.id;
  if (!mine) return { error: NOT_YOURS };

  // Follow up needs a day to come back, worked out here in Calgary time.
  let followUpOn: string | null = null;
  if (status === "follow_up") {
    if (parsed.data.follow_up === "keep" && lead.status === "follow_up" && lead.follow_up_on) {
      followUpOn = lead.follow_up_on;
    } else {
      const day = followUpDateFor(parsed.data.follow_up ?? "", parsed.data.follow_up_date ?? null, calgaryToday());
      if (!day.ok) return { error: day.error };
      followUpOn = day.date;
    }
  }

  if (lead.status === status) {
    if (status !== "follow_up" || followUpOn === lead.follow_up_on) return { ok: true };
    // Moving the follow-up day on a lead that stays in Follow up.
    const { data, error } = await supabase
      .from("leads")
      .update({ follow_up_on: followUpOn })
      .eq("id", id)
      .select("id");
    if (error) return { error: statusSaveError(error.code) };
    if (!data || data.length === 0) return { error: NOT_YOURS };
    revalidatePath("/app/leads");
    revalidatePath(`/app/leads/${id}`);
    return { ok: true };
  }
  if (!canChangeStatus(me.role, lead.status, status)) {
    return {
      error: "That status isn't yours to set. Booking sets Meeting booked, and Keenan sets the rest.",
    };
  }

  let lostReason: string | null = null;
  if (status === "lost") {
    const reasons = await lostReasons(supabase);
    const chosen = parsed.data.lost_reason ?? "";
    if (!reasons.includes(chosen)) return { error: "Pick a reason for Lost." };
    lostReason = chosen;
  }

  const { data, error } = await supabase
    .from("leads")
    .update({ status, lost_reason: lostReason, follow_up_on: followUpOn })
    .eq("id", id)
    .select("id");
  if (error) return { error: statusSaveError(error.code) };
  if (!data || data.length === 0) return { error: NOT_YOURS };

  revalidatePath("/app/leads");
  revalidatePath(`/app/leads/${id}`);
  return { ok: true };
}

const noteSchema = z.object({
  id: z.uuid(),
  text: z
    .string()
    .trim()
    .min(1, { error: "Write the note first." })
    .max(4000, { error: "That note is too long." }),
});

export async function addLeadNote(
  _previous: SimpleState,
  formData: FormData,
): Promise<SimpleState> {
  const me = await salesSide();
  if (typeof me === "string") return { error: me };
  const parsed = noteSchema.safeParse({ id: formData.get("id"), text: formData.get("text") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Write the note first." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("lead_events")
    .insert({ lead_id: parsed.data.id, type: "note", payload: { text: parsed.data.text } });
  if (error) {
    return { error: error.code === "42501" ? NOT_YOURS : "The note could not be saved. Try again." };
  }
  revalidatePath(`/app/leads/${parsed.data.id}`);
  return { ok: true };
}

// Adds photos already uploaded from the lead page. With a slot, one photo
// goes into that slot, and any photo already there stays as an extra.
export async function attachLeadPhotos(
  leadId: string,
  paths: string[],
  slot: PhotoSlot | null = null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await salesSide();
  if (typeof me === "string") return { ok: false, error: me };
  const id = z.uuid().safeParse(leadId);
  if (!id.success) return { ok: false, error: "That lead was not found." };
  const slotChoice = z.enum(Constants.public.Enums.photo_slot).nullable().safeParse(slot);
  if (!slotChoice.success) return { ok: false, error: "That photo slot was not found." };
  if (
    paths.length === 0 ||
    paths.length > (slotChoice.data ? 1 : MAX_PHOTOS_PER_FORM) ||
    paths.some((path) => !isOwnPhotoPath(path, me.id))
  ) {
    return { ok: false, error: "A photo did not upload properly. Take it again." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("lead_photos")
    .insert(paths.map((storage_path) => ({ lead_id: id.data, storage_path, slot: slotChoice.data })));
  if (error) {
    return {
      ok: false,
      error: error.code === "42501" ? NOT_YOURS : "The photo could not be added. Try again.",
    };
  }
  revalidatePath(`/app/leads/${id.data}`);
  return { ok: true };
}

// Leads already at this Google place, newest first, so two setters don't
// knock the same door.
export async function findLeadsAtPlace(
  placeId: string,
  excludeLeadId: string | null,
): Promise<DuplicateLead[]> {
  if (!(await canRead())) return [];
  const place = z.string().trim().min(1).max(300).safeParse(placeId);
  if (!place.success) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select("id, first_name, last_name, status, created_by, created_at")
    .eq("place_id", place.data)
    .order("created_at", { ascending: false })
    .limit(4);
  const leads = (data ?? []).filter((lead) => lead.id !== excludeLeadId).slice(0, 3);
  const names = await namesById(supabase, leads.map((lead) => lead.created_by));
  return leads.map((lead) => ({
    id: lead.id,
    name: leadName(lead),
    status: STATUS_LABELS[lead.status],
    addedBy: names.get(lead.created_by) ?? "Someone",
    addedOn: formatDate(lead.created_at),
  }));
}

export type TrackColourState = { ok?: boolean; error?: string; errors?: { choice?: string; ral_code?: string } };

// The owner sets a lead's track colour: a colour from the list, or Custom
// with a RAL Classic code. The database refuses anyone else, a retired
// colour and a code that is not on the RAL Classic list.
export async function setTrackColour(
  _previous: TrackColourState,
  formData: FormData,
): Promise<TrackColourState> {
  try {
    await requireOwnerForAction();
  } catch (e) {
    if (e instanceof ReadOnlyError) return { error: VIEW_AS_READ_ONLY };
    if (e instanceof NotOwnerError) return { error: "Only Keenan sets the track colour." };
    throw e;
  }
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "That lead was not found." };
  const parsed = trackColourChoiceSchema.safeParse({
    choice: String(formData.get("choice") ?? ""),
    ral_code: String(formData.get("ral_code") ?? ""),
  });
  if (!parsed.success) {
    const errors: TrackColourState["errors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] === "ral_code" ? "ral_code" : "choice";
      errors[field] ??= issue.message;
    }
    return { error: "The track colour needs a look.", errors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .update(parsed.data)
    .eq("id", id.data)
    .select("id");
  if (error) {
    if (error.code === "23503") {
      return {
        error: "The track colour needs a look.",
        errors: { ral_code: "That number isn't on the RAL Classic list. Check it in the RAL K7 book." },
      };
    }
    if (error.code === "22023") return { error: "That colour has been retired. Pick another." };
    return { error: "The track colour could not be saved. Try again." };
  }
  if (!data || data.length === 0) return { error: "That lead was not found." };

  revalidatePath(`/app/leads/${id.data}`);
  return { ok: true };
}

// Leads within 25 m of a phone position, so two setters don't add the same
// new house twice (Keenan, 2026-11-01).
export async function findLeadsNear(
  lat: number,
  lng: number,
  excludeLeadId: string | null,
): Promise<(DuplicateLead & { metres: number })[]> {
  if (!(await canRead())) return [];
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !inCalgaryArea(lat, lng)) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select("id, first_name, last_name, status, created_by, created_at, lat, lng")
    .gte("lat", lat - 0.0005)
    .lte("lat", lat + 0.0005)
    .gte("lng", lng - 0.0008)
    .lte("lng", lng + 0.0008)
    .limit(20);
  const near = (data ?? [])
    .filter((lead) => lead.id !== excludeLeadId && lead.lat !== null && lead.lng !== null)
    .map((lead) => ({ lead, metres: kmBetween({ lat, lng }, { lat: lead.lat as number, lng: lead.lng as number }) * 1000 }))
    .filter((item) => item.metres <= NEARBY_LEAD_M)
    .sort((a, b) => a.metres - b.metres)
    .slice(0, 3);
  const names = await namesById(supabase, near.map((item) => item.lead.created_by));
  return near.map(({ lead, metres }) => ({
    id: lead.id,
    name: leadName(lead),
    status: STATUS_LABELS[lead.status],
    addedBy: names.get(lead.created_by) ?? "Someone",
    addedOn: formatDate(lead.created_at),
    metres: Math.round(metres),
  }));
}

// A lead's map position from the phone at the door, for a brand-new street.
export async function setLeadPosition(
  leadId: string,
  position: { lat: number; lng: number; accuracy: number },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await salesSide();
  if (typeof me === "string") return { ok: false, error: me };
  const id = z.uuid().safeParse(leadId);
  if (!id.success) return { ok: false, error: "That lead was not found." };
  const { lat, lng, accuracy } = position;
  if (![lat, lng, accuracy].every(Number.isFinite) || accuracy > GPS_MAX_ACCURACY_M || accuracy < 0 || !inCalgaryArea(lat, lng)) {
    return { ok: false, error: "That position isn't accurate enough. Try again at the door." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .update({ lat, lng, place_id: null, position_source: "device", position_accuracy_m: Math.round(accuracy * 10) / 10 })
    .eq("id", id.data)
    .select("id");
  if (error) return { ok: false, error: error.code === "42501" ? NOT_YOURS : "The position could not be saved. Try again." };
  if (!data || data.length === 0) return { ok: false, error: NOT_YOURS };
  revalidatePath(`/app/leads/${id.data}`);
  return { ok: true };
}
