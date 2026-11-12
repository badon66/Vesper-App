// Offers (Keenan, 2026-11-10, round 9). A quote keeps the house's measured
// runs once (quotes.runs); each offer picks which runs it covers, by their
// positions in that list. An offer is priced with the quote's own prices
// through lib/pricing.ts, the same function as everywhere else: lights at
// the price per foot for its runs, the control box, upper access for its own
// runs, rush colour if chosen, extra work, discounts and the minimum. Offers
// show biggest first, so Keenan walks them down from the full wrap.
//
// One shape everywhere: quotes.offers (the database cleans it the same way
// in quote_offers_clean), meeting mode, the lead page's quote editor, the
// customer's link and round 8's Accepted sheet.

import { priceQuote, runPart, selectRuns, totalFeet, type QuoteInputs, type QuoteRun, type QuoteTotals, type RunPart } from "@/lib/pricing";
import { areaOf, hasArea } from "@/lib/quotes/areas";

// boxes: this offer's control box count, 1 to 9; null uses the quote's
// box count (the five seats, 2026-11-10). upperAccess (round 11): the
// upper access amount Keenan typed over for this offer, 0 included, kept
// as upper_access in quotes.offers; null is the automatic amount. hidden
// (round 13, Keenan, 2026-11-11): Keenan's "Show to customer" switch, off.
// A hidden offer stays in the editor, marked Hidden, and shows nowhere the
// customer looks: not on Your price, not on their link (the database leaves
// it out of what the link reads), not on the Accepted sheet. Kept only
// when true.
// fromCustomer (quote link take 3, 2026-11-11): the offer the customer
// built on their link with Build your own and booked. It is saved under one
// id, so a newer one replaces their last one and never one of Keenan's; it
// does not count toward his four.
export type QuoteOffer = {
  id: string;
  name: string;
  runs: number[];
  boxes?: number | null;
  upperAccess?: number | null;
  hidden?: boolean;
  fromCustomer?: boolean;
};

export const CUSTOMER_OFFER_ID = "customer";
export const CUSTOMER_OFFER_NAME = "Custom quote (from the customer)";
export const isCustomerOffer = (offer: Pick<QuoteOffer, "id" | "fromCustomer">): boolean =>
  offer.fromCustomer === true || offer.id === CUSTOMER_OFFER_ID;

export const OFFER_NAME_MAX = 60;
// What the editor lets Keenan type, so an iPad button never wraps at three
// options; the database's 60 stays as a backstop.
export const OFFER_NAME_EDITOR_MAX = 20;
export const OFFER_ID_MAX = 40;
// The meeting and the link show up to four.
export const OFFERS_MAX = 4;

// The id and name of the offer an empty list stands for: every run.
export const FULL_WRAP_ID = "full";
export const FULL_WRAP_NAME = "Full wrap";

export type QuickStart = "front_lower" | "full_front" | "front_upper" | "full_wrap" | "front_back" | "full_back" | "custom";

// The "+ Offer" presets (round 11, Keenan, 2026-11-11): the standard offers
// he sells from, each filled from the measured areas, gables included to
// start (he can tick a gable off on any offer). label is the button; name
// is what the offer is called, which customers read and he can change.
export const QUICK_STARTS: readonly { kind: QuickStart; label: string; name: string; hint: string }[] = [
  { kind: "front_lower", label: "Front lower only", name: "Front lower only", hint: "The front, lower" },
  { kind: "full_front", label: "Full front", name: "Full front", hint: "The front, upper and lower" },
  { kind: "front_upper", label: "Front upper", name: "Front upper", hint: "The front, upper" },
  { kind: "full_wrap", label: "Full wrap", name: "Full wrap", hint: "Every area" },
  { kind: "front_back", label: "Front plus back", name: "Front plus back", hint: "The front and the back" },
  { kind: "full_back", label: "Full back", name: "Full back", hint: "The back, upper and lower" },
  { kind: "custom", label: "Custom", name: "", hint: "Tick the areas and name it" },
];

