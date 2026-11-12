import { describe, expect, it } from "vitest";

import type { LeadMockupItem } from "@/lib/leads/mockup-roles";
import { priceQuote, type QuoteRun } from "@/lib/pricing";
import { newAreaRun, newOtherRun } from "@/lib/quotes/areas";
import {
  addOtherRun,
  addQuickStart,
  appendRun,
  areaLines,
  areaShortLabel,
  automaticUpperAccess,
  drawOrder,
  dropRun,
  houseLineLabel,
  houseLines,
  moneyText,
  offerLitPositions,
  offerPhoto,
  pickMockupForOffer,
  runByTheFoot,
  runPricingMode,
  setAreaFeet,
  setRunFeet,
  setRunPricing,
  type RunsAndOffers,
} from "@/lib/quotes/editor";
import { parseOffers, quickStartsFor, type QuoteOffer } from "@/lib/quotes/offers";

// The quote editor by area (round 11, Keenan, 2026-11-11): the two views'
// lines, the feet typed on them with the offers kept in step, the lines as
// drawn (measured, empty, lit by the active offer), an area priced Keenan's
// way, the upper access an offer fills in itself, and the photo on every
// offer.

const HOUSE: QuoteRun[] = [
  newAreaRun("front_lower", 64),
  newAreaRun("front_upper_gable", 10),
  newAreaRun("front_upper", 38),
  newAreaRun("back_lower", 50),
  newOtherRun("Shed", 20, "lower"),
];

// An old quote: two runs on the front lower (Front and Garage), named apart.
const OLD: QuoteRun[] = [
  { name: "Front", feet: 60, level: "lower", part: "eave" },
  { name: "Garage", feet: 30, level: "lower", part: "garage" },
  { name: "Upper front", feet: 40, level: "upper", part: "eave" },
  { name: "Upper gable", feet: 20, level: "upper", part: "gable" },
];

const FEES = { upperAccessFee: 200, upperGableAccessFee: 400 };

const state = (runs: QuoteRun[], offers: QuoteOffer[] = []): RunsAndOffers => ({ runs, offers });

describe("the views", () => {
  it("places each run on its line, an old quote's extras under the same area, Other apart", () => {
    const lines = areaLines(HOUSE);
    expect(lines.front_lower).toEqual([0]);
    expect(lines.front_upper_gable).toEqual([1]);
    expect(lines.front_upper).toEqual([2]);
    expect(lines.back_lower).toEqual([3]);
    expect(lines.sides_lower).toEqual([]);
    expect(Object.values(lines).flat()).not.toContain(4);
    expect(areaLines(OLD).front_lower).toEqual([0, 1]);
    // An old gable named by neither front nor back stays as Other (lib/quotes/areas.ts).
    expect(areaLines(OLD).front_upper_gable).toEqual([]);
    expect(Object.values(areaLines(OLD)).flat()).toEqual([0, 1, 2]);
  });

  it("labels a line by what its view doesn't already say", () => {
    expect(areaShortLabel("front_lower")).toBe("Lower");
    expect(areaShortLabel("front_lower_gable")).toBe("Lower gable");
    expect(areaShortLabel("back_upper_gable")).toBe("Upper gable");
    expect(areaShortLabel("sides_upper")).toBe("Upper");
  });
});

