// Meeting mode's price page (round 9, the spec 3.4 and 3.5), kept pure: the
// options the customer sees, biggest first, each option's breakdown in the
// rows and words the link and the Accepted sheet use, the coverage line and
// the page's words with their code defaults. No React, so it is unit tested;
// components/meeting/quote-screen.tsx draws it.
//
// The page's words are settings.deck.lines (lib/deck.ts: deckLine,
// priceSubLine, with the code's defaults).
//
// CONTRACT
//   NO_PAYMENT                          fixed by CLAUDE.md
//   screenOptions(inputs, offers)       the options a customer sees: biggest
//                                       first, never one without measured feet
//   coverageLine(runs, offer)           "Front, Garage and Upper gable, 166 ft"
//                                       from its measured runs only
//   breakdownRows(totals)               the option's rows: each line, with a
//                                       "Before the minimum" sum before the
//                                       top-up to the minimum
//   minimumSentence(minimum)            Keenan's sentence under that top-up
//   money(amount)                       "$4,959", a discount with a true minus

import { cleanFeet, formatMoney, type QuoteInputs, type QuoteRun, type QuoteTotals } from "@/lib/pricing";
import { offerCoverage, shownOffers, type PricedOffer, type QuoteOffer } from "@/lib/quotes/offers";

// Fixed by CLAUDE.md, never editable.
export const NO_PAYMENT = "No payment until your install is complete.";

// The options a customer sees, biggest first: never one that covers no
// measured feet (an option with no runs, or only runs not measured yet).
export function screenOptions(inputs: QuoteInputs, offers: readonly QuoteOffer[]): PricedOffer[] {
  return shownOffers(inputs, offers).filter((priced) => priced.feet > 0);
}

// What an option covers, from its measured runs only (a run added but not
// measured yet is left out until it has feet).
export function coverageLine(runs: QuoteRun[], offer: Pick<QuoteOffer, "runs">): string {
  return offerCoverage(runs, { runs: offer.runs.filter((p) => p >= 0 && p < runs.length && cleanFeet(runs[p].feet) > 0) });
}

// Round 18: a track's line carries its areas for the drop-down under it.
export type BreakdownRow =
  | { kind: "line"; label: string; detail: string | null; amount: string; minimum: boolean; areas?: { label: string; detail: string | null; amount: string }[] }
  | { kind: "sum"; label: string; amount: string };

const MINIMUM_PREFIX = "To reach our";

export function money(amount: number): string {
  return amount < 0 ? `−${formatMoney(-amount)}` : formatMoney(amount);
}

export function breakdownRows(totals: QuoteTotals): BreakdownRow[] {
  const rows: BreakdownRow[] = [];
  for (const line of totals.lines) {
    const minimum = line.label.startsWith(MINIMUM_PREFIX);
    if (minimum) rows.push({ kind: "sum", label: "Before the minimum", amount: money(totals.beforeMinimum) });
    rows.push({
      kind: "line",
      label: line.label,
      detail: line.detail,
      amount: money(line.amount),
      minimum,
      ...(line.areas ? { areas: line.areas.map((area) => ({ label: area.label, detail: area.detail, amount: money(area.amount) })) } : {}),
    });
  }
  return rows;
}

// Keenan's sentence under the top-up, word for word.
export function minimumSentence(minimum: number): string {
  return `That's under our ${formatMoney(minimum)} minimum, so this option comes to ${formatMoney(minimum)}.`;
}
