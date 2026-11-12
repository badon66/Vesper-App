import { describe, expect, it } from "vitest";
import { commissionBaseCents } from "@/lib/pay/commission";
import { CONTROLLER_DETAIL, CONTROLLER_LABEL, priceQuote, type QuoteInputs, type QuoteRun } from "@/lib/pricing";
import {
  AREA_VIEWS,
  areaKeyOf,
  areaOf,
  cleanGableCount,
  gableCount,
  hasOwnNames,
  lineLabel,
  newAreaRun,
  newOtherRun,
  renameRun,
  renameView,
  resetNames,
  runDisplayName,
  runLineLabel,
  sidesRuns,
  viewName,
  VIEW_TITLES,
} from "@/lib/quotes/areas";
import { splitSides } from "@/lib/quotes/editor";
import {
  carryQuoteRushFee,
  cleanCharges,
  cleanRushFee,
  offersForSave,
  parseOffers,
  priceOffer,
  sharedRushFee,
  type QuoteOffer,
} from "@/lib/quotes/offers";
import { revisionChanges, revisionTimelineLine } from "@/lib/quotes/revise";

// Round 18 (Keenan, 2026-11-12): measuring by Left side and Right side,
// gables with a count, names Keenan can change and reset, the rush fee and
// extra charges on each offer, and the words a customer reads when Keenan
// changes their quote after the yes.

const inputs = (runs: QuoteRun[], over: Partial<QuoteInputs> = {}): QuoteInputs => ({
  runs,
  boxCount: 1,
  pricePerFt: 24,
  boxPrice: 500,
  adders: [],
  discounts: [],
  colourTiming: null,
  rushFee: null,
  upperAccessFee: 200,
  upperGableAccessFee: 400,
  gstEnabled: false,
  gstRate: 0.05,
  areaName: runDisplayName,
  ...over,
});

describe("the views (part 1)", () => {
  it("are Front, Back, Left side and Right side, each with the same four lines", () => {
    expect(AREA_VIEWS.map((view) => view.kind)).toEqual(["front", "back", "left", "right"]);
    expect(AREA_VIEWS.map((view) => view.title)).toEqual(["Front", "Back", "Left side", "Right side"]);
    expect(VIEW_TITLES.sides).toBe("Sides");
    for (const view of AREA_VIEWS) {
      expect([...view.keys].sort()).toEqual(["lower", "lower_gable", "upper", "upper_gable"].map((line) => `${view.kind}_${line}`));
      for (const key of view.keys) {
        const run = newAreaRun(key, 10);
        expect(areaKeyOf(run)).toBe(key);
        expect(areaOf(run)).toBe(view.kind);
      }
    }
    expect(runDisplayName(newAreaRun("left_upper_gable", 12))).toBe("Left side upper gable");
    expect(runDisplayName(newAreaRun("right_lower", 40))).toBe("Right side lower");
  });

  it("keep an old Sides number as one line named Sides until Keenan splits it", () => {
    const old: QuoteRun[] = [newAreaRun("front_lower", 60), { name: "Sides", feet: 51, level: "lower", part: "sides" }];
    expect(sidesRuns(old)).toEqual([1]);
    expect(runDisplayName(newAreaRun("sides_lower", 51))).toBe("Sides");
    const before = priceQuote(inputs(old)).total;
    const offers: QuoteOffer[] = [
      { id: "full", name: "Full wrap", runs: [0, 1], boxes: null },
      { id: "front", name: "Front", runs: [0], boxes: null },
    ];
    const split = splitSides({ runs: old, offers }, 1);
    // Left takes the larger half, right the rest; every offer with the sides gets both.
    expect(split.runs.map((run) => [areaKeyOf(run), run.feet])).toEqual([
      ["front_lower", 60],
      ["left_lower", 26],
      ["right_lower", 25],
    ]);
    expect(split.offers.map((offer) => offer.runs)).toEqual([[0, 1, 2], [0]]);
    expect(priceQuote(inputs(split.runs)).total).toBe(before);
    expect(sidesRuns(split.runs)).toEqual([]);
  });

  it("split a flat-priced Sides by its feet, to the cent, for the same total", () => {
    const old: QuoteRun[] = [{ ...newAreaRun("sides_lower", 51), flat: 1000 }];
    const split = splitSides({ runs: old, offers: [] }, 0);
    expect(split.runs.map((run) => run.flat)).toEqual([509.8, 490.2]);
    expect(priceQuote(inputs(split.runs)).total).toBe(priceQuote(inputs(old)).total);
  });
});

