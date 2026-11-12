// Saving the quote (round 9): meeting mode and the lead page's quote editor
// save the same draft row, one per lead, through the same server action
// (app/(app)/meeting/actions.ts saveQuoteDraft), so the quote Keenan builds
// ahead is the quote the meeting opens with. Pure: what a save sends, built
// from the quote as the controls hold it, and the plain words for a quote
// that can't change.

import { quoteInputs, quoteMinimum, type MeetingPayload, type QuoteUIState } from "@/lib/meeting/state";
import { offersForSave } from "@/lib/quotes/offers";
import { formatTime } from "@/lib/time";

// Where the save came from, for the words when the quote is accepted.
export type SaveFrom = "meeting" | "lead";

// An accepted quote is read only (the spec 3.7). The meeting has no Outcome
// section, so its words say where Outcome is.
export const QUOTE_LOCKED_LEAD = "This quote is accepted, so its prices are locked. To change them, undo the acceptance under Outcome.";
export const QUOTE_LOCKED_MEETING =
  "This quote is accepted, so its prices are locked. To change them, undo the acceptance under Outcome on the lead page.";

export function quoteLockedWords(from: SaveFrom): string {
  return from === "lead" ? QUOTE_LOCKED_LEAD : QUOTE_LOCKED_MEETING;
}

export const NO_SIGNAL_SAVE = "No signal. The quote stays on this iPad; save again when you're back online.";

export type QuoteSaveInput = {
  leadId: string;
  from: SaveFrom;
  runs: {
    name: string;
    feet: number;
    level: "lower" | "upper";
    part?: QuoteUIState["runs"][number]["part"];
    area?: QuoteUIState["runs"][number]["area"];
    gable?: boolean | null;
    rate?: number | null;
    flat?: number | null;
    track?: "hat" | "double" | "j" | null;
    trackRate?: number | null;
  }[];
  boxCount: number;
  pricePerFt: number;
  boxPrice: number;
  adders: { label: string; amount: number; upperOnly?: boolean }[];
  // percent: a line worked out on each option (Black Friday as a percent).
  discounts: { label: string; amount: number; percent?: number | null }[];
  colourTiming: QuoteUIState["colourTiming"];
  rushFee: number | null;
  upperAccessFee: number | null;
  upperGableAccessFee: number | null;
  minJobTotal: number | null;
  financingOffered: boolean;
  validUntil: string;
  notes: string;
  gstEnabled: boolean;
  gstRate: number;
  gstNumber: string | null;
  offers: {
    id: string;
    name: string;
    runs: number[];
    boxes: number | null;
    upperAccess: number | null;
    hidden?: boolean;
    fromCustomer?: boolean;
    lead?: boolean;
    description?: string;
  }[];
  meetingOffer: string | null;
  meetingInstallOn: string | null;
};

// What a save sends: every price the quote uses, the offers cleaned the way
// the database keeps them, the choice made at the table (only while it still
// names one of them) and the install day picked there.
export function quoteSaveInput(state: QuoteUIState, pricing: MeetingPayload["pricing"], leadId: string, from: SaveFrom): QuoteSaveInput {
  const inputs = quoteInputs(state, pricing);
  const runCount = state.runs.length;
  const offers = offersForSave(state.offers, runCount).map((offer) => ({ ...offer, boxes: offer.boxes ?? null, upperAccess: offer.upperAccess ?? null }));
  // An empty list stands for one full wrap under the id "full".
  // The table's choice only while the customer sees that offer (round 13).
  const ids = offers.length > 0 ? offers.filter((offer) => offer.hidden !== true).map((offer) => offer.id) : runCount > 0 ? ["full"] : [];
  return {
    leadId,
    from,
    runs: state.runs.map((run) => ({ ...run, feet: Math.max(0, Math.round(run.feet)) })),
    boxCount: state.boxCount,
    pricePerFt: inputs.pricePerFt,
    boxPrice: inputs.boxPrice,
    adders: inputs.adders,
    discounts: inputs.discounts,
    colourTiming: state.colourTiming,
    // Round 18: the rush fee rides on each offer, never the quote.
    rushFee: null,
    upperAccessFee: inputs.upperAccessFee ?? null,
    upperGableAccessFee: inputs.upperGableAccessFee ?? null,
    minJobTotal: quoteMinimum(state, pricing),
    financingOffered: state.financingOffered,
    validUntil: state.validUntil,
    notes: "",
    gstEnabled: pricing.gstEnabled,
    gstRate: pricing.gstRate,
    gstNumber: pricing.gstNumber,
    offers,
    meetingOffer: state.chosenOffer && ids.includes(state.chosenOffer) ? state.chosenOffer : null,
    meetingInstallOn: state.installOn,
  };
}

// "Saved 2:41 p.m.": the time already ends in a full stop.
export function savedLine(iso: string): string {
  const time = formatTime(iso);
  return `Saved ${time}${time.endsWith(".") ? "" : "."}`;
}
