import { cleanFeet, type QuoteLineItem, type QuoteRun } from "@/lib/pricing";
import type { Json } from "@/types/database";

// A setter's commission (Keenan, 2026-11-09, round 8): the commission rate
// (settings.commission_rate, 5% to start) of the lights and control boxes
// after discounts. The rush colour fee, upper access, every extra work line
// and any top-up to the minimum job total are left out.
//
// The database works the amount out itself when Keenan marks a quote
// accepted (public.quote_commission_base and public.quote_accept), from the
// stored quote, never from a number a browser sends. This is its mirror,
// for previews and unit tests, and it gives exactly the database's amount:
// money is counted in whole cents and the rate in basis points, so no
// floating point rounding can move a cent.
//
//   feet      = sum over the accepted runs of least(10000, greatest(0, round(feet)))
//   track     = round(price_per_ft x 100) x feet                cents
//   boxes     = round(box_price x 100) x greatest(box_count, 0)  cents (boxes always count)
//   discounts = sum of round(greatest(0, amount) x 100)          cents
//   base      = greatest(0, track + boxes - discounts) / 100
//   amount    = round(base x rate, 2)
//
// It reads only the runs, the boxes, the two prices and the discounts, so
// what is left out is left out by construction, whatever the quote's other
// lines are called now or later.

// Only the parts of a quote the commission reads. A run's feet and a
// discount's amount count only when they are numbers, as in the database.
export type CommissionQuote = {
  runs: readonly Pick<QuoteRun, "feet">[];
  boxCount: number;
  pricePerFt: number;
  boxPrice: number;
  discounts: readonly Pick<QuoteLineItem, "amount">[];
  // The accepted runs, as 0-based positions into runs; null means every
  // run (the full quote). A "Start smaller" acceptance counts only its own.
  positions: readonly number[] | null;
};

export type Commission = {
  // The base and the amount in dollars, each a whole number of cents.
  base: number;
  amount: number;
};

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

// Rounds a whole-number ratio half away from zero, the way Postgres rounds
// a numeric.
function divideRounded(numerator: number, denominator: number): number {
  const sign = numerator < 0 ? -1 : 1;
  const size = Math.abs(numerator);
  const whole = Math.floor(size / denominator);
  const rest = size - whole * denominator;
  return sign * (rest * 2 >= denominator ? whole + 1 : whole);
}

// value x 10^places, rounded half away from zero, worked on the number's
// own decimal digits. 1.005 x 100 is 100.49999999999999 in floating point,
// but Postgres reads the stored 1.005 exactly and rounds it to 101; so does
// this.
export function shiftRounded(value: number, places: number): number {
  if (!isNumber(value)) return 0;
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(value));
  if (!match) return Math.round(value * 10 ** places);
  const [, minus, whole, fraction = "", exponent = "0"] = match;
  const digits = `${whole}${fraction}`;
  // Where the decimal point falls in digits once shifted.
  const point = whole.length + Number(exponent) + places;
  let kept: string;
  let next: number;
  if (point <= 0) {
    kept = "0";
    next = point === 0 ? Number(digits[0] ?? "0") : 0;
  } else if (point >= digits.length) {
    kept = digits.padEnd(point, "0");
    next = 0;
  } else {
    kept = digits.slice(0, point);
    next = Number(digits[point]);
  }
  const size = Number(kept) + (next >= 5 ? 1 : 0);
  return size === 0 ? 0 : minus ? -size : size;
}

const cents = (dollars: number) => shiftRounded(dollars, 2);

// The rate as whole basis points: 0.05 is 500. settings.commission_rate
// keeps four decimal places, so this is exact.
export const rateBasisPoints = (rate: number) => shiftRounded(rate, 4);

// The feet the commission counts: the accepted runs only, each in whole
// feet, nothing below 0 or above 10,000.
export function commissionFeet(quote: Pick<CommissionQuote, "runs" | "positions">): number {
  const wanted = quote.positions === null ? null : new Set(quote.positions);
  let feet = 0;
  quote.runs.forEach((run, at) => {
    if (wanted !== null && !wanted.has(at)) return;
    if (isNumber(run?.feet)) feet += cleanFeet(run.feet);
  });
  return feet;
}

// The base in cents: lights and control boxes, less the discounts, never
// below zero.
export function commissionBaseCents(quote: CommissionQuote): number {
  const track = cents(quote.pricePerFt) * commissionFeet(quote);
  const boxes = cents(quote.boxPrice) * Math.max(0, Math.round(isNumber(quote.boxCount) ? quote.boxCount : 0));
  let discounts = 0;
  for (const discount of quote.discounts) {
    if (isNumber(discount?.amount)) discounts += cents(Math.max(0, discount.amount));
  }
  return Math.max(0, track + boxes - discounts);
}

// The commission's amount in cents for a base in cents at a rate:
// round(base x rate, 2).
export function commissionAmountCents(baseCents: number, rate: number): number {
  return divideRounded(baseCents * rateBasisPoints(rate), 10_000);
}

// The base and the commission on a quote at a rate, in dollars.
export function commissionFor(quote: CommissionQuote, rate: number): Commission {
  const base = commissionBaseCents(quote);
  return { base: base / 100, amount: commissionAmountCents(base, rate) / 100 };
}

// The quote columns the commission reads, as a quotes row has them.
export type CommissionQuoteRow = {
  runs: Json;
  box_count: number;
  price_per_ft: number;
  box_price: number;
  discounts: Json;
};

const objectsOf = (value: Json): { [key: string]: Json | undefined }[] =>
  Array.isArray(value)
    ? value.filter((item): item is { [key: string]: Json | undefined } => !!item && typeof item === "object" && !Array.isArray(item))
    : [];

// A quotes row read straight from the database, ready for commissionFor.
// Runs keep their places, so positions still point at the right ones; a
// run or discount that isn't an object, or whose number isn't a number,
// counts for nothing.
export function commissionQuoteFromRow(row: CommissionQuoteRow, positions: readonly number[] | null): CommissionQuote {
  const runs = Array.isArray(row.runs) ? row.runs : [];
  return {
    runs: runs.map((run) => {
      const feet = run && typeof run === "object" && !Array.isArray(run) ? run.feet : undefined;
      return { feet: isNumber(feet) ? feet : 0 };
    }),
    boxCount: Number(row.box_count),
    pricePerFt: Number(row.price_per_ft),
    boxPrice: Number(row.box_price),
    discounts: objectsOf(row.discounts).map((discount) => ({
      amount: isNumber(discount.amount) ? discount.amount : 0,
    })),
    positions,
  };
}
