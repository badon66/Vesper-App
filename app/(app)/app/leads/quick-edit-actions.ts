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
import { maySeeContact } from "@/lib/leads/contact-rules";
import { contactFor } from "@/lib/leads/contacts";
import { lostReasons } from "@/lib/leads/queries";
import { LEAD_CHANGED, quickEditStatus, type QuickTab } from "@/lib/leads/quick-edit";
import { canChangeStatus } from "@/lib/leads/status";
import { GPS_MAX_ACCURACY_M, inCalgaryArea } from "@/lib/geo";
import { normalizePhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { calgaryToday } from "@/lib/time";
import { VIEW_AS_READ_ONLY } from "@/lib/view-as";
import type { Database } from "@/types/database";

// Round 20 (Keenan, 2026-11-14): the quick edit pop-up, opened by a double
// tap or a press and hold on a lead's name on Leads, Home and Meetings.
// Keenan edits any lead; a setter only their own (created or assigned to
// them), with the same contact privacy as everywhere: never another
// setter's customer's phone or email. Under View as it opens as the viewed
// person would see it, and Save is refused calmly. A save never wipes
// something newer: it carries the lead's updated_at from when the pop-up
// opened, and the database update only lands while that is still current.

export type QuickEditData = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: {
    addressLine: string;
    city: string;
    postalCode: string | null;
    lat: number | null;
    lng: number | null;
    placeId: string | null;
    positionSource: "picked" | "device" | null;
    accuracy: number | null;
  };
  status: Database["public"]["Enums"]["lead_status"];
  followUpOn: string | null;
  assignedTo: string | null;
  stamp: string;
  owner: boolean;
  viewingAs: boolean;
  setters: { id: string; name: string }[];
  lostReasons: string[];
};

export type QuickEditLoad = { ok: true; data: QuickEditData } | { ok: false; message: string };
export type QuickEditResult = { ok: true; stamp: string } | { ok: false; message: string; changed?: boolean };

const NOT_YOURS = "You can only change your own leads.";
const FAILED = "That didn't save. Try again.";

const mine = (me: SessionProfile, lead: { created_by: string; assigned_to: string | null }) =>
  me.role === "owner" || lead.created_by === me.id || lead.assigned_to === me.id;

export async function loadQuickEdit(leadId: string): Promise<QuickEditLoad> {
  let viewer: { profile: SessionProfile; viewingAs: boolean };
  try {
    viewer = await requireSalesSideForRead();
  } catch (e) {
    if (e instanceof NotAllowedError) return { ok: false, message: "Not for your role." };
    throw e;
  }
  const me = viewer.profile;
  const id = z.uuid().safeParse(leadId);
  if (!id.success) return { ok: false, message: "That lead was not found." };
  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select(
      "id, created_by, assigned_to, first_name, last_name, address_line, city, postal_code, lat, lng, place_id, position_source, position_accuracy_m, status, follow_up_on, updated_at",
    )
    .eq("id", id.data)
    .maybeSingle();
  if (!lead) return { ok: false, message: "That lead was not found." };
  // Scoped to what this person may change, not to RLS alone: View as reads
  // with Keenan's session.
  if (!mine(me, lead)) return { ok: false, message: NOT_YOURS };
  const owner = me.role === "owner";
  const [contact, reasons, setters] = await Promise.all([
    maySeeContact(me, lead) ? contactFor(supabase, me, lead.id) : Promise.resolve({ phone: null, email: null }),
    lostReasons(supabase),
    owner
      ? supabase
          .from("profiles")
          .select("id, full_name, role")
          .eq("active", true)
          .in("role", ["owner", "sales"])
          .order("full_name")
          .then(({ data }) => (data ?? []).map((row) => ({ id: row.id, name: row.role === "owner" ? `${row.full_name} (you)` : row.full_name })))
      : Promise.resolve([]),
  ]);
  return {
    ok: true,
    data: {
      id: lead.id,
      firstName: lead.first_name,
      lastName: lead.last_name ?? "",
      phone: contact.phone ?? "",
      email: contact.email ?? "",
      address: {
        addressLine: lead.address_line,
        city: lead.city,
        postalCode: lead.postal_code,
        lat: lead.lat,
        lng: lead.lng,
        placeId: lead.place_id,
        positionSource: lead.position_source === "device" ? "device" : lead.position_source === "picked" ? "picked" : null,
        accuracy: lead.position_accuracy_m,
      },
      status: lead.status,
      followUpOn: lead.follow_up_on,
      assignedTo: lead.assigned_to,
      stamp: lead.updated_at,
      owner,
      viewingAs: viewer.viewingAs,
      setters,
      lostReasons: reasons,
    },
  };
}

