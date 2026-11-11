// Black Friday pricing (round 10, Keenan, 2026-11-10). Keenan sets the deal
// in Settings: a percent or a dollar amount off. Until he does there is no
// deal and meeting mode shows no button. With the button on, every offer
// shows its regular price struck through beside the Black Friday price, and
// when the customer says yes the deal is saved on the quote as one discount
// line, so the link, the acceptance and commission all read the same quote.
//
// The amount comes off the offer's total before GST, after the quote's own
// discounts; the minimum job total still applies after it, through
// lib/pricing.ts like every other line.

import { percentOfCents, type QuoteInputs, type QuoteLineItem, type QuoteTotals } from "@/lib/pricing";
import { priceOffer, type QuoteOffer } from "@/lib/quotes/offers";

export type BlackFridayDeal = { kind: "percent" | "amount"; value: number };

export const BLACK_FRIDAY_LABEL = "Black Friday";

// The deal as Settings stores it, or null when it isn't set (or is unusable).
export function blackFridayFrom(row: { black_friday_kind?: string | null; black_friday_value?: number | string | null }): BlackFridayDeal | null {
  const kind = row.black_friday_kind;
  const value = Number(row.black_friday_value);
  if ((kind !== "percent" && kind !== "amount") || !Number.isFinite(value) || value <= 0) return null;
  if (kind === "percent" && value > 90) return null;
  return { kind, value };
}

// What the deal takes off a total before GST, to the cent, never more than
// the total itself.
// A percent is worked out exactly as lib/pricing.ts works out a percent
// line, so the line saved and the price shown never differ by a cent.
export function blackFridayAmount(deal: BlackFridayDeal, beforeDeal: number): number {
  if (beforeDeal <= 0) return 0;
  const total = Math.round(beforeDeal * 100);
  if (deal.kind === "percent") return percentOfCents(total, deal.value) / 100;
  return Math.min(Math.round(deal.value * 100), total) / 100;
}

// The deal's words for the button and the line: "15% off" or "$300 off".
export function blackFridayWords(deal: BlackFridayDeal): string {
  if (deal.kind === "percent") return `${Number.isInteger(deal.value) ? deal.value : deal.value.toFixed(1)}% off`;
  const whole = Number.isInteger(deal.value);
  return `$${deal.value.toLocaleString("en-CA", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })} off`;
}

// True when the quote's discounts already carry the deal's line.
export function hasBlackFridayLine(discounts: readonly QuoteLineItem[]): boolean {
  return discounts.some((line) => line.label === BLACK_FRIDAY_LABEL);
}

const withoutDeal = (inputs: QuoteInputs): QuoteInputs => ({
  ...inputs,
  discounts: inputs.discounts.filter((line) => line.label !== BLACK_FRIDAY_LABEL),
});

// The discount line for an offer: the deal worked out on that offer's own
// total before the minimum (the minimum still lifts it afterwards). A
// percent deal's line carries its percent (2026-11-11), so lib/pricing.ts
// works it out again on whichever option is priced: each option gets its
// own percent off on the link, and amount keeps this offer's dollars. A
// dollars deal's line is a fixed amount, the same on every option.
export function blackFridayLine(inputs: QuoteInputs, offer: QuoteOffer, deal: BlackFridayDeal): QuoteLineItem | null {
  const regular = priceOffer(withoutDeal(inputs), offer);
  if (!regular) return null;
  const amount = blackFridayAmount(deal, regular.beforeMinimum);
  if (amount <= 0) return null;
  return deal.kind === "percent" ? { label: BLACK_FRIDAY_LABEL, amount, percent: deal.value } : { label: BLACK_FRIDAY_LABEL, amount };
}

// An offer at its regular price and at the Black Friday price.
export function priceWithBlackFriday(
  inputs: QuoteInputs,
  offer: QuoteOffer,
  deal: BlackFridayDeal,
): { regular: QuoteTotals; deal: QuoteTotals } | null {
  const base = withoutDeal(inputs);
  const regular = priceOffer(base, offer);
  if (!regular) return null;
  const line = blackFridayLine(base, offer, deal);
  const withDeal = line ? priceOffer({ ...base, discounts: [...base.discounts, line] }, offer) : regular;
  return { regular, deal: withDeal ?? regular };
}

// The quote's discounts once the customer says yes with the deal on: any
// earlier Black Friday line replaced by the one for the chosen offer.
export function discountsWithBlackFriday(inputs: QuoteInputs, offer: QuoteOffer, deal: BlackFridayDeal): QuoteLineItem[] {
  const base = withoutDeal(inputs).discounts;
  const line = blackFridayLine(inputs, offer, deal);
  return line ? [...base, line] : base;
}
