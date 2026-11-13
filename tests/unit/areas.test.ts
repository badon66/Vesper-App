import { describe, expect, it } from "vitest";
import { commissionBaseCents, commissionLightsCents } from "@/lib/pay/commission";
import { priceQuote, runLightsCents, type QuoteInputs, type QuoteRun } from "@/lib/pricing";
import {
  areaDisplayName,
  areaKeyOf,
  areaOf,
  hasArea,
  isGable,
  newAreaRun,
  newOtherRun,
  otherRuns,
  runsOnArea,
  tagRun,
} from "@/lib/quotes/areas";
import { priceOffer } from "@/lib/quotes/offers";

// Quoting by area (round 11, Keenan, 2026-11-11): the areas, each priced
// its own way, the upper access typed over, a gable ticked off, and an old
// quote priced exactly as before.

const HOUSE: QuoteRun[] = [
  newAreaRun("front_lower", 64),
  newAreaRun("front_lower_gable", 12),
  newAreaRun("front_upper", 38),
  newAreaRun("front_upper_gable", 10),
  newAreaRun("back_lower", 50),
  newAreaRun("sides_lower", 60),
  newOtherRun("Shed", 20, "lower"),
];

const inputs = (over: Partial<QuoteInputs> = {}): QuoteInputs => ({
  runs: HOUSE,
  boxCount: 1,
  pricePerFt: 24,
  boxPrice: 500,
  adders: [],
  discounts: [],
  colourTiming: null,
  // Round 18: a rush fee is the offer's own switch, off unless set.
  rushFee: null,
  upperAccessFee: 200,
  upperGableAccessFee: 400,
  minJobTotal: 2500,
  gstEnabled: false,
  gstRate: 0.05,
  ...over,
});

const line = (totals: ReturnType<typeof priceQuote>, label: string) => totals.lines.find((item) => item.label === label);

describe("the areas", () => {
  it("names each standard area, and keeps the customer's words free of levels", () => {
    expect(HOUSE.map((run) => run.name)).toEqual(["Front", "Front gable", "Front", "Front gable", "Back", "Sides", "Shed"]);
    expect(HOUSE.map(areaKeyOf)).toEqual(["front_lower", "front_lower_gable", "front_upper", "front_upper_gable", "back_lower", "sides_lower", null]);
    expect(areaDisplayName(HOUSE[2])).toBe("Front upper");
    expect(areaDisplayName(HOUSE[6])).toBe("Shed");
    expect(runsOnArea(HOUSE, "front_lower")).toEqual([0]);
    expect(otherRuns(HOUSE)).toEqual([6]);
    expect(hasArea(HOUSE, "back", "upper")).toBe(false);
    expect(hasArea(HOUSE, "front", "upper")).toBe(true);
  });

  it("places an old run by what its name and part make obvious, the rest as Other", () => {
    const old: QuoteRun[] = [
      { name: "Front", feet: 64, level: "lower", part: "eave" },
      { name: "Garage", feet: 28, level: "lower", part: "garage" },
      { name: "Front upper", feet: 52, level: "upper", part: "eave" },
      { name: "Upper gable", feet: 22, level: "upper", part: "gable" },
      { name: "Back", feet: 40, level: "lower" },
      { name: "Left side", feet: 30, level: "lower", part: "sides" },
      { name: "Sides", feet: 26, level: "lower", part: "sides" },
      { name: "Rear peak", feet: 14, level: "upper" },
    ];
    // Round 18: a name that says left or right goes to that side's own view;
    // a run that only says sides stays one Sides line until Keenan splits it.
    expect(old.map(areaOf)).toEqual(["front", "front", "front", "other", "back", "left", "sides", "back"]);
    expect(old.map(isGable)).toEqual([false, false, false, true, false, false, false, true]);
    expect(old.map(areaKeyOf)).toEqual(["front_lower", "front_lower", "front_upper", null, "back_lower", "left_lower", "sides_lower", "back_upper_gable"]);
    // Two old runs on one area both stay: a name of its own reads as typed;
    // a standard name reads as the editor names the line (round 19).
    expect(runsOnArea(old, "front_lower")).toEqual([0, 1]);
    expect(areaDisplayName(old[1])).toBe("Garage");
    expect(areaDisplayName(old[0])).toBe("Front lower");
    expect(areaDisplayName(tagRun(old[1]))).toBe("Garage");
    // Tagging changes nothing that prices.
    const tagged = old.map(tagRun);
    expect(tagged[1]).toMatchObject({ name: "Garage", feet: 28, level: "lower", part: "garage", area: "front", gable: false, rate: null, flat: null });
    expect(priceQuote(inputs({ runs: tagged })).subtotal).toBe(priceQuote(inputs({ runs: old })).subtotal);
  });
});

