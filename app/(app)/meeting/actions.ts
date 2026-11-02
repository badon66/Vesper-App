"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NotOwnerError, ReadOnlyError, requireOwnerForAction, type SessionProfile } from "@/lib/auth/profile";
import { priceQuote, totalFeet, type QuoteInputs } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";
import { VIEW_AS_READ_ONLY } from "@/lib/view-as";

// Meeting mode's writes (M5). All of them are Keenan's: meeting mode is
// customer-facing and owner-only. Each one needs signal; a failed call
// loses nothing, because the draft lives on the iPad until it is saved.

type Refused = { ok: false; code: "read_only" | "not_allowed"; message: string };

async function owner(): Promise<SessionProfile | Refused> {
  try {
    return await requireOwnerForAction();
  } catch (e) {
    if (e instanceof ReadOnlyError) return { ok: false, code: "read_only", message: VIEW_AS_READ_ONLY };
    if (e instanceof NotOwnerError) return { ok: false, code: "not_allowed", message: "Only Keenan can do that." };
    throw e;
  }
}

const refused = (value: unknown): value is Refused =>
  typeof value === "object" && value !== null && "ok" in value;

const money = z.number().min(0).max(99_999_999).transform((n) => Math.round(n * 100) / 100);

const quoteDraftSchema = z.object({
  leadId: z.uuid(),
  runs: z
    .array(
      z.object({
        name: z.string().trim().max(60),
        feet: z.number().int().min(0).max(10_000),
        level: z.enum(["lower", "upper"]),
      }),
    )
    .max(30),
  boxCount: z.number().int().min(0).max(20),
  pricePerFt: money,
  boxPrice: money,
  adders: z.array(z.object({ label: z.string().trim().max(80), amount: money })).max(20),
  discounts: z.array(z.object({ label: z.string().trim().max(80), amount: money })).max(20),
  colourTiming: z.enum(["stock", "factory_order", "rush"]).nullable(),
  rushFeePerFt: money.nullable(),
  financingOffered: z.boolean(),
  validUntil: z.iso.date(),
  notes: z.string().trim().max(2000),
  gstEnabled: z.boolean(),
  gstRate: z.number().min(0).max(0.9999),
  gstNumber: z.string().trim().max(30).nullable(),
});

export type QuoteDraftInput = z.input<typeof quoteDraftSchema>;
export type SaveQuoteResult =
  | { ok: true; quoteId: string; savedAt: string }
  | { ok: false; code: string; message: string };

