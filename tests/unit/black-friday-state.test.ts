import { describe, expect, it, vi } from "vitest";

import { DEFAULT_LINES } from "@/lib/deck";
import { PRICING_SETTINGS, pricingFrom } from "@/lib/meeting/deck-payload";
import {
  blackFridayOn,
  chooseWithBlackFriday,
  offerPrice,
  recapParts,
  settleBlackFriday,
  withBlackFriday,
} from "@/lib/meeting/black-friday-state";
import { defaultQuoteState, quoteFingerprint, quoteInputs, storedQuote, type MeetingPayload, type QuoteUIState } from "@/lib/meeting/state";
import type { QuoteRun } from "@/lib/pricing";
import { BLACK_FRIDAY_LABEL, type BlackFridayDeal } from "@/lib/quotes/black-friday";
import { quoteSaveInput } from "@/lib/quotes/draft";
import { priceOffer, type QuoteOffer } from "@/lib/quotes/offers";

// Black Friday on Your price (Keenan, 2026-11-10): the button's state, the
// line it puts on the quote when the customer says yes, and what saves.

vi.mock("server-only", () => ({}));

describe("the meeting's payload", () => {
  const row = {
    price_per_ft: 23,
    box_price: 500,
    neighbour_discount: 150,
    gst_enabled: false,
    gst_rate: 0.05,
    gst_number: null,
    rush_colour_fee: 350,
    upper_access_fee: 200,
    upper_gable_access_fee: 400,
    price_hold_days: 120,
    min_job_total: null,
  };

  it("reads the deal from Settings, and no deal as null", () => {
    expect(PRICING_SETTINGS).toContain("black_friday_kind, black_friday_value");
    expect(pricingFrom({ ...row, black_friday_kind: "percent", black_friday_value: 15 }).blackFriday).toEqual({ kind: "percent", value: 15 });
    expect(pricingFrom({ ...row, black_friday_kind: "amount", black_friday_value: 300 }).blackFriday).toEqual({ kind: "amount", value: 300 });
    expect(pricingFrom({ ...row, black_friday_kind: null, black_friday_value: null }).blackFriday).toBeNull();
    expect(pricingFrom({ ...row, black_friday_kind: "percent", black_friday_value: 95 }).blackFriday).toBeNull();
    expect(pricingFrom(row).blackFriday).toBeNull();
  });
});

const RUNS: QuoteRun[] = [
  { name: "Front", feet: 60, level: "lower", part: "eave" },
  { name: "Garage", feet: 30, level: "lower", part: "garage" },
  { name: "Upper front", feet: 40, level: "upper", part: "eave" },
];
const FULL: QuoteOffer = { id: "full", name: "Full wrap", runs: [0, 1, 2], boxes: null };
const MAIN: QuoteOffer = { id: "main", name: "Main floor", runs: [0, 1], boxes: null };

const PERCENT: BlackFridayDeal = { kind: "percent", value: 15 };
const AMOUNT: BlackFridayDeal = { kind: "amount", value: 300 };

const pricingWith = (deal: BlackFridayDeal | null): MeetingPayload["pricing"] => ({
  pricePerFt: 23,
  boxPrice: 500,
  neighbourDiscount: 150,
  gstEnabled: false,
  gstRate: 0.05,
  gstNumber: null,
  rushFee: 350,
  upperAccessFee: 200,
  upperGableAccessFee: 400,
  priceHoldDays: 120,
  minJobTotal: null,
  blackFriday: deal,
});

const state = (pricing: MeetingPayload["pricing"], over: Partial<QuoteUIState> = {}): QuoteUIState => ({
  ...defaultQuoteState({ pricing, today: "2026-11-24", lead: { colourKind: "list", colourText: "White" } }),
  runs: RUNS,
  offers: [FULL, MAIN],
  ...over,
});

const dealLines = (quote: QuoteUIState) => quote.customDiscounts.filter((line) => line.label === BLACK_FRIDAY_LABEL);

