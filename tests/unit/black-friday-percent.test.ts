import { describe, expect, it } from "vitest";

import { chooseWithBlackFriday, withBlackFriday } from "@/lib/meeting/black-friday-state";
import { defaultQuoteState, quoteInputs, quoteStateFromDraft, type MeetingPayload, type QuoteDraft, type QuoteUIState } from "@/lib/meeting/state";
import { commissionQuoteFromRow } from "@/lib/pay/commission";
import { priceQuote, resolveDiscounts, selectRuns, type QuoteInputs, type QuoteLineItem, type QuoteRun } from "@/lib/pricing";
import { linkOffers, offerChoice, quoteFromRow } from "@/lib/quote-link/view";
import { BLACK_FRIDAY_LABEL, type BlackFridayDeal } from "@/lib/quotes/black-friday";
import { quoteSaveInput } from "@/lib/quotes/draft";
import { percentDiscountWords, typeDiscountAmount } from "@/lib/quotes/editor";
import { priceOffer, type QuoteOffer } from "@/lib/quotes/offers";
import { acceptedDiscounts, acceptOptions, optionDiscounts, previewCommission, quoteInputsFromRow, type OfferQuoteRow } from "@/lib/quotes/outcome-card";

// Black Friday as a percent follows each option (Keenan, 2026-11-11): the
// saved line carries its percent, lib/pricing.ts works it out on whichever
// option is priced (the customer's link switching options included), the
// minimum still holds, and Accepted stores the accepted option's own amount
// so the database's commission reads it.

const RUNS: QuoteRun[] = [
  { name: "Front", feet: 60, level: "lower", part: "eave" },
  { name: "Garage", feet: 30, level: "lower", part: "garage" },
  { name: "Upper front", feet: 40, level: "upper", part: "eave" },
  { name: "Upper gable", feet: 20, level: "upper", part: "gable" },
];

const FULL: QuoteOffer = { id: "full", name: "Full wrap", runs: [0, 1, 2, 3], boxes: null };
const MAIN: QuoteOffer = { id: "main", name: "Main floor", runs: [0, 1, 2], boxes: null };
const LOWER: QuoteOffer = { id: "lower", name: "Front lower", runs: [0, 1], boxes: null };

const NEIGHBOUR: QuoteLineItem = { label: "Neighbour discount", amount: 150 };
// Saved on a yes to the Full wrap: 15% of ($4,350 - $150) is $630.
const PERCENT_LINE: QuoteLineItem = { label: BLACK_FRIDAY_LABEL, amount: 630, percent: 15 };

const inputs = (over: Partial<QuoteInputs> = {}): QuoteInputs => ({
  runs: RUNS,
  boxCount: 1,
  pricePerFt: 23,
  boxPrice: 500,
  adders: [],
  discounts: [NEIGHBOUR, PERCENT_LINE],
  colourTiming: null,
  rushFee: null,
  upperAccessFee: 200,
  upperGableAccessFee: 400,
  minJobTotal: 2500,
  gstEnabled: false,
  gstRate: 0.05,
  ...over,
});

const dealLine = (lines: { label: string; detail: string | null; amount: number }[]) => lines.find((line) => line.label === BLACK_FRIDAY_LABEL);

