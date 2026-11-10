import { describe, expect, it } from "vitest";
import {
  cleanFeet,
  defaultValidUntil,
  formatMoney,
  guessRunPart,
  hasUpperRun,
  priceQuote,
  RUSH_COLOUR_LABEL,
  runPart,
  screenTotal,
  selectRuns,
  totalFeet,
  UPPER_ACCESS_LABEL,
  upperAccessAmount,
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
    rushFee: null,
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
    expect(quote.lines[0].detail).toBe("100 ft at $23 a foot");
    expect(quote.lines[1].detail).toBe("Always included");
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
  // A flat amount a job since 2026-11-04, not a fee per foot.
  it("adds the flat fee once, only when the colour comes this season", () => {
    const rush = priceQuote(base({ colourTiming: "rush", rushFee: 350 }));
    expect(rush.lines.find((line) => line.label === RUSH_COLOUR_LABEL)).toEqual({
      label: RUSH_COLOUR_LABEL,
      detail: "Made to order this season",
      amount: 350,
    });
    const named = priceQuote(base({ colourTiming: "rush", rushFee: 350, colourName: "Brown" }));
    expect(named.lines.find((line) => line.label === RUSH_COLOUR_LABEL)?.detail).toBe("Brown track, made to order this season");
    expect(rush.subtotal).toBe(3150);
    const longer = priceQuote(base({ colourTiming: "rush", rushFee: 350, runs: [{ name: "Front", feet: 400, level: "lower" }] }));
    expect(longer.lines.find((line) => line.label === RUSH_COLOUR_LABEL)?.amount).toBe(350);

    for (const timing of ["factory_order", "stock", null] as const) {
      const other = priceQuote(base({ colourTiming: timing, rushFee: 350 }));
      expect(other.lines.some((line) => line.label === RUSH_COLOUR_LABEL)).toBe(false);
      expect(other.subtotal).toBe(2800);
    }
  });

  it("adds nothing when the fee is not set, even on a rush", () => {
    for (const fee of [null, 0]) {
      const quote = priceQuote(base({ colourTiming: "rush", rushFee: fee }));
      expect(quote.subtotal).toBe(2800);
      expect(quote.lines.some((line) => line.label === RUSH_COLOUR_LABEL)).toBe(false);
    }
  });
});

