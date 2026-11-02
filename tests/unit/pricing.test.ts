import { describe, expect, it } from "vitest";
import {
  cleanFeet,
  defaultValidUntil,
  formatMoney,
  priceQuote,
  screenTotal,
  totalFeet,
  type QuoteInputs,
} from "@/lib/pricing";

// The current defaults: $23/ft, $500 box, GST off.
function base(overrides: Partial<QuoteInputs> = {}): QuoteInputs {
  return {
    runs: [
      { name: "Front upper", feet: 60, level: "upper" },
      { name: "Garage", feet: 40, level: "lower" },
    ],
    boxCount: 1,
    pricePerFt: 23,
    boxPrice: 500,
    adders: [],
    discounts: [],
    colourTiming: "stock",
    rushFeePerFt: null,
    gstEnabled: false,
    gstRate: 0.05,
    ...overrides,
  };
}

describe("A plain house", () => {
  it("prices feet times the rate plus the box, with no GST while GST is off", () => {
    const quote = priceQuote(base());
    expect(quote.totalFeet).toBe(100);
    expect(quote.lines.map((line) => [line.label, line.amount])).toEqual([
      ["Track and lights", 2300],
      ["Control box", 500],
    ]);
    expect(quote.subtotal).toBe(2800);
    expect(quote.gst).toBe(0);
    expect(quote.total).toBe(2800);
  });

  it("names the breakdown the way Keenan says it", () => {
    const quote = priceQuote(base());
    expect(quote.lines[0].detail).toBe("100 ft at $23/ft");
  });
});

describe("Adders and discounts", () => {
  it("adds each adder and subtracts each discount, line by line", () => {
    const quote = priceQuote(
      base({
        adders: [
          { label: "Third storey height", amount: 250 },
          { label: "Steep complexity", amount: 100 },
        ],
        discounts: [
          { label: "Neighbour discount", amount: 150 },
          { label: "Fall special", amount: 75.5 },
        ],
      }),
    );
    expect(quote.subtotal).toBe(2300 + 500 + 250 + 100 - 150 - 75.5);
    expect(quote.lines.find((line) => line.label === "Neighbour discount")?.amount).toBe(-150);
  });

  it("never prices a house below zero", () => {
    const quote = priceQuote(base({ discounts: [{ label: "Everything", amount: 99999 }] }));
    expect(quote.subtotal).toBe(0);
    expect(quote.total).toBe(0);
  });
});

describe("Per-quote price changes", () => {
  it("uses the prices on the quote, not the settings defaults", () => {
    const quote = priceQuote(base({ pricePerFt: 21.5, boxPrice: 450, boxCount: 2 }));
    expect(quote.lines[0].amount).toBe(2150);
    expect(quote.lines[1]).toMatchObject({ label: "Control boxes (2)", amount: 900 });
    expect(quote.subtotal).toBe(3050);
  });
});

describe("The rush colour fee", () => {
  it("adds the fee on every foot only when the colour comes this season", () => {
    const rush = priceQuote(base({ colourTiming: "rush", rushFeePerFt: 2.5 }));
    expect(rush.lines.find((line) => line.label === "Colour this season")?.amount).toBe(250);
    expect(rush.subtotal).toBe(3050);

    const factory = priceQuote(base({ colourTiming: "factory_order", rushFeePerFt: 2.5 }));
    expect(factory.lines.some((line) => line.label === "Colour this season")).toBe(false);
    expect(factory.subtotal).toBe(2800);
  });

  it("adds nothing when the fee is not set, even on a rush", () => {
    const quote = priceQuote(base({ colourTiming: "rush", rushFeePerFt: null }));
    expect(quote.subtotal).toBe(2800);
  });
});

describe("GST on and off", () => {
  it("adds 5% GST on the subtotal when enabled, rounded to the cent", () => {
    const quote = priceQuote(base({ gstEnabled: true }));
    expect(quote.gst).toBe(140);
    expect(quote.total).toBe(2940);

    const odd = priceQuote(base({ runs: [{ name: "Front", feet: 61, level: "lower" }], gstEnabled: true }));
    // 61 x 23 = 1403 + 500 = 1903; 5% = 95.15
    expect(odd.gst).toBe(95.15);
    expect(odd.total).toBe(1998.15);
  });

  it("shows + GST on screen only while GST is enabled, never a dollar figure", () => {
    expect(screenTotal(3450, true)).toBe("$3,450 + GST");
    expect(screenTotal(3450, false)).toBe("$3,450");
    expect(screenTotal(3427.5, false)).toBe("$3,427.50");
  });
});

describe("Rounding", () => {
  it("rounds every line to the cent so the lines add up to the total", () => {
    const quote = priceQuote(
      base({
        pricePerFt: 23.333,
        runs: [{ name: "Front", feet: 7, level: "lower" }],
        boxCount: 0,
        gstEnabled: true,
      }),
    );
    // 23.333 rounds to 23.33 a foot; 7 ft = 163.31; GST 8.17.
    expect(quote.lines[0].amount).toBe(163.31);
    expect(quote.subtotal).toBe(163.31);
    expect(quote.gst).toBe(8.17);
    expect(quote.total).toBe(171.48);
    const sum = quote.lines.reduce((acc, line) => acc + line.amount, 0);
    expect(Math.round(sum * 100) / 100).toBe(quote.subtotal);
  });

  it("treats junk feet as zero and whole feet as whole", () => {
    expect(cleanFeet(Number.NaN)).toBe(0);
    expect(cleanFeet(-4)).toBe(0);
    expect(cleanFeet(42.6)).toBe(43);
    expect(totalFeet([{ name: "A", feet: 10.4, level: "lower" }, { name: "B", feet: 0, level: "upper" }])).toBe(10);
  });
});

describe("Money and dates", () => {
  it("writes money the way the screens do", () => {
    expect(formatMoney(3450)).toBe("$3,450");
    expect(formatMoney(3427.5)).toBe("$3,427.50");
    expect(formatMoney(-150)).toBe("-$150");
  });

  it("defaults valid until to the settings days out", () => {
    expect(defaultValidUntil("2026-11-03", 14)).toBe("2026-11-17");
    expect(defaultValidUntil("2026-12-28", 14)).toBe("2027-01-11");
    expect(defaultValidUntil("2026-11-03", 0)).toBe("2026-11-04");
  });
});
