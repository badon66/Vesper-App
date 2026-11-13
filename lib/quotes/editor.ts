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
//
// Round 11 (quoting by area, Keenan, 2026-11-11), the views and the prices:
//   areaLines(runs)                     the positions on each standard area
//   areaShortLabel(key)                 "Lower gable", the line's label in its view
//   setAreaFeet(state, key, feet)       feet typed on an area's line: a new run,
//                                       the run's feet, or (0) the run taken off
//   setRunFeet(state, at, feet)         feet typed on a run's own line
//   appendRun, dropRun, addOtherRun     the runs and the offers kept in step
//   houseLines(runs, lit)               each line on the drawn views: its run, its
//                                       feet, measured or empty, lit by the offer
//   offerLitPositions(runs, offer)      the measured positions an offer covers
//   houseLineLabel(key, line)           "Front lower, 64 ft", what a line says
//   runPricingMode(run)                 "quote", "rate" or "flat"
//   setRunPricing(run, mode, value)     Keenan's own price a foot, or a flat price
//   runByTheFoot(run, pricePerFt)       what the area comes to by the foot
//   automaticUpperAccess(runs, offer, fees)
//                                       the upper access an offer fills in itself
//   offerPhoto(mockups, offerId)        the picture an offer shows: its own, else the Main
//   pickMockupForOffer(mockups, mockupId, offerId)
//                                       one picture per offer

