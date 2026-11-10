import { describe, expect, it } from "vitest";
import {
  commissionAmountCents,
  commissionBaseCents,
  commissionFeet,
  commissionFor,
  commissionQuoteFromRow,
  rateBasisPoints,
  shiftRounded,
  type CommissionQuote,
} from "@/lib/pay/commission";
import { priceQuote, type QuoteInputs } from "@/lib/pricing";

// Round 8 (Keenan, 2026-11-09): the commission is the rate times the lights
// and control boxes after discounts. These are worked by hand, the way
// public.quote_commission_base works them: whole cents, the rate in basis
// points, round half up.

const quote = (extra: Partial<CommissionQuote> = {}): CommissionQuote => ({
  runs: [
    { feet: 100 },
    { feet: 40 },
  ],
  boxCount: 1,
  pricePerFt: 23,
  boxPrice: 500,
  discounts: [],
  positions: null,
  ...extra,
});

describe("commission base", () => {
  it("is the lights and the control box", () => {
    // 140 ft x $23 = $3,220, plus one $500 box.
    expect(commissionBaseCents(quote())).toBe(372_000);
    expect(commissionFor(quote(), 0.05)).toEqual({ base: 3720, amount: 186 });
  });

  it("takes the discounts off", () => {
    // 100 ft x $24 = $2,400, a $500 box, less $60: $2,840. 5% is $142.
    const sold = quote({ runs: [{ feet: 100 }], pricePerFt: 24, discounts: [{ amount: 60 }] });
    expect(commissionFor(sold, 0.05)).toEqual({ base: 2840, amount: 142 });
    // Neighbour discount and referral credit together.
    const both = quote({ discounts: [{ amount: 150 }, { amount: 150 }] });
    expect(commissionFor(both, 0.05)).toEqual({ base: 3420, amount: 171 });
  });

  it("counts every control box, whatever runs are picked", () => {
    expect(commissionBaseCents(quote({ boxCount: 2 }))).toBe(422_000);
    expect(commissionBaseCents(quote({ boxCount: 0 }))).toBe(322_000);
    expect(commissionBaseCents(quote({ boxCount: -1 }))).toBe(322_000);
    // No runs picked at all still leaves the box.
    expect(commissionBaseCents(quote({ positions: [] }))).toBe(50_000);
  });

  it("counts only the runs of a Start smaller acceptance", () => {
    const runs = [{ feet: 100 }, { feet: 40 }, { feet: 25 }];
    expect(commissionFeet({ runs, positions: null })).toBe(165);
    expect(commissionFeet({ runs, positions: [0, 2] })).toBe(125);
    // A position twice counts once; one off the end counts for nothing.
    expect(commissionFeet({ runs, positions: [2, 2, 7] })).toBe(25);
    // 125 ft x $23 = $2,875, plus the box: $3,375. 5% is $168.75.
    expect(commissionFor(quote({ runs, positions: [0, 2] }), 0.05)).toEqual({ base: 3375, amount: 168.75 });
  });

  it("counts whole feet, nothing below 0 or above 10,000, and numbers only", () => {
    const runs = [{ feet: 12.5 }, { feet: 0.4 }, { feet: -5 }, { feet: 20_000 }, { feet: Number.NaN }, { feet: "30" as unknown as number }];
    expect(commissionFeet({ runs, positions: null })).toBe(13 + 10_000);
  });

  it("never goes below zero", () => {
    expect(commissionFor(quote({ discounts: [{ amount: 9_999 }] }), 0.05)).toEqual({ base: 0, amount: 0 });
  });

  it("ignores a negative or non-numeric discount", () => {
    const odd = quote({ discounts: [{ amount: -150 }, { amount: "150" as unknown as number }, { amount: Number.NaN }] });
    expect(commissionBaseCents(odd)).toBe(372_000);
  });

  it("works on the stored decimals, so floating point never moves a cent", () => {
    // 1.005 x 100 is 100.49999999999999 in floating point; Postgres reads
    // the stored 1.005 and rounds it to 101.
    expect(shiftRounded(1.005, 2)).toBe(101);
    expect(shiftRounded(4.35, 2)).toBe(435);
    expect(shiftRounded(0.005, 2)).toBe(1);
    expect(shiftRounded(0.004, 2)).toBe(0);
    expect(shiftRounded(-1.005, 2)).toBe(-101);
    expect(shiftRounded(5e-7, 6)).toBe(1);
    expect(shiftRounded(1e21, 2)).toBe(1e23);
    expect(commissionBaseCents(quote({ runs: [], boxCount: 1, pricePerFt: 0, boxPrice: 10, discounts: [{ amount: 1.005 }] }))).toBe(1_000 - 101);
    expect(rateBasisPoints(0.05)).toBe(500);
    expect(rateBasisPoints(0.0525)).toBe(525);
  });

  it("rounds the amount half up to the cent, like round(base x rate, 2)", () => {
    // 110 ft x $23.10 = $2,541.00, a $500 box, less $38.90: $3,002.10.
    // 5% is $150.105, which rounds up to $150.11. Plain floating point
    // (3002.10 x 0.05) would give $150.10.
    const odd = quote({ runs: [{ feet: 110 }], pricePerFt: 23.1, discounts: [{ amount: 38.9 }] });
    expect(commissionFor(odd, 0.05)).toEqual({ base: 3002.1, amount: 150.11 });
    // $42.30 at 5% is $2.115: $2.12.
    expect(commissionAmountCents(4_230, 0.05)).toBe(212);
    // $86.00 at 5.25% is $4.515: $4.52.
    expect(commissionAmountCents(8_600, 0.0525)).toBe(452);
    expect(commissionAmountCents(0, 0.05)).toBe(0);
    expect(commissionAmountCents(372_000, 0)).toBe(0);
  });

  it("leaves out rush colour, extra work, upper-only lines and the minimum top-up", () => {
    // The same lights, box and discount priced as the customer sees them,
    // with every line the commission leaves out.
    const runs = [
      { name: "Front", feet: 60, level: "lower" as const },
      { name: "Upper", feet: 20, level: "upper" as const },
    ];
    const priced = priceQuote({
      runs,
      boxCount: 1,
      pricePerFt: 23,
      boxPrice: 500,
      adders: [{ label: "Extra wiring", amount: 120 }, { label: "Lift", amount: 300, upperOnly: true }],
      discounts: [{ label: "Neighbour discount", amount: 150 }],
      colourTiming: "rush",
      rushFeePerFt: 4,
      minJobTotal: 5_000,
      gstEnabled: true,
      gstRate: 0.05,
    } as QuoteInputs);
    expect(priced.minimumApplied).toBe(true);
    expect(priced.subtotal).toBe(5_000);
    // 80 ft x $23 = $1,840, plus $500, less $150: $2,190. 5% is $109.50.
    expect(commissionFor(quote({ runs, discounts: [{ amount: 150 }] }), 0.05)).toEqual({ base: 2190, amount: 109.5 });
  });

  it("matches the quote's own subtotal when the quote has only lights, boxes and discounts", () => {
    const runs = [
      { name: "Front", feet: 72.4, level: "lower" as const },
      { name: "Garage", feet: 31, level: "lower" as const },
    ];
    const plain = {
      runs,
      boxCount: 2,
      pricePerFt: 23.45,
      boxPrice: 500,
      adders: [],
      discounts: [{ label: "Neighbour discount", amount: 150 }, { label: "Referral credit", amount: 150 }],
      colourTiming: "stock",
      gstEnabled: false,
      gstRate: 0.05,
    } as unknown as QuoteInputs;
    const ours = commissionFor(quote({ runs, boxCount: 2, pricePerFt: 23.45, discounts: plain.discounts }), 0.05);
    expect(ours.base).toBe(priceQuote(plain).subtotal);
  });
});