describe("gables with a count (part 1)", () => {
  it("hold a count of 2 to 20; one is the plain line", () => {
    expect([cleanGableCount(2), cleanGableCount(20), cleanGableCount(25), cleanGableCount(1), cleanGableCount(2.5), cleanGableCount("3")]).toEqual([
      2,
      20,
      20,
      null,
      null,
      null,
    ]);
    const two = { ...newAreaRun("front_upper_gable", 24), count: 2 };
    expect(gableCount(two)).toBe(2);
    expect(gableCount({ ...newAreaRun("front_upper", 24), count: 2 })).toBe(1);
    expect(lineLabel("front_upper_gable", 2)).toBe("Upper gables (2)");
    expect(lineLabel("back_lower_gable")).toBe("Lower gable");
    expect(runLineLabel(two)).toBe("Upper gables (2)");
    expect(runDisplayName(two)).toBe("Front upper gables (2)");
  });

  it("price by their total feet: the count only names them", () => {
    const one = priceQuote(inputs([newAreaRun("front_upper_gable", 24)]));
    const two = priceQuote(inputs([{ ...newAreaRun("front_upper_gable", 24), count: 2 }]));
    expect(two.total).toBe(one.total);
    expect(two.lines[0].areas).toEqual([{ label: "Front upper gables (2)", detail: "24 ft", amount: 576 }]);
  });
});

describe("names Keenan changes on a quote (part 2)", () => {
  const house: QuoteRun[] = [newAreaRun("front_lower", 64), newAreaRun("front_upper", 38), newAreaRun("back_lower", 50), newOtherRun("Shed", 20, "lower")];

  it("rename a line, and an empty name goes back to the standard one", () => {
    const renamed = renameRun(house[0], "  Street side  $ ");
    expect(renamed.name).toBe("Street side");
    expect(areaKeyOf(renamed)).toBe("front_lower");
    expect(runDisplayName(renamed)).toBe("Street side");
    expect(renameRun(renamed, "   ").name).toBe("Front");
    // A gable keeps its count beside Keenan's name.
    expect(runDisplayName({ ...renameRun(newAreaRun("back_upper_gable", 30), "Peaks"), count: 3 })).toBe("Peaks (3)");
  });

  it("rename a view, which names every line on it, and only that view", () => {
    const runs = renameView(house, "front", "Street side");
    expect(viewName(runs, "front")).toBe("Street side");
    expect(runs.map(runDisplayName)).toEqual(["Street side lower", "Street side upper", "Back lower", "Shed"]);
    expect(viewName(renameView(runs, "front", " "), "front")).toBe("Front");
  });

  it("reset to the standard names, keeping feet, prices and offers", () => {
    const own = renameView(house.map((run, at) => (at === 2 ? { ...renameRun(run, "Patio"), rate: 26 } : run)), "front", "Street side");
    expect(hasOwnNames(own)).toBe(true);
    const reset = resetNames(own);
    expect(hasOwnNames(reset)).toBe(false);
    expect(reset.map(runDisplayName)).toEqual(["Front lower", "Front upper", "Back lower", "Shed"]);
    expect(reset.map((run) => [run.feet, run.rate ?? null])).toEqual(own.map((run) => [run.feet, run.rate ?? null]));
    expect(priceQuote(inputs(reset)).total).toBe(priceQuote(inputs(own)).total);
  });

  it("show in the breakdown under the track", () => {
    const runs = renameView(house, "back", "Lane side");
    const lines = priceQuote(inputs(runs)).lines;
    expect(lines[0].areas?.map((area) => area.label)).toEqual(["Front lower", "Front upper", "Lane side lower", "Shed"]);
  });
});

