import { describe, expect, it } from "vitest";
import {
  bookedStartSmaller,
  currentCommission,
  installedWords,
  notInstalledWords,
  optionWords,
  pickOutcomeQuote,
  previewCommission,
  runsFromJson,
  standingCommission,
  voidWords,
  type CommissionRow,
} from "@/lib/quotes/outcome-card";
import { commissionLine } from "@/lib/quotes/outcome";

// Keenan's outcome card on the lead page (round 8, 2026-11-09): which quote
// it is about, the options Accepted offers, and the commission line.

const runs = runsFromJson([
  { name: "Front", feet: 100, level: "lower" },
  { name: "Garage", feet: 60, level: "lower" },
  { name: "Front upper", feet: 40, level: "upper" },
]);

const quoteRow = {
  runs: [
    { name: "Front", feet: 100, level: "lower" },
    { name: "Garage", feet: 60, level: "lower" },
  ],
  box_count: 1,
  price_per_ft: 23,
  box_price: 500,
  discounts: [{ label: "Neighbour", amount: 150 }],
};

const zane = { name: "Zane", role: "sales" };

function earning(over: Partial<CommissionRow>): CommissionRow {
  return {
    id: "e1",
    profile_id: "p-zane",
    amount: 201.5,
    status: "pending",
    payable_at: null,
    paid_at: null,
    note: null,
    quote_id: "q1",
    source_quote_id: "q1",
    created_at: "2026-11-09T20:00:00Z",
    ...over,
  };
}

describe("runs as stored", () => {
  it("keeps each run in its place, so positions still point at the right one", () => {
    expect(runsFromJson([{ name: "Front", feet: 80, level: "upper" }, "junk", { feet: "12" }])).toEqual([
      { name: "Front", feet: 80, level: "upper" },
      { name: "", feet: 0, level: "lower" },
      { name: "", feet: 0, level: "lower" },
    ]);
    expect(runsFromJson(null)).toEqual([]);
    expect(runsFromJson({ runs: [] })).toEqual([]);
  });
});

describe("the customer's Start smaller choice", () => {
  const booked = (option: string, selection: number[] | null) => ({
    booked_at: "2026-11-09T21:00:00Z",
    booked_option: option,
    booked_selection: selection,
  });

  it("is offered while it still matches the quote", () => {
    expect(bookedStartSmaller(runs, booked("Start smaller: Front, Garage", [0, 1]))).toEqual([0, 1]);
    expect(bookedStartSmaller(runs, booked("Start smaller: Garage", [1]))).toEqual([1]);
  });

  it("is not offered for the Recommended package, no booking, or a quote that moved on", () => {
    expect(bookedStartSmaller(runs, booked("Recommended package", null))).toBeNull();
    expect(bookedStartSmaller(runs, null)).toBeNull();
    expect(bookedStartSmaller(runs, { booked_at: null, booked_option: null, booked_selection: null })).toBeNull();
    // A run renamed since they booked.
    expect(bookedStartSmaller(runs, booked("Start smaller: Garage door", [1]))).toBeNull();
    // A run taken off since.
    expect(bookedStartSmaller(runs, booked("Start smaller: Deck", [5]))).toBeNull();
    // Every run is the full quote, not a smaller option.
    expect(bookedStartSmaller(runs, booked("Start smaller: Front, Garage, Front upper", [0, 1, 2]))).toBeNull();
    expect(bookedStartSmaller(runs, booked("Start smaller: Garage", [1, 1]))).toBeNull();
  });
});

describe("the option in words", () => {
  it("names the full quote and a smaller option with their feet", () => {
    expect(optionWords(runs, null)).toEqual({ label: "Full quote", detail: "3 runs, 200 ft" });
    expect(optionWords(runs, [0, 1, 2])).toEqual({ label: "Full quote", detail: "3 runs, 200 ft" });
    expect(optionWords(runs, [1])).toEqual({ label: "Garage only", detail: "Start smaller, 60 ft" });
    expect(optionWords(runs, [0, 1])).toEqual({ label: "Front and Garage", detail: "Start smaller, 160 ft" });
    expect(optionWords(runsFromJson([{ name: "Front", feet: 90 }]), null)).toEqual({
      label: "Full quote",
      detail: "1 run, 90 ft",
    });
  });
});

describe("which quote the card is about", () => {
  it("is the accepted one while there is one, even under a newer draft", () => {
    const rows = [
      { id: "new-draft", status: "draft", created_at: "2026-11-10T01:00:00Z" },
      { id: "yes", status: "accepted", created_at: "2026-11-09T01:00:00Z" },
    ];
    expect(pickOutcomeQuote(rows)?.id).toBe("yes");
  });

  it("is otherwise the newest of any status, declined and cancelled included", () => {
    const rows = [
      { id: "old", status: "draft", created_at: "2026-11-01T01:00:00Z" },
      { id: "no", status: "declined", created_at: "2026-11-09T01:00:00Z" },
    ];
    expect(pickOutcomeQuote(rows)?.id).toBe("no");
    expect(pickOutcomeQuote([])).toBeNull();
  });
});