// The presets the measurements can fill: no Front upper without an upper
// front, no Full back without a back, no Full front without both levels
// at the front, no Front plus back without both; Full wrap needs any run.
export function quickStartsFor(runs: QuoteRun[]): typeof QUICK_STARTS {
  const frontLower = hasArea(runs, "front", "lower");
  const frontUpper = hasArea(runs, "front", "upper");
  const front = frontLower || frontUpper;
  const back = hasArea(runs, "back");
  const any = runs.some((run) => run.feet > 0);
  const fits: Record<QuickStart, boolean> = {
    front_lower: frontLower,
    full_front: frontLower && frontUpper,
    front_upper: frontUpper,
    full_wrap: any,
    front_back: front && back,
    full_back: back,
    custom: true,
  };
  return QUICK_STARTS.filter((start) => fits[start.kind]);
}

// A run on the front of the house, for an old run too: its area tag, else
// what its name and part make obvious (lib/quotes/areas.ts).
export function isFrontRun(run: QuoteRun): boolean {
  return areaOf(run) === "front";
}

// A box count as saved: a whole number from 1 to 9, else null (the quote's).
export function cleanBoxes(value: unknown): number | null {
  const n = typeof value === "string" && /^[0-9]+$/.test(value) ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 9 ? n : null;
}

// An upper access amount Keenan typed over, as saved: a number from 0 to
// 100,000, to the cent, else null (the automatic amount). A number only,
// never text, the same as the database's quote_offers_clean.
export function cleanUpperAccess(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100_000 ? Math.round(value * 100) / 100 : null;
}

// Positions on a quote with runCount runs: whole numbers in range, sorted,
// without repeats.
export function cleanPositions(runCount: number, positions: unknown): number[] {
  if (!Array.isArray(positions)) return [];
  const kept = new Set<number>();
  for (const value of positions) {
    const n = typeof value === "string" && /^[0-9]+$/.test(value) ? Number(value) : value;
    if (typeof n === "number" && Number.isInteger(n) && n >= 0 && n < runCount) kept.add(n);
  }
  return [...kept].sort((a, b) => a - b);
}

// A name as saved: trimmed, one line, at most 60 characters, never a dollar
// sign (an offer's name goes on the timeline every setter reads when the
// customer books it, so it must never carry a price). Empty becomes "Offer".
export function cleanOfferName(name: unknown): string {
  const text = typeof name === "string" ? name.replace(/\s+/g, " ").replace(/\$/g, "").trim() : "";
  return (text || "Offer").slice(0, OFFER_NAME_MAX);
}

// The offers as stored, cleaned the way the database cleans them. An empty
// list (every quote made before round 9) is one offer covering every run.
export function parseOffers(value: unknown, runCount: number): QuoteOffer[] {
  const list = Array.isArray(value) ? value : [];
  const offers: QuoteOffer[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim().slice(0, OFFER_ID_MAX) : "";
    if (id === "" || seen.has(id)) continue;
    seen.add(id);
    offers.push({
      id,
      name: cleanOfferName(record.name),
      runs: cleanPositions(runCount, record.runs),
      boxes: cleanBoxes(record.boxes),
      upperAccess: cleanUpperAccess(record.upper_access ?? record.upperAccess),
      ...(record.hidden === true ? { hidden: true } : {}),
      ...(record.from_customer === true || record.fromCustomer === true || id === CUSTOMER_OFFER_ID ? { fromCustomer: true } : {}),
    });
  }
  if (offers.length > 0) return offers;
  return runCount > 0 ? [fullWrap(runCount)] : [];
}

export function fullWrap(runCount: number): QuoteOffer {
  return { id: FULL_WRAP_ID, name: FULL_WRAP_NAME, runs: Array.from({ length: runCount }, (_, at) => at), boxes: null, upperAccess: null };
}

