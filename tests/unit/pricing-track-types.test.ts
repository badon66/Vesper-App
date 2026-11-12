import { describe, expect, it } from "vitest";
import { commissionLightsCents, commissionQuoteFromRow } from "@/lib/pay/commission";
import { CONTROLLER_DETAIL, CONTROLLER_LABEL, priceQuote, runRateOf, runTrack, trackFields, type QuoteInputs, type QuoteRun } from "@/lib/pricing";
import { customerAreaName } from "@/lib/quotes/areas";

// Track types (quote link take 3, Keenan, 2026-11-11): Hat track is the
// quote's price a foot; Double and J track have their own price a foot,
// copied onto the area when Keenan picks it. His own rate or a flat price
// on the area still wins. The commission counts it as lights. Round 18: the
// breakdown is one line per track (Hat track reads Standard track, J track
// reads L track (back track)), each with its areas under it.
function base(runs: QuoteRun[], overrides: Partial<QuoteInputs> = {}): QuoteInputs {
  return {
    runs,
    boxCount: 1,
    pricePerFt: 23,
    boxPrice: 500,
    adders: [],
    discounts: [],
    colourTiming: "stock",
    rushFee: null,
    gstEnabled: false,
    gstRate: 0.05,
    ...overrides,
  };
}

const front: QuoteRun = { name: "Front lower", feet: 64, level: "lower", area: "front" };
const garage: QuoteRun = { name: "Garage", feet: 28, level: "lower", area: "front" };
const gables: QuoteRun = { name: "Upper gables", feet: 22, level: "upper", area: "front", gable: true, track: "j", trackRate: 30 };

describe("an area's track", () => {
  it("is Hat track unless it says Double or J", () => {
    expect(runTrack({})).toBe("hat");
    expect(runTrack({ track: null })).toBe("hat");
    expect(runTrack({ track: "hat" })).toBe("hat");
    expect(runTrack({ track: "double" })).toBe("double");
    expect(runTrack({ track: "j" })).toBe("j");
  });

  it("is read gently from a stored run", () => {
    expect(trackFields({ track: "j", trackRate: 30 })).toEqual({ track: "j", trackRate: 30 });
    expect(trackFields({ track: "double", trackRate: "31.499" })).toEqual({ track: "double", trackRate: 31.5 });
    expect(trackFields({ track: "double" })).toEqual({ track: "double" });
    expect(trackFields({ track: "hat", trackRate: 40 })).toEqual({});
    expect(trackFields({ track: "triple", trackRate: 40 })).toEqual({});
    expect(trackFields(null)).toEqual({});
  });

  it("sets the price a foot: own rate first, then the track's, then the quote's", () => {
    expect(runRateOf({ track: "j", trackRate: 30 }, 23)).toBe(30);
    expect(runRateOf({ track: "j", trackRate: 30, rate: 26 }, 23)).toBe(26);
    expect(runRateOf({ track: "j", trackRate: null }, 23)).toBe(23);
    expect(runRateOf({ track: "hat", trackRate: 30 }, 23)).toBe(23);
  });
});

describe("pricing with track types", () => {
  it("prices a J track area at J track's price, under its own track's line", () => {
    const totals = priceQuote(base([front, garage, gables]));
    expect(totals.lines.map((line) => [line.label, line.detail, line.amount])).toEqual([
      ["Standard track", "92 ft at $23 a foot", 2116],
      ["L track (back track)", "22 ft at $30 a foot", 660],
      [CONTROLLER_LABEL, CONTROLLER_DETAIL, 500],
    ]);
    expect(totals.lines[0].areas).toEqual([
      { label: "Front lower", detail: "64 ft", amount: 1472 },
      { label: "Garage", detail: "28 ft", amount: 644 },
    ]);
    expect(totals.lines[1].areas).toEqual([{ label: "Upper gables", detail: "22 ft", amount: 660 }]);
    expect(totals.subtotal).toBe(3276);
    expect(totals.totalFeet).toBe(114);
  });

  it("lets Keenan's own rate on the area win, still naming the track", () => {
    const totals = priceQuote(base([front, { ...gables, rate: 26 }]));
    expect(totals.lines[1]).toMatchObject({ label: "L track (back track)", detail: "22 ft at $26 a foot", amount: 572, track: "j" });
  });

  it("lets a flat price on the area win, still naming the track", () => {
    const totals = priceQuote(base([front, { ...gables, flat: 500 }]));
    expect(totals.lines[1]).toMatchObject({ label: "L track (back track)", detail: "22 ft", amount: 500 });
    expect(totals.lines[1].areas).toEqual([{ label: "Upper gables", detail: "22 ft, flat price", amount: 500 }]);
    expect(totals.subtotal).toBe(64 * 23 + 500 + 500);
  });

  it("prices Double track the same way", () => {
    const totals = priceQuote(base([front, { name: "Back upper", feet: 40, level: "upper", area: "back", track: "double", trackRate: 27.5 }]));
    expect(totals.lines[1]).toMatchObject({ label: "Double track", detail: "40 ft at $27.50 a foot", amount: 1100, track: "double" });
    expect(totals.lines[1].areas).toEqual([{ label: "Back upper", detail: "40 ft", amount: 1100 }]);
  });

  it("leaves a quote with only Hat track exactly as before", () => {
    const totals = priceQuote(base([front, garage]));
    expect(totals.lines.map((line) => line.label)).toEqual(["Standard track", CONTROLLER_LABEL]);
    expect(totals.subtotal).toBe(92 * 23 + 500);
  });

  it("with only an L track area, shows no empty Standard track line", () => {
    const totals = priceQuote(base([gables]));
    expect(totals.lines.map((line) => line.label)).toEqual(["L track (back track)", CONTROLLER_LABEL]);
  });

  it("still takes a percent deal off the whole, track lines included", () => {
    const totals = priceQuote(base([front, gables], { discounts: [{ label: "Black Friday", amount: 0, percent: 10 }] }));
    // Lights 64 x 23 = 1472, J 660, box 500 = 2632; 10% = 263.20.
    expect(totals.subtotal).toBe(2368.8);
  });

  it("applies GST and the minimum the same way", () => {
    const withGst = priceQuote(base([gables], { gstEnabled: true }));
    expect(withGst.gst).toBe(58);
    const raised = priceQuote(base([gables], { minJobTotal: 2500 }));
    expect(raised.subtotal).toBe(2500);
    expect(raised.minimumApplied).toBe(true);
  });
});