const coordinate = (min: number, max: number) => z.number().min(min).max(max).nullable();
const inputSchema = z.object({
  id: z.uuid(),
  stamp: z.string().min(10).max(64),
  firstName: z.string().trim().min(1, { error: "Enter a first name." }).max(80, { error: "First name is too long." }),
  lastName: z.string().trim().max(80, { error: "Last name is too long." }),
  // Only sent when the person may see the contact.
  phone: z.string().max(40).optional(),
  email: z.string().trim().max(254, { error: "Email is too long." }).optional(),
  address: z
    .object({
      addressLine: z.string().trim().min(1, { error: "Enter the address." }).max(200, { error: "Address is too long." }),
      city: z.string().trim().max(80),
      postalCode: z.string().trim().max(12),
      lat: coordinate(-90, 90),
      lng: coordinate(-180, 180),
      placeId: z.string().max(300).nullable(),
      positionSource: z.enum(["picked", "device"]).nullable(),
      accuracy: z.number().min(0).max(GPS_MAX_ACCURACY_M).nullable(),
    })
    .nullable(),
  tab: z.enum(["active", "later", "met", "closed"]),
  followUpOn: z.string().max(10).nullable(),
  lostReason: z.string().max(200).nullable(),
  assignedTo: z.uuid().nullable().optional(),
  note: z.string().trim().max(4000, { error: "That note is too long." }),
});
export type QuickEditInput = z.input<typeof inputSchema>;