// What a preset covers, as positions: its areas' runs, gables included;
// Custom starts empty and Keenan ticks the areas himself.
export function quickStartRuns(kind: QuickStart, runs: QuoteRun[]): number[] {
  const on = (run: QuoteRun): boolean => {
    const area = areaOf(run);
    switch (kind) {
      case "full_wrap":
        return true;
      case "front_lower":
        return area === "front" && run.level === "lower";
      case "front_upper":
        return area === "front" && run.level === "upper";
      case "full_front":
        return area === "front";
      case "full_back":
        return area === "back";
      case "front_back":
        return area === "front" || area === "back";
      default:
        return false;
    }
  };
  return runs.flatMap((run, at) => (on(run) ? [at] : []));
}

// A run's name, never blank, the way the customer's link and the database
// name it (quote_link_run_name).
export function offerRunName(run: QuoteRun, position: number): string {
  return run.name.trim() || `Run ${position + 1}`;
}

// What an offer covers, in words, built from its runs, never typed (round
// 10): the parts of the house, then the levels when the house has an upper
// run, then the feet: "Front and garage, upper and lower: 165 ft". Run
// names lose their level words ("Upper front" is the front); a run named
// only by its level takes its part's name. Empty when it covers no run.
const LEVEL_WORDS = /\b(upper|lower|main|second|top|ground|floor|level|storey|story)\b/gi;
const PART_WORDS: Record<RunPart, string> = {
  eave: "eaves",
  gable: "gable",
  garage: "garage",
  porch: "porch",
  sides: "sides",
  other: "roofline",
};

function areaName(run: QuoteRun): string {
  const bare = run.name.replace(LEVEL_WORDS, " ").replace(/\s+/g, " ").trim().toLowerCase();
  return bare || PART_WORDS[runPart(run)];
}