describe("a quotes row", () => {
  it("reads the columns the commission needs, keeping each run in its place", () => {
    const row = {
      runs: [
        { name: "Front", feet: 100, level: "lower", part: "eave" },
        { name: "Side", feet: "40", level: "lower" },
        null,
        { name: "Back", feet: 25, level: "upper" },
      ],
      box_count: 1,
      price_per_ft: 24,
      box_price: 500,
      discounts: [{ label: "Neighbour discount", amount: 60 }, "free", { label: "Typo", amount: "100" }],
    };
    const parsed = commissionQuoteFromRow(row, [0, 3]);
    expect(parsed.runs.map((run) => run.feet)).toEqual([100, 0, 0, 25]);
    expect(parsed.positions).toEqual([0, 3]);
    // 125 ft x $24 = $3,000, a $500 box, less $60: $3,440. 5% is $172.
    expect(commissionFor(parsed, 0.05)).toEqual({ base: 3440, amount: 172 });
  });

  it("copes with columns that aren't lists", () => {
    const parsed = commissionQuoteFromRow({ runs: null, box_count: 1, price_per_ft: 24, box_price: 500, discounts: {} }, null);
    expect(commissionFor(parsed, 0.05)).toEqual({ base: 500, amount: 25 });
  });

  it("reads a whole stored quote and leaves out every line that isn't lights, boxes or discounts", () => {
    // A quote as the database holds it, on main or after the quote link
    // rework: extra work (one only with upper runs), rush colour both ways
    // (per foot and flat), upper access and a minimum far above the total.
    const stored = {
      runs: [
        { name: "Front", feet: 60, level: "lower", part: "eave" },
        { name: "Garage", feet: 25, level: "lower", part: "garage" },
        { name: "Upper peak", feet: 40, level: "upper", part: "gable" },
      ],
      box_count: 2,
      price_per_ft: 24,
      box_price: 500,
      adders: [
        { label: "Extra wiring", amount: 120 },
        { label: "Lift rental", amount: 300, upper_only: true },
      ],
      discounts: [
        { label: "Neighbour discount", amount: 150 },
        { label: "Referral credit", amount: 150 },
      ],
      colour_timing: "rush",
      rush_fee_per_ft: 4,
      rush_fee: 350,
      upper_access_fee: 200,
      upper_gable_access_fee: 400,
      min_job_total: 10_000,
      subtotal: 10_000,
      total: 10_000,
    };
    // The full quote: 125 ft x $24 = $3,000, two $500 boxes, less $300:
    // $3,700. 5% is $185.
    expect(commissionFor(commissionQuoteFromRow(stored, null), 0.05)).toEqual({ base: 3700, amount: 185 });
    // Start smaller, the lower runs only: 85 ft x $24 = $2,040, both boxes,
    // less $300: $2,740. 5% is $137.
    expect(commissionFor(commissionQuoteFromRow(stored, [0, 1]), 0.05)).toEqual({ base: 2740, amount: 137 });
  });
});

// A small, repeatable stream of numbers, so the checks below cover many
// values and still run the same way every time.
function numbers(seed: number) {
  let state = seed >>> 0;
  return (below: number) => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state % below;
  };
}

describe("exactly the database's rounding", () => {
  it("rounds the amount half up from exact whole numbers, for every base and rate", () => {
    const next = numbers(8);
    for (let i = 0; i < 2_000; i++) {
      const base = next(100_000_000);
      const points = next(2_001);
      // round(base x rate, 2) worked in exact integers.
      const exact = Number((BigInt(base) * BigInt(points) + BigInt(5_000)) / BigInt(10_000));
      expect(commissionAmountCents(base, points / 10_000)).toBe(exact);
    }
  });

  it("turns stored decimals into cents the way Postgres does", () => {
    const next = numbers(11);
    for (let i = 0; i < 2_000; i++) {
      // A stored amount with up to three decimals, read back as a number.
      const thousandths = next(10_000_000);
      expect(shiftRounded(thousandths / 1_000, 2)).toBe(Math.floor((thousandths + 5) / 10));
    }
  });
});
