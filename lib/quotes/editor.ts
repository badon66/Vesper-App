// Keenan's quote editor (round 9, the spec 3.7), kept pure: the offers as he
// edits them, the "+ Offer" quick starts, the quiet warnings that never
// block, the name checks, and the lead page's one-line summary. No React, so
// it is unit tested; components/quotes/quote-editor/* draws it. Owner only:
// amounts are fine here, and none of it is ever customer facing.
//
// CONTRACT
//   editorOffers(runs, offers)          the offers as edited: the full-wrap
//                                       stand-in becomes a real offer the
//                                       first time Keenan changes the list
//   addQuickStart(offers, kind, runs)   a new offer from a quick start, at
//                                       most OFFERS_MAX
//   toggleOfferRun(offer, position)     a run tapped on or off an offer
//   offerNameIssue(name)                the deck's word checks on a name
//   nameHasLevel(name)                  "level" in a name
//   offerWarnings(inputs, offers)       the quiet warnings, in words
//   editorOrder(inputs, offers)         the cards' order: biggest first
//   quoteSummary(inputs, offers, validUntil, formatDate)
//                                       "Full wrap $4,959, Main floor $3,380.
//                                       Price held until March 4, 2027."

import { hasDash, hasExclamation } from "@/lib/deck";
import { cleanFeet, formatMoney, percentWords, screenTotal, usablePercent, type QuoteInputs, type QuoteRun } from "@/lib/pricing";
import {
  cleanOfferName,
  newOfferId,
  OFFERS_MAX,
  parseOffers,
  pricedOffers,
  QUICK_STARTS,
  quickStartRuns,
  uniqueOfferName,
  type QuickStart,
  type QuoteOffer,
} from "@/lib/quotes/offers";
import { screenOptions } from "@/lib/meeting/price-screen";

// The offers as Keenan edits them. An empty list stands for one full wrap
// (parseOffers); the first change makes that stand-in a real offer, kept
// under its own id ("full"), so a choice made on it still names it.
export function editorOffers(runs: readonly QuoteRun[], offers: readonly QuoteOffer[]): QuoteOffer[] {
  return offers.length > 0 ? [...offers] : parseOffers([], runs.length);
}

export function addQuickStart(offers: readonly QuoteOffer[], kind: QuickStart, runs: QuoteRun[], seed?: number): QuoteOffer[] {
  if (offers.length >= OFFERS_MAX) return [...offers];
  const start = QUICK_STARTS.find((item) => item.kind === kind) ?? QUICK_STARTS[0];
  const id = newOfferId(
    offers.map((offer) => offer.id),
    seed,
  );
  const name = kind === "custom" ? "" : uniqueOfferName(start.name, offers);
  return [...offers, { id, name, runs: quickStartRuns(kind, runs), boxes: null }];
}

export function toggleOfferRun(offer: QuoteOffer, position: number): QuoteOffer {
  const on = offer.runs.includes(position);
  const runs = on ? offer.runs.filter((p) => p !== position) : [...offer.runs, position].sort((a, b) => a - b);
  return { ...offer, runs };
}

// The deck's word checks (no dashes, no exclamation marks), on a name a
// customer reads. Null when it reads fine.
export function offerNameIssue(name: string): string | null {
  if (hasDash(name)) return "No dashes. Use a comma or a full stop instead.";
  if (hasExclamation(name)) return "No exclamation marks.";
  return null;
}

export function nameHasLevel(name: string): boolean {
  return /\blevels?\b/i.test(name);
}

export const LEVEL_WARNING = 'Customers may read "level" as the basement.';

const nameOf = (offer: QuoteOffer) => cleanOfferName(offer.name);

// The runs an offer really covers: those with measured feet.
function measured(runs: readonly QuoteRun[], offer: QuoteOffer): number[] {
  return offer.runs.filter((p) => p >= 0 && p < runs.length && cleanFeet(runs[p].feet) > 0);
}

export type EditorWarning = { key: string; text: string };