export async function saveQuickEdit(input: QuickEditInput): Promise<QuickEditResult> {
  let me: SessionProfile;
  try {
    me = await requireSalesSideForAction();
  } catch (e) {
    if (e instanceof ReadOnlyError) return { ok: false, message: VIEW_AS_READ_ONLY };
    if (e instanceof NotAllowedError) return { ok: false, message: "Not for your role." };
    throw e;
  }
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? FAILED };
  const values = parsed.data;
  const owner = me.role === "owner";

  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("id, created_by, assigned_to, status, follow_up_on, updated_at, first_name, last_name, address_line")
    .eq("id", values.id)
    .maybeSingle();
  if (!lead) return { ok: false, message: "That lead was not found." };
  if (!mine(me, lead)) return { ok: false, message: NOT_YOURS };
  if (lead.updated_at !== values.stamp && Date.parse(lead.updated_at) !== Date.parse(values.stamp)) {
    return { ok: false, message: LEAD_CHANGED, changed: true };
  }

  const update: Database["public"]["Tables"]["leads"]["Update"] = {};
  if (values.firstName !== lead.first_name) update.first_name = values.firstName;
  if ((values.lastName || null) !== lead.last_name) update.last_name = values.lastName || null;

  // The phone and email only from someone who may see them (the pop-up
  // never shows them otherwise, and never sends them).
  if (maySeeContact(me, lead)) {
    const current = await contactFor(supabase, me, lead.id);
    if (values.phone !== undefined) {
      const phone = normalizePhone(values.phone);
      if (!phone.ok) return { ok: false, message: phone.error };
      if (phone.e164 !== current.phone) update.phone = phone.e164;
    }
    if (values.email !== undefined) {
      const email = values.email || null;
      if (email && !z.email().safeParse(email).success) return { ok: false, message: "That email address doesn't look right." };
      if (email !== current.email) update.email = email;
    }
  }

  if (values.address) {
    const a = values.address;
    const hasPosition = a.lat !== null && a.lng !== null;
    const device = hasPosition && a.positionSource === "device";
    if (device && (a.accuracy === null || !inCalgaryArea(a.lat as number, a.lng as number))) {
      return { ok: false, message: "The phone's position wasn't usable. Take it again at the house." };
    }
    update.address_line = a.addressLine;
    update.city = a.city || "Calgary";
    update.postal_code = a.postalCode || null;
    update.lat = hasPosition ? a.lat : null;
    update.lng = hasPosition ? a.lng : null;
    update.place_id = hasPosition && !device ? a.placeId : null;
    update.position_source = hasPosition ? (device ? "device" : "picked") : null;
    update.position_accuracy_m = device ? a.accuracy : null;
  }

  // Which tab it's in: Active, Later, Met or Closed.
  const status = quickEditStatus(values.tab as QuickTab, lead.status);
  if (status.kind === "refused") return { ok: false, message: status.message };
  if (status.kind === "change" || status.kind === "follow_up") {
    const to = status.kind === "follow_up" ? "follow_up" : status.to;
    if (to !== lead.status && !canChangeStatus(me.role, lead.status, to)) {
      return { ok: false, message: "That tab isn't yours to set. Booking sets Meeting booked, and Keenan sets the rest." };
    }
    if (to !== lead.status && (lead.status === "sold" || lead.status === "installed")) {
      return { ok: false, message: "This lead's status comes from its quote. Use the Outcome card on its page." };
    }
    if (to === "follow_up") {
      const day = values.followUpOn;
      if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, message: "Pick the day to follow up." };
      if (day < calgaryToday()) return { ok: false, message: "Pick today or a later day." };
      if (to !== lead.status || day !== lead.follow_up_on) {
        update.status = "follow_up";
        update.follow_up_on = day;
      }
    } else {
      update.status = to;
      update.follow_up_on = null;
      if (to === "lost") {
        const reasons = await lostReasons(supabase);
        if (!values.lostReason || !reasons.includes(values.lostReason)) return { ok: false, message: "Pick a reason for Closed." };
        update.lost_reason = values.lostReason;
      } else {
        update.lost_reason = null;
      }
    }
  }

  if (owner && values.assignedTo !== undefined && values.assignedTo !== lead.assigned_to) {
    update.assigned_to = values.assignedTo;
  }

  let stamp = lead.updated_at;
  if (Object.keys(update).length > 0) {
    const { data, error } = await supabase
      .from("leads")
      .update(update)
      .eq("id", lead.id)
      .eq("updated_at", lead.updated_at)
      .select("updated_at");
    if (error) {
      if (error.code === "42501") return { ok: false, message: NOT_YOURS };
      if (error.code === "22023") return { ok: false, message: "Pick today or a later day." };
      if (error.code === "23514") return { ok: false, message: "Pick when to follow up." };
      return { ok: false, message: FAILED };
    }
    if (!data || data.length === 0) {
      // Someone else's save landed between the check and this one.
      return { ok: false, message: LEAD_CHANGED, changed: true };
    }
    stamp = data[0].updated_at;
  }

  if (values.note) {
    const { error } = await supabase.from("lead_events").insert({ lead_id: lead.id, type: "note", payload: { text: values.note } });
    if (error) return { ok: false, message: "The changes saved, but the note didn't. Try the note again." };
  }

  revalidatePath("/app/leads");
  revalidatePath(`/app/leads/${lead.id}`);
  revalidatePath("/app");
  revalidatePath("/app/meetings");
  return { ok: true, stamp };
}
