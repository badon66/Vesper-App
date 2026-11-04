// Quote math (M5). One pure function prices the whole quote, used by the
// iPad live and by the server when a draft is saved, so the number the
// customer watched is the number that is stored. Everything is worked in
// cents and rounded per line, so the breakdown always adds up to the total.
//
// The formula (CLAUDE.md): total = (total feet x price per foot)
// + (boxes x box price) + upper access + the rush colour fee + adders
// - discounts, raised to the minimum job, then GST if enabled. A non-stock
// colour installed this season adds the flat rush colour fee (2026-11-04,
// replacing a fee per foot); a stocked colour, or a factory order
// (spring), adds nothing. Upper access (2026-11-04) follows the runs that
// are on: none without an upper run, the upper gable amount when an upper
// gable is on, otherwise the upper amount. A quote made before then has no
// amounts, so neither line.
//
// The quote link (2026-11-02) runs the same function on the customer's
// phone and on the server, over the runs they have switched on: an
// extra-work line marked "only with upper runs" counts only while an
// upper run is in, and when the total before GST falls below the minimum
// job total it rises to the minimum with a line saying so.

// The part of the house a run lights (2026-11-04), beside its level, so the
// house diagram knows what to light and upper access knows an upper gable.
export const RUN_PARTS = ["eave", "gable", "garage", "porch", "sides", "other"] as const;
export type RunPart = (typeof RUN_PARTS)[number];
export type QuoteRun = { name: string; feet: number; level: "lower" | "upper"; part?: RunPart | null };
export type QuoteLineItem = { label: string; amount: number };
// Extra work. upperOnly: the line counts only while an upper run is in.
export type QuoteAdder = QuoteLineItem & { upperOnly?: boolean };
export type ColourTiming = "stock" | "factory_order" | "rush";

export type QuoteInputs = {
  runs: QuoteRun[];
  boxCount: number;
  pricePerFt: number;
  boxPrice: number;
  adders: QuoteAdder[];
  discounts: QuoteLineItem[];
  colourTiming: ColourTiming | null;
  // The flat fee this quote uses when colourTiming is "rush"; ignored
  // otherwise. Null or 0: no line.
  rushFee: number | null;
  // The two upper access amounts this quote uses; null on a quote made
  // before 2026-11-04, which has no upper access line.
  upperAccessFee?: number | null;
  upperGableAccessFee?: number | null;
  // The least the job can cost before GST; null or 0 means no minimum.
  minJobTotal?: number | null;
  gstEnabled: boolean;
  gstRate: number;
};

export type QuoteLine = {
  label: string;
  detail: string | null;
  // In dollars, already rounded to the cent. Discounts are negative.
  amount: number;
};

export type QuoteTotals = {
  totalFeet: number;
  lines: QuoteLine[];
  subtotal: number;
  gst: number;
  total: number;
  // True when the total was raised to the minimum job total.
  minimumApplied: boolean;
};

const toCents = (dollars: number) => Math.round(dollars * 100);
const toDollars = (cents: number) => cents / 100;

// A run's feet: whole feet, measured at the house. Anything unusable is 0.
export function cleanFeet(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(10_000, Math.round(value));
}

export function totalFeet(runs: QuoteRun[]): number {
  return runs.reduce((sum, run) => sum + cleanFeet(run.feet), 0);
}

// Whether any run with feet is on the upper level.
export function hasUpperRun(runs: QuoteRun[]): boolean {
  return runs.some((run) => run.level === "upper" && cleanFeet(run.feet) > 0);
}

// A run's part as stored, or a guess from its name for a run saved before
// parts existed (the quote builder makes the same guess as a starting
// point, and Keenan can change it).
export function guessRunPart(name: string): RunPart {
  const n = name.toLowerCase();
  if (/porch|veranda|entry|entrance/.test(n)) return "porch";
  if (/\bsides?\b/.test(n)) return "sides";
  if (/gable|peak/.test(n)) return "gable";
  if (/garage/.test(n)) return "garage";
  if (/eave|front|back|rear|roofline|fascia/.test(n)) return "eave";
  return "other";
}

export function runPart(run: QuoteRun): RunPart {
  return run.part && (RUN_PARTS as readonly string[]).includes(run.part) ? run.part : guessRunPart(run.name);
}

// The upper access amount for the runs that are on, or null for no line.
export function upperAccessAmount(
  runs: QuoteRun[],
  fees: { upperAccessFee?: number | null; upperGableAccessFee?: number | null },
): number | null {
  const upper = runs.filter((run) => run.level === "upper" && cleanFeet(run.feet) > 0);
  if (upper.length === 0) return null;
  const amount = upper.some((run) => runPart(run) === "gable") ? fees.upperGableAccessFee : fees.upperAccessFee;
  return amount !== null && amount !== undefined && Number.isFinite(amount) && amount > 0 ? amount : null;
}