// The quiet warnings (the spec 3.7): they never block a save. Pairs are
// named biggest first, as the customer will see them.
export function offerWarnings(inputs: QuoteInputs, offers: readonly QuoteOffer[]): EditorWarning[] {
  const warnings: EditorWarning[] = [];
  const shown = screenOptions(inputs, offers);
  const minimum = inputs.minJobTotal ?? 0;

  // No runs yet (or none measured): customers won't see it.
  for (const offer of offers) {
    if (measured(inputs.runs, offer).length === 0) {
      warnings.push({ key: `empty:${offer.id}`, text: `${nameOf(offer)} has no runs yet, so customers won't see it.` });
    }
  }

  const atMinimumPair = new Set<string>();
  for (let a = 0; a < shown.length; a++) {
    for (let b = a + 1; b < shown.length; b++) {
      const first = shown[a];
      const second = shown[b];
      const runsA = measured(inputs.runs, first.offer).join(",");
      const runsB = measured(inputs.runs, second.offer).join(",");
      const names = `${nameOf(first.offer)} and ${nameOf(second.offer)}`;
      if (runsA === runsB) {
        warnings.push({
          key: `same-runs:${first.offer.id}:${second.offer.id}`,
          text: `${nameOf(second.offer)} covers the same runs as ${nameOf(first.offer)}.`,
        });
        continue;
      }
      const totalA = first.totals?.subtotal ?? 0;
      const totalB = second.totals?.subtotal ?? 0;
      if (totalA === totalB) {
        const bothMinimum = Boolean(first.totals?.minimumApplied && second.totals?.minimumApplied);
        if (bothMinimum) {
          atMinimumPair.add(first.offer.id);
          atMinimumPair.add(second.offer.id);
        }
        warnings.push({
          key: `same-price:${first.offer.id}:${second.offer.id}`,
          text: bothMinimum ? `${names} both come to ${formatMoney(totalA)}, our minimum.` : `${names} come to the same price.`,
        });
        continue;
      }
      // Fewer feet but a higher total: a with more feet is listed first.
      const [big, small] = first.feet >= second.feet ? [first, second] : [second, first];
      if (small.feet < big.feet && (small.totals?.subtotal ?? 0) > (big.totals?.subtotal ?? 0)) {
        warnings.push({ key: `costs-more:${small.offer.id}:${big.offer.id}`, text: `${nameOf(small.offer)} costs more than ${nameOf(big.offer)}.` });
      }
    }
  }

  if (minimum > 0) {
    for (const priced of shown) {
      if (priced.totals?.minimumApplied && !atMinimumPair.has(priced.offer.id)) {
        warnings.push({
          key: `minimum:${priced.offer.id}`,
          text: `${nameOf(priced.offer)} is under our ${formatMoney(minimum)} minimum, so it comes to ${formatMoney(minimum)}.`,
        });
      }
    }
  }

  if (offers.some((offer) => nameHasLevel(offer.name))) warnings.push({ key: "level", text: LEVEL_WARNING });
  return warnings;
}

// The cards' order: biggest first, offers with no runs last, ties in the
// order Keenan made them.
export function editorOrder(inputs: QuoteInputs, offers: readonly QuoteOffer[]): string[] {
  return pricedOffers(inputs, offers).map((priced) => priced.offer.id);
}

// The lead page's Quote card: every option a customer sees, biggest first,
// with its total, then the price-held date. Empty with no option yet.
export function quoteSummary(
  inputs: QuoteInputs,
  offers: readonly QuoteOffer[],
  validUntil: string | null,
  formatDate: (day: string) => string,
): string {
  // An empty list is one full wrap.
  const shown = screenOptions(inputs, offers.length > 0 ? offers : parseOffers([], inputs.runs.length));
  if (shown.length === 0) return "";
  const list = shown.map((priced) => `${nameOf(priced.offer)} ${screenTotal(priced.totals?.subtotal ?? 0, inputs.gstEnabled)}`).join(", ");
  return validUntil ? `${list}. Price held until ${formatDate(validUntil)}.` : `${list}.`;
}

// ------------------------------------------------ a discount worked out per option

// A discount line as the editor holds it: percent when it is worked out on
// each option (Black Friday as a percent, 2026-11-11).
type EditorDiscount = { label: string; amount: string; percent?: number };

// Keenan types an amount on a discount: a line worked out on each option
// becomes a fixed amount, dropping its percent; any other line just takes
// the amount.
export function typeDiscountAmount<T extends EditorDiscount>(lines: readonly T[], at: number, amount: string): T[] {
  return lines.map((line, which) => {
    if (which !== at) return line;
    const { percent: _dropped, ...rest } = line;
    void _dropped;
    return { ...rest, amount } as T;
  });
}

// What a percent line comes to on each option, for the note under it in
// the editor (its amount box reads "15% off"): "Black Friday, 15% off:
// Full wrap $553.50, Main floor $385.50." Null for a fixed line.
export function percentDiscountWords(line: EditorDiscount, inputs: QuoteInputs, offers: readonly QuoteOffer[]): string | null {
  const percent = usablePercent(line.percent);
  if (percent === null) return null;
  const label = line.label.trim() || "Discount";
  const detail = `${percentWords(percent)}% off`;
  const shown = screenOptions(inputs, offers.length > 0 ? offers : parseOffers([], inputs.runs.length));
  const each = shown.map((priced) => {
    const found = priced.totals?.lines.find((item) => item.label === label && item.detail === detail);
    return `${nameOf(priced.offer)} ${formatMoney(found ? -found.amount : 0)}`;
  });
  return each.length > 0 ? `${label}, ${detail}: ${each.join(", ")}.` : `${label}, ${detail} each option.`;
}