describe("Upper access", () => {
  const fees = { upperAccessFee: 200, upperGableAccessFee: 400 };

  it("adds nothing without an upper run", () => {
    const lower = priceQuote(base({ ...fees, runs: [{ name: "Garage", feet: 40, level: "lower" }] }));
    expect(lower.lines.some((line) => line.label === UPPER_ACCESS_LABEL)).toBe(false);
    expect(lower.subtotal).toBe(40 * 23 + 500);
  });

  it("adds the upper amount with upper runs and no upper gable", () => {
    const quote = priceQuote(base(fees));
    expect(quote.lines.find((line) => line.label === UPPER_ACCESS_LABEL)).toEqual({
      label: UPPER_ACCESS_LABEL,
      detail: "For work up high: $200, or $400 with an upper gable",
      amount: 200,
    });
    // Only one amount set, or both the same: nothing to explain.
    expect(priceQuote(base({ upperAccessFee: 200, upperGableAccessFee: null })).lines.find((line) => line.label === UPPER_ACCESS_LABEL)?.detail).toBeNull();
    expect(priceQuote(base({ upperAccessFee: 300, upperGableAccessFee: 300 })).lines.find((line) => line.label === UPPER_ACCESS_LABEL)?.detail).toBeNull();
    expect(quote.subtotal).toBe(3000);
  });

  it("adds the gable amount instead when an upper gable is in, once", () => {
    const quote = priceQuote(
      base({
        ...fees,
        runs: [
          { name: "Front upper", feet: 60, level: "upper" },
          { name: "Two upper gables", feet: 30, level: "upper", part: "gable" },
          { name: "Garage", feet: 40, level: "lower" },
        ],
      }),
    );
    expect(quote.lines.filter((line) => line.label === UPPER_ACCESS_LABEL).map((line) => line.amount)).toEqual([400]);
  });

  it("does not count a lower gable or an upper run with no feet", () => {
    const lowerGable = [
      { name: "Garage gable", feet: 34, level: "lower" as const, part: "gable" as const },
      { name: "Front upper", feet: 20, level: "upper" as const },
    ];
    expect(upperAccessAmount(lowerGable, fees)).toBe(200);
    const emptyGable = [...lowerGable, { name: "Upper gable", feet: 0, level: "upper" as const, part: "gable" as const }];
    expect(upperAccessAmount(emptyGable, fees)).toBe(200);
    expect(upperAccessAmount([{ name: "Upper", feet: 0, level: "upper" }], fees)).toBeNull();
  });

  it("follows the runs that are switched on", () => {
    const runs = [
      { name: "Upper gable", feet: 30, level: "upper" as const, part: "gable" as const },
      { name: "Upper eave", feet: 32, level: "upper" as const, part: "eave" as const },
      { name: "Garage", feet: 30, level: "lower" as const, part: "garage" as const },
    ];
    expect(upperAccessAmount(selectRuns(runs, null), fees)).toBe(400);
    expect(upperAccessAmount(selectRuns(runs, [1, 2]), fees)).toBe(200);
    expect(upperAccessAmount(selectRuns(runs, [2]), fees)).toBeNull();
  });

  it("adds no line on a quote made before upper access existed, or with an amount cleared", () => {
    expect(priceQuote(base()).lines.some((line) => line.label === UPPER_ACCESS_LABEL)).toBe(false);
    expect(priceQuote(base({ upperAccessFee: null, upperGableAccessFee: 400 })).subtotal).toBe(2800);
    expect(priceQuote(base({ upperAccessFee: 0, upperGableAccessFee: 400 })).subtotal).toBe(2800);
  });

  it("counts toward the minimum like any other line", () => {
    const small = priceQuote(base({ ...fees, runs: [{ name: "Upper eave", feet: 20, level: "upper" }], minJobTotal: 2500 }));
    // 20 ft x $23 = $460 + $500 box + $200 upper access = $1,160, raised by $1,340.
    expect(small.lines.find((line) => line.label.startsWith("To reach"))?.amount).toBe(1340);
    expect(small.subtotal).toBe(2500);
  });
});

describe("Todd Dean's quote, as a new quote would price it", () => {
  // Anonymised from the real quote: $24/ft, one box, a $300 discount, an
  // upper gable in, so the $400 upper access line (2026-11-04).
  const runs = [
    { name: "Garage Gable", feet: 34, level: "lower" as const },
    { name: "Garage Eave", feet: 30, level: "lower" as const },
    { name: "Lower Porch Eave", feet: 13, level: "lower" as const },
    { name: "Upper Front Eave", feet: 32, level: "upper" as const },
    { name: "Two Upper Gables", feet: 30, level: "upper" as const },
    { name: "Upper & Lower Sides", feet: 26, level: "lower" as const },
  ];

  it("guesses each run's part from its name", () => {
    expect(runs.map((run) => guessRunPart(run.name))).toEqual(["gable", "garage", "porch", "eave", "gable", "sides"]);
  });

  it("comes to $4,560", () => {
    const quote = priceQuote(
      base({
        runs,
        pricePerFt: 24,
        upperAccessFee: 200,
        upperGableAccessFee: 400,
        discounts: [{ label: "Family & Friends Discount", amount: 300 }],
        minJobTotal: 2500,
      }),
    );
    expect(quote.lines.map((line) => [line.label, line.amount])).toEqual([
      ["Track and lights", 3960],
      ["Control box", 500],
      [UPPER_ACCESS_LABEL, 400],
      ["Family & Friends Discount", -300],
    ]);
    expect(quote.subtotal).toBe(4560);
  });
});

