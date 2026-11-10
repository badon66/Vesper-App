import { commissionFor, commissionQuoteFromRow, type CommissionQuoteRow } from "@/lib/pay/commission";
import {
  formatMoney,
  priceQuote,
  RUN_PARTS,
  screenTotal,
  selectRuns,
  totalFeet,
  type ColourTiming,
  type QuoteAdder,
  type QuoteInputs,
  type QuoteLineItem,
  type QuoteRun,
} from "@/lib/pricing";
import {
  FULL_WRAP_ID,
  offerCoverage,
  offerForRuns,
  offerRunName,
  parseOffers,
  shownOffers,
  type QuoteOffer,
} from "@/lib/quotes/offers";
import type { CommissionLine } from "@/lib/quotes/outcome";
import type { Json } from "@/types/database";

// The facts behind Keenan's outcome card on the lead page (round 8,
// 2026-11-09), worked out on the server from what the database holds. Pure,
// so the unit tests can pin them. The database decides every outcome; this
// only says what the card shows and what a tap will do.
//
// Round 9 (Keenan, 2026-11-10): Accepted asks which offer they said yes to,
// biggest first, and the commission uses that offer's lights and boxes.

// ------------------------------------------------------------------ runs

// A quote's runs as stored, each kept in its place so positions still point
// at the right run. A run that isn't an object counts as an empty one. A
// run's part (eave, gable and so on) is kept when it is one of the parts,
// so an offer is priced the way the customer's link prices it.
export function runsFromJson(value: Json | null | undefined): QuoteRun[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const run = item && typeof item === "object" && !Array.isArray(item) ? item : {};
    const name = typeof run.name === "string" ? run.name : "";
    const feet = typeof run.feet === "number" && Number.isFinite(run.feet) ? run.feet : 0;
    const part = (RUN_PARTS as readonly unknown[]).includes(run.part) ? (run.part as QuoteRun["part"]) : null;
    return { name, feet, level: run.level === "upper" ? "upper" : "lower", ...(part ? { part } : {}) };
  });
}

// Positions that are on the quote, sorted and without repeats, or null when
// they are missing, empty, out of range or cover every run (the full quote).
function partOfQuote(runCount: number, positions: readonly number[] | null | undefined): number[] | null {
  if (!positions || positions.length === 0) return null;
  const kept = Array.from(new Set(positions)).sort((a, b) => a - b);
  if (kept.length !== positions.length) return null;
  if (kept.some((p) => !Number.isInteger(p) || p < 0 || p >= runCount)) return null;
  return kept.length === runCount ? null : kept;
}