function listWords(words: string[]): string {
  return words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

export function offerCoverage(runs: QuoteRun[], offer: Pick<QuoteOffer, "runs">): string {
  const picked = [...new Set(offer.runs)].filter((p) => p >= 0 && p < runs.length).sort((a, b) => a - b);
  if (picked.length === 0) return "";
  const areas = [...new Set(picked.map((p) => areaName(runs[p])))];
  const list = listWords(areas);
  const twoLevels = runs.some((run) => run.level === "upper");
  const upper = picked.some((p) => runs[p].level === "upper");
  const lower = picked.some((p) => runs[p].level === "lower");
  const levels = !twoLevels ? "" : upper && lower ? ", upper and lower" : upper ? ", upper" : ", lower";
  const words = `${list}${levels}: ${totalFeet(selectRuns(runs, picked))} ft`;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// The feet an offer lights (round 16, Keenan, 2026-11-11): what each option
// shows under its name, on Your price and on the link, in place of the
// areas it covers. The same feet the coverage words counted.
export function offerFeet(runs: QuoteRun[], offer: Pick<QuoteOffer, "runs">): number {
  const picked = [...new Set(offer.runs)].filter((p) => p >= 0 && p < runs.length).sort((a, b) => a - b);
  return totalFeet(selectRuns(runs, picked));
}

// "165 ft of lights", from the line in Settings; empty with no feet.
export function feetWords(line: string, feet: number): string {
  if (!(feet > 0)) return "";
  const shown = Math.round(feet * 10) / 10;
  return line.replace(/\{feet\}/g, shown.toLocaleString("en-CA"));
}

// A new offer's id: short, unique on the quote, never reused.
export function newOfferId(taken: readonly string[], seed: number = Date.now()): string {
  const used = new Set(taken);
  let n = Math.abs(Math.floor(seed)) % 1_000_000;
  for (;;) {
    const id = `o${n.toString(36)}`;
    if (!used.has(id)) return id;
    n += 1;
  }
}

// A name not already on the quote: "Lower level", then "Lower level 2".
export function uniqueOfferName(name: string, offers: readonly QuoteOffer[]): string {
  const taken = new Set(offers.map((offer) => offer.name.toLowerCase()));
  const base = cleanOfferName(name);
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base.slice(0, OFFER_NAME_MAX - 3)} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

// When a run is removed from the quote, every offer's positions after it
// move down one, and the removed run comes off every offer.
export function removeRunFromOffers(offers: readonly QuoteOffer[], removed: number): QuoteOffer[] {
  return offers.map((offer) => ({
    ...offer,
    runs: offer.runs.filter((p) => p !== removed).map((p) => (p > removed ? p - 1 : p)),
  }));
}

// When a run is added to the quote, the offers that covered every run keep
// covering every run (a full wrap stays a full wrap); others stay as they
// were. Lower-level offers take a new lower run too.
export function addRunToOffers(offers: readonly QuoteOffer[], runsBefore: QuoteRun[], added: QuoteRun): QuoteOffer[] {
  const position = runsBefore.length;
  const lowerBefore = runsBefore.flatMap((run, at) => (run.level === "lower" ? [at] : []));
  return offers.map((offer) => {
    const coversAll = runsBefore.length > 0 && offer.runs.length === runsBefore.length;
    const coversLower =
      lowerBefore.length > 0 &&
      offer.runs.length === lowerBefore.length &&
      offer.runs.every((p, i) => p === lowerBefore[i]);
    if (coversAll || (coversLower && added.level === "lower")) return { ...offer, runs: [...offer.runs, position] };
    return offer;
  });
}

// An offer's price: the quote's inputs with only the offer's runs. Null
// when the offer covers no run yet (it shows "Pick the runs" instead).
export function priceOffer(inputs: QuoteInputs, offer: QuoteOffer): QuoteTotals | null {
  if (offer.runs.length === 0) return null;
  return priceQuote({
    ...inputs,
    runs: selectRuns(inputs.runs, offer.runs),
    boxCount: offer.boxes ?? inputs.boxCount,
    upperAccess: offer.upperAccess ?? null,
  });
}

export type PricedOffer = {
  offer: QuoteOffer;
  totals: QuoteTotals | null;
  feet: number;
  // True when the offer covers every run on the quote.
  everyRun: boolean;
};

// Every offer with its price, biggest first: by total, then by feet, then
// in the order Keenan made them. Offers with no runs yet come last.
export function pricedOffers(inputs: QuoteInputs, offers: readonly QuoteOffer[]): PricedOffer[] {
  const priced = offers.map((offer, order) => {
    const totals = priceOffer(inputs, offer);
    return {
      order,
      offer,
      totals,
      feet: totalFeet(selectRuns(inputs.runs, offer.runs)),
      everyRun: inputs.runs.length > 0 && offer.runs.length === inputs.runs.length,
    };
  });
  priced.sort((a, b) => {
    if ((a.totals === null) !== (b.totals === null)) return a.totals === null ? 1 : -1;
    const byTotal = (b.totals?.subtotal ?? 0) - (a.totals?.subtotal ?? 0);
    if (byTotal !== 0) return byTotal;
    if (b.feet !== a.feet) return b.feet - a.feet;
    return a.order - b.order;
  });
  return priced.map(({ offer, totals, feet, everyRun }) => ({ offer, totals, feet, everyRun }));
}

// The offers a customer sees: those that cover at least one run and that
// Keenan hasn't hidden (round 13).
export function shownOffers(inputs: QuoteInputs, offers: readonly QuoteOffer[]): PricedOffer[] {
  return pricedOffers(inputs, offers).filter((priced) => priced.totals !== null && priced.offer.hidden !== true);
}

// Show to customer (round 13). At least one offer is always shown: a quote
// with a hidden offer must keep a shown one that covers an area, or the
// customer would open their link to nothing. True when that rule is broken.
export function noOfferShown(offers: readonly QuoteOffer[]): boolean {
  if (!offers.some((offer) => offer.hidden === true)) return false;
  return !offers.some((offer) => offer.hidden !== true && offer.runs.length > 0);
}

// Whether this offer may be hidden: only while another one stays shown.
export function canHideOffer(offers: readonly QuoteOffer[], id: string): boolean {
  if (!offers.some((offer) => offer.id === id)) return false;
  return !noOfferShown(offers.map((offer) => (offer.id === id ? { ...offer, hidden: true } : offer)));
}

// Flip an offer's switch. Hiding the last shown offer changes nothing.
export function setOfferHidden(offers: readonly QuoteOffer[], id: string, hidden: boolean): QuoteOffer[] {
  if (hidden && !canHideOffer(offers, id)) return [...offers];
  return offers.map((offer) => {
    if (offer.id !== id) return offer;
    const { hidden: _was, ...rest } = offer;
    void _was;
    return hidden ? { ...rest, hidden: true } : rest;
  });
}

// After an offer is deleted: if only hidden ones are left covering an
// area, the first of them is shown again, so the rule holds and Keenan sees
// its switch flip on the card.
export function keepOneShown(offers: readonly QuoteOffer[]): QuoteOffer[] {
  if (!noOfferShown(offers)) return [...offers];
  const reveal = offers.find((offer) => offer.hidden === true && offer.runs.length > 0) ?? offers.find((offer) => offer.hidden === true);
  return reveal ? setOfferHidden(offers, reveal.id, false) : [...offers];
}

export const ONE_OFFER_SHOWN = "At least one offer is always shown.";
export const NO_OFFER_SHOWN = "Every offer that covers an area is hidden. Show at least one to the customer.";

// True once the quote has an offer covering at least one run: what prep's
// "Quote drafted ahead" counts.
export function hasPricedOffer(runCount: number, offers: unknown): boolean {
  return parseOffers(offers, runCount).some((offer) => offer.runs.length > 0);
}

// The offer whose runs are exactly these positions (null = every run), for
// naming what a customer accepted or booked. Null when none matches.
export function offerForRuns(offers: readonly QuoteOffer[], runCount: number, positions: readonly number[] | null): QuoteOffer | null {
  const wanted = positions === null ? Array.from({ length: runCount }, (_, at) => at) : cleanPositions(runCount, [...positions]);
  return offers.find((offer) => offer.runs.length === wanted.length && offer.runs.every((p, i) => p === wanted[i])) ?? null;
}

// The offers as saved: cleaned, at most six, names unique enough to tell
// apart. The full-wrap stand-in is saved as a real offer once Keenan edits.
export function offersForSave(offers: readonly QuoteOffer[], runCount: number): QuoteOffer[] {
  const seen = new Set<string>();
  const out: QuoteOffer[] = [];
  let own = 0;
  for (const offer of offers) {
    const id = offer.id.trim().slice(0, OFFER_ID_MAX);
    if (id === "" || seen.has(id)) continue;
    const customer = isCustomerOffer(offer);
    // Keenan's own up to four; the customer's one never counts toward them.
    if (!customer && own === OFFERS_MAX) continue;
    seen.add(id);
    if (!customer) own += 1;
    out.push({
      id,
      name: cleanOfferName(offer.name),
      runs: cleanPositions(runCount, offer.runs),
      boxes: cleanBoxes(offer.boxes),
      upperAccess: cleanUpperAccess(offer.upperAccess),
      ...(offer.hidden === true ? { hidden: true } : {}),
      ...(customer ? { fromCustomer: true } : {}),
    });
  }
  return out;
}

// What the quote row stores as its subtotal, GST and total (round 10
// catch-up, 2026-11-11): the option chosen at the table when there is one,
// otherwise the whole quote. Nothing on screen reads the stored numbers
// (every screen prices from the runs), but a report or a document that
// does should see the chosen option's real numbers, not a percent line
// worked out over every run.
export function chosenOfferTotals(inputs: QuoteInputs, offers: readonly QuoteOffer[], meetingOffer: string | null): QuoteTotals {
  const chosen = meetingOffer ? offers.find((offer) => offer.id === meetingOffer && offer.hidden !== true) : undefined;
  return (chosen ? priceOffer(inputs, chosen) : null) ?? priceQuote(inputs);
}
