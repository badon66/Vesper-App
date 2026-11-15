"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { NotOwnerError, ReadOnlyError, requireOwnerForAction, type SessionProfile } from "@/lib/auth/profile";
import { bookingsToTell, notifyLeadDeleted } from "@/lib/push/setter-notices";
import { createClient } from "@/lib/supabase/server";
import { VIEW_AS_READ_ONLY } from "@/lib/view-as";

// Round 20 (Keenan, 2026-11-14): Keenan deletes a lead, and can bring it
// back from Admin > Deleted within 30 days. The database decides every step
// (lead_delete_check, lead_soft_delete, lead_restore), owner only; these
// actions turn its answer into words. Setters never see Delete, and while
// Keenan views the app as someone every one of them is refused.

export type DeleteCheck =
  | { ok: true; meetings: string[] }
  | { ok: false; reason: "accepted" | "pay" | "not_found" | "refused"; status?: string; message: string };

export type DeleteResult = { ok: true; cancelled: number } | { ok: false; reason?: "accepted" | "pay"; message: string };

const id = z.uuid();
const FAILED = "That didn't save. Try again.";
const BLOCKED_ACCEPTED = "This lead has an accepted quote, so it can't be deleted.";
const BLOCKED_PAY = "This lead has booking pay or commission, so it can't be deleted.";

async function owner(): Promise<SessionProfile | string> {
  try {
    return await requireOwnerForAction();
  } catch (e) {
    if (e instanceof ReadOnlyError) return VIEW_AS_READ_ONLY;
    if (e instanceof NotOwnerError) return "Only Keenan deletes a lead.";
    throw e;
  }
}

function revalidateLists(leadId: string) {
  revalidatePath("/app/leads");
  revalidatePath(`/app/leads/${leadId}`);
  revalidatePath("/app");
  revalidatePath("/app/meetings");
  revalidatePath("/app/schedule");
  revalidatePath("/app/admin/deleted");
}

// What deleting would do, for the one confirm: refused and why, or the
// upcoming meetings it would cancel.
export async function checkLeadDelete(leadId: string): Promise<DeleteCheck> {
  const me = await owner();
  if (typeof me === "string") return { ok: false, reason: "refused", message: me };
  const lead = id.safeParse(leadId);
  if (!lead.success) return { ok: false, reason: "not_found", message: "That lead was not found." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lead_delete_check", { p_lead: lead.data });
  if (error || !data) return { ok: false, reason: "refused", message: FAILED };
  const answer = data as { ok: boolean; state?: string; status?: string; meetings?: string[] };
  if (answer.ok) return { ok: true, meetings: answer.meetings ?? [] };
  if (answer.state === "accepted") return { ok: false, reason: "accepted", status: answer.status, message: BLOCKED_ACCEPTED };
  if (answer.state === "pay") return { ok: false, reason: "pay", status: answer.status, message: BLOCKED_PAY };
  return { ok: false, reason: "not_found", message: "That lead was not found." };
}

export async function deleteLead(leadId: string): Promise<DeleteResult> {
  const me = await owner();
  if (typeof me === "string") return { ok: false, message: me };
  const lead = id.safeParse(leadId);
  if (!lead.success) return { ok: false, message: "That lead was not found." };
  const supabase = await createClient();

  // The setters of its upcoming bookings, read while the lead can still be
  // read, so each can be told their booking was cancelled.
  const { data: upcoming } = await supabase
    .from("meetings")
    .select("id")
    .eq("lead_id", lead.data)
    .in("status", ["booked", "confirmed"])
    .gt("starts_at", new Date().toISOString());
  const tell = await bookingsToTell(supabase, (upcoming ?? []).map((row) => row.id), me.id);

  const { data, error } = await supabase.rpc("lead_soft_delete", { p_lead: lead.data });
  if (error) {
    if (error.hint === "accepted_quote") return { ok: false, reason: "accepted", message: BLOCKED_ACCEPTED };
    if (error.hint === "has_pay") return { ok: false, reason: "pay", message: BLOCKED_PAY };
    if (error.hint === "not_found") return { ok: false, message: "That lead was already deleted." };
    return { ok: false, message: FAILED };
  }
  const cancelled = ((data as { cancelled?: string[] } | null)?.cancelled ?? []) as string[];
  const told = tell.filter((booking) => booking.leadId === lead.data);
  if (cancelled.length > 0 && told.length > 0) {
    after(() => notifyLeadDeleted(supabase, told).catch(() => undefined));
  }
  revalidateLists(lead.data);
  return { ok: true, cancelled: cancelled.length };
}

export async function restoreLead(leadId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const me = await owner();
  if (typeof me === "string") return { ok: false, message: me };
  const lead = id.safeParse(leadId);
  if (!lead.success) return { ok: false, message: "That lead was not found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("lead_restore", { p_lead: lead.data });
  if (error) {
    if (error.hint === "not_deleted") return { ok: false, message: "That lead is no longer in Deleted." };
    return { ok: false, message: FAILED };
  }
  revalidateLists(lead.data);
  return { ok: true };
}