// The breakdown's names for the two lines added on 2026-11-04.
export const UPPER_ACCESS_LABEL = "Upper access";
export const RUSH_COLOUR_LABEL = "Colour before Christmas";

// The runs a customer has switched on: positions into the quote's runs, in
// the quote's order, or every run when positions is null. Positions that
// aren't on the quote are ignored.
export function selectRuns(runs: QuoteRun[], positions: readonly number[] | null): QuoteRun[] {
  if (positions === null) return runs;
  const wanted = new Set(positions);
  return runs.filter((_, at) => wanted.has(at));
}

export function priceQuote(inputs: QuoteInputs): QuoteTotals {
  const feet = totalFeet(inputs.runs);
  const lines: QuoteLine[] = [];

  const trackCents = toCents(inputs.pricePerFt) * feet;
  lines.push({
    label: "Track and lights",
    detail: `${feet} ft at ${formatMoney(inputs.pricePerFt)}/ft`,
    amount: toDollars(trackCents),
  });

  const boxes = Math.max(0, Math.round(inputs.boxCount));
  const boxCents = toCents(inputs.boxPrice) * boxes;
  if (boxes > 0) {
    lines.push({
      label: boxes === 1 ? "Control box" : `Control boxes (${boxes})`,
      detail: boxes === 1 ? null : `${boxes} at ${formatMoney(inputs.boxPrice)}`,
      amount: toDollars(boxCents),
    });
  }

  let accessCents = 0;
  const access = upperAccessAmount(inputs.runs, inputs);
  if (access !== null) {
    accessCents = toCents(access);
    lines.push({ label: UPPER_ACCESS_LABEL, detail: null, amount: toDollars(accessCents) });
  }

  let rushCents = 0;
  if (inputs.colourTiming === "rush" && inputs.rushFee !== null && Number.isFinite(inputs.rushFee) && inputs.rushFee > 0) {
    rushCents = toCents(inputs.rushFee);
    lines.push({ label: RUSH_COLOUR_LABEL, detail: null, amount: toDollars(rushCents) });
  }

  let adderCents = 0;
  const upper = hasUpperRun(inputs.runs);
  for (const adder of inputs.adders) {
    if (adder.upperOnly && !upper) continue;
    const cents = toCents(Math.max(0, adder.amount));
    if (cents === 0 && adder.label.trim() === "") continue;
    adderCents += cents;
    lines.push({ label: adder.label.trim() || "Extra work", detail: null, amount: toDollars(cents) });
  }

  let discountCents = 0;
  for (const discount of inputs.discounts) {
    const cents = toCents(Math.max(0, discount.amount));
    if (cents === 0) continue;
    discountCents += cents;
    lines.push({ label: discount.label.trim() || "Discount", detail: null, amount: -toDollars(cents) });
  }

  // A pile of discounts can never make the house owe less than nothing.
  let subtotalCents = Math.max(0, trackCents + boxCents + accessCents + rushCents + adderCents - discountCents);

  // Below the minimum job total, the total rises to the minimum, and a
  // line says so, so the breakdown still adds up.
  // The line names what the amount is: the top-up to the minimum.
  const minimum = inputs.minJobTotal ?? 0;
  const minCents = Number.isFinite(minimum) && minimum > 0 ? toCents(minimum) : 0;
  const minimumApplied = minCents > subtotalCents;
  if (minimumApplied) {
    lines.push({
      label: `To reach our ${formatMoney(toDollars(minCents))} minimum`,
      detail: null,
      amount: toDollars(minCents - subtotalCents),
    });
    subtotalCents = minCents;
  }

  const gstCents = inputs.gstEnabled ? Math.round(subtotalCents * inputs.gstRate) : 0;

  return {
    totalFeet: feet,
    lines,
    subtotal: toDollars(subtotalCents),
    gst: toDollars(gstCents),
    total: toDollars(subtotalCents + gstCents),
    minimumApplied,
  };
}

// "$3,450" or "$3,427.50": cents show only when they exist.
export function formatMoney(amount: number): string {
  const cents = Math.round(Math.abs(amount) * 100);
  const whole = cents % 100 === 0;
  const text = (cents / 100).toLocaleString("en-CA", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${amount < 0 ? "-" : ""}$${text}`;
}

// What any screen shows for a total: "$3,450 + GST" while GST is enabled,
// the price alone while it is off. No screen ever shows a GST dollar
// figure; that is for the PDF (take 2).
export function screenTotal(subtotal: number, gstEnabled: boolean): string {
  return gstEnabled ? `${formatMoney(subtotal)} + GST` : formatMoney(subtotal);
}

// A new quote's price-held-until date: price_hold_days out (120 since
// 2026-11-04), as a Calgary calendar date (YYYY-MM-DD).
export function defaultValidUntil(today: string, holdDays: number): string {
  const [year, month, day] = today.split("-").map(Number);
  const days = Number.isFinite(holdDays) ? Math.min(365, Math.max(1, Math.round(holdDays))) : 120;
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
