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

import { priceQuote, selectRuns, totalFeet, type QuoteInputs, type QuoteRun, type QuoteTotals } from "@/lib/pricing";

export type QuoteOffer = { id: string; name: string; runs: number[] };

export const OFFER_NAME_MAX = 60;
export const OFFER_ID_MAX = 40;
export const OFFERS_MAX = 6;

// The id and name of the offer an empty list stands for: every run.
export const FULL_WRAP_ID = "full";
export const FULL_WRAP_NAME = "Full wrap";

export type QuickStart = "full" | "lower" | "front";

export const QUICK_STARTS: readonly { kind: QuickStart; name: string; hint: string }[] = [
  { kind: "full", name: "Full wrap", hint: "Every run" },
  { kind: "lower", name: "Lower level", hint: "Every lower run" },
  { kind: "front", name: "Front only", hint: "You pick the runs" },
];

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
    offers.push({ id, name: cleanOfferName(record.name), runs: cleanPositions(runCount, record.runs) });
  }
  if (offers.length > 0) return offers;
  return runCount > 0 ? [fullWrap(runCount)] : [];
}

export function fullWrap(runCount: number): QuoteOffer {
  return { id: FULL_WRAP_ID, name: FULL_WRAP_NAME, runs: Array.from({ length: runCount }, (_, at) => at) };
}

// What a quick start covers: every run, every lower run, or none yet (Keenan
// picks the front runs himself).
export function quickStartRuns(kind: QuickStart, runs: QuoteRun[]): number[] {
  if (kind === "full") return runs.map((_, at) => at);
  if (kind === "lower") return runs.flatMap((run, at) => (run.level === "lower" ? [at] : []));
  return [];
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
  return priceQuote({ ...inputs, runs: selectRuns(inputs.runs, offer.runs) });
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

// The offers worth showing a customer: those that cover at least one run.
export function shownOffers(inputs: QuoteInputs, offers: readonly QuoteOffer[]): PricedOffer[] {
  return pricedOffers(inputs, offers).filter((priced) => priced.totals !== null);
}

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
  for (const offer of offers) {
    const id = offer.id.trim().slice(0, OFFER_ID_MAX);
    if (id === "" || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: cleanOfferName(offer.name), runs: cleanPositions(runCount, offer.runs) });
    if (out.length === OFFERS_MAX) break;
  }
  return out;
}