describe("A run's part of the house", () => {
  it("guesses from the names Keenan uses", () => {
    const cases: [string, string][] = [
      ["Front", "eave"],
      ["Front upper", "eave"],
      ["Back", "eave"],
      ["Left gable", "gable"],
      ["Right peak", "gable"],
      ["Garage", "garage"],
      ["Garage line", "garage"],
      ["Porch", "porch"],
      ["Front entry", "porch"],
      ["Left side", "sides"],
      ["Sides", "sides"],
      ["Shed", "other"],
      ["", "other"],
    ];
    for (const [name, part] of cases) expect([name, guessRunPart(name)]).toEqual([name, part]);
  });

  it("uses the stored part over the guess, and the guess for a run saved without one", () => {
    expect(runPart({ name: "Front", feet: 10, level: "lower", part: "porch" })).toBe("porch");
    expect(runPart({ name: "Left gable", feet: 10, level: "lower" })).toBe("gable");
    expect(runPart({ name: "Left gable", feet: 10, level: "lower", part: "nonsense" as never })).toBe("gable");
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

  it("holds a new quote's prices the settings days out (120 since 2026-11-04)", () => {
    expect(defaultValidUntil("2026-11-04", 120)).toBe("2027-03-04");
    // Todd's quote, made 2026-11-02 (Calgary).
    expect(defaultValidUntil("2026-11-02", 120)).toBe("2027-03-02");
    expect(defaultValidUntil("2026-11-03", 14)).toBe("2026-11-17");
    expect(defaultValidUntil("2026-12-28", 14)).toBe("2027-01-11");
    expect(defaultValidUntil("2026-11-03", 0)).toBe("2026-11-04");
    expect(defaultValidUntil("2026-11-03", 9999)).toBe("2027-11-03");
  });
});

// The customer quote link (2026-11-02): the same function prices whatever
// runs the customer has switched on, on their phone and on the server.
describe("The quote link's choices", () => {
  const house = (overrides: Partial<QuoteInputs> = {}) =>
    base({
      runs: [
        { name: "Front", feet: 60, level: "lower" },
        { name: "Upper front", feet: 40, level: "upper" },
        { name: "Garage", feet: 30, level: "lower" },
      ],
      adders: [
        { label: "Extra height", amount: 150, upperOnly: true },
        { label: "Garage corner", amount: 75 },
      ],
      discounts: [{ label: "Neighbour discount", amount: 150 }],
      ...overrides,
    });

  it("picks the runs they switched on, in the quote's order, and every run for the Recommended package", () => {
    const runs = house().runs;
    expect(selectRuns(runs, null)).toEqual(runs);
    expect(selectRuns(runs, [2, 0]).map((run) => run.name)).toEqual(["Front", "Garage"]);
    expect(selectRuns(runs, [7]).map((run) => run.name)).toEqual([]);
  });

  it("prices the Recommended package exactly as the quote was priced", () => {
    const whole = priceQuote(house());
    const picked = priceQuote(house({ runs: selectRuns(house().runs, null) }));
    expect(picked).toEqual(whole);
    // 130 ft x $23 + $500 box + $150 + $75 - $150
    expect(whole.subtotal).toBe(3565);
  });

  it("keeps the control box and every discount whatever they switch off", () => {
    const small = priceQuote(house({ runs: selectRuns(house().runs, [2]) }));
    const labels = small.lines.map((line) => line.label);
    expect(labels).toContain("Control box");
    expect(labels).toContain("Neighbour discount");
    expect(small.totalFeet).toBe(30);
  });

  it("drops extra work marked only with upper runs when no upper run is on", () => {
    const withUpper = priceQuote(house({ runs: selectRuns(house().runs, [1, 2]) }));
    expect(withUpper.lines.map((line) => line.label)).toContain("Extra height");
    const lowerOnly = priceQuote(house({ runs: selectRuns(house().runs, [0, 2]) }));
    expect(lowerOnly.lines.map((line) => line.label)).not.toContain("Extra height");
    expect(lowerOnly.lines.map((line) => line.label)).toContain("Garage corner");
    // 90 ft x $23 + $500 + $75 - $150
    expect(lowerOnly.subtotal).toBe(2495);
  });

  it("counts an upper run only when it has feet", () => {
    expect(hasUpperRun([{ name: "Upper", feet: 0, level: "upper" }])).toBe(false);
    expect(hasUpperRun([{ name: "Upper", feet: 12, level: "upper" }])).toBe(true);
    const noFeet = priceQuote(house({ runs: [{ name: "Upper", feet: 0, level: "upper" }, { name: "Front", feet: 10, level: "lower" }] }));
    expect(noFeet.lines.map((line) => line.label)).not.toContain("Extra height");
  });

  it("raises a small choice to the minimum job total, with a line saying so", () => {
    const small = priceQuote(house({ runs: selectRuns(house().runs, [2]), minJobTotal: 2500 }));
    // 30 ft x $23 + $500 + $75 - $150 = $1,115, raised by $1,385
    // The line names what its amount is: the top-up, not the minimum.
    const minimum = small.lines.find((line) => line.label.startsWith("To reach"));
    expect(minimum).toEqual({ label: "To reach our $2,500 minimum", detail: null, amount: 1385 });
    expect(small.minimumApplied).toBe(true);
    // The lines' own sum, before the top-up, for the breakdown's Subtotal.
    expect(small.beforeMinimum).toBe(1115);
    expect(small.subtotal).toBe(2500);
    expect(small.lines.reduce((sum, line) => sum + Math.round(line.amount * 100), 0)).toBe(250000);
  });

  it("leaves a choice at or above the minimum alone, and an empty minimum means none", () => {
    const whole = priceQuote(house({ minJobTotal: 2500 }));
    expect(whole.minimumApplied).toBe(false);
    expect(whole.subtotal).toBe(3565);
    expect(whole.beforeMinimum).toBe(3565);
    const exact = priceQuote(house({ runs: selectRuns(house().runs, [0, 2]), minJobTotal: 2495 }));
    expect(exact.minimumApplied).toBe(false);
    for (const none of [null, 0, undefined]) {
      const small = priceQuote(house({ runs: selectRuns(house().runs, [2]), minJobTotal: none }));
      expect(small.subtotal).toBe(1115);
    }
  });

  it("applies the minimum before GST, then GST on the minimum", () => {
    const small = priceQuote(house({ runs: selectRuns(house().runs, [2]), minJobTotal: 2500, gstEnabled: true }));
    expect(small.subtotal).toBe(2500);
    expect(small.gst).toBe(125);
    expect(small.total).toBe(2625);
    expect(screenTotal(small.subtotal, true)).toBe("$2,500 + GST");
  });

  it("never lets discounts push a small choice below zero, minimum or not", () => {
    const tiny = priceQuote(
      house({ runs: selectRuns(house().runs, [2]), discounts: [{ label: "Big discount", amount: 5000 }] }),
    );
    expect(tiny.subtotal).toBe(0);
    const raised = priceQuote(
      house({ runs: selectRuns(house().runs, [2]), discounts: [{ label: "Big discount", amount: 5000 }], minJobTotal: 1800.5 }),
    );
    expect(raised.subtotal).toBe(1800.5);
  });

  it("rounds a smaller choice to the cent with odd prices", () => {
    const odd = priceQuote(
      house({ runs: selectRuns(house().runs, [0, 1]), pricePerFt: 23.33, boxPrice: 499.99, minJobTotal: null }),
    );
    // 100 ft x $23.33 = $2,333.00; + $499.99 + $150 + $75 - $150
    expect(odd.subtotal).toBe(2907.99);
    expect(odd.lines.reduce((sum, line) => sum + Math.round(line.amount * 100), 0)).toBe(Math.round(odd.subtotal * 100));
  });
});