describe("the views, drawn", () => {
  it("knows each line's state: its run and feet when measured, empty otherwise, and lit when the active offer covers it", () => {
    const lit = offerLitPositions(HOUSE, { runs: [0, 1, 2] });
    expect([...lit]).toEqual([0, 1, 2]);
    const lines = houseLines(HOUSE, lit);
    expect(lines.front_lower).toEqual({ at: 0, feet: 64, measured: true, lit: true });
    expect(lines.front_upper_gable).toEqual({ at: 1, feet: 10, measured: true, lit: true });
    expect(lines.front_upper).toEqual({ at: 2, feet: 38, measured: true, lit: true });
    // Measured, but the offer leaves it out: it stays as it is.
    expect(lines.back_lower).toEqual({ at: 3, feet: 50, measured: true, lit: false });
    expect(lines.sides_lower).toEqual({ at: null, feet: 0, measured: false, lit: false });
    expect(lines.back_upper_gable).toEqual({ at: null, feet: 0, measured: false, lit: false });
    // An Other is never a line on the drawings.
    expect(Object.values(lines).some((line) => line.at === 4)).toBe(false);
    // Round 18: four views of four lines each, and an old quote's Sides.
    expect(lines.left_lower).toEqual({ at: null, feet: 0, measured: false, lit: false });
    expect(lines.right_upper_gable).toEqual({ at: null, feet: 0, measured: false, lit: false });
    expect(Object.keys(lines)).toHaveLength(18);
  });

  it("with no active offer nothing is lit; a run with no feet is an empty line and never lights", () => {
    expect(offerLitPositions(HOUSE, null).size).toBe(0);
    expect(Object.values(houseLines(HOUSE)).every((line) => !line.lit)).toBe(true);
    // The new quote's one empty Front run is the Front lower line, unmeasured.
    const fresh: QuoteRun[] = [{ name: "Front", feet: 0, level: "lower", part: "eave" }];
    expect(houseLines(fresh, new Set([0])).front_lower).toEqual({ at: 0, feet: 0, measured: false, lit: false });
    // Positions off the quote, and runs with no feet, light nothing.
    expect([...offerLitPositions(fresh, { runs: [0, 7] })]).toEqual([]);
    expect([...offerLitPositions(HOUSE, { runs: [3, 9] })]).toEqual([3]);
  });

  it("an old quote's extra run on an area is a row under the drawing, never the line: the line is the area's own run", () => {
    // Front 60 ft and Garage 30 ft are both on the front lower; the line is Front.
    expect(houseLines(OLD, new Set([1])).front_lower).toEqual({ at: 0, feet: 60, measured: true, lit: false });
    expect(houseLines(OLD, new Set([0, 1])).front_lower).toEqual({ at: 0, feet: 60, measured: true, lit: true });
  });

  it("says what a line is in words", () => {
    expect(houseLineLabel("front_lower", { feet: 64, measured: true })).toBe("Front lower, 64 ft");
    expect(houseLineLabel("back_upper_gable", { feet: 0, measured: false })).toBe("Back upper gable, not measured");
    expect(houseLineLabel("sides_upper", houseLines(HOUSE).sides_upper)).toBe("Sides upper, not measured");
  });
});

describe("feet typed on a line", () => {
  it("the first feet on an empty line add the area; an area with no feet is never a run", () => {
    const next = setAreaFeet(state(HOUSE), "sides_lower", 48);
    expect(next.runs).toHaveLength(6);
    expect(next.runs[5]).toMatchObject({ name: "Sides", feet: 48, level: "lower", part: "sides", area: "sides", gable: false, rate: null, flat: null });
    // Nothing typed adds nothing.
    expect(setAreaFeet(state(HOUSE), "sides_lower", 0)).toEqual(state(HOUSE));
    expect(setAreaFeet(state(HOUSE), "back_upper", Number.NaN).runs).toHaveLength(5);
  });

  it("feet typed over a measured line change its run in place", () => {
    const next = setAreaFeet(state(HOUSE), "front_upper", 42);
    expect(next.runs[2]).toMatchObject({ name: "Front", feet: 42, level: "upper" });
    expect(next.runs).toHaveLength(5);
    // The default quote's one empty Front run takes the feet, no second run.
    const fresh = state([{ name: "Front", feet: 0, level: "lower", part: "eave" }]);
    expect(setAreaFeet(fresh, "front_lower", 70).runs).toEqual([{ name: "Front", feet: 70, level: "lower", part: "eave" }]);
  });

  it("clearing a line takes its run off the quote and off every offer, positions kept right", () => {
    const offers: QuoteOffer[] = [
      { id: "full", name: "Full wrap", runs: [0, 1, 2, 3, 4], boxes: null },
      { id: "front", name: "Full front", runs: [0, 1, 2], boxes: null },
    ];
    const next = setAreaFeet(state(HOUSE, offers), "front_upper_gable", 0);
    expect(next.runs.map((run) => run.name)).toEqual(["Front", "Front", "Back", "Shed"]);
    expect(next.offers).toEqual([
      { id: "full", name: "Full wrap", runs: [0, 1, 2, 3], boxes: null },
      { id: "front", name: "Full front", runs: [0, 1], boxes: null },
    ]);
  });

  it("an old quote's extra run has its own line: changed in place, or taken off when cleared", () => {
    const offers: QuoteOffer[] = [{ id: "full", name: "Full wrap", runs: [0, 1, 2, 3], boxes: null }];
    expect(setRunFeet(state(OLD, offers), 1, 28).runs[1]).toMatchObject({ name: "Garage", feet: 28 });
    const gone = setRunFeet(state(OLD, offers), 1, 0);
    expect(gone.runs.map((run) => run.name)).toEqual(["Front", "Upper front", "Upper gable"]);
    expect(gone.offers[0].runs).toEqual([0, 1, 2]);
    // The main line is the first run on the area; the extra keeps its position.
    expect(setAreaFeet(state(OLD), "front_lower", 66).runs[0]).toMatchObject({ name: "Front", feet: 66 });
  });

  it("an Other keeps its name at 0 ft until it is removed, and is added empty to fill in", () => {
    const added = addOtherRun(state(HOUSE));
    expect(added.runs[5]).toMatchObject({ name: "", feet: 0, level: "lower", part: "other", area: "other" });
    expect(setRunFeet(state(HOUSE), 4, 0).runs[4]).toMatchObject({ name: "Shed", feet: 0 });
    const removed = dropRun(state(HOUSE, [{ id: "full", name: "Full wrap", runs: [0, 1, 2, 3, 4], boxes: null }]), 4);
    expect(removed.runs).toHaveLength(4);
    expect(removed.offers[0].runs).toEqual([0, 1, 2, 3]);
    expect(dropRun(state(HOUSE), 9)).toEqual(state(HOUSE));
  });

  it("a run added keeps a full wrap full and leaves an empty offers list (one full wrap) empty", () => {
    const run = newAreaRun("back_upper", 30);
    expect(appendRun(state(HOUSE), run).offers).toEqual([]);
    const full: QuoteOffer = { id: "full", name: "Full wrap", runs: [0, 1, 2, 3, 4], boxes: null };
    const front: QuoteOffer = { id: "front", name: "Full front", runs: [0, 1, 2], boxes: null };
    const next = appendRun(state(HOUSE, [full, front]), run);
    expect(next.offers[0].runs).toEqual([0, 1, 2, 3, 4, 5]);
    expect(next.offers[1].runs).toEqual([0, 1, 2]);
  });
});

