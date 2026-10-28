"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  NotAllowedError,
  requireSalesSideForAction,
  type SessionProfile,
} from "@/lib/auth/profile";
import { lostReasons, namesById, openKnockSession } from "@/lib/leads/queries";
import {
  leadColumnsFromValues,
  leadFormDataToInput,
  parseLeadForm,
  type LeadFormErrors,
} from "@/lib/leads/schema";
import { canChangeStatus, leadName, STATUS_LABELS } from "@/lib/leads/status";
import { isOwnPhotoPath, MAX_PHOTOS_PER_FORM } from "@/lib/photos";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/time";
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

async function salesSide(): Promise<SessionProfile | null> {
  try {
    return await requireSalesSideForAction();
  } catch (e) {
    if (e instanceof NotAllowedError) return null;
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
  if (!me) return { error: NOT_FOR_ROLE };

  const parsed = parseLeadForm(leadFormDataToInput(formData));
  if (!parsed.ok) return { error: "Some fields need a look.", errors: parsed.errors };
  const { values } = parsed;
  if (values.photo_paths.some((path) => !isOwnPhotoPath(path, me.id))) {
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
  if (values.photo_paths.length > 0) {
    const { error: photoError } = await supabase
      .from("lead_photos")
      .insert(values.photo_paths.map((storage_path) => ({ lead_id: lead.id, storage_path })));
    photosFailed = Boolean(photoError);
  }

  revalidatePath("/app/leads");
  redirect(photosFailed ? `/app/leads/${lead.id}?photos=failed` : `/app/leads?added=${lead.id}`);
}

export async function updateLead(
  _previous: LeadFormState,
  formData: FormData,
): Promise<LeadFormState> {
  const me = await salesSide();
  if (!me) return { error: NOT_FOR_ROLE };
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
});

export async function changeLeadStatus(
  _previous: SimpleState,
  formData: FormData,
): Promise<SimpleState> {
  const me = await salesSide();
  if (!me) return { error: NOT_FOR_ROLE };
  const parsed = statusSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    lost_reason: formData.get("lost_reason") ?? undefined,
  });
  if (!parsed.success) return { error: "Pick a status." };
  const { id, status } = parsed.data;

  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("id, status, created_by, assigned_to")
    .eq("id", id)
    .maybeSingle();
  if (!lead) return { error: "That lead was not found." };
  const mine = me.role === "owner" || lead.created_by === me.id || lead.assigned_to === me.id;
  if (!mine) return { error: NOT_YOURS };
  if (lead.status === status) return { ok: true };
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
    .update({ status, lost_reason: lostReason })
    .eq("id", id)
    .select("id");
  if (error) {
    return {
      error:
        error.code === "42501"
          ? "That status isn't yours to set."
          : "The status could not be saved. Try again.",
    };
  }
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
  if (!me) return { error: NOT_FOR_ROLE };
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

export async function attachLeadPhotos(
  leadId: string,
  paths: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await salesSide();
  if (!me) return { ok: false, error: NOT_FOR_ROLE };
  const id = z.uuid().safeParse(leadId);
  if (!id.success) return { ok: false, error: "That lead was not found." };
  if (
    paths.length === 0 ||
    paths.length > MAX_PHOTOS_PER_FORM ||
    paths.some((path) => !isOwnPhotoPath(path, me.id))
  ) {
    return { ok: false, error: "A photo did not upload properly. Take it again." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("lead_photos")
    .insert(paths.map((storage_path) => ({ lead_id: id.data, storage_path })));
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
  const me = await salesSide();
  if (!me) return [];
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