// "Front", "Front and Garage", "Front, Garage and Upper front".
function listWords(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const howManyRuns = (n: number) => (n === 1 ? "1 run" : `${n} runs`);

// The accepted runs in words when no offer on the quote matches them (a
// quote accepted before offers, or an offer changed since): "Full quote",
// or the runs they said yes to ("Garage only", "Front and Garage"), with
// how many runs and the feet.
export function optionWords(runs: QuoteRun[], positions: readonly number[] | null): { label: string; detail: string } {
  const part = partOfQuote(runs.length, positions);
  const feet = totalFeet(selectRuns(runs, part));
  if (part === null) return { label: "Full quote", detail: `${howManyRuns(runs.length)}, ${feet} ft` };
  const names = part.map((p) => offerRunName(runs[p], p));
  return {
    label: names.length === 1 ? `${names[0]} only` : listWords(names),
    detail: `${howManyRuns(part.length)}, ${feet} ft`,
  };
}

// ---------------------------------------------------------------- offers

// The quote columns an offer's price and commission read: the quote's own
// prices, never Settings, so the sheet matches the customer's link.
export type OfferQuoteRow = CommissionQuoteRow & {
  offers: Json;
  adders: Json;
  colour_timing: string | null;
  rush_fee: number | null;
  upper_access_fee: number | null;
  upper_gable_access_fee: number | null;
  min_job_total: number | null;
  gst_enabled: boolean;
  gst_rate: number;
};

const objects = (value: Json | null | undefined): { [key: string]: Json | undefined }[] =>
  Array.isArray(value)
    ? value.filter((item): item is { [key: string]: Json | undefined } => !!item && typeof item === "object" && !Array.isArray(item))
    : [];

// A number as the customer's page reads one: a number, or text that is
// one; anything else is 0 (or null where the column may be empty).
function amountOf(value: unknown): number {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}
const maybeAmount = (value: unknown): number | null => (value === null || value === undefined ? null : amountOf(value));
const label = (value: unknown): string => (typeof value === "string" ? value : "");

const COLOUR_TIMINGS: readonly ColourTiming[] = ["stock", "factory_order", "rush"];

// The pricing inputs for every run on a stored quote, built the way the
// customer's link builds them (lib/quote-link/view.ts customerInputs): the
// rush colour fee only when the quote is rush, both upper access amounts,
// the minimum job total and GST as the quote has them.
export function quoteInputsFromRow(row: OfferQuoteRow, runs: QuoteRun[] = runsFromJson(row.runs)): QuoteInputs {
  const colourTiming = COLOUR_TIMINGS.find((timing) => timing === row.colour_timing) ?? null;
  const adders: QuoteAdder[] = objects(row.adders).map((adder) => ({
    label: label(adder.label),
    amount: amountOf(adder.amount),
    ...(adder.upper_only === true ? { upperOnly: true } : {}),
  }));
  const discounts: QuoteLineItem[] = objects(row.discounts).map((discount) => ({
    label: label(discount.label),
    amount: amountOf(discount.amount),
  }));
  return {
    runs,
    boxCount: amountOf(row.box_count),
    pricePerFt: amountOf(row.price_per_ft),
    boxPrice: amountOf(row.box_price),
    adders,
    discounts,
    colourTiming,
    rushFee: colourTiming === "rush" ? maybeAmount(row.rush_fee) : null,
    upperAccessFee: maybeAmount(row.upper_access_fee),
    upperGableAccessFee: maybeAmount(row.upper_gable_access_fee),
    minJobTotal: maybeAmount(row.min_job_total),
    gstEnabled: row.gst_enabled === true,
    gstRate: amountOf(row.gst_rate),
  };
}

export type BookedLink = {
  booked_at: string | null;
  booked_option: string | null;
  booked_offer: string | null;
  booked_selection: number[] | null;
};

// The offer the customer booked with Book my install on their link, among
// these offers: the one they booked by its id while it is still on the
// quote with runs, else the one whose runs are exactly the runs they booked
// (a booking made before offers, or an offer taken off since). Runs booked
// on an older version of the quote, with a run taken off since, match
// nothing. Null when they haven't booked or nothing matches.
export function bookedOfferId(offers: readonly QuoteOffer[], runCount: number, link: BookedLink | null): string | null {
  if (!link?.booked_at) return null;
  const withRuns = offers.filter((offer) => offer.runs.length > 0);
  if (link.booked_offer) {
    const byId = withRuns.find((offer) => offer.id === link.booked_offer);
    if (byId) return byId.id;
  }
  const positions = link.booked_selection;
  if (!positions || positions.length === 0) return null;
  if (new Set(positions).size !== positions.length) return null;
  if (positions.some((p) => !Number.isInteger(p) || p < 0 || p >= runCount)) return null;
  return offerForRuns(withRuns, runCount, positions)?.id ?? null;
}

// One choice on the Accepted sheet: an offer on the quote.
export type AcceptOption = {
  // The offer's id on the quote.
  id: string;
  // The runs accepting it passes to quote_accept: 0-based positions, or
  // null when it covers every run, so the database's commission uses this
  // offer's lights.
  positions: number[] | null;
  // The offer's own control box count; null uses the quote's.
  boxes: number | null;
  // The offer's name.
  label: string;
  // What it covers, the way the meeting and the link say it: the runs by
  // name and the feet.
  detail: string;
  // Its price with the quote's own prices, as a screen shows a total.
  total: string;
  // The one the customer booked on their link.
  booked: boolean;
  // What accepting it would pay the setter.
  commission: CommissionLine;
};

// The offers Accepted lists, biggest first, each with what it covers, its
// price and the commission it would make. The customer's booked offer is
// marked. A quote whose offers cover no run yet offers the full quote, as
// round 8 did, so Accepted is never stuck.
export function acceptOptions({
  quote,
  link,
  commission,
}: {
  quote: OfferQuoteRow;
  link: BookedLink | null;
  commission: (positions: number[] | null, boxes: number | null) => CommissionLine;
}): AcceptOption[] {
  const runs = runsFromJson(quote.runs);
  const inputs = quoteInputsFromRow(quote, runs);
  const offers = parseOffers(quote.offers, runs.length);
  const bookedId = bookedOfferId(offers, runs.length, link);
  const shown = shownOffers(inputs, offers);
  if (shown.length === 0) {
    return [
      {
        id: FULL_WRAP_ID,
        positions: null,
        boxes: null,
        ...optionWords(runs, null),
        total: screenTotal(priceQuote(inputs).subtotal, inputs.gstEnabled),
        booked: false,
        commission: commission(null, null),
      },
    ];
  }
  return shown.map(({ offer, totals, everyRun }) => {
    const positions = everyRun ? null : [...offer.runs];
    const boxes = offer.boxes ?? null;
    return {
      id: offer.id,
      positions,
      boxes,
      label: offer.name,
      detail: offerCoverage(runs, offer),
      total: totals ? screenTotal(totals.subtotal, inputs.gstEnabled) : "",
      booked: offer.id === bookedId,
      commission: commission(positions, boxes),
    };
  });
}

// The option to start on when Accepted opens: the one they booked on their
// link, else the biggest.
export function startingChoice(options: readonly Pick<AcceptOption, "booked">[]): number {
  return Math.max(0, options.findIndex((option) => option.booked));
}

// The commission an offer would make, short, for its row on the sheet; the
// line under the list says who it goes to and when.
export function offerCommissionWords(line: CommissionLine): string {
  return line.kind === "earning" ? `${formatMoney(line.amount)} commission` : "No commission";
}

// What they said yes to, for the card once accepted (and after a cancel):
// the offer whose runs are the accepted runs, by its name and what it
// covers; else the runs in words.
export function acceptedOption(quote: Pick<OfferQuoteRow, "runs" | "offers">, acceptedRuns: readonly number[] | null) {
  const runs = runsFromJson(quote.runs);
  const offers = parseOffers(quote.offers, runs.length).filter((offer) => offer.runs.length > 0);
  const part = partOfQuote(runs.length, acceptedRuns);
  const offer = offerForRuns(offers, runs.length, part);
  return offer ? { label: offer.name, detail: offerCoverage(runs, offer) } : optionWords(runs, acceptedRuns);
}

// ---------------------------------------------------------------- quote

type QuoteForCard = { status: string; created_at: string };

// The quote the card is about: the lead's accepted quote while it has one
// (a newer draft saved in meeting mode after the yes must not hide it),
// otherwise its newest quote of any status.
export function pickOutcomeQuote<T extends QuoteForCard>(rows: readonly T[]): T | null {
  const accepted = rows.find((row) => row.status === "accepted");
  if (accepted) return accepted;
  return [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}

// ------------------------------------------------------------ commission

export type CommissionRow = {
  id: string;
  profile_id: string;
  amount: number;
  status: "pending" | "paid" | "void";
  payable_at: string | null;
  paid_at: string | null;
  note: string | null;
  quote_id: string | null;
  source_quote_id: string | null;
  created_at: string;
};

// The lead's commission the card talks about: the one pending or paid (a
// lead never has two), else the newest voided one that came from this
// quote, else none.
export function currentCommission<T extends CommissionRow>(rows: readonly T[], quoteId: string): T | null {
  const newest = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    newest.find((row) => row.status !== "void") ??
    newest.find((row) => row.status === "void" && (row.source_quote_id ?? row.quote_id) === quoteId) ??
    null
  );
}

// Who the commission goes to: the lead's setter, the same person as the
// booking pay. Only a sales associate earns; a lead of Keenan's earns
// nothing.
export type Receiver = { name: string; role: string | null };

// What accepting would pay on an option, worked out the database's way
// (lib/pay/commission.ts), for the Accepted sheet's preview: the option's
// lights and its boxes (its own box count, else the quote's).
export function previewCommission({
  receiver,
  existing,
  quote,
  positions,
  boxes = null,
  rate,
}: {
  receiver: Receiver;
  existing: CommissionRow | null;
  quote: CommissionQuoteRow;
  positions: readonly number[] | null;
  boxes?: number | null;
  rate: number;
}): CommissionLine {
  if (receiver.role === "owner") return { kind: "none", reason: "owner_lead" };
  if (receiver.role !== "sales") return { kind: "none", reason: null };
  if (existing?.status === "paid") return { kind: "none", reason: "already_paid" };
  const counted = boxes === null ? quote : { ...quote, box_count: boxes };
  const amount =
    existing?.status === "pending" ? existing.amount : commissionFor(commissionQuoteFromRow(counted, positions), rate).amount;
  return { kind: "earning", amount, setterName: receiver.name, status: "pending", payableAt: null, paidAt: null };
}

// The commission line as it stands, from the earning: coming, owed, paid
// or voided; or why there is none.
export function standingCommission(earning: CommissionRow | null, receiver: Receiver, names: ReadonlyMap<string, string>): CommissionLine {
  if (!earning) {
    return { kind: "none", reason: receiver.role === "owner" ? "owner_lead" : null };
  }
  return {
    kind: "earning",
    amount: earning.amount,
    setterName: names.get(earning.profile_id) ?? receiver.name,
    status: earning.status,
    payableAt: earning.payable_at,
    paidAt: earning.paid_at,
  };
}

// What Cancelled and Undo acceptance do to the commission, said before the
// tap: an unpaid one is voided; a paid one stays paid.
export function voidWords(line: CommissionLine): string | null {
  if (line.kind !== "earning" || line.status === "void") return null;
  const what = `The ${formatMoney(line.amount)} commission to ${line.setterName}`;
  return line.status === "paid" ? `${what} is already paid, so it stays paid.` : `${what} is voided.`;
}

// What Not installed yet does to it: an owed commission waits for the
// install again; a paid one stays paid.
export function notInstalledWords(line: CommissionLine): string | null {
  if (line.kind !== "earning" || line.status === "void") return null;
  const what = `The ${formatMoney(line.amount)} commission to ${line.setterName}`;
  return line.status === "paid" ? `${what} is already paid, so it stays paid.` : `${what} waits for the install again.`;
}

// What Installed does to it: a commission still coming becomes owed.
export function installedWords(line: CommissionLine): string | null {
  if (line.kind !== "earning" || line.status !== "pending" || line.payableAt) return null;
  return `The ${formatMoney(line.amount)} commission to ${line.setterName} becomes owed, ready to mark paid in Pay.`;
}
