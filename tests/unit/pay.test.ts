import { describe, expect, it } from "vitest";
import {
  commissionStage,
  commissionStatusText,
  formatMoney,
  homeCommissions,
  homeCommissionText,
  isOwed,
  payTotals,
  ratePercent,
  voidReason,
  type HomeCommission,
} from "@/lib/pay/earnings";

describe("setter pay", () => {
  it("adds up owed now, coming once installed and paid; voided counts for nothing", () => {
    const totals = payTotals([
      { amount: 20, status: "pending", payable_at: "2026-11-02T03:00:00Z" },
      { amount: 20, status: "pending", payable_at: "2026-11-03T03:00:00Z" },
      { amount: 172.5, status: "pending", payable_at: null },
      { amount: 20, status: "paid", payable_at: "2026-10-30T03:00:00Z" },
      { amount: 20, status: "void", payable_at: "2026-10-30T03:00:00Z" },
      { amount: 142, status: "void", payable_at: null },
    ]);
    expect(totals).toEqual({ owedNow: 40, pendingInstall: 172.5, paid: 20 });
  });

  it("counts an installed job's commission as owed now, beside the booking fees", () => {
    const totals = payTotals([
      { amount: 20, status: "pending", payable_at: "2026-11-02T03:00:00Z" },
      { amount: 142, status: "pending", payable_at: "2026-11-20T19:00:00Z" },
    ]);
    expect(totals).toEqual({ owedNow: 162, pendingInstall: 0, paid: 0 });
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
    expect(isOwed({ amount: 20, status: "void", payable_at: "x" })).toBe(false);
  });

  it("shows a commission's rate as a percentage", () => {
    expect(ratePercent(0.05)).toBe("5%");
    expect(ratePercent(0.0625)).toBe("6.25%");
    expect(ratePercent(0.1234)).toBe("12.34%");
  });
});

describe("commission on the pay screens (round 8)", () => {
  const coming = { amount: 142, status: "pending" as const, payable_at: null, paid_at: null, note: null };
  const owed = { ...coming, payable_at: "2026-11-20T19:00:00Z" };
  const paid = { ...owed, status: "paid" as const, paid_at: "2026-11-27T19:00:00Z" };
  const voided = { ...coming, status: "void" as const, note: "Cancelled: timing" };

  it("knows where a commission stands", () => {
    expect(commissionStage(coming)).toBe("coming");
    expect(commissionStage(owed)).toBe("owed");
    expect(commissionStage(paid)).toBe("paid");
    expect(commissionStage(voided)).toBe("void");
  });

  it("puts each void's fixed reason in words that follow Voided", () => {
    expect(voidReason("Cancelled: timing")).toBe("cancelled, timing");
    expect(voidReason("Cancelled: partner said no")).toBe("cancelled, partner said no");
    expect(voidReason("Acceptance undone")).toBe("acceptance undone");
    expect(voidReason("The lead left Sold")).toBe("the lead left Sold");
    expect(voidReason("Outcome changed to no show")).toBe("outcome changed to no show");
    expect(voidReason(null)).toBeNull();
    expect(voidReason("  ")).toBeNull();
  });

  it("gives My pay's words for each commission", () => {
    expect(commissionStatusText(coming)).toBe("Coming once it's installed");
    expect(commissionStatusText(owed)).toBe("Owed");
    expect(commissionStatusText(paid)).toBe("Paid Nov 27, 2026");
    expect(commissionStatusText({ ...paid, paid_at: null })).toBe("Paid");
    expect(commissionStatusText(voided)).toBe("Voided: cancelled, timing");
    expect(commissionStatusText({ ...voided, note: "Acceptance undone" })).toBe("Voided: acceptance undone");
    expect(commissionStatusText({ ...voided, note: null })).toBe("Voided");
  });

  it("gives Home's line in Keenan's words, whole dollars when there are no cents", () => {
    expect(homeCommissionText(coming)).toBe("Sold. $142 commission once it's installed.");
    expect(homeCommissionText(owed)).toBe("Installed. $142 commission to be paid.");
    expect(homeCommissionText(paid)).toBe("Paid. $142 commission.");
    expect(homeCommissionText(voided)).toBe("Cancelled. No commission.");
    expect(homeCommissionText({ ...coming, amount: 142.5 })).toBe("Sold. $142.50 commission once it's installed.");
    expect(homeCommissionText({ ...owed, amount: 1234.05 })).toBe("Installed. $1,234.05 commission to be paid.");
  });

  describe("which commissions Home shows", () => {
    const now = Date.parse("2026-11-20T20:00:00Z");
    const daysAgo = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString();
    const line = (id: string, lead: string, fields: Partial<HomeCommission>): HomeCommission & { id: string } => ({
      id,
      lead_id: lead,
      amount: 142,
      status: "pending",
      payable_at: null,
      paid_at: null,
      note: null,
      updated_at: daysAgo(1),
      ...fields,
    });

    it("every one coming or owed, however old, and paid or voided in the last 7 days, newest change first", () => {
      const shown = homeCommissions(
        [
          line("old-coming", "a", { updated_at: daysAgo(40) }),
          line("owed", "b", { payable_at: daysAgo(2), updated_at: daysAgo(2) }),
          line("paid-recent", "c", { status: "paid", payable_at: daysAgo(5), paid_at: daysAgo(3), updated_at: daysAgo(3) }),
          line("paid-old", "d", { status: "paid", payable_at: daysAgo(20), paid_at: daysAgo(8), updated_at: daysAgo(8) }),
          line("void-recent", "e", { status: "void", note: "Cancelled: price", updated_at: daysAgo(6) }),
          line("void-old", "f", { status: "void", note: "Cancelled: price", updated_at: daysAgo(9) }),
        ],
        now,
      );
      expect(shown.map((row) => row.id)).toEqual(["owed", "paid-recent", "void-recent", "old-coming"]);
    });

    it("leaves out a void when the lead was accepted again, and shows one void per lead", () => {
      const shown = homeCommissions(
        [
          line("undone", "a", { status: "void", note: "Acceptance undone", updated_at: daysAgo(2) }),
          line("again", "a", { updated_at: daysAgo(1) }),
          line("undone-1", "b", { status: "void", note: "Acceptance undone", updated_at: daysAgo(4) }),
          line("cancelled-2", "b", { status: "void", note: "Cancelled: timing", updated_at: daysAgo(1) }),
        ],
        now,
      );
      expect(shown.map((row) => row.id)).toEqual(["again", "cancelled-2"]);
    });

    it("shows nothing for a setter with no commission", () => {
      expect(homeCommissions([], now)).toEqual([]);
    });
  });
});