describe("a percent discount line in lib/pricing.ts", () => {
  it("is worked out on each option, the minimum still lifting one", () => {
    // Full wrap: $3,450 lights + $500 box + $400 upper gable access - $150 = $4,200; 15% is $630.
    const full = priceOffer(inputs(), FULL)!;
    expect(dealLine(full.lines)).toEqual({ label: BLACK_FRIDAY_LABEL, detail: "15% off", amount: -630 });
    expect(full.subtotal).toBe(3570);
    // Main floor: $2,990 + $500 + $200 upper access - $150 = $3,540; 15% is $531.
    const main = priceOffer(inputs(), MAIN)!;
    expect(dealLine(main.lines)?.amount).toBe(-531);
    expect(main.subtotal).toBe(3009);
    // Front lower: $2,070 + $500 - $150 = $2,420; 15% is $363, so $2,057, lifted to the $2,500 minimum.
    const lower = priceOffer(inputs(), LOWER)!;
    expect(dealLine(lower.lines)?.amount).toBe(-363);
    expect(lower.beforeMinimum).toBe(2057);
    expect(lower.minimumApplied).toBe(true);
    expect(lower.subtotal).toBe(2500);
  });

  it("adds GST after it when GST is on, and never mentions it when off", () => {
    const on = inputs({ gstEnabled: true });
    expect([priceOffer(on, FULL)!.gst, priceOffer(on, FULL)!.total]).toEqual([178.5, 3748.5]);
    expect([priceOffer(on, MAIN)!.gst, priceOffer(on, MAIN)!.total]).toEqual([150.45, 3159.45]);
    expect([priceOffer(on, LOWER)!.gst, priceOffer(on, LOWER)!.total]).toEqual([125, 2625]);
    expect(priceOffer(inputs(), MAIN)!.gst).toBe(0);
    expect(priceOffer(inputs(), MAIN)!.total).toBe(3009);
  });

  it("takes the fixed discounts off first, rounds to the cent and never goes below zero", () => {
    const odd = priceQuote(inputs({ runs: [{ name: "Front", feet: 33, level: "lower" }], discounts: [{ label: "Deal", amount: 1, percent: 12.5 }], minJobTotal: null }));
    // 33 x $23 + $500 = $1,259; 12.5% is $157.375, so $157.38.
    expect(dealLine(odd.lines)).toBeUndefined();
    expect(odd.lines.find((line) => line.label === "Deal")).toEqual({ label: "Deal", detail: "12.5% off", amount: -157.38 });
    const nothingLeft = priceQuote(inputs({ discounts: [{ label: "Big", amount: 99_999 }, PERCENT_LINE], minJobTotal: null }));
    expect(dealLine(nothingLeft.lines)).toBeUndefined();
    expect(nothingLeft.subtotal).toBe(0);
  });

  it("treats an unusable percent as a fixed amount", () => {
    for (const percent of [0, -5, 95, Number.NaN, null]) {
      const totals = priceOffer(inputs({ discounts: [NEIGHBOUR, { label: BLACK_FRIDAY_LABEL, amount: 630, percent }] }), MAIN)!;
      expect(dealLine(totals.lines)).toEqual({ label: BLACK_FRIDAY_LABEL, detail: null, amount: -630 });
    }
  });

  it("resolveDiscounts gives each option's own amount, keeping the percent and the fixed lines", () => {
    const main = resolveDiscounts({ ...inputs(), runs: selectRuns(RUNS, MAIN.runs) });
    expect(main).toEqual([NEIGHBOUR, { label: BLACK_FRIDAY_LABEL, amount: 531, percent: 15 }]);
    expect(resolveDiscounts(inputs({ discounts: [NEIGHBOUR] }))).toEqual([NEIGHBOUR]);
  });

  it("a dollars deal is the same dollars on every option, as before", () => {
    const dollars = inputs({ discounts: [NEIGHBOUR, { label: BLACK_FRIDAY_LABEL, amount: 300 }] });
    expect(dealLine(priceOffer(dollars, FULL)!.lines)).toEqual({ label: BLACK_FRIDAY_LABEL, detail: null, amount: -300 });
    expect(dealLine(priceOffer(dollars, MAIN)!.lines)?.amount).toBe(-300);
    expect(priceOffer(dollars, MAIN)!.subtotal).toBe(3240);
    expect(priceOffer(dollars, LOWER)!.subtotal).toBe(2500);
  });
});

// A quotes row as the database keeps it.
const ROW: OfferQuoteRow = {
  runs: RUNS,
  offers: [FULL, MAIN, LOWER],
  box_count: 1,
  price_per_ft: 23,
  box_price: 500,
  adders: [],
  discounts: [{ ...NEIGHBOUR }, { ...PERCENT_LINE }],
  colour_timing: "stock",
  rush_fee: null,
  upper_access_fee: 200,
  upper_gable_access_fee: 400,
  min_job_total: 2500,
  gst_enabled: false,
  gst_rate: 0.05,
};

