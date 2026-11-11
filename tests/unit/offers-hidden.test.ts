import { describe, expect, it } from "vitest";
import type { QuoteInputs, QuoteRun } from "@/lib/pricing";
import { screenOptions } from "@/lib/meeting/price-screen";
import { offersBlock, quoteSummary } from "@/lib/quotes/editor";
import {
  canHideOffer,
  chosenOfferTotals,
  keepOneShown,
  NO_OFFER_SHOWN,
  noOfferShown,
  offersForSave,
  parseOffers,
  pricedOffers,
  setOfferHidden,
  shownOffers,
  type QuoteOffer,
} from "@/lib/quotes/offers";
import { acceptOptions, previewCommission, startingChoice, type OfferQuoteRow } from "@/lib/quotes/outcome-card";
import { linkOffers, offerChoice, quoteFromRow } from "@/lib/quote-link/view";

// Round 13 (Keenan, 2026-11-11): Keenan chooses which offers the customer
// sees. A hidden offer stays in the editor and shows nowhere the customer
// looks; at least one offer is always shown.

const RUNS: QuoteRun[] = [
  { name: "Front", feet: 60, level: "lower", part: "eave" },
  { name: "Garage", feet: 30, level: "lower", part: "garage" },
  { name: "Upper front", feet: 40, level: "upper", part: "eave" },
];

const inputs: QuoteInputs = {
  runs: RUNS,
  boxCount: 1,
  pricePerFt: 24,
  boxPrice: 500,
  adders: [],
  discounts: [],
  colourTiming: null,
  rushFee: null,
  upperAccessFee: 200,
  upperGableAccessFee: 400,
  minJobTotal: 2500,
  gstEnabled: false,
  gstRate: 0.05,
};

const full: QuoteOffer = { id: "full", name: "Full wrap", runs: [0, 1, 2] };
const lower: QuoteOffer = { id: "lower", name: "Front lower", runs: [0, 1] };
const garage: QuoteOffer = { id: "garage", name: "Garage", runs: [1] };
const hide = (offer: QuoteOffer): QuoteOffer => ({ ...offer, hidden: true });

describe("Show to customer (round 13)", () => {
  it("keeps the switch only when it is off, reading and saving", () => {
    const stored = [
      { id: "full", name: "Full wrap", runs: [0, 1, 2], hidden: false },
      { id: "lower", name: "Front lower", runs: [0, 1], hidden: true },
      { id: "garage", name: "Garage", runs: [1], hidden: "true" },
    ];
    const parsed = parseOffers(stored, RUNS.length);
    expect(parsed.map((offer) => [offer.id, "hidden" in offer ? offer.hidden : "none"])).toEqual([
      ["full", "none"],
      ["lower", true],
      ["garage", "none"],
    ]);
    expect(offersForSave(parsed, RUNS.length).map((offer) => offer.hidden ?? false)).toEqual([false, true, false]);
  });

  it("leaves a hidden offer out of what the customer sees, and keeps it in the editor's list", () => {
    const offers = [full, hide(lower), garage];
    expect(shownOffers(inputs, offers).map((priced) => priced.offer.id)).toEqual(["full", "garage"]);
    expect(screenOptions(inputs, offers).map((priced) => priced.offer.id)).toEqual(["full", "garage"]);
    expect(pricedOffers(inputs, offers).map((priced) => priced.offer.id)).toEqual(["full", "lower", "garage"]);
  });

  it("always keeps one shown: the last shown offer can't be hidden", () => {
    expect(canHideOffer([full, lower], "full")).toBe(true);
    expect(canHideOffer([full, hide(lower)], "full")).toBe(false);
    expect(canHideOffer([full], "full")).toBe(false);
    // An offer with no areas doesn't count as something to see.
    expect(canHideOffer([full, { id: "blank", name: "", runs: [] }], "full")).toBe(false);
    expect(canHideOffer([full, lower], "nope")).toBe(false);

    expect(setOfferHidden([full, lower], "lower", true)).toEqual([full, hide(lower)]);
    // Refused: nothing changes.
    expect(setOfferHidden([full, hide(lower)], "full", true)).toEqual([full, hide(lower)]);
    // Showing it again drops the flag altogether.
    expect(setOfferHidden([full, hide(lower)], "lower", false)).toEqual([full, lower]);
  });

  it("says when nothing would be shown, and shows one again after a delete", () => {
    expect(noOfferShown([full, lower])).toBe(false);
    expect(noOfferShown([full, hide(lower)])).toBe(false);
    expect(noOfferShown([hide(lower)])).toBe(true);
    expect(noOfferShown([{ id: "blank", name: "", runs: [] }, hide(lower)])).toBe(true);
    // No switch off anywhere: the old rules, never blocked.
    expect(noOfferShown([{ id: "blank", name: "", runs: [] }])).toBe(false);
    expect(noOfferShown([])).toBe(false);

    // Full wrap deleted, only the hidden one left: it shows again.
    expect(keepOneShown([hide(lower)])).toEqual([lower]);
    expect(keepOneShown([hide(garage), hide(lower)])).toEqual([garage, hide(lower)]);
    expect(keepOneShown([full, hide(lower)])).toEqual([full, hide(lower)]);

    expect(offersBlock([full, hide(lower)])).toBeNull();
    expect(offersBlock([hide(lower)])).toBe(NO_OFFER_SHOWN);
    expect(offersBlock([{ ...full, name: "Full wrap - best" }])).toBe("An offer's name needs fixing first.");
  });

  it("counts the hidden ones on the lead page's summary, without a price", () => {
    const day = (value: string) => value;
    expect(quoteSummary(inputs, [full, hide(lower)], "2026-11-25", day)).toBe("Full wrap $3,820. 1 hidden from the customer. Price held until 2026-11-25.");
    expect(quoteSummary(inputs, [full, lower], null, day)).toBe("Full wrap $3,820, Front lower $2,660.");
  });

  it("never treats a hidden offer as the table's choice when storing the quote's numbers", () => {
    // Chosen and shown: that option's numbers. Chosen but hidden since: the whole quote's.
    expect(chosenOfferTotals(inputs, [full, lower], "lower").subtotal).toBe(2660);
    expect(chosenOfferTotals(inputs, [full, hide(lower)], "lower").subtotal).toBe(3820);
  });
});

