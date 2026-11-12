import { describe, expect, it } from "vitest";
import { commissionLightsCents, commissionQuoteFromRow } from "@/lib/pay/commission";
import { priceQuote, runRateOf, runTrack, trackFields, type QuoteInputs, type QuoteRun } from "@/lib/pricing";

// Track types (quote link take 3, Keenan, 2026-11-11): Hat track is the
// quote's price a foot; Double and J track have their own price a foot,
// copied onto the area when Keenan picks it. His own rate or a flat price
// on the area still wins. The breakdown names the track where it isn't Hat
// track, and the commission counts it as lights.
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
  it("prices a J track area at J track's price, on its own line naming the track", () => {
    const totals = priceQuote(base([front, garage, gables]));
    expect(totals.lines.map((line) => [line.label, line.detail, line.amount])).toEqual([
      ["Track and lights", "92 ft at $23 a foot", 2116],
      ["Upper gables", "22 ft of J track at $30 a foot", 660],
      ["Control box", "Always included", 500],
    ]);
    expect(totals.subtotal).toBe(3276);
    expect(totals.totalFeet).toBe(114);
  });

  it("lets Keenan's own rate on the area win, still naming the track", () => {
    const totals = priceQuote(base([front, { ...gables, rate: 26 }]));
    expect(totals.lines[1]).toEqual({ label: "Upper gables", detail: "22 ft of J track at $26 a foot", amount: 572 });
  });

  it("lets a flat price on the area win, still naming the track", () => {
    const totals = priceQuote(base([front, { ...gables, flat: 500 }]));
    expect(totals.lines[1]).toEqual({ label: "Upper gables", detail: "22 ft of J track, flat price", amount: 500 });
    expect(totals.subtotal).toBe(64 * 23 + 500 + 500);
  });

  it("prices Double track the same way", () => {
    const totals = priceQuote(base([front, { name: "Back upper", feet: 40, level: "upper", area: "back", track: "double", trackRate: 27.5 }]));
    expect(totals.lines[1]).toEqual({ label: "Back upper", detail: "40 ft of Double track at $27.50 a foot", amount: 1100 });
  });

  it("leaves a quote with only Hat track exactly as before", () => {
    const totals = priceQuote(base([front, garage]));
    expect(totals.lines.map((line) => line.label)).toEqual(["Track and lights", "Control box"]);
    expect(totals.subtotal).toBe(92 * 23 + 500);
  });

  it("with only a track area, shows no empty Track and lights line", () => {
    const totals = priceQuote(base([gables]));
    expect(totals.lines.map((line) => line.label)).toEqual(["Upper gables", "Control box"]);
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