describe("the customer's link with a percent Black Friday line", () => {
  it("keeps the percent when it reads the quote, and each option shows its own 15% off", () => {
    const quote = quoteFromRow({ ...ROW, runs_fingerprint: "x" })!;
    expect(quote.discounts).toEqual([NEIGHBOUR, PERCENT_LINE]);
    const totals = Object.fromEntries(linkOffers(quote).map((priced) => [priced.offer.id, priced.totals!.subtotal]));
    expect(totals).toEqual({ full: 3570, main: 3009, lower: 2500 });
    // Switching options: the server's total for Book my install follows too.
    expect(dealLine(offerChoice(quote, "main")!.totals.lines)?.amount).toBe(-531);
    expect(offerChoice(quote, "main")!.total).toBe("$3,009");
    expect(dealLine(offerChoice(quote, "lower")!.totals.lines)?.amount).toBe(-363);
    expect(offerChoice(quote, "lower")!.totals.minimumApplied).toBe(true);
    expect(offerChoice({ ...quote, gstEnabled: true }, "full")!.total).toBe("$3,570 + GST");
  });

  it("drops a percent it can't use", () => {
    const quote = quoteFromRow({ ...ROW, discounts: [{ label: BLACK_FRIDAY_LABEL, amount: 630, percent: "lots" }, { label: "Other", amount: 20, percent: 120 }] })!;
    expect(quote.discounts).toEqual([
      { label: BLACK_FRIDAY_LABEL, amount: 630 },
      { label: "Other", amount: 20 },
    ]);
  });
});

describe("Accepted with a percent Black Friday line", () => {
  it("stores the accepted option's own amount first, keeping the percent and the rest", () => {
    const withExtra = { ...ROW, discounts: [{ ...NEIGHBOUR }, { ...PERCENT_LINE, note: "kept" }] };
    expect(acceptedDiscounts(withExtra, "main")).toEqual([NEIGHBOUR, { label: BLACK_FRIDAY_LABEL, amount: 531, percent: 15, note: "kept" }]);
    expect(acceptedDiscounts(ROW, "lower")).toEqual([NEIGHBOUR, { label: BLACK_FRIDAY_LABEL, amount: 363, percent: 15 }]);
  });

  it("changes nothing when the amount is already the option's, with no percent line, or no such option", () => {
    expect(acceptedDiscounts(ROW, "full")).toBeNull();
    expect(acceptedDiscounts({ ...ROW, discounts: [NEIGHBOUR, { label: BLACK_FRIDAY_LABEL, amount: 300 }] }, "main")).toBeNull();
    expect(acceptedDiscounts(ROW, "nope")).toBeNull();
  });

  it("works it out on the option's own boxes, and on every run for a quote with no offers", () => {
    const twoBoxes = { ...ROW, offers: [{ ...MAIN, boxes: 2 }] };
    // ($2,990 + $1,000 + $200 - $150) x 15% = $606.
    expect(acceptedDiscounts(twoBoxes, "main")?.[1]).toEqual({ label: BLACK_FRIDAY_LABEL, amount: 606, percent: 15 });
    expect(acceptedDiscounts({ ...ROW, offers: [], discounts: [NEIGHBOUR, { ...PERCENT_LINE, amount: 1 }] }, "full")?.[1]).toEqual(PERCENT_LINE);
  });

  it("previews each option's commission on its own amount, as the database will work it out", () => {
    const receiver = { name: "Sam", role: "sales" };
    const options = acceptOptions({
      quote: ROW,
      link: null,
      commission: (positions, boxes, discounts) =>
        previewCommission({ receiver, existing: null, quote: { ...ROW, discounts }, positions, boxes, rate: 0.05 }),
    });
    const amounts = Object.fromEntries(options.map((option) => [option.id, option.commission.kind === "earning" ? option.commission.amount : null]));
    // Lights and boxes less the discounts, at 5%: full ($3,950 - $780), main ($3,490 - $681), lower ($2,570 - $513).
    expect(amounts).toEqual({ full: 158.5, main: 140.45, lower: 102.85 });
    // The same as the commission on the stored row once Accepted has rewritten the line.
    const stored = commissionQuoteFromRow({ ...ROW, discounts: acceptedDiscounts(ROW, "main")! }, MAIN.runs);
    expect(stored.discounts.map((d) => d.amount)).toEqual([150, 531]);
    expect(optionDiscounts(ROW, MAIN.runs, null)).toEqual([NEIGHBOUR, { label: BLACK_FRIDAY_LABEL, amount: 531, percent: 15 }]);
  });
});

const PERCENT: BlackFridayDeal = { kind: "percent", value: 15 };
const pricing: MeetingPayload["pricing"] = {
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
  minJobTotal: 2500,
  blackFriday: PERCENT,
};
const context = { pricing, today: "2026-11-24", lead: { colourKind: "list" as const, colourText: "White" } };
const state = (over: Partial<QuoteUIState> = {}): QuoteUIState => ({ ...defaultQuoteState(context), runs: RUNS, offers: [FULL, MAIN, LOWER], ...over });

