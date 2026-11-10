"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NotOwnerError, ReadOnlyError, requireOwnerForAction } from "@/lib/auth/profile";
import {
  cleanOutcomeNote,
  isOutcomeReason,
  OUTCOME_MESSAGES,
  outcomeFailure,
  parseAcceptResult,
  type AcceptResult,
} from "@/lib/quotes/outcome";
import { FULL_WRAP_ID } from "@/lib/quotes/offers";
import { createClient } from "@/lib/supabase/server";
import { VIEW_AS_READ_ONLY } from "@/lib/view-as";

// Keenan's taps on a quote's outcome card (round 8, 2026-11-09): Accepted,
// Declined, Cancelled, Undo acceptance and Installed. Owner only, and
// refused under View as. Each one is a single database function that checks
// everything again, moves the quote and the lead together, keeps the
// setter's commission in step and writes the timeline; nothing here sends a
// number the database trusts.

export type OutcomeResult = { ok: true } | { ok: false; code: string; message: string };
export type AcceptOutcome = ({ ok: true } & AcceptResult) | { ok: false; code: string; message: string };

async function owner(): Promise<{ ok: false; code: string; message: string } | null> {
  try {
    await requireOwnerForAction();
    return null;
  } catch (e) {
    if (e instanceof ReadOnlyError) return { ok: false, code: "read_only", message: VIEW_AS_READ_ONLY };
    if (e instanceof NotOwnerError) return { ok: false, code: "not_allowed", message: OUTCOME_MESSAGES.not_allowed };
    throw e;
  }
}

const id = z.uuid();
const day = z.iso.date();
const notFound = { ok: false as const, code: "no_quote", message: OUTCOME_MESSAGES.no_quote };

// Everything that shows a lead's status, a sale or a commission.
function refresh(leadId: string) {
  revalidatePath(`/app/leads/${leadId}`);
  revalidatePath("/app/leads");
  revalidatePath("/app");
  revalidatePath("/app/meetings");
  revalidatePath("/app/admin/pay");
  revalidatePath("/app/pay");
}

const acceptSchema = z.object({
  quoteId: id,
  leadId: id,
  // The option they said yes to (an offer id on the quote, round 9).
  offerId: z.string().trim().min(1).max(40),
  // 0-based positions into the quote's runs; null is the full quote.
  runs: z.array(z.number().int().min(0).max(999)).min(1).max(200).nullable(),
  installOn: day.nullable(),
});

// Accepted: the customer said yes. The lead moves to Sold, the quote's
// numbers lock, and the setter's commission is made, coming once installed.
export async function acceptQuote(input: z.input<typeof acceptSchema>): Promise<AcceptOutcome> {
  const refused = await owner();
  if (refused) return refused;
  const parsed = acceptSchema.safeParse(input);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (field === "runs") return { ok: false, code: "bad_runs", message: OUTCOME_MESSAGES.bad_runs };
    if (field === "installOn") return { ok: false, code: "bad_install_on", message: "Pick the planned install day, or leave it empty." };
    return notFound;
  }
  const { quoteId, leadId, offerId, runs, installOn } = parsed.data;
  const supabase = await createClient();
  // Round 9: accept the option by its id, so the database records it with
  // its runs and boxes and works the commission out on that option's lights
  // and boxes. A quote whose offers cover no run offers the full quote as
  // round 8 did; that one goes through round 8's function.
  let { data, error } = await supabase.rpc("quote_accept_offer", {
    p_quote: quoteId,
    p_offer: offerId,
    p_install_on: installOn ?? undefined,
  });
  if (error && error.hint === "bad_offer" && offerId === FULL_WRAP_ID && runs === null) {
    ({ data, error } = await supabase.rpc("quote_accept", {
      p_quote: quoteId,
      p_runs: undefined,
      p_install_on: installOn ?? undefined,
    }));
  }
  if (error) return outcomeFailure(error);
  refresh(leadId);
  return { ok: true, ...parseAcceptResult(data) };
}

const reasonSchema = z.object({
  quoteId: id,
  leadId: id,
  reason: z.string(),
  note: z.string().max(2000).nullable(),
});

function reasonAndNote(input: z.input<typeof reasonSchema>) {
  const parsed = reasonSchema.safeParse(input);
  if (!parsed.success) return notFound;
  const { quoteId, leadId, reason, note } = parsed.data;
  if (!isOutcomeReason(reason)) return { ok: false as const, code: "bad_reason", message: OUTCOME_MESSAGES.bad_reason };
  const cleaned = cleanOutcomeNote(reason, note);
  if (!cleaned.ok) return cleaned;
  return { ok: true as const, quoteId, leadId, reason, note: cleaned.note };
}

