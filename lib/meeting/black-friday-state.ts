// Black Friday on Your price (Keenan, 2026-11-10): the button's state and
// what it does to the quote, kept pure so it is unit tested. The deal itself
// (a percent or a dollar amount off, from Settings) and its arithmetic live
// in lib/quotes/black-friday.ts; this module only decides when the quote
// carries the deal's discount line.
//
// The one rule: the quote carries one Black Friday discount line exactly
// while the button is on and an option is chosen, worked out on that
// option. So a yes with it on saves the line with the quote (the link, the
// acceptance and commission then read the same quote), choosing another
// option recomputes it, and turning the button off, or taking the choice
// back, takes the line off. With the button on and nothing chosen yet,
// every option only shows both prices; nothing is added to the quote.
//
// No dollar amount ever leaves the quote: the line lives in the quote's
// discounts and nowhere else.
//
// CONTRACT
//   blackFridayOn(state, deal)              whether the button reads as on
//   settleBlackFriday(state, pricing)       the quote with its line as the rule says
//   withBlackFriday(state, on, pricing)     the button tapped
//   chooseWithBlackFriday(state, id, pricing)
//                                           a yes (an offer id) or a yes taken back (null)
//   offerPrice(inputs, offer, deal, on)     an option's regular total, and its
//                                           Black Friday total while the button is on
//   recapParts(lines, name, regular, deal, gstEnabled)
//                                           What happens next's "Your choice" line in parts

import { deckLine, fillLine, type DeckLines } from "@/lib/deck";
import { quoteInputs, quoteOffers, type MeetingPayload, type QuoteUIState } from "@/lib/meeting/state";
import { screenTotal, type QuoteInputs, type QuoteTotals } from "@/lib/pricing";
import { BLACK_FRIDAY_LABEL, blackFridayLine, priceWithBlackFriday, type BlackFridayDeal } from "@/lib/quotes/black-friday";
import { priceOffer, type QuoteOffer } from "@/lib/quotes/offers";

type Pricing = MeetingPayload["pricing"];

const isDealLine = (line: { label: string }) => line.label.trim() === BLACK_FRIDAY_LABEL;

// Money as the quote's inputs hold it: "300" or "254.15".
const asTyped = (amount: number) => (Number.isInteger(amount) ? String(amount) : amount.toFixed(2));

// On as the iPad left it; with no deal in Settings, never. A quote opened
// from the server (no iPad copy) reads as on when it carries the line.
export function blackFridayOn(state: Pick<QuoteUIState, "blackFriday" | "customDiscounts">, deal: BlackFridayDeal | null): boolean {
  if (!deal) return false;
  if (typeof state.blackFriday === "boolean") return state.blackFriday;
  return state.customDiscounts.some(isDealLine);
}

// The quote with its Black Friday line as the rule says. With no deal in
// Settings it is left exactly as it is: a line saved while the deal was on
// stays an ordinary discount, so clearing the deal never changes a price
// already given.
export function settleBlackFriday(state: QuoteUIState, pricing: Pricing): QuoteUIState {
  const deal = pricing.blackFriday;
  if (!deal) return state;
  const rest = state.customDiscounts.filter((line) => !isDealLine(line));
  const offer = blackFridayOn(state, deal) && state.chosenOffer ? quoteOffers(state).find((item) => item.id === state.chosenOffer) : undefined;
  const line = offer ? blackFridayLine(quoteInputs(state, pricing), offer, deal) : null;
  const next = line ? [...rest, { label: BLACK_FRIDAY_LABEL, amount: asTyped(line.amount) }] : rest;
  return JSON.stringify(next) === JSON.stringify(state.customDiscounts) ? state : { ...state, customDiscounts: next };
}

export function withBlackFriday(state: QuoteUIState, on: boolean, pricing: Pricing): QuoteUIState {
  if (!pricing.blackFriday) return state;
  return settleBlackFriday({ ...state, blackFriday: on }, pricing);
}

export function chooseWithBlackFriday(state: QuoteUIState, offerId: string | null, pricing: Pricing): QuoteUIState {
  return settleBlackFriday({ ...state, chosenOffer: offerId }, pricing);
}

// An option's totals: its regular price, and while the button is on its
// Black Friday price (null when off, or when the deal takes nothing off).
export type OfferPrice = { regular: QuoteTotals | null; deal: QuoteTotals | null };

export function offerPrice(inputs: QuoteInputs, offer: QuoteOffer, deal: BlackFridayDeal | null, on: boolean): OfferPrice {
  if (on && deal) {
    const both = priceWithBlackFriday(inputs, offer, deal);
    if (both) return { regular: both.regular, deal: both.deal.subtotal < both.regular.subtotal ? both.deal : null };
  }
  return { regular: priceOffer(inputs, offer), deal: null };
}

// "Your choice: Main floor, $3,380 + GST" in parts, so What happens next can
// strike the regular total through before the Black Friday one. regular is
// null without the deal (the line reads as it always has).
export type RecapView = { before: string; regular: string | null; total: string; after: string };

export function recapParts(lines: DeckLines, name: string, regular: number, deal: number | null, gstEnabled: boolean): RecapView {
  const total = screenTotal(deal ?? regular, gstEnabled);
  const struck = deal !== null && deal < regular ? screenTotal(regular, gstEnabled) : null;
  const template = lines.recap;
  const split = template.indexOf("{total}");
  if (split < 0) return { before: deckLine(lines, "recap", { name: name.trim(), total }), regular: null, total: "", after: "" };
  return {
    before: fillLine(template.slice(0, split), { name: name.trim() }),
    regular: struck,
    total,
    after: fillLine(template.slice(split + "{total}".length), { name: name.trim() }),
  };
}
