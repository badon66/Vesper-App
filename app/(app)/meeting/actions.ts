"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NotOwnerError, ReadOnlyError, requireOwnerForAction, type SessionProfile } from "@/lib/auth/profile";
import { hasDash, hasExclamation } from "@/lib/deck";
import { guessRunPart, RUN_PARTS, totalFeet, TRACK_TYPES, type QuoteInputs } from "@/lib/pricing";
import { quoteLockedWords, type QuoteSaveInput } from "@/lib/quotes/draft";
import { AREA_KINDS } from "@/lib/quotes/areas";
import { chosenOfferTotals, NO_OFFER_SHOWN, noOfferShown, OFFERS_MAX, offersForSave } from "@/lib/quotes/offers";
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
        // The part of the house (2026-11-04). An iPad still holding a draft
        // from before parts gets the guess from the run's name.
        part: z.enum(RUN_PARTS).nullable().optional(),
        // Round 11, quoting by area: the view, a gable, Keenan's own price
        // a foot for the area, or a flat price for it.
        area: z.enum(AREA_KINDS).nullable().optional(),
        gable: z.boolean().nullable().optional(),
        rate: z.number().min(0).max(10_000).nullable().optional(),
        flat: z.number().min(0).max(1_000_000).nullable().optional(),
        // Take 3: the area's track type, and its track's price a foot as
        // copied from Settings when Keenan picked it.
        track: z.enum(TRACK_TYPES).nullable().optional(),
        trackRate: z.number().min(0).max(10_000).nullable().optional(),
      }),
    )
    .max(30),
  boxCount: z.number().int().min(0).max(20),
  pricePerFt: money,
  boxPrice: money,
  adders: z
    .array(z.object({ label: z.string().trim().max(80), amount: money, upperOnly: z.boolean().optional() }))
    .max(20),
  // percent (2026-11-11): a line worked out on each option, Black Friday as
  // a percent; more than 0 and at most 90. Left out, a fixed amount.
  discounts: z
    .array(z.object({ label: z.string().trim().max(80), amount: money, percent: z.number().gt(0).max(90).nullable().optional() }))
    .max(20),
  colourTiming: z.enum(["stock", "factory_order", "rush"]).nullable(),
  // This quote's flat rush colour fee and upper access amounts (2026-11-04),
  // copied from Settings and changed at the table if Keenan wants. Null on
  // a quote made before, which has neither line.
  rushFee: money.nullable().optional(),
  upperAccessFee: money.nullable().optional(),
  upperGableAccessFee: money.nullable().optional(),
  // The minimum job total from Settings when the quote is saved.
  minJobTotal: money.nullable().optional(),
  financingOffered: z.boolean(),
  validUntil: z.iso.date(),
  notes: z.string().trim().max(2000),
  gstEnabled: z.boolean(),
  gstRate: z.number().min(0).max(0.9999),
  gstNumber: z.string().trim().max(30).nullable(),
  // Round 9 (2026-11-10): where the save came from (meeting mode, or the
  // lead page's quote editor), for the words when the quote is accepted.
  from: z.enum(["meeting", "lead"]).optional(),
  // The offers, each picking runs by position, with its own box count
  // (null: the quote's); the option chosen at the table; the install day
  // picked there. An iPad still holding a copy from before round 9 sends
  // none, and the quote keeps one full wrap.
  offers: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(40),
        name: z.string().max(60),
        runs: z.array(z.number().int().min(0).max(29)).max(30),
        boxes: z.number().int().min(1).max(9).nullable().optional(),
        // Round 11: the upper access amount typed over for this offer.
        upperAccess: z.number().min(0).max(100_000).nullable().optional(),
        // Round 13: Show to customer, off. Left out, the offer is shown.
        hidden: z.boolean().optional(),
        // Take 3: the customer's own (Build your own on the link).
        fromCustomer: z.boolean().optional(),
      }),
    )
    .max(OFFERS_MAX + 1)
    .optional(),
  meetingOffer: z.string().trim().min(1).max(40).nullable().optional(),
  meetingInstallOn: z.iso.date().nullable().optional(),
});