describe("pricing an area Keenan's way", () => {
  it("prices every area at the quote's price a foot to start, as before", () => {
    const totals = priceQuote(inputs());
    // 254 ft x $24 = 6096 + 500 box + 400 (an upper gable is on) = 6996.
    expect(totals.totalFeet).toBe(254);
    expect(line(totals, "Standard track")).toMatchObject({ label: "Standard track", detail: "254 ft at $24 a foot", amount: 6096, track: "hat" });
    expect(line(totals, "Standard track")?.areas?.map((area) => area.detail)).toEqual(["64 ft", "12 ft", "38 ft", "10 ft", "50 ft", "60 ft", "20 ft"]);
    expect(line(totals, "Upper roof access")?.amount).toBe(400);
    expect(line(totals, "Rush fee")).toBeUndefined();
    expect(totals.subtotal).toBe(6996);
  });

  it("an area at Keenan's own price a foot: the line names the feet at each rate", () => {
    const runs = HOUSE.map((run, at) => (at === 2 ? { ...run, rate: 28 } : run));
    const totals = priceQuote(inputs({ runs, areaName: areaDisplayName }));
    // 216 ft at $24 = 5184, 38 ft at $28 = 1064.
    // Round 18: the track's own line gives the feet; its areas each name their rate.
    expect(line(totals, "Standard track")).toMatchObject({ label: "Standard track", detail: "254 ft", amount: 6248 });
    expect(line(totals, "Standard track")?.areas?.[2]).toEqual({ label: "Front upper", detail: "38 ft at $28 a foot", amount: 1064 });
    expect(line(totals, "Standard track")?.areas?.[0]).toEqual({ label: "Front lower", detail: "64 ft at $24 a foot", amount: 1536 });
    expect(totals.subtotal).toBe(6248 + 500 + 400);
    expect(runLightsCents(runs[2], 24)).toBe(38 * 2800);
  });

  it("a flat-priced area is its own area line under its track, by its name and price, and still counts its feet", () => {
    const runs = HOUSE.map((run, at) => (at === 6 ? { ...run, flat: 600 } : run));
    const totals = priceQuote(inputs({ runs }));
    expect(line(totals, "Standard track")).toMatchObject({ label: "Standard track", detail: "254 ft", amount: 5616 + 600 });
    expect(line(totals, "Standard track")?.areas?.[6]).toEqual({ label: "Shed", detail: "20 ft, flat price", amount: 600 });
    expect(totals.totalFeet).toBe(254);
    expect(totals.subtotal).toBe(5616 + 600 + 500 + 400);
    // A flat price of 0 is allowed: the area is on the house for free.
    expect(line(priceQuote(inputs({ runs: HOUSE.map((run, at) => (at === 6 ? { ...run, flat: 0 } : run)) })), "Standard track")?.areas?.[6]?.amount).toBe(0);
    // Every line adds up to the total.
    const sum = totals.lines.reduce((acc, item) => acc + item.amount, 0);
    expect(Math.round(sum * 100) / 100).toBe(totals.subtotal);
  });

  it("the upper access amount typed over sticks for that offer, 0 included", () => {
    const typed = priceQuote(inputs({ upperAccess: 150 }));
    expect(line(typed, "Upper roof access")).toEqual({ label: "Upper roof access", detail: null, amount: 150 });
    expect(typed.subtotal).toBe(6096 + 500 + 150);
    const none = priceQuote(inputs({ upperAccess: 0 }));
    expect(line(none, "Upper roof access")).toBeUndefined();
    expect(none.subtotal).toBe(6096 + 500);
    // Null is the automatic amount.
    expect(priceQuote(inputs({ upperAccess: null })).subtotal).toBe(6996);
    // Through an offer.
    const offer = { id: "a", name: "Full wrap", runs: [0, 1, 2, 3, 4, 5, 6], boxes: null, upperAccess: 0 };
    expect(priceOffer(inputs(), offer)!.subtotal).toBe(6096 + 500);
  });

  it("a gable ticked off an offer leaves its feet and its upper access out", () => {
    const withGable = priceOffer(inputs(), { id: "f", name: "Full front", runs: [0, 1, 2, 3], boxes: null })!;
    const noUpperGable = priceOffer(inputs(), { id: "f", name: "Full front", runs: [0, 1, 2], boxes: null })!;
    // 124 ft x $24 = 2976 + 500 + 400 = 3876; without the upper gable: 114 ft = 2736 + 500 + 200 = 3436.
    expect(withGable.subtotal).toBe(3876);
    expect(noUpperGable.subtotal).toBe(3436);
    expect(line(noUpperGable, "Upper roof access")?.amount).toBe(200);
  });

  it("the minimum, discounts and GST work the same over areas", () => {
    const small = priceQuote(inputs({ runs: [newAreaRun("front_lower", 40)], discounts: [{ label: "Neighbour discount", amount: 150 }] }));
    // 960 + 500 - 150 = 1310, lifted to 2500.
    expect(small.minimumApplied).toBe(true);
    expect(small.subtotal).toBe(2500);
    const gst = priceQuote(inputs({ gstEnabled: true }));
    expect(gst.gst).toBeCloseTo(6996 * 0.05, 2);
  });

  it("adds an offer's own rush fee as one line, before GST (round 18)", () => {
    const rush = priceQuote(inputs({ rushFee: 350, gstEnabled: true }));
    expect(line(rush, "Rush fee")).toEqual({ label: "Rush fee", detail: null, amount: 350 });
    expect(rush.subtotal).toBe(6996 + 350);
    expect(rush.gst).toBeCloseTo((6996 + 350) * 0.05, 2);
  });
});

describe("the commission over areas", () => {
  it("counts each area at what it is priced at, by the foot or flat, and leaves upper access out", () => {
    const runs = HOUSE.map((run, at) => (at === 2 ? { ...run, rate: 28 } : at === 6 ? { ...run, flat: 600 } : run));
    const quote = { runs, boxCount: 1, pricePerFt: 24, boxPrice: 500, discounts: [{ label: "Neighbour discount", amount: 150 }], positions: null };
    // Lights: 196 ft x $24 = 4704 + 38 x $28 = 1064 + 600 flat = 6368; + 500 box - 150 = 6718.
    expect(commissionLightsCents(quote)).toBe(636800);
    expect(commissionBaseCents(quote)).toBe(671800);
    // An option without the shed and the upper gable.
    // 186 ft at $24, 38 ft at $28, the box, less the discount.
    expect(commissionBaseCents({ ...quote, positions: [0, 1, 2, 4, 5] })).toBe(186 * 2400 + 38 * 2800 + 50000 - 15000);
  });
});