describe("the Black Friday button", () => {
  it("never shows as on without a deal in Settings", () => {
    const pricing = pricingWith(null);
    expect(blackFridayOn(state(pricing, { blackFriday: true }), null)).toBe(false);
    // Tapping it with no deal changes nothing.
    const quote = state(pricing, { chosenOffer: "main" });
    expect(withBlackFriday(quote, true, pricing)).toBe(quote);
  });

  it("reads as the iPad left it, else on when the saved quote carries the line", () => {
    const pricing = pricingWith(PERCENT);
    expect(blackFridayOn(state(pricing), PERCENT)).toBe(false);
    expect(blackFridayOn(state(pricing, { blackFriday: true }), PERCENT)).toBe(true);
    const saved = state(pricing, { customDiscounts: [{ label: BLACK_FRIDAY_LABEL, amount: "387" }] });
    expect(blackFridayOn(saved, PERCENT)).toBe(true);
    expect(blackFridayOn({ ...saved, blackFriday: false }, PERCENT)).toBe(false);
  });

  it("on with nothing chosen: both prices show, nothing is added to the quote", () => {
    const pricing = pricingWith(PERCENT);
    const on = withBlackFriday(state(pricing), true, pricing);
    expect(on.blackFriday).toBe(true);
    expect(dealLines(on)).toEqual([]);
    const inputs = quoteInputs(on, pricing);
    const full = offerPrice(inputs, FULL, PERCENT, true);
    // Full wrap: 130 ft at $23 + $500 box + $200 upper access = $3,690; 15% off is $553.50.
    expect(full.regular?.subtotal).toBe(3690);
    expect(full.deal?.subtotal).toBe(3136.5);
    expect(offerPrice(inputs, FULL, PERCENT, false)).toEqual({ regular: priceOffer(inputs, FULL), deal: null });
  });
});

describe("an option already at the minimum (round 13)", () => {
  it("has no Black Friday price, so Your price says Already at our lowest price under it", () => {
    // A $2,500 minimum. Main floor: 90 ft at $23 + $500 = $2,570, over it.
    // A one-run option: 60 ft at $23 + $500 = $1,880, lifted to $2,500.
    const pricing = { ...pricingWith(AMOUNT), minJobTotal: 2500 };
    const on = withBlackFriday(state(pricing), true, pricing);
    const inputs = quoteInputs(on, pricing);
    const small: QuoteOffer = { id: "small", name: "Front only", runs: [0], boxes: null };
    const low = offerPrice(inputs, small, AMOUNT, true);
    // The deal can't take it under the minimum: one price, nothing struck.
    expect(low.regular?.subtotal).toBe(2500);
    expect(low.regular?.minimumApplied).toBe(true);
    expect(low.deal).toBeNull();
    // An option over the minimum still shows both.
    const main = offerPrice(inputs, MAIN, AMOUNT, true);
    expect(main.regular?.minimumApplied).toBe(false);
    expect(main.deal).not.toBeNull();
  });
});

