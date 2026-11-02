// Quote math (M5). One pure function prices the whole quote, used by the
// iPad live and by the server when a draft is saved, so the number the
// customer watched is the number that is stored. Everything is worked in
// cents and rounded per line, so the breakdown always adds up to the total.
//
// The formula (CLAUDE.md): total = (total feet x price per foot)
// + (boxes x box price) + adders - discounts, then GST if enabled. A
// non-stock colour installed this season adds the rush colour fee per foot
// on every foot; a stocked colour, or a factory order (spring), adds
// nothing.

export type QuoteRun = { name: string; feet: number; level: "lower" | "upper" };
export type QuoteLineItem = { label: string; amount: number };
export type ColourTiming = "stock" | "factory_order" | "rush";

export type QuoteInputs = {
  runs: QuoteRun[];
  boxCount: number;
  pricePerFt: number;
  boxPrice: number;
  adders: QuoteLineItem[];
  discounts: QuoteLineItem[];
  colourTiming: ColourTiming | null;
  // The fee this quote uses when colourTiming is "rush"; ignored otherwise.
  rushFeePerFt: number | null;
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

  let rushCents = 0;
  if (inputs.colourTiming === "rush" && inputs.rushFeePerFt !== null && inputs.rushFeePerFt > 0) {
    rushCents = toCents(inputs.rushFeePerFt) * feet;
    lines.push({
      label: "Colour this season",
      detail: `${feet} ft at ${formatMoney(inputs.rushFeePerFt)}/ft`,
      amount: toDollars(rushCents),
    });
  }

  let adderCents = 0;
  for (const adder of inputs.adders) {
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
  const subtotalCents = Math.max(0, trackCents + boxCents + rushCents + adderCents - discountCents);
  const gstCents = inputs.gstEnabled ? Math.round(subtotalCents * inputs.gstRate) : 0;

  return {
    totalFeet: feet,
    lines,
    subtotal: toDollars(subtotalCents),
    gst: toDollars(gstCents),
    total: toDollars(subtotalCents + gstCents),
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

// A new quote's valid-until date: quote_valid_days out, as a Calgary
// calendar date (YYYY-MM-DD).
export function defaultValidUntil(today: string, validDays: number): string {
  const [year, month, day] = today.split("-").map(Number);
  const days = Number.isFinite(validDays) ? Math.min(90, Math.max(1, Math.round(validDays))) : 14;
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