describe("the presets over the views", () => {
  it("offers only the presets the measurements can fill, each with its gables ticked on", () => {
    expect(quickStartsFor(HOUSE).map((start) => start.kind)).toEqual(["front_lower", "full_front", "front_upper", "full_wrap", "front_back", "full_back", "custom"]);
    const onlyFront = [newAreaRun("front_lower", 64), newAreaRun("front_lower_gable", 12)];
    expect(quickStartsFor(onlyFront).map((start) => start.kind)).toEqual(["front_lower", "full_wrap", "custom"]);
    const added = addQuickStart(parseOffers([], HOUSE.length), "full_front", HOUSE, 7);
    expect(added[1]).toMatchObject({ name: "Full front", runs: [0, 1, 2] });
  });
});

describe("an area priced Keenan's way", () => {
  const front = newAreaRun("front_upper", 38);

  it("starts at the quote's price, takes his own price a foot, or a flat price, 0 included", () => {
    expect(runPricingMode(front)).toBe("quote");
    const rate = setRunPricing(front, "rate", 28);
    expect(rate).toMatchObject({ rate: 28, flat: null });
    expect(runPricingMode(rate)).toBe("rate");
    const flat = setRunPricing(rate, "flat", 900);
    expect(flat).toMatchObject({ rate: null, flat: 900 });
    expect(runPricingMode(flat)).toBe("flat");
    expect(runPricingMode(setRunPricing(front, "flat", 0))).toBe("flat");
    expect(setRunPricing(flat, "quote")).toMatchObject({ rate: null, flat: null });
  });

  it("a box not typed yet, or nothing usable, prices at the quote's rate until it is", () => {
    expect(setRunPricing(front, "rate", null)).toMatchObject({ rate: null, flat: null });
    expect(setRunPricing(front, "rate", 0)).toMatchObject({ rate: null });
    expect(setRunPricing(front, "flat", null)).toMatchObject({ flat: null });
    expect(setRunPricing(front, "flat", -5)).toMatchObject({ flat: null });
    // To the cent, and never past what the save accepts.
    expect(setRunPricing(front, "rate", 27.555).rate).toBe(27.56);
    expect(setRunPricing(front, "rate", 50_000).rate).toBe(10_000);
    expect(setRunPricing(front, "flat", 5_000_000).flat).toBe(1_000_000);
  });

  it("knows what an area comes to by the foot, for the flat box to start from", () => {
    expect(runByTheFoot(front, 24)).toBe(912);
    expect(runByTheFoot({ ...front, rate: 28 }, 24)).toBe(1064);
    expect(runByTheFoot({ ...front, flat: 500 }, 24)).toBe(912);
    expect(moneyText(24)).toBe("24");
    expect(moneyText(27.5)).toBe("27.50");
    expect(moneyText(null)).toBe("");
  });

  it("prices through lib/pricing.ts exactly as the breakdown will", () => {
    const runs = HOUSE.map((run, at) => (at === 2 ? setRunPricing(run, "rate", 28) : at === 4 ? setRunPricing(run, "flat", 600) : run));
    const totals = priceQuote({
      runs,
      boxCount: 1,
      pricePerFt: 24,
      boxPrice: 500,
      adders: [],
      discounts: [],
      colourTiming: null,
      rushFee: null,
      ...FEES,
      gstEnabled: false,
      gstRate: 0.05,
    });
    // 124 ft at $24 = 2976, 38 ft at $28 = 1064, the shed flat 600, the box, $400 with an upper gable.
    expect(totals.lines.map((line) => [line.label, line.amount])).toEqual([
      ["Standard track", 4640],
      ["Smart controller and power supply", 500],
      ["Upper roof access", 400],
    ]);
    expect(totals.lines[0].areas?.map((area) => [area.label, area.detail, area.amount])).toEqual([
      ["Front", "64 ft at $24 a foot", 1536],
      ["Front gable", "10 ft at $24 a foot", 240],
      ["Front", "38 ft at $28 a foot", 1064],
      ["Back", "50 ft at $24 a foot", 1200],
      ["Shed", "20 ft, flat price", 600],
    ]);
  });
});