export type QuoteDraftInput = z.input<typeof quoteDraftSchema>;

// The shared builder's shape (lib/quotes/draft.ts) is what this takes.
const _sameShape: QuoteDraftInput = {} as QuoteSaveInput;
void _sameShape;
export type SaveQuoteResult =
  | { ok: true; quoteId: string; savedAt: string }
  | { ok: false; code: string; message: string };

// Saves (or re-saves) the lead's one draft quote, with every price it used
// copied onto it. The totals are computed by the same lib/pricing.ts the
// screen used, so what the customer watched is what is stored. Meeting mode
// and the lead page's quote editor (round 9) both save through here, to the
// same row: the quote built ahead is the quote the meeting opens with.
export async function saveQuoteDraft(input: QuoteDraftInput): Promise<SaveQuoteResult> {
  const me = await owner();
  if (refused(me)) return me;
  const parsed = quoteDraftSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "bad_input", message: "Something in the quote doesn't look right. Check the numbers." };
  }
  const draft = {
    ...parsed.data,
    runs: parsed.data.runs.map((run) => ({ ...run, part: run.part ?? guessRunPart(run.name) })),
    // Stored as {label, amount}, with percent only when the line has one.
    discounts: parsed.data.discounts.map(({ label, amount, percent }) => ({ label, amount, ...(percent ? { percent } : {}) })),
  };
  const locked = { ok: false as const, code: "quote_locked", message: quoteLockedWords(draft.from ?? "meeting") };
  // An option's name is read by the customer: the deck's word checks.
  if ((draft.offers ?? []).some((offer) => hasDash(offer.name) || hasExclamation(offer.name))) {
    return { ok: false, code: "bad_input", message: "An option's name has a dash or an exclamation mark. Take it out and save again." };
  }
  // The offers as the database keeps them, and the table's choice only
  // while it names one of them (an empty list is one full wrap, "full").
  const offers = offersForSave(
    (draft.offers ?? []).map((offer) => ({ ...offer, boxes: offer.boxes ?? null, upperAccess: offer.upperAccess ?? null })),
    draft.runs.length,
  );
  // Round 13: at least one offer is always shown to the customer.
  if (noOfferShown(offers)) return { ok: false, code: "no_offer_shown", message: NO_OFFER_SHOWN };
  // The table's choice only while it names an offer the customer sees.
  const offerIds = offers.length > 0 ? offers.filter((offer) => offer.hidden !== true).map((offer) => offer.id) : draft.runs.length > 0 ? ["full"] : [];
  const meetingOffer = draft.meetingOffer && offerIds.includes(draft.meetingOffer) ? draft.meetingOffer : null;

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
    rushFee: draft.rushFee ?? null,
    upperAccessFee: draft.upperAccessFee ?? null,
    upperGableAccessFee: draft.upperGableAccessFee ?? null,
    minJobTotal: draft.minJobTotal ?? null,
    gstEnabled: draft.gstEnabled,
    gstRate: draft.gstRate,
  };
  // The stored subtotal, GST and total are the chosen option's own when
  // one is chosen at the table (round 10 catch-up, 2026-11-11), otherwise
  // the whole quote's.
  const priced = chosenOfferTotals(inputs, offers, meetingOffer);

  const colourName = lead.track_colours?.name ?? (lead.track_ral_code ? `RAL ${lead.track_ral_code}` : null);
  const row = {
    lead_id: draft.leadId,
    created_by: me.id,
    status: "draft" as const,
    price_per_ft: draft.pricePerFt,
    box_price: draft.boxPrice,
    box_count: draft.boxCount,
    runs: draft.runs.map(({ area, gable, rate, flat, track, trackRate, ...run }) => ({
      ...run,
      ...(area ? { area } : {}),
      ...(typeof gable === "boolean" ? { gable } : {}),
      ...(typeof rate === "number" && rate > 0 ? { rate } : {}),
      ...(typeof flat === "number" ? { flat } : {}),
      // Hat track is the standard and isn't stored; Double or J keeps its
      // price a foot from when Keenan picked it.
      ...(track === "double" || track === "j" ? { track, ...(typeof trackRate === "number" && trackRate > 0 ? { trackRate } : {}) } : {}),
    })),
    total_feet: totalFeet(draft.runs),
    // Stored the way the data model names it: upper_only, only when set.
    adders: draft.adders.map((adder) => ({
      label: adder.label,
      amount: adder.amount,
      ...(adder.upperOnly ? { upper_only: true } : {}),
    })),
    discounts: draft.discounts,
    colour_timing: draft.colourTiming,
    // Round 17: the flat fee is kept only while Keenan charges it for a
    // this-season install (lib/meeting/state.ts quoteRushFee), so a fee
    // nobody is charged is never stored or named; the price counts it only
    // then. The fee per foot is no longer used (2026-11-04).
    rush_fee: draft.colourTiming === "rush" ? (draft.rushFee ?? null) : null,
    rush_fee_per_ft: null,
    upper_access_fee: draft.upperAccessFee ?? null,
    upper_gable_access_fee: draft.upperGableAccessFee ?? null,
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
    min_job_total: draft.minJobTotal ?? null,
    // Round 9: the offers, the table's choice and the install day picked
    // there (never written to the lead before Accepted). Stored the way the
    // database cleans them: upper_access for the typed amount (round 11),
    // hidden only when the switch is off (round 13).
    offers: offers.map(({ upperAccess, hidden, fromCustomer, ...offer }) => ({
      ...offer,
      upper_access: upperAccess ?? null,
      ...(hidden === true ? { hidden: true } : {}),
      ...(fromCustomer === true ? { from_customer: true } : {}),
    })),
    meeting_offer: meetingOffer,
    meeting_install_on: draft.meetingInstallOn ?? null,
  };

  // While the lead has an accepted quote, its prices are locked: nothing
  // saves until the acceptance is undone on the lead page.
  const { data: accepted } = await supabase
    .from("quotes")
    .select("id")
    .eq("lead_id", draft.leadId)
    .eq("status", "accepted")
    .limit(1)
    .maybeSingle();
  if (accepted) return locked;

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
    if (error?.hint === "quote_locked") return locked;
    if (error || !updated) {
      return { ok: false, code: "save_failed", message: "The draft could not be saved. Check your signal and try again." };
    }
    revalidatePath(`/app/leads/${draft.leadId}`);
    return { ok: true, quoteId: existing.id, savedAt: updated.updated_at };
  }

  // The database writes the quote_created timeline event (its id only,
  // never a dollar amount), as it writes every event but notes.
  const { data: created, error } = await supabase.from("quotes").insert(row).select("id, updated_at").single();
  // Round 8: while a quote on the lead is accepted, no new quote starts
  // (the database's quotes guard, hint quote_locked).
  if (error?.hint === "quote_locked") return locked;
  if (error || !created) {
    return { ok: false, code: "save_failed", message: "The draft could not be saved. Check your signal and try again." };
  }
  revalidatePath(`/app/leads/${draft.leadId}`);
  return { ok: true, quoteId: created.id, savedAt: created.updated_at };
}

export type ConfirmInitialsResult =
  | { ok: true; initialledAt: string }
  | { ok: false; code: string; message: string };

// The customer initials the track colour at every meeting (M5). The lead
// keeps the latest initials and moment; the database writes a
// colour_confirmed timeline event for each one, naming the colour.
// Never from a render: only from Keenan's tap.
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
  revalidatePath(`/app/leads/${id.data}`);
  return { ok: true, initialledAt: at };
}
