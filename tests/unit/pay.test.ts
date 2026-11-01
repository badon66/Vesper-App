import { describe, expect, it } from "vitest";
import { formatMoney, isOwed, payTotals } from "@/lib/pay/earnings";

describe("setter pay", () => {
  it("adds up owed now, pending install and paid; voided counts for nothing", () => {
    const totals = payTotals([
      { amount: 20, status: "pending", payable_at: "2026-11-02T03:00:00Z" },
      { amount: 20, status: "pending", payable_at: "2026-11-03T03:00:00Z" },
      { amount: 172.5, status: "pending", payable_at: null },
      { amount: 20, status: "paid", payable_at: "2026-10-30T03:00:00Z" },
      { amount: 20, status: "void", payable_at: "2026-10-30T03:00:00Z" },
    ]);
    expect(totals).toEqual({ owedNow: 40, pendingInstall: 172.5, paid: 20 });
  });

  it("rounds to the cent and shows dollars", () => {
    expect(payTotals([{ amount: 0.1, status: "paid", payable_at: "x" }, { amount: 0.2, status: "paid", payable_at: "x" }]).paid).toBe(0.3);
    expect(formatMoney(20)).toBe("$20.00");
    expect(formatMoney(1234.5)).toBe("$1,234.50");
  });

  it("knows which lines can be marked paid", () => {
    expect(isOwed({ amount: 20, status: "pending", payable_at: "x" })).toBe(true);
    expect(isOwed({ amount: 20, status: "pending", payable_at: null })).toBe(false);
    expect(isOwed({ amount: 20, status: "paid", payable_at: "x" })).toBe(false);
  });
});