describe("saying yes with Black Friday on", () => {
  it("adds one Black Friday line worked out on the chosen option, and recomputes it for another", () => {
    const pricing = pricingWith(PERCENT);
    const on = withBlackFriday(state(pricing), true, pricing);
    const main = chooseWithBlackFriday(on, "main", pricing);
    // Main floor: 90 ft at $23 + $500 = $2,570; 15% off is $385.50.
    expect(main.chosenOffer).toBe("main");
    expect(dealLines(main)).toEqual([{ label: BLACK_FRIDAY_LABEL, amount: "385.50", percent: 15 }]);
    const full = chooseWithBlackFriday(main, "full", pricing);
    expect(dealLines(full)).toEqual([{ label: BLACK_FRIDAY_LABEL, amount: "553.50", percent: 15 }]);
    // The chosen option's price on the quote is its Black Friday price.
    expect(priceOffer(quoteInputs(full, pricing), FULL)?.subtotal).toBe(3136.5);
    // The screen still shows the regular price struck through, never the deal twice.
    const shown = offerPrice(quoteInputs(full, pricing), FULL, PERCENT, true);
    expect([shown.regular?.subtotal, shown.deal?.subtotal]).toEqual([3690, 3136.5]);
  });

  it("a dollar amount comes off whichever option is chosen", () => {
    const pricing = pricingWith(AMOUNT);
    const yes = chooseWithBlackFriday(withBlackFriday(state(pricing), true, pricing), "main", pricing);
    expect(dealLines(yes)).toEqual([{ label: BLACK_FRIDAY_LABEL, amount: "300" }]);
  });

  it("turning it off after a yes, or taking the yes back, takes the line off", () => {
    const pricing = pricingWith(PERCENT);
    const yes = chooseWithBlackFriday(withBlackFriday(state(pricing), true, pricing), "main", pricing);
    expect(dealLines(withBlackFriday(yes, false, pricing))).toEqual([]);
    expect(dealLines(chooseWithBlackFriday(yes, null, pricing))).toEqual([]);
    // Turning it on after a yes puts the line on.
    const plain = chooseWithBlackFriday(state(pricing), "main", pricing);
    expect(dealLines(plain)).toEqual([]);
    expect(dealLines(withBlackFriday(plain, true, pricing))).toEqual([{ label: BLACK_FRIDAY_LABEL, amount: "385.50", percent: 15 }]);
  });

  it("keeps the quote's own discounts, and recomputes the line when the quote changes", () => {
    const pricing = pricingWith(PERCENT);
    const yes = chooseWithBlackFriday(
      withBlackFriday(state(pricing, { customDiscounts: [{ label: "Referral", amount: "100" }] }), true, pricing),
      "main",
      pricing,
    );
    // ($2,570 - $100) x 15% = $370.50, after the quote's own discount.
    expect(yes.customDiscounts).toEqual([
      { label: "Referral", amount: "100" },
      { label: BLACK_FRIDAY_LABEL, amount: "370.50", percent: 15 },
    ]);
    const longer = settleBlackFriday({ ...yes, runs: [{ ...RUNS[0], feet: 70 }, RUNS[1], RUNS[2]] }, pricing);
    expect(dealLines(longer)).toEqual([{ label: BLACK_FRIDAY_LABEL, amount: "405", percent: 15 }]);
    // Settling a settled quote changes nothing.
    expect(settleBlackFriday(longer, pricing)).toBe(longer);
  });

  it("with the deal cleared in Settings, a saved line stays an ordinary discount", () => {
    const pricing = pricingWith(null);
    const saved = state(pricing, { chosenOffer: "main", customDiscounts: [{ label: BLACK_FRIDAY_LABEL, amount: "385.50" }] });
    expect(settleBlackFriday(saved, pricing)).toBe(saved);
    expect(chooseWithBlackFriday(saved, "full", pricing).customDiscounts).toEqual(saved.customDiscounts);
  });

  it("saves the line as one of the quote's discounts, and the button rides on the iPad's copy", () => {
    const pricing = pricingWith(PERCENT);
    const yes = chooseWithBlackFriday(withBlackFriday(state(pricing), true, pricing), "main", pricing);
    const sent = quoteSaveInput(yes, pricing, "lead-1", "meeting");
    expect(sent.discounts).toEqual([{ label: BLACK_FRIDAY_LABEL, amount: 385.5, percent: 15 }]);
    expect(sent.meetingOffer).toBe("main");
    // The line changes the saved quote; the button alone never does.
    expect(quoteFingerprint(yes)).not.toBe(quoteFingerprint(chooseWithBlackFriday(state(pricing), "main", pricing)));
    expect(quoteFingerprint(withBlackFriday(state(pricing), true, pricing))).toBe(quoteFingerprint(state(pricing)));
    // A reload reads the iPad's copy back with the button as it was.
    expect(storedQuote(JSON.parse(JSON.stringify(yes)) as QuoteUIState).blackFriday).toBe(true);
  });
});

describe("What happens next's choice with Black Friday", () => {
  it("strikes the regular total through before the Black Friday one", () => {
    expect(recapParts(DEFAULT_LINES, "Main floor", 2570, 2184.5, false)).toEqual({
      before: "Your choice: Main floor,",
      regular: "$2,570",
      total: "$2,184.50",
      after: "",
    });
    expect(recapParts(DEFAULT_LINES, "Main floor", 2570, 2184.5, true).total).toBe("$2,184.50 + GST");
  });

  it("reads as it always has without the deal", () => {
    const parts = recapParts(DEFAULT_LINES, " Main floor ", 2570, null, false);
    expect(parts).toEqual({ before: "Your choice: Main floor,", regular: null, total: "$2,570", after: "" });
    expect(`${parts.before} ${parts.total}`).toBe("Your choice: Main floor, $2,570");
    // Keenan's own wording without {total}: the whole line, nothing struck.
    const lines = { ...DEFAULT_LINES, recap: "You chose {name}." };
    expect(recapParts(lines, "Main floor", 2570, 2184.5, false)).toEqual({ before: "You chose Main floor.", regular: null, total: "", after: "" });
  });
});
