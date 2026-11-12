import { describe, expect, it } from "vitest";
import type { QuoteInputs, QuoteRun } from "@/lib/pricing";
import {
  addRunToOffers,
  cleanOfferName,
  cleanPositions,
  hasPricedOffer,
  newOfferId,
  offerCoverage,
  offerForRuns,
  offersForSave,
  parseOffers,
  pricedOffers,
  QUICK_STARTS,
  priceOffer,
  quickStartRuns,
  quickStartsFor,
  removeRunFromOffers,
  shownOffers,
  uniqueOfferName,
} from "@/lib/quotes/offers";

const RUNS: QuoteRun[] = [
  { name: "Front", feet: 60, level: "lower", part: "eave" },
  { name: "Garage", feet: 30, level: "lower", part: "garage" },
  { name: "Upper front", feet: 40, level: "upper", part: "eave" },
  { name: "Upper gable", feet: 20, level: "upper", part: "gable" },
];

const inputs = (over: Partial<QuoteInputs> = {}): QuoteInputs => ({
  runs: RUNS,
  boxCount: 1,
  pricePerFt: 23,
  boxPrice: 500,
  adders: [],
  discounts: [{ label: "Neighbour discount", amount: 150 }],
  colourTiming: null,
  rushFee: null,
  upperAccessFee: 200,
  upperGableAccessFee: 400,
  minJobTotal: 2500,
  gstEnabled: false,
  gstRate: 0.05,
  ...over,
});