describe("the commission counts a track area as lights", () => {
  it("at the track's price a foot, read from the stored row", () => {
    const quote = commissionQuoteFromRow(
      {
        runs: [front, garage, gables] as unknown as never,
        box_count: 1,
        price_per_ft: 23,
        box_price: 500,
        discounts: [] as unknown as never,
      } as never,
      null,
    );
    expect(commissionLightsCents(quote)).toBe((92 * 23 + 22 * 30) * 100);
  });
});

describe("every area under its track (round 18, the link, meeting mode and the signed copy)", () => {
  it("lists each area with its feet, its own rate where the track line has none, for the same total", () => {
    const runs = [
      { name: "Front", feet: 64, level: "lower" as const },
      { name: "Upper gables", feet: 22, level: "upper" as const, track: "j" as const, trackRate: 30 },
      { name: "Shed", feet: 0, level: "lower" as const, flat: 250 },
      { name: "Back", feet: 0, level: "lower" as const },
    ];
    const base = { runs, boxCount: 1, pricePerFt: 23, boxPrice: 500, adders: [], discounts: [], colourTiming: "stock" as const, rushFee: null, gstEnabled: false, gstRate: 0.05 };
    const totals = priceQuote(base);
    expect(totals.lines.slice(0, 2).map((line) => [line.label, line.detail, line.amount])).toEqual([
      ["Standard track", "64 ft", 1722],
      ["L track (back track)", "22 ft at $30 a foot", 660],
    ]);
    // An unmeasured area isn't listed; a flat one with no feet says so.
    expect(totals.lines[0].areas).toEqual([
      { label: "Front", detail: "64 ft at $23 a foot", amount: 1472 },
      { label: "Shed", detail: "Flat price", amount: 250 },
    ]);
    expect(totals.subtotal).toBe(1472 + 250 + 660 + 500);
  });

  it("names a quote by area the way the editor does, so the front's two storeys never both read Front", () => {
    const runs = [
      { name: "Front", feet: 64, level: "lower" as const, part: "eave" as const, area: "front" as const, gable: false },
      { name: "Front gable", feet: 12, level: "lower" as const, part: "gable" as const, area: "front" as const, gable: true },
      { name: "Front", feet: 38, level: "upper" as const, part: "eave" as const, area: "front" as const, gable: false, rate: 28 },
      { name: "Shed", feet: 20, level: "lower" as const, part: "other" as const, area: "other" as const, gable: false, flat: 600 },
    ];
    const base = { runs, boxCount: 1, pricePerFt: 24, boxPrice: 500, adders: [], discounts: [], colourTiming: "stock" as const, rushFee: null, gstEnabled: false, gstRate: 0.05 };
    const named = priceQuote({ ...base, areaName: customerAreaName });
    expect(named.lines[0].areas?.map((line) => [line.label, line.detail, line.amount])).toEqual([
      ["Front lower", "64 ft at $24 a foot", 1536],
      ["Front lower gable", "12 ft at $24 a foot", 288],
      ["Front upper", "38 ft at $28 a foot", 1064],
      ["Shed", "20 ft, flat price", 600],
    ]);
    expect(named.total).toBe(priceQuote(base).total);
    // A run from an older quote, with no area tag, keeps the name Keenan typed.
    expect(customerAreaName({ name: "Garage Eave", feet: 30, level: "lower" })).toBe("Garage Eave");
    // An area Keenan named himself keeps his name.
    expect(customerAreaName({ name: "Over the garage", feet: 30, level: "upper", area: "front", gable: false })).toBe("Over the garage");
  });
});