describe("every parser keeps the percent", () => {
  it("meeting mode: a yes saves the percent, and every option is then priced with its own", () => {
    // No neighbour discount here: the Full wrap is $4,350, so 15% is $652.50.
    const yes = chooseWithBlackFriday(withBlackFriday(state(), true, pricing), "full", pricing);
    expect(yes.customDiscounts).toEqual([{ label: BLACK_FRIDAY_LABEL, amount: "652.50", percent: 15 }]);
    const sent = quoteSaveInput(yes, pricing, "lead-1", "meeting");
    expect(sent.discounts).toEqual([{ label: BLACK_FRIDAY_LABEL, amount: 652.5, percent: 15 }]);
    // The Main floor ($3,690) then gets its own 15%, $553.50.
    const priced = quoteInputs(yes, pricing);
    expect(priceOffer(priced, MAIN)?.subtotal).toBe(3136.5);
  });

  it("a saved draft reads back with its percent; a fixed line stays fixed", () => {
    const draft: QuoteDraft = {
      quoteId: "quote-1",
      runs: RUNS,
      boxCount: 1,
      pricePerFt: 23,
      boxPrice: 500,
      adders: [],
      discounts: [{ label: "Referral", amount: 100 }, PERCENT_LINE],
      colourTiming: "stock",
      rushFee: null,
      upperAccessFee: 200,
      upperGableAccessFee: 400,
      financingOffered: false,
      validUntil: "2026-12-17",
      offers: [FULL, MAIN],
      meetingOffer: "full",
      meetingInstallOn: null,
      updatedAt: "2026-11-24T01:00:00+00:00",
    };
    const read = quoteStateFromDraft(draft, context);
    expect(read.customDiscounts).toEqual([
      { label: "Referral", amount: "100" },
      { label: BLACK_FRIDAY_LABEL, amount: "630", percent: 15 },
    ]);
    expect(quoteInputs(read, pricing).discounts).toEqual([{ label: "Referral", amount: 100 }, PERCENT_LINE]);
    expect(quoteInputsFromRow({ ...ROW, discounts: [{ label: BLACK_FRIDAY_LABEL, amount: 630, percent: "15" }] }).discounts).toEqual([PERCENT_LINE]);
  });

  it("a dollars deal saves a fixed line, as before", () => {
    const dollars = { ...pricing, blackFriday: { kind: "amount" as const, value: 300 } };
    const yes = chooseWithBlackFriday(withBlackFriday(state(), true, dollars), "main", dollars);
    expect(yes.customDiscounts).toEqual([{ label: BLACK_FRIDAY_LABEL, amount: "300" }]);
    expect(quoteSaveInput(yes, dollars, "lead-1", "meeting").discounts).toEqual([{ label: BLACK_FRIDAY_LABEL, amount: 300 }]);
  });
});

describe("the lead page's editor", () => {
  it("says what a percent line comes to on each option", () => {
    const quote = state({ customDiscounts: [{ label: BLACK_FRIDAY_LABEL, amount: "630", percent: 15 }] });
    const words = percentDiscountWords(quote.customDiscounts[0], quoteInputs(quote, pricing), quote.offers);
    expect(words).toBe("Black Friday, 15% off: Full wrap $652.50, Main floor $553.50, Front lower $385.50.");
    expect(percentDiscountWords({ label: "Referral", amount: "100" }, quoteInputs(quote, pricing), quote.offers)).toBeNull();
  });

  it("a typed amount makes the line a fixed amount, dropping its percent", () => {
    const lines = [
      { label: "Referral", amount: "100" },
      { label: BLACK_FRIDAY_LABEL, amount: "630", percent: 15 },
    ];
    const typed = typeDiscountAmount(lines, 1, "400");
    expect(typed).toEqual([
      { label: "Referral", amount: "100" },
      { label: BLACK_FRIDAY_LABEL, amount: "400" },
    ]);
    expect(typeDiscountAmount(lines, 0, "120")[1]).toEqual(lines[1]);
    const priced = quoteInputs(state({ customDiscounts: typed }), pricing);
    expect(priceOffer(priced, MAIN)?.subtotal).toBe(3690 - 100 - 400);
  });
});