describe("offers", () => {
  it("reads an empty list as one full wrap, and cleans what is stored", () => {
    expect(parseOffers([], 4)).toEqual([{ id: "full", name: "Full wrap", runs: [0, 1, 2, 3], boxes: null, upperAccess: null }]);
    expect(parseOffers(null, 0)).toEqual([]);
    expect(
      parseOffers(
        [
          { id: "a", name: "  Lower   level ", runs: [1, 0, 0, 9, "2", -1, 1.5] },
          { id: "a", name: "Same id again", runs: [0] },
          { id: "", name: "No id", runs: [0] },
          "not an offer",
          { id: "b", name: "", runs: "nope" },
        ],
        4,
      ),
    ).toEqual([
      { id: "a", name: "Lower level", runs: [0, 1, 2], boxes: null, upperAccess: null },
      { id: "b", name: "Offer", runs: [], boxes: null, upperAccess: null },
    ]);
    expect(parseOffers([{ id: "c", name: "Two boxes", runs: [0], boxes: 2 }, { id: "d", name: "Bad", runs: [0], boxes: 12 }], 4).map((o) => o.boxes)).toEqual([2, null]);
  });

  it("never lets a name carry a price", () => {
    expect(cleanOfferName("Full wrap $4,200")).toBe("Full wrap 4,200");
    expect(cleanOfferName("x".repeat(80))).toHaveLength(60);
    expect(cleanOfferName(null)).toBe("Offer");
  });

  it("keeps positions in range, sorted and once each", () => {
    expect(cleanPositions(3, [2, 2, 0, 5, "1"])).toEqual([0, 1, 2]);
    expect(cleanPositions(3, "0,1")).toEqual([]);
  });

  it("presets (round 11): each fills from the areas, gables included; Custom starts empty", () => {
    expect(quickStartRuns("full_wrap", RUNS)).toEqual([0, 1, 2, 3]);
    // Front, Garage and Upper front are the front; Upper gable is named by its level only, so it is Other.
    expect(quickStartRuns("full_front", RUNS)).toEqual([0, 1, 2]);
    expect(quickStartRuns("front_lower", RUNS)).toEqual([0, 1]);
    expect(quickStartRuns("front_upper", RUNS)).toEqual([2]);
    expect(quickStartRuns("custom", RUNS)).toEqual([]);
    const house: QuoteRun[] = [
      { name: "Back", feet: 40, level: "lower", part: "eave" },
      { name: "Left side", feet: 30, level: "lower", part: "sides" },
      { name: "Front porch", feet: 12, level: "lower", part: "porch" },
      { name: "Front gable", feet: 18, level: "upper", part: "gable" },
    ];
    expect(quickStartRuns("full_front", house)).toEqual([2, 3]);
    expect(quickStartRuns("full_back", house)).toEqual([0]);
    expect(quickStartRuns("front_back", house)).toEqual([0, 2, 3]);
  });

  it("prices an offer from its own runs: upper access only with its upper runs, the gable amount with an upper gable", () => {
    const lower = priceOffer(inputs(), { id: "l", name: "Lower level", runs: [0, 1] })!;
    // 90 ft x $23 = $2,070 + $500 box - $150 = $2,420, raised to the $2,500 minimum.
    expect(lower.lines.map((line) => line.label)).toEqual([
      "Standard track",
      "Smart controller and power supply",
      "Neighbour discount",
      "To reach our $2,500 minimum",
    ]);
    expect(lower.subtotal).toBe(2500);
    expect(lower.minimumApplied).toBe(true);

    const eaves = priceOffer(inputs(), { id: "u", name: "Front and upper", runs: [0, 2] })!;
    // 100 ft x $23 = $2,300 + $500 + $200 upper access - $150 = $2,850.
    expect(eaves.lines.find((line) => line.label === "Upper roof access")?.amount).toBe(200);
    expect(eaves.subtotal).toBe(2850);

    const full = priceOffer(inputs(), { id: "f", name: "Full wrap", runs: [0, 1, 2, 3] })!;
    // 150 ft x $23 = $3,450 + $500 + $400 (an upper gable) - $150 = $4,200.
    expect(full.lines.find((line) => line.label === "Upper roof access")?.amount).toBe(400);
    expect(full.subtotal).toBe(4200);

    // Round 18: the rush fee is the offer's own switch; a quote-wide one never reaches an offer.
    const rush = priceOffer(inputs(), { id: "f", name: "Full wrap", runs: [0, 1, 2, 3], rushFee: 350 })!;
    expect(rush.subtotal).toBe(4550);
    expect(rush.lines.find((line) => line.label === "Rush fee")).toEqual({ label: "Rush fee", detail: null, amount: 350 });
    expect(priceOffer(inputs({ rushFee: 350, colourTiming: "rush" }), { id: "f", name: "Full wrap", runs: [0, 1, 2, 3] })!.subtotal).toBe(4200);
    expect(priceOffer(inputs(), { id: "x", name: "Front only", runs: [] })).toBeNull();
  });

  it("lists offers biggest first, with offers still to pick at the end", () => {
    const offers = [
      { id: "front", name: "Front only", runs: [] },
      { id: "lower", name: "Lower level", runs: [0, 1] },
      { id: "full", name: "Full wrap", runs: [0, 1, 2, 3] },
      { id: "garage", name: "Garage", runs: [1] },
    ];
    const order = pricedOffers(inputs(), offers).map((priced) => priced.offer.id);
    // Lower level and Garage both rise to the $2,500 minimum; Lower level has more feet.
    expect(order).toEqual(["full", "lower", "garage", "front"]);
    expect(shownOffers(inputs(), offers).map((priced) => priced.offer.id)).toEqual(["full", "lower", "garage"]);
    expect(pricedOffers(inputs(), offers)[0].everyRun).toBe(true);
  });

  it("follows the runs: removing a run takes it off every offer, adding one keeps a full wrap full", () => {
    const offers = [
      { id: "full", name: "Full wrap", runs: [0, 1, 2, 3] },
      { id: "lower", name: "Lower level", runs: [0, 1] },
      { id: "pick", name: "Front only", runs: [0, 2] },
    ];
    expect(removeRunFromOffers(offers, 1)).toEqual([
      { id: "full", name: "Full wrap", runs: [0, 1, 2] },
      { id: "lower", name: "Lower level", runs: [0] },
      { id: "pick", name: "Front only", runs: [0, 1] },
    ]);
    const added = addRunToOffers(offers, RUNS, { name: "Porch", feet: 12, level: "lower", part: "porch" });
    expect(added.map((offer) => offer.runs)).toEqual([
      [0, 1, 2, 3, 4],
      [0, 1, 4],
      [0, 2],
    ]);
  });

  it("names a new offer apart from the others, with an unused id", () => {
    const offers = [{ id: "o1", name: "Lower level", runs: [0] }];
    expect(uniqueOfferName("Lower level", offers)).toBe("Lower level 2");
    expect(uniqueOfferName("Front only", offers)).toBe("Front only");
    expect(newOfferId(["o1"], 1)).toBe("o2");
  });

  it("counts a quote as drafted once an offer has runs", () => {
    expect(hasPricedOffer(0, [])).toBe(false);
    expect(hasPricedOffer(4, [])).toBe(true);
    expect(hasPricedOffer(4, [{ id: "f", name: "Front only", runs: [] }])).toBe(false);
    expect(hasPricedOffer(4, [{ id: "f", name: "Front only", runs: [0] }])).toBe(true);
  });

  it("finds the offer a customer accepted or booked by its runs", () => {
    const offers = parseOffers(
      [
        { id: "full", name: "Full wrap", runs: [0, 1, 2, 3] },
        { id: "lower", name: "Lower level", runs: [0, 1] },
      ],
      4,
    );
    expect(offerForRuns(offers, 4, null)?.name).toBe("Full wrap");
    expect(offerForRuns(offers, 4, [1, 0])?.name).toBe("Lower level");
    expect(offerForRuns(offers, 4, [2])).toBeNull();
  });

  it("saves at most four offers, cleaned", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ id: `o${i}`, name: `Offer ${i}`, runs: [i % 4] }));
    expect(offersForSave(many, 4)).toHaveLength(4);
    expect(offersForSave([{ id: " a ", name: "Lower $", runs: [3, 3, 7], boxes: 2 }], 4)).toEqual([{ id: "a", name: "Lower", runs: [3], boxes: 2, upperAccess: null }]);
    // A typed upper access amount is kept, 0 included, and read back from upper_access.
    expect(offersForSave([{ id: "b", name: "Front", runs: [0], upperAccess: 0 }], 4)[0].upperAccess).toBe(0);
    expect(parseOffers([{ id: "b", name: "Front", runs: [0], upper_access: 150.5 }], 4)[0].upperAccess).toBe(150.5);
    expect(parseOffers([{ id: "b", name: "Front", runs: [0], upper_access: -1 }], 4)[0].upperAccess).toBeNull();
  });

  it("prices an offer with its own box count, or the quote's", () => {
    const two = priceOffer(inputs(), { id: "f", name: "Full wrap", runs: [0, 1, 2, 3], boxes: 2 })!;
    expect(two.lines.find((line) => line.label === "Smart controller and power supply (2)")?.amount).toBe(1000);
    expect(two.subtotal).toBe(4700);
    expect(priceOffer(inputs(), { id: "f", name: "Full wrap", runs: [0, 1, 2, 3], boxes: null })!.subtotal).toBe(4200);
  });

  it("says what an offer covers in words, from its runs, never typed", () => {
    expect(offerCoverage(RUNS, { runs: [0, 1, 2] })).toBe("Front and garage, upper and lower: 130 ft");
    expect(offerCoverage(RUNS, { runs: [0, 2, 1, 3] })).toBe("Front, garage and gable, upper and lower: 150 ft");
    expect(offerCoverage(RUNS, { runs: [1] })).toBe("Garage, lower: 30 ft");
    expect(offerCoverage(RUNS, { runs: [0, 1] })).toBe("Front and garage, lower: 90 ft");
    expect(offerCoverage(RUNS, { runs: [] })).toBe("");
    // A bungalow has one level, so no level words.
    const bungalow: QuoteRun[] = [
      { name: "Front", feet: 50, level: "lower", part: "eave" },
      { name: "Back", feet: 50, level: "lower", part: "eave" },
    ];
    expect(offerCoverage(bungalow, { runs: [0, 1] })).toBe("Front and back: 100 ft");
    // A run named only by its level takes its part's name.
    expect(offerCoverage([{ name: "Upper", feet: 20, level: "upper", part: "gable" }], { runs: [0] })).toBe("Gable, upper: 20 ft");
  });

  it("shows only the presets the measurements can fill", () => {
    // Front lower and upper, no back: no Full back or Front plus back.
    expect(quickStartsFor(RUNS).map((s) => s.kind)).toEqual(["front_lower", "full_front", "front_upper", "full_wrap", "custom"]);
    // A bungalow front: no Full front or Front upper.
    expect(quickStartsFor(RUNS.filter((r) => r.level === "lower")).map((s) => s.kind)).toEqual(["front_lower", "full_wrap", "custom"]);
    const both: QuoteRun[] = [...RUNS, { name: "Back", feet: 40, level: "lower", part: "eave" }];
    expect(quickStartsFor(both).map((s) => s.kind)).toEqual(["front_lower", "full_front", "front_upper", "full_wrap", "front_back", "full_back", "custom"]);
    expect(quickStartsFor([]).map((s) => s.kind)).toEqual(["custom"]);
    expect(QUICK_STARTS.map((s) => s.name)).toEqual(["Front lower only", "Full front", "Front upper", "Full wrap", "Front plus back", "Full back", ""]);
  });
});