describe("a hidden offer on the Accepted sheet and the link (round 13)", () => {
  const row: OfferQuoteRow = {
    runs: RUNS,
    offers: [
      { id: "full", name: "Full wrap", runs: [0, 1, 2] },
      { id: "lower", name: "Front lower", runs: [0, 1], hidden: true },
      { id: "garage", name: "Garage", runs: [1] },
    ],
    box_count: 1,
    price_per_ft: 24,
    box_price: 500,
    adders: [],
    discounts: [],
    colour_timing: null,
    rush_fee: null,
    upper_access_fee: 200,
    upper_gable_access_fee: 400,
    min_job_total: 2500,
    gst_enabled: false,
    gst_rate: 0.05,
  } as OfferQuoteRow;
  const commission = (positions: number[] | null, boxes: number | null) =>
    previewCommission({ receiver: { name: "Sam", role: "sales" }, existing: null, quote: row, positions, boxes, rate: 0.05 });

  it("lists only the shown offers on the Accepted sheet, and never marks a hidden one booked", () => {
    const options = acceptOptions({
      quote: row,
      link: { booked_at: "2026-11-11T20:00:00Z", booked_option: "Front lower", booked_offer: "lower", booked_selection: [0, 1] },
      commission,
      meetingOffer: "garage",
    });
    expect(options.map((option) => [option.id, option.booked, option.meeting])).toEqual([
      ["full", false, false],
      ["garage", false, true],
    ]);
    // Nothing shown is booked, so the sheet opens on the table's choice.
    expect(startingChoice(options)).toBe(1);
  });

  it("opens on what they booked on their link, with the table's choice marked beside it", () => {
    const options = acceptOptions({
      quote: row,
      link: { booked_at: "2026-11-11T20:00:00Z", booked_option: "Garage", booked_offer: "garage", booked_selection: [1] },
      commission,
      meetingOffer: "full",
    });
    expect(options.map((option) => [option.id, option.booked, option.meeting])).toEqual([
      ["full", false, true],
      ["garage", true, false],
    ]);
    expect(startingChoice(options)).toBe(1);
  });

  it("prices Keenan's side of the link without the hidden offer, and never lets it be chosen", () => {
    const quote = quoteFromRow({ ...row, runs: RUNS.map(({ name, feet, level }) => ({ name, feet, level })) });
    expect(quote).not.toBeNull();
    expect(linkOffers(quote!).map((priced) => priced.offer.id)).toEqual(["full", "garage"]);
    expect(offerChoice(quote!, "lower")).toBeNull();
    expect(offerChoice(quote!, "garage")?.name).toBe("Garage");
  });
});