describe("the controller line (part 4)", () => {
  it("reads Smart controller and power supply with Keenan's detail, at the box price", () => {
    const runs = [newAreaRun("front_lower", 64)];
    const one = priceQuote(inputs(runs));
    expect(one.lines[1]).toEqual({ label: CONTROLLER_LABEL, detail: CONTROLLER_DETAIL, amount: 500 });
    expect(CONTROLLER_LABEL).toBe("Smart controller and power supply");
    expect(CONTROLLER_DETAIL).toBe("600 W, Bluetooth and Wi-Fi, all-weather, installs indoors or outdoors. Run it from the app on your phone.");
    const own = priceQuote(inputs(runs, { boxCount: 2, controller: { label: "Controller", detail: "Runs from your phone." } }));
    expect(own.lines[1]).toEqual({ label: "Controller (2)", detail: "2 at $500. Runs from your phone.", amount: 1000 });
  });
});

describe("the rush fee and extra charges on each offer (part 5)", () => {
  const runs = [newAreaRun("front_lower", 64), newAreaRun("back_lower", 50)];
  const full: QuoteOffer = { id: "full", name: "Full wrap", runs: [0, 1], boxes: null };

  it("keep a fee over 0 to the cent, and charges with a name or an amount, at most ten", () => {
    expect([cleanRushFee(350), cleanRushFee("275.555"), cleanRushFee(0), cleanRushFee(-5), cleanRushFee(200_000), cleanRushFee("x")]).toEqual([
      350,
      275.56,
      null,
      null,
      null,
      null,
    ]);
    expect(
      cleanCharges([
        { label: " Extra  outlet $", amount: 150 },
        { label: "", amount: 0 },
        { label: "Ladder", amount: "99.999" },
        { label: "", amount: 40 },
        { label: "Negative", amount: -5 },
        "junk",
      ]),
    ).toEqual([
      { label: "Extra outlet", amount: 150 },
      { label: "Ladder", amount: 100 },
      { label: "", amount: 40 },
      { label: "Negative", amount: 0 },
    ]);
    expect(cleanCharges(Array.from({ length: 14 }, (_, i) => ({ label: `C${i}`, amount: i + 1 })))).toHaveLength(10);
  });

  it("save and read back on the offer, the database's way", () => {
    const saved = offersForSave([{ ...full, rushFee: 350, charges: [{ label: "Extra outlet", amount: 150 }] }], 2);
    expect(saved[0]).toMatchObject({ rushFee: 350, charges: [{ label: "Extra outlet", amount: 150 }] });
    const read = parseOffers([{ id: "full", name: "Full wrap", runs: [0, 1], rush_fee: 350, charges: [{ label: "Extra outlet", amount: 150 }] }], 2);
    expect(read[0]).toMatchObject({ rushFee: 350, charges: [{ label: "Extra outlet", amount: 150 }] });
    expect(offersForSave([{ ...full, rushFee: 0, charges: [] }], 2)[0]).not.toHaveProperty("rushFee");
  });

  it("price on that offer only: its fee, its charges after the shared extra work, before the minimum and GST", () => {
    const base = inputs(runs, { adders: [{ label: "Extra work", amount: 100 }], gstEnabled: true });
    const plain = priceOffer(base, full)!;
    const own = priceOffer(base, { ...full, rushFee: 350, charges: [{ label: "Extra outlet", amount: 150 }, { label: "", amount: 25 }] })!;
    expect(own.subtotal).toBe(plain.subtotal + 350 + 150 + 25);
    expect(own.lines.map((line) => line.label)).toEqual(["Standard track", CONTROLLER_LABEL, "Rush fee", "Extra work", "Extra outlet", "Extra charge"]);
    expect(own.gst).toBeCloseTo(own.subtotal * 0.05, 2);
    // Another offer on the same quote never sees them.
    expect(priceOffer(base, { id: "back", name: "Back", runs: [1], boxes: null })!.lines.map((line) => line.label)).not.toContain("Extra outlet");
  });

  it("never count toward commission: its base is the lights and the controllers, less the discounts", () => {
    const quote = { runs, boxCount: 1, pricePerFt: 24, boxPrice: 500, discounts: [], positions: null };
    expect(commissionBaseCents(quote)).toBe(114 * 2400 + 50000);
  });

  it("carry an old quote's one fee onto every offer, so no total moves", () => {
    const offers: QuoteOffer[] = [full, { id: "back", name: "Back", runs: [1], boxes: null }];
    expect(carryQuoteRushFee(offers, { colourTiming: "rush", rushFee: 350 }).map((offer) => offer.rushFee)).toEqual([350, 350]);
    // Spring never charged it; offers with their own fees are left be.
    expect(carryQuoteRushFee(offers, { colourTiming: "factory_order", rushFee: 350 }).map((offer) => offer.rushFee)).toEqual([undefined, undefined]);
    const own = [{ ...full, rushFee: 100 }, offers[1]];
    expect(carryQuoteRushFee(own, { colourTiming: "rush", rushFee: 350 }).map((offer) => offer.rushFee)).toEqual([100, undefined]);
    // The whole quote counts a fee only when every offer of Keenan's shown charges it.
    expect(sharedRushFee(carryQuoteRushFee(offers, { colourTiming: "rush", rushFee: 350 }))).toBe(350);
    expect(sharedRushFee(own)).toBeNull();
    expect(sharedRushFee([{ ...full, rushFee: 350 }, { ...offers[1], rushFee: 350, hidden: true }])).toBe(350);
    expect(sharedRushFee([])).toBeNull();
  });
});