// Saves (or re-saves) the lead's one draft quote, with every price it used
// copied onto it. The totals are computed by the same lib/pricing.ts the
// screen used, so what the customer watched is what is stored.
export async function saveQuoteDraft(input: QuoteDraftInput): Promise<SaveQuoteResult> {
  const me = await owner();
  if (refused(me)) return me;
  const parsed = quoteDraftSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "bad_input", message: "Something in the quote doesn't look right. Check the numbers." };
  }
  const draft = parsed.data;

  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("id, track_ral_code, track_colour_id, track_colours (name)")
    .eq("id", draft.leadId)
    .maybeSingle();
  if (!lead) return { ok: false, code: "not_found", message: "That lead was not found." };

  const inputs: QuoteInputs = {
    runs: draft.runs,
    boxCount: draft.boxCount,
    pricePerFt: draft.pricePerFt,
    boxPrice: draft.boxPrice,
    adders: draft.adders,
    discounts: draft.discounts,
    colourTiming: draft.colourTiming,
    rushFeePerFt: draft.rushFeePerFt,
    gstEnabled: draft.gstEnabled,
    gstRate: draft.gstRate,
  };
  const priced = priceQuote(inputs);

  const colourName = lead.track_colours?.name ?? (lead.track_ral_code ? `RAL ${lead.track_ral_code}` : null);
  const row = {
    lead_id: draft.leadId,
    created_by: me.id,
    status: "draft" as const,
    price_per_ft: draft.pricePerFt,
    box_price: draft.boxPrice,
    box_count: draft.boxCount,
    runs: draft.runs,
    total_feet: totalFeet(draft.runs),
    adders: draft.adders,
    discounts: draft.discounts,
    colour_timing: draft.colourTiming,
    rush_fee_per_ft: draft.colourTiming === "rush" ? draft.rushFeePerFt : null,
    gst_enabled: draft.gstEnabled,
    gst_rate: draft.gstRate,
    gst_number: draft.gstNumber,
    subtotal: priced.subtotal,
    gst: priced.gst,
    total: priced.total,
    financing_offered: draft.financingOffered,
    track_colour_name: colourName,
    track_ral_code: lead.track_ral_code,
    track_custom: lead.track_ral_code !== null,
    notes: draft.notes || null,
    valid_until: draft.validUntil,
  };

  // One draft per lead, reused on every save.
  const { data: existing } = await supabase
    .from("quotes")
    .select("id")
    .eq("lead_id", draft.leadId)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // savedAt is the database's own updated_at, the same clock the meeting
  // page reads the draft by, so the iPad can tell its own last save from a
  // newer one made elsewhere.
  if (existing) {
    const { data: updated, error } = await supabase
      .from("quotes")
      .update(row)
      .eq("id", existing.id)
      .select("updated_at")
      .single();
    if (error || !updated) {
      return { ok: false, code: "save_failed", message: "The draft could not be saved. Check your signal and try again." };
    }
    revalidatePath(`/app/leads/${draft.leadId}`);
    return { ok: true, quoteId: existing.id, savedAt: updated.updated_at };
  }

  const { data: created, error } = await supabase.from("quotes").insert(row).select("id, updated_at").single();
  if (error || !created) {
    return { ok: false, code: "save_failed", message: "The draft could not be saved. Check your signal and try again." };
  }
  // The timeline says a quote exists; the payload holds the id and never a
  // dollar amount, because sales users can read the timeline.
  await supabase.from("lead_events").insert({
    lead_id: draft.leadId,
    actor_id: me.id,
    type: "quote_created",
    payload: { quote_id: created.id },
  });
  revalidatePath(`/app/leads/${draft.leadId}`);
  return { ok: true, quoteId: created.id, savedAt: created.updated_at };
}

export type ConfirmInitialsResult =
  | { ok: true; initialledAt: string }
  | { ok: false; code: string; message: string };

// The customer initials the track colour at every meeting (M5). The lead
// keeps the latest initials and moment; the timeline keeps every
// confirmation. Never from a render: only from Keenan's tap.
export async function confirmColourInitials(leadId: string, initials: string): Promise<ConfirmInitialsResult> {
  const me = await owner();
  if (refused(me)) return me;
  const id = z.uuid().safeParse(leadId);
  const text = z.string().trim().min(1).max(12).safeParse(initials);
  if (!id.success) return { ok: false, code: "not_found", message: "That lead was not found." };
  if (!text.success) return { ok: false, code: "bad_input", message: "Type their initials first." };

  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("id, track_colour_id, track_ral_code")
    .eq("id", id.data)
    .maybeSingle();
  if (!lead) return { ok: false, code: "not_found", message: "That lead was not found." };
  if (lead.track_colour_id === null && lead.track_ral_code === null) {
    return { ok: false, code: "no_colour", message: "Set the track colour on the lead first, then confirm it here." };
  }

  const at = new Date().toISOString();
  const { error } = await supabase
    .from("leads")
    .update({ track_colour_initials: text.data, track_colour_initialled_at: at })
    .eq("id", id.data);
  if (error) {
    return { ok: false, code: "save_failed", message: "That didn't save. Try again in a moment." };
  }
  await supabase.from("lead_events").insert({
    lead_id: id.data,
    actor_id: me.id,
    type: "colour_confirmed",
    payload: { initials: text.data },
  });
  revalidatePath(`/app/leads/${id.data}`);
  return { ok: true, initialledAt: at };
}