describe("the lead's commission", () => {
  it("is the pending or paid one first, else the newest voided one from this quote", () => {
    const voided = earning({ id: "v", status: "void", quote_id: null, created_at: "2026-11-10T00:00:00Z" });
    const pending = earning({ id: "p", amount: 180, quote_id: "q1", created_at: "2026-11-09T00:00:00Z" });
    expect(currentCommission([voided, pending], "q1")?.id).toBe("p");
    expect(currentCommission([voided], "q1")?.id).toBe("v");
    // A void from another quote on the lead says nothing about this one.
    expect(currentCommission([earning({ status: "void", quote_id: null, source_quote_id: "q0" })], "q1")).toBeNull();
    expect(currentCommission([], "q1")).toBeNull();
  });
});

describe("the Accepted sheet's preview", () => {
  const base = { quote: quoteRow, rate: 0.05, existing: null };

  it("is the commission rate of the lights and control boxes after discounts", () => {
    // (100 + 60) ft x $23 + $500 - $150 = $4,030; 5% is $201.50.
    const line = previewCommission({ ...base, receiver: zane, positions: null });
    expect(line).toEqual({ kind: "earning", amount: 201.5, setterName: "Zane", status: "pending", payableAt: null, paidAt: null });
    expect(commissionLine(line)).toBe("$201.50 to Zane, coming once installed.");
  });

  it("counts only the runs of a Start smaller option", () => {
    // 60 ft x $23 + $500 - $150 = $1,730; 5% is $86.50.
    const line = previewCommission({ ...base, receiver: zane, positions: [1] });
    expect(line.kind === "earning" && line.amount).toBe(86.5);
  });

  it("is none on Keenan's own lead, and none new once one is paid", () => {
    const owner = previewCommission({ ...base, receiver: { name: "Keenan", role: "owner" }, positions: null });
    expect(commissionLine(owner)).toBe("No commission: the lead is yours.");
    const paid = previewCommission({ ...base, receiver: zane, positions: null, existing: earning({ status: "paid" }) });
    expect(paid).toEqual({ kind: "none", reason: "already_paid" });
    expect(previewCommission({ ...base, receiver: { name: "Crew", role: "crew" }, positions: null })).toEqual({
      kind: "none",
      reason: null,
    });
  });

  it("shows a commission still pending at its own amount", () => {
    const line = previewCommission({ ...base, receiver: zane, positions: null, existing: earning({ amount: 99 }) });
    expect(line.kind === "earning" && line.amount).toBe(99);
  });
});

describe("the commission as it stands", () => {
  const names = new Map([["p-zane", "Zane Lee"]]);

  it("reads from the earning, named by who it went to", () => {
    expect(commissionLine(standingCommission(earning({}), zane, names))).toBe("$201.50 to Zane Lee, coming once installed.");
    expect(commissionLine(standingCommission(earning({ payable_at: "2026-11-20T18:00:00Z" }), zane, names))).toBe(
      "$201.50 to Zane Lee, owed now. Mark it paid in Pay.",
    );
    expect(
      commissionLine(standingCommission(earning({ status: "paid", paid_at: "2026-11-27T18:00:00Z" }), zane, names)),
    ).toBe("$201.50 to Zane Lee, paid Nov 27.");
    expect(commissionLine(standingCommission(earning({ status: "void" }), zane, names))).toBe("$201.50 to Zane Lee, voided.");
  });

  it("says why there is none", () => {
    expect(standingCommission(null, { name: "Keenan", role: "owner" }, names)).toEqual({ kind: "none", reason: "owner_lead" });
    expect(standingCommission(null, zane, names)).toEqual({ kind: "none", reason: null });
  });
});

describe("what a tap does to the commission", () => {
  const names = new Map([["p-zane", "Zane"]]);
  const line = (over: Partial<CommissionRow>) => standingCommission(earning(over), zane, names);

  it("voids an unpaid one on Cancelled and Undo, and leaves a paid one paid", () => {
    expect(voidWords(line({}))).toBe("The $201.50 commission to Zane is voided.");
    expect(voidWords(line({ payable_at: "2026-11-20T18:00:00Z" }))).toBe("The $201.50 commission to Zane is voided.");
    expect(voidWords(line({ status: "paid", paid_at: "2026-11-27T18:00:00Z" }))).toBe(
      "The $201.50 commission to Zane is already paid, so it stays paid.",
    );
    expect(voidWords(line({ status: "void" }))).toBeNull();
    expect(voidWords({ kind: "none", reason: "owner_lead" })).toBeNull();
  });

  it("makes one still coming owed on Installed", () => {
    expect(installedWords(line({}))).toBe("The $201.50 commission to Zane becomes owed, ready to mark paid in Pay.");
    expect(installedWords(line({ payable_at: "2026-11-20T18:00:00Z" }))).toBeNull();
    expect(installedWords(line({ status: "paid" }))).toBeNull();
    expect(installedWords({ kind: "none", reason: null })).toBeNull();
  });

  it("makes an owed one wait for the install again on Not installed yet, and leaves a paid one paid", () => {
    expect(notInstalledWords(line({ payable_at: "2026-11-20T18:00:00Z" }))).toBe(
      "The $201.50 commission to Zane waits for the install again.",
    );
    expect(notInstalledWords(line({ status: "paid", paid_at: "2026-11-27T18:00:00Z" }))).toBe(
      "The $201.50 commission to Zane is already paid, so it stays paid.",
    );
    expect(notInstalledWords(line({ status: "void" }))).toBeNull();
    expect(notInstalledWords({ kind: "none", reason: "owner_lead" })).toBeNull();
  });
});