describe("changing a quote after the yes (part 6)", () => {
  const runs = [newAreaRun("front_lower", 64), newAreaRun("back_lower", 50)];
  const full: QuoteOffer = { id: "full", name: "Full wrap", runs: [0, 1], boxes: null };
  const before = priceOffer(inputs(runs), full)!;

  it("lists what the customer reads changed, area by area, in plain words", () => {
    const added = priceOffer(inputs(runs), { ...full, charges: [{ label: "Extra outlet", amount: 150 }] })!;
    expect(revisionChanges(before, added)).toEqual(["Added: Extra outlet, $150"]);
    const longer = priceOffer(inputs([{ ...runs[0], feet: 70 }, runs[1]]), full)!;
    expect(revisionChanges(before, longer)).toEqual(["Front lower: $1,536 to $1,680 (70 ft)"]);
    const renamed = priceOffer(inputs([renameRun(runs[0], "Street side"), runs[1]]), full)!;
    expect(revisionChanges(before, renamed)).toEqual(["Front lower is now Street side"]);
    const fewer = priceOffer(inputs(runs), { ...full, runs: [0] })!;
    expect(revisionChanges(before, fewer)).toEqual(["Removed: Back lower, $1,200"]);
    expect(revisionChanges(before, before)).toEqual([]);
    // A different charge at the same price is a change, never a rename.
    const outlet = priceOffer(inputs(runs), { ...full, charges: [{ label: "Extra outlet", amount: 150 }] })!;
    const ladder = priceOffer(inputs(runs), { ...full, charges: [{ label: "Ladder", amount: 150 }] })!;
    expect(revisionChanges(outlet, ladder)).toEqual(["Added: Ladder, $150", "Removed: Extra outlet, $150"]);
    for (const line of [...revisionChanges(before, added), ...revisionChanges(before, fewer)]) expect(line).not.toMatch(/[–—]/);
  });

  it("writes the timeline line with the old and new totals", () => {
    expect(revisionTimelineLine(3236, 3386, ["Added: Extra outlet, $150"])).toBe("Quote changed after the yes: $3,236 to $3,386. Added: Extra outlet, $150.");
    expect(revisionTimelineLine(3236, 3236, ["Front lower is now Street side"])).toBe(
      "Quote changed after the yes: still $3,236. Front lower is now Street side.",
    );
  });
});