describe("the upper access an offer fills in itself", () => {
  it("is the upper amount, the gable amount with an upper gable on, nothing with no upper area", () => {
    expect(automaticUpperAccess(HOUSE, { runs: [0, 1, 2] }, FEES)).toBe(400);
    expect(automaticUpperAccess(HOUSE, { runs: [0, 2] }, FEES)).toBe(200);
    expect(automaticUpperAccess(HOUSE, { runs: [0, 3] }, FEES)).toBeNull();
    expect(automaticUpperAccess(HOUSE, { runs: [0, 2] }, { upperAccessFee: null, upperGableAccessFee: null })).toBeNull();
  });
});

describe("a photo on every offer", () => {
  const mockup = (id: string, over: Partial<LeadMockupItem> = {}): LeadMockupItem => ({
    id,
    url: `https://example.test/${id}`,
    name: "",
    main: false,
    day: false,
    night: false,
    scene: false,
    offers: [],
    ...over,
  });
  const LIST = [mockup("a", { name: "Warm white", main: true }), mockup("b", { name: "Christmas", offers: ["front"] }), mockup("c")];

  it("shows an offer its own picture, else the Main, else nothing", () => {
    expect(offerPhoto(LIST, "front")).toEqual({ item: LIST[1], own: true });
    expect(offerPhoto(LIST, "full")).toEqual({ item: LIST[0], own: false });
    expect(offerPhoto([mockup("c")], "full")).toBeNull();
  });

  it("picking moves the mark: one picture per offer, and names the one it came off", () => {
    const picked = pickMockupForOffer(LIST, "c", "front");
    expect(picked.previous).toBe("b");
    expect(picked.list.map((item) => item.offers)).toEqual([[], [], ["front"]]);
    // Picking the one it already has changes nothing and names nothing.
    const same = pickMockupForOffer(LIST, "b", "front");
    expect(same.previous).toBeNull();
    expect(same.list).toEqual(LIST);
    // A picture can show several offers: the other offers' marks stay.
    const two = pickMockupForOffer([mockup("a", { offers: ["full"] }), mockup("b")], "a", "front");
    expect(two.list[0].offers).toEqual(["full", "front"]);
  });
});

describe("the drawn views' tap order (round 13)", () => {
  it("draws the gables first and the rooflines after, so a roofline takes the tap where a gable's foot meets it", () => {
    const front = [{ key: "front_lower" }, { key: "front_lower_gable" }, { key: "front_upper" }, { key: "front_upper_gable" }];
    expect(drawOrder(front).map((line) => line.key)).toEqual(["front_lower_gable", "front_upper_gable", "front_lower", "front_upper"]);
    // The back the same; the sides have no gable and keep their order.
    expect(drawOrder([{ key: "back_lower" }, { key: "back_lower_gable" }, { key: "back_upper" }, { key: "back_upper_gable" }]).map((line) => line.key)).toEqual([
      "back_lower_gable",
      "back_upper_gable",
      "back_lower",
      "back_upper",
    ]);
    expect(drawOrder([{ key: "sides_lower" }, { key: "sides_upper" }]).map((line) => line.key)).toEqual(["sides_lower", "sides_upper"]);
    // The list given is left as it was.
    expect(front.map((line) => line.key)).toEqual(["front_lower", "front_lower_gable", "front_upper", "front_upper_gable"]);
  });
});