import { hasDash, hasExclamation } from "@/lib/deck";
import type { LeadMockupItem } from "@/lib/leads/mockup-roles";
import {
  cleanFeet,
  formatMoney,
  percentWords,
  runLightsCents,
  screenTotal,
  selectRuns,
  upperAccessAmount,
  usablePercent,
  type QuoteInputs,
  type QuoteRun,
} from "@/lib/pricing";
import {
  AREA_KEYS,
  AREA_LABELS,
  areaKeyOf,
  areaOf,
  kindOfKey,
  lineLabel,
  newAreaRun,
  newOtherRun,
  runFlat,
  runRate,
  runsOnArea,
  viewName,
  type AreaKey,
} from "@/lib/quotes/areas";
import {
  addRunToOffers,
  cleanOfferName,
  newOfferId,
  NO_OFFER_SHOWN,
  noOfferShown,
  OFFERS_MAX,
  isCustomerOffer,
  parseOffers,
  pricedOffers,
  QUICK_STARTS,
  quickStartRuns,
  removeRunFromOffers,
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
  // Keenan's own four; the customer's own build (take 3) doesn't count.
  if (offers.filter((offer) => !isCustomerOffer(offer)).length >= OFFERS_MAX) return [...offers];
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

// Round 17: an offer's description is read by the customer too, so the
// same word checks as its name.
export function offerDescriptionIssue(description: string | undefined): string | null {
  return offerNameIssue(description ?? "");
}

// What stops a save, in words, or null: an offer's name or description that
// needs fixing, or (round 13) every offer that covers an area being hidden.
export function offersBlock(offers: readonly QuoteOffer[]): string | null {
  if (offers.some((offer) => offerNameIssue(offer.name) !== null)) return "An offer's name needs fixing first.";
  if (offers.some((offer) => offerDescriptionIssue(offer.description) !== null)) return "An offer's description needs fixing first.";
  if (noOfferShown(offers)) return NO_OFFER_SHOWN;
  return null;
}

export function nameHasLevel(name: string): boolean {
  return /\blevels?\b/i.test(name);
}

export const LEVEL_WARNING = 'Customers may read "level" as the basement.';

const nameOf = (offer: QuoteOffer) => cleanOfferName(offer.name);

// The runs an offer really covers: those with measured feet.
function measured(runs: readonly QuoteRun[], offer: Pick<QuoteOffer, "runs">): number[] {
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
  // Round 13: the offers Keenan keeps from the customer, counted, never priced here.
  const hidden = offers.filter((offer) => offer.hidden === true).length;
  const kept = hidden > 0 ? ` ${hidden} hidden from the customer.` : "";
  return validUntil ? `${list}.${kept} Price held until ${formatDate(validUntil)}.` : `${list}.${kept}`;
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

// ------------------------------------------------ the views (round 11)

// The runs and the offers together, since a run added or taken off moves
// every offer's positions (lib/quotes/offers.ts).
export type RunsAndOffers = { runs: QuoteRun[]; offers: QuoteOffer[] };

// The positions on each standard area, in the quote's order: one on a quote
// made this round, several on an old quote with two runs on one area (Front
// and Garage, say), which the view shows as more lines under it.
export function areaLines(runs: readonly QuoteRun[]): Record<AreaKey, number[]> {
  const lines = Object.fromEntries(AREA_KEYS.map((key) => [key, [] as number[]])) as Record<AreaKey, number[]>;
  runs.forEach((run, at) => {
    const key = areaKeyOf(run);
    if (key) lines[key].push(at);
  });
  return lines;
}

// The line's label inside its view: "Lower gable" under Front, "Upper"
// under Sides. The view's own title says the rest.
export function areaShortLabel(key: AreaKey): string {
  return lineLabel(key);
}

// A run added at the end: a full wrap stays a full wrap, and an offer that
// covered every lower run takes a new lower run too; an empty offers list
// (one full wrap) stays empty.
export function appendRun(state: RunsAndOffers, run: QuoteRun): RunsAndOffers {
  return { runs: [...state.runs, run], offers: state.offers.length > 0 ? addRunToOffers(state.offers, state.runs, run) : [] };
}

// A run taken off the quote: it comes off every offer, and the positions
// after it move down.
export function dropRun(state: RunsAndOffers, at: number): RunsAndOffers {
  if (at < 0 || at >= state.runs.length) return state;
  return { runs: state.runs.filter((_, which) => which !== at), offers: removeRunFromOffers(state.offers, at) };
}

// Feet typed on a standard area's line. An area with no feet isn't on the
// house, so it is never kept as a run: the first feet typed into an empty
// line add the run (newAreaRun), feet typed over it change it, and 0 takes
// it off. A line already holding a run (the quote's first run on that area)
// changes that run; an old quote's extra runs on the area have lines of
// their own (setRunFeet).
export function setAreaFeet(state: RunsAndOffers, key: AreaKey, feet: number): RunsAndOffers {
  const positions = runsOnArea(state.runs, key);
  if (positions.length > 0) return setRunFeet(state, positions[0], feet);
  const clean = cleanFeet(feet);
  // A new line on a view Keenan renamed carries the view's name.
  const kind = kindOfKey(key);
  const view = viewName(state.runs, kind);
  return clean === 0 ? state : appendRun(state, newAreaRun(key, clean, view));
}

// Splitting an old quote's Sides line (round 18, Keenan, 2026-11-12): the
// Sides run becomes the Left side's line at its level, and a Right side line
// is added; the feet go half each (the left takes the odd foot) and a flat
// price splits the same way to the cent, so the total stays exactly where
// it was until Keenan types the real numbers. Its track and price a foot go
// with both, and every offer that had the Sides takes both sides.
export function splitSides(state: RunsAndOffers, at: number): RunsAndOffers {
  const run = state.runs[at];
  if (!run || areaOf(run) !== "sides") return state;
  const feet = cleanFeet(run.feet);
  const leftFeet = Math.ceil(feet / 2);
  const rightFeet = feet - leftFeet;
  const flat = runFlat(run);
  const leftFlat = flat === null ? null : feet > 0 ? Math.round(flat * 100 * (leftFeet / feet)) / 100 : flat;
  const rightFlat = flat === null || leftFlat === null ? null : Math.round((flat - leftFlat) * 100) / 100;
  const carry = { rate: runRate(run), ...(run.track ? { track: run.track, ...(run.trackRate ? { trackRate: run.trackRate } : {}) } : {}) };
  const upper = run.level === "upper";
  const left: QuoteRun = { ...newAreaRun(upper ? "left_upper" : "left_lower", leftFeet, viewName(state.runs, "left")), ...carry, flat: leftFlat };
  const right: QuoteRun = { ...newAreaRun(upper ? "right_upper" : "right_lower", rightFeet, viewName(state.runs, "right")), ...carry, flat: rightFlat };
  const runs = state.runs.map((item, which) => (which === at ? left : item));
  const added = runs.length;
  if (rightFeet === 0 && rightFlat === null) return { runs, offers: state.offers };
  return {
    runs: [...runs, right],
    offers: state.offers.map((offer) => (offer.runs.includes(at) ? { ...offer, runs: [...offer.runs, added] } : offer)),
  };
}

// Feet typed on a run's own line: an old quote's extra run on an area, or an
// Other. 0 takes a standard area's run off the quote; an Other keeps its
// name at 0 ft (it is on the house only once it has feet) until Keenan
// removes it.
export function setRunFeet(state: RunsAndOffers, at: number, feet: number): RunsAndOffers {
  const run = state.runs[at];
  if (!run) return state;
  const clean = cleanFeet(feet);
  if (clean === 0 && areaKeyOf(run) !== null) return dropRun(state, at);
  return { ...state, runs: state.runs.map((item, which) => (which === at ? { ...item, feet: clean } : item)) };
}

// "+ Other": a shed, a detached garage, anything off the two views, named
// and measured on its line.
export function addOtherRun(state: RunsAndOffers): RunsAndOffers {
  return appendRun(state, newOtherRun("", 0, "lower"));
}

// ------------------------------------------------ the views, drawn (Keenan, 2026-11-11)

// A line on the drawn views: the area's own run (the first on it; an old
// quote's extra runs on the area have rows of their own under the drawing,
// never the line), its feet, whether it is on the house, and whether the
// active offer lights it.
export type HouseLine = { at: number | null; feet: number; measured: boolean; lit: boolean };

// The measured positions an offer covers: what lights up on the drawings
// while its card is active. Empty with no active offer.
export function offerLitPositions(runs: readonly QuoteRun[], offer: Pick<QuoteOffer, "runs"> | null): Set<number> {
  return new Set(offer ? measured(runs, offer) : []);
}

// Every line on the drawings from the runs and the lit positions: measured
// when the area's run has feet (the new quote's empty Front run is an empty
// line), lit when that run is among the lit ones. An area's extra runs
// never measure or light its line.
export function houseLines(runs: readonly QuoteRun[], lit: ReadonlySet<number> = new Set()): Record<AreaKey, HouseLine> {
  const lines = areaLines(runs);
  return Object.fromEntries(
    AREA_KEYS.map((key) => {
      const at = lines[key].length > 0 ? lines[key][0] : null;
      const feet = at !== null ? cleanFeet(runs[at].feet) : 0;
      const isMeasured = feet > 0;
      const line: HouseLine = { at, feet, measured: isMeasured, lit: isMeasured && at !== null && lit.has(at) };
      return [key, line];
    }),
  ) as Record<AreaKey, HouseLine>;
}

// What a line says to a screen reader: "Front lower, 64 ft", or "Front
// lower, not measured".
export function houseLineLabel(key: AreaKey, line: Pick<HouseLine, "feet" | "measured">): string {
  return `${AREA_LABELS[key]}, ${line.measured ? `${line.feet} ft` : "not measured"}`;
}

// ------------------------------------------------ pricing an area Keenan's way

// How an area is priced: at the quote's price a foot, at Keenan's own price
// a foot for it, or at a flat price for it (lib/pricing.ts runLightsCents).
export type PricingMode = "quote" | "rate" | "flat";

export function runPricingMode(run: Pick<QuoteRun, "rate" | "flat">): PricingMode {
  if (runFlat(run) !== null) return "flat";
  if (runRate(run) !== null) return "rate";
  return "quote";
}

const RATE_MAX = 10_000;
const FLAT_MAX = 1_000_000;
const cents = (value: number) => Math.round(value * 100) / 100;

// Keenan's choice on an area. A price a foot takes a value more than 0, a
// flat price 0 or more (the area on the house for free); null, or nothing
// usable, is the box not typed yet, and the area prices at the quote's
// price a foot until it is.
export function setRunPricing(run: QuoteRun, mode: PricingMode, value: number | null = null): QuoteRun {
  const usable = value !== null && Number.isFinite(value);
  switch (mode) {
    case "rate":
      return { ...run, rate: usable && value > 0 ? cents(Math.min(RATE_MAX, value)) : null, flat: null };
    case "flat":
      return { ...run, rate: null, flat: usable && value >= 0 ? cents(Math.min(FLAT_MAX, value)) : null };
    default:
      return { ...run, rate: null, flat: null };
  }
}

// What an area comes to by the foot, at its own rate or the quote's: the
// flat box's placeholder, so a flat price starts from what it is worth.
export function runByTheFoot(run: QuoteRun, pricePerFt: number): number {
  return runLightsCents({ ...run, flat: null }, pricePerFt) / 100;
}

// "28" or "27.50": a money amount as a box shows it; "" for none.
export function moneyText(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

// The upper access an offer fills in itself from its runs ($200, or $400
// with an upper gable, the quote's own amounts): what its box shows until
// Keenan types over it. Null when the offer has no upper run, or the quote
// has no amounts.
export function automaticUpperAccess(
  runs: readonly QuoteRun[],
  offer: Pick<QuoteOffer, "runs">,
  fees: { upperAccessFee?: number | null; upperGableAccessFee?: number | null },
): number | null {
  return upperAccessAmount(selectRuns([...runs], offer.runs), fees);
}

// The order the drawn views draw their lines in (round 13, Keenan,
// 2026-11-11). Each line has a wide invisible band to land a finger on;
// where a gable's foot meets a roofline the two bands overlap, and the one
// drawn last takes the tap. The gables are drawn first and the rooflines
// after them, so a tap on a roofline lands on that roofline right to its
// ends (it used to land in the gable's box near the gable's feet); the
// gable keeps the rest of its two legs and its peak.
export function drawOrder<T extends { key: string }>(lines: readonly T[]): T[] {
  const gable = (line: T) => (line.key.endsWith("_gable") ? 0 : 1);
  return [...lines].sort((a, b) => gable(a) - gable(b));
}

// ------------------------------------------------ a photo on every offer

// The picture an offer shows (the deck and the link read the same rule,
// lib/meeting/deck-pages.ts offerMockup): the mockup marked for it, else the
// Main; null with neither.
export function offerPhoto(mockups: readonly LeadMockupItem[], offerId: string): { item: LeadMockupItem; own: boolean } | null {
  const own = mockups.find((item) => item.offers.includes(offerId));
  if (own) return { item: own, own: true };
  const main = mockups.find((item) => item.main);
  return main ? { item: main, own: false } : null;
}

// The list after Keenan picks a mockup for an offer: one picture per offer,
// so the offer comes off the one that had it (named as previous, so the save
// takes it off there too) and goes on the picked one.
export function pickMockupForOffer(
  mockups: readonly LeadMockupItem[],
  mockupId: string,
  offerId: string,
): { list: LeadMockupItem[]; previous: string | null } {
  const had = mockups.find((item) => item.id !== mockupId && item.offers.includes(offerId));
  const list = mockups.map((item) => {
    if (item.id === mockupId) return item.offers.includes(offerId) ? item : { ...item, offers: [...item.offers, offerId] };
    if (item.offers.includes(offerId)) return { ...item, offers: item.offers.filter((id) => id !== offerId) };
    return item;
  });
  return { list, previous: had?.id ?? null };
}