// Declined, with a one-tap reason. The lead moves to Lost ("Lost: price").
// The note for Other stays on the quote, where only Keenan reads it.
export async function declineQuote(input: z.input<typeof reasonSchema>): Promise<OutcomeResult> {
  const refused = await owner();
  if (refused) return refused;
  const checked = reasonAndNote(input);
  if (!checked.ok) return checked;
  const supabase = await createClient();
  const { error } = await supabase.rpc("quote_decline", {
    p_quote: checked.quoteId,
    p_reason: checked.reason,
    p_note: checked.note ?? undefined,
  });
  if (error) return outcomeFailure(error);
  refresh(checked.leadId);
  return { ok: true };
}

// Cancelled: a yes taken back later. The lead moves to Lost ("Lost:
// cancelled, timing") and a commission not yet paid is voided.
export async function cancelSale(input: z.input<typeof reasonSchema>): Promise<OutcomeResult> {
  const refused = await owner();
  if (refused) return refused;
  const checked = reasonAndNote(input);
  if (!checked.ok) return checked;
  const supabase = await createClient();
  const { error } = await supabase.rpc("quote_cancel", {
    p_quote: checked.quoteId,
    p_reason: checked.reason,
    p_note: checked.note ?? undefined,
  });
  if (error) return outcomeFailure(error);
  refresh(checked.leadId);
  return { ok: true };
}

const undoSchema = z.object({ quoteId: id, leadId: id });

// Undo acceptance: the quote goes back to a draft so its numbers can
// change, the lead goes back to where it was, and a commission not yet paid
// is voided. A paid one stays paid.
export async function undoAcceptance(input: z.input<typeof undoSchema>): Promise<OutcomeResult> {
  const refused = await owner();
  if (refused) return refused;
  const parsed = undoSchema.safeParse(input);
  if (!parsed.success) return notFound;
  const supabase = await createClient();
  const { error } = await supabase.rpc("quote_undo_acceptance", { p_quote: parsed.data.quoteId });
  if (error) return outcomeFailure(error);
  refresh(parsed.data.leadId);
  return { ok: true };
}

const installDaySchema = z.object({ leadId: id, on: day.nullable() });

// The planned install day on a Sold lead, added or changed after the yes
// (Accepted asks for it too). Only Keenan may set it; the database refuses
// anyone else (leads_owner_dates). It is a day, never an amount.
export async function setInstallDay(input: z.input<typeof installDaySchema>): Promise<OutcomeResult> {
  const refused = await owner();
  if (refused) return refused;
  const parsed = installDaySchema.safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues[0]?.path[0] === "on"
      ? { ok: false, code: "bad_install_on", message: "Pick the planned install day." }
      : { ok: false, code: "no_lead", message: OUTCOME_MESSAGES.no_lead };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .update({ install_on: parsed.data.on })
    .eq("id", parsed.data.leadId)
    .eq("status", "sold")
    .select("id");
  if (error) return outcomeFailure(error);
  if (!data || data.length === 0) {
    return { ok: false, code: "not_sold", message: "The install day goes on a Sold lead. Refresh to see where it stands." };
  }
  refresh(parsed.data.leadId);
  return { ok: true };
}

const installedSchema = z.object({ leadId: id, on: day });

// Installed, on the day the crew finished. The commission becomes owed.
export async function markInstalled(input: z.input<typeof installedSchema>): Promise<OutcomeResult> {
  const refused = await owner();
  if (refused) return refused;
  const parsed = installedSchema.safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues[0]?.path[0] === "on"
      ? { ok: false, code: "bad_date", message: OUTCOME_MESSAGES.bad_date }
      : { ok: false, code: "no_lead", message: OUTCOME_MESSAGES.no_lead };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("lead_mark_installed", { p_lead: parsed.data.leadId, p_on: parsed.data.on });
  if (error) return outcomeFailure(error);
  refresh(parsed.data.leadId);
  return { ok: true };
}

const notInstalledSchema = z.object({ leadId: id });

// Not installed yet: a wrong Installed tap or day put right. The lead goes
// back to Sold and its install date comes off; a commission not yet paid
// waits for the install again, and a paid one stays paid.
export async function markNotInstalled(input: z.input<typeof notInstalledSchema>): Promise<OutcomeResult> {
  const refused = await owner();
  if (refused) return refused;
  const parsed = notInstalledSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "no_lead", message: OUTCOME_MESSAGES.no_lead };
  const supabase = await createClient();
  const { error } = await supabase.rpc("lead_undo_installed", { p_lead: parsed.data.leadId });
  if (error) return outcomeFailure(error);
  refresh(parsed.data.leadId);
  return { ok: true };
}
