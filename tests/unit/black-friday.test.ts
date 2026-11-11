import { describe, expect, it } from "vitest";
import type { QuoteInputs, QuoteRun } from "@/lib/pricing";
import {
  BLACK_FRIDAY_LABEL,
  blackFridayAmount,
  blackFridayFrom,
  blackFridayWords,
  discountsWithBlackFriday,
  hasBlackFridayLine,
  priceWithBlackFriday,
} from "@/lib/quotes/black-friday";

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
  rushFee: 350,
  upperAccessFee: 200,
  upperGableAccessFee: 400,
  minJobTotal: 2500,
  gstEnabled: false,
  gstRate: 0.05,
  ...over,
});

const FULL = { id: "full", name: "Full wrap", runs: [0, 1, 2, 3] };
const LOWER = { id: "lower", name: "Front lower", runs: [0, 1] };

describe("Black Friday", () => {
  it("reads the deal from Settings, or none", () => {
    expect(blackFridayFrom({ black_friday_kind: "percent", black_friday_value: 15 })).toEqual({ kind: "percent", value: 15 });
    expect(blackFridayFrom({ black_friday_kind: "amount", black_friday_value: "300.00" })).toEqual({ kind: "amount", value: 300 });
    expect(blackFridayFrom({ black_friday_kind: null, black_friday_value: 15 })).toBeNull();
    expect(blackFridayFrom({ black_friday_kind: "percent", black_friday_value: 0 })).toBeNull();
    expect(blackFridayFrom({ black_friday_kind: "percent", black_friday_value: 95 })).toBeNull();
  });

  it("works out the amount to the cent, never more than the total", () => {
    expect(blackFridayAmount({ kind: "percent", value: 15 }, 4200)).toBe(630);
    expect(blackFridayAmount({ kind: "percent", value: 12.5 }, 3333.33)).toBe(416.67);
    expect(blackFridayAmount({ kind: "amount", value: 300 }, 4200)).toBe(300);
    expect(blackFridayAmount({ kind: "amount", value: 5000 }, 4200)).toBe(4200);
    expect(blackFridayWords({ kind: "percent", value: 15 })).toBe("15% off");
    expect(blackFridayWords({ kind: "amount", value: 300 })).toBe("$300 off");
  });

  it("prices each offer at its regular and Black Friday price, the minimum still lifting it", () => {
    const full = priceWithBlackFriday(inputs(), FULL, { kind: "percent", value: 10 })!;
    // $4,200 regular; 10% is $420 off, so $3,780.
    expect(full.regular.subtotal).toBe(4200);
    expect(full.deal.subtotal).toBe(3780);
    expect(full.deal.lines.find((line) => line.label === BLACK_FRIDAY_LABEL)?.amount).toBe(-420);
    // Front lower is already at the $2,500 minimum, so the deal can't take it lower.
    const lower = priceWithBlackFriday(inputs(), LOWER, { kind: "amount", value: 300 })!;
    expect(lower.regular.subtotal).toBe(2500);
    expect(lower.deal.subtotal).toBe(2500);
  });

  it("saves one Black Friday line for the chosen offer, replacing any earlier one", () => {
    const saved = discountsWithBlackFriday(inputs(), FULL, { kind: "amount", value: 300 });
    expect(saved).toEqual([
      { label: "Neighbour discount", amount: 150 },
      { label: BLACK_FRIDAY_LABEL, amount: 300 },
    ]);
    expect(hasBlackFridayLine(saved)).toBe(true);
    const again = discountsWithBlackFriday(inputs({ discounts: saved }), FULL, { kind: "percent", value: 10 });
    expect(again.filter((line) => line.label === BLACK_FRIDAY_LABEL)).toEqual([{ label: BLACK_FRIDAY_LABEL, amount: 420, percent: 10 }]);
  });
});
