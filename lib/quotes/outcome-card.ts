import { commissionFor, commissionQuoteFromRow, type CommissionQuoteRow } from "@/lib/pay/commission";
import { cleanFeet, formatMoney, selectRuns, totalFeet, type QuoteRun } from "@/lib/pricing";
import { choiceLabel, optionName } from "@/lib/quote-link/view";
import type { CommissionLine } from "@/lib/quotes/outcome";
import type { Json } from "@/types/database";

// The facts behind Keenan's outcome card on the lead page (round 8,
// 2026-11-09), worked out on the server from what the database holds. Pure,
// so the unit tests can pin them. The database decides every outcome; this
// only says what the card shows and what a tap will do.

// ------------------------------------------------------------------ runs

// A quote's runs as stored, each kept in its place so positions still point
// at the right run. A run that isn't an object counts as an empty one.
export function runsFromJson(value: Json | null | undefined): QuoteRun[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const run = item && typeof item === "object" && !Array.isArray(item) ? item : {};
    const name = typeof run.name === "string" ? run.name : "";
    const feet = typeof run.feet === "number" && Number.isFinite(run.feet) ? run.feet : 0;
    return { name, feet, level: run.level === "upper" ? "upper" : "lower" };
  });
}

// Positions that are on the quote, sorted and without repeats, or null when
// they are missing, empty, out of range or cover every run (the full quote).
function partOfQuote(runCount: number, positions: readonly number[] | null | undefined): number[] | null {
  if (!positions || positions.length === 0) return null;
  const kept = Array.from(new Set(positions)).sort((a, b) => a - b);
  if (kept.length !== positions.length) return null;
  if (kept.some((p) => !Number.isInteger(p) || p < 0 || p >= runCount)) return null;
  return kept.length === runCount ? null : kept;
}

export type BookedLink = {
  booked_at: string | null;
  booked_option: string | null;
  booked_selection: number[] | null;
};

// The customer's "Start smaller" choice from Book my install on their link,
// when it still matches the quote: the same runs are still there under the
// same names (the database named the option from them when they booked).
// Null for the Recommended package, no booking, or a choice the quote has
// moved on from. Accepted then offers it first, beside the full quote.
export function bookedStartSmaller(runs: QuoteRun[], link: BookedLink | null): number[] | null {
  if (!link?.booked_at || !link.booked_option?.startsWith("Start smaller:")) return null;
  const positions = partOfQuote(runs.length, link.booked_selection);
  if (!positions) return null;
  return optionName(runs, positions) === link.booked_option ? positions : null;
}

// The accepted option in words for Keenan: "Full quote", or the parts they
// said yes to ("Garage only", "Front and Garage"), with the feet.
export function optionWords(runs: QuoteRun[], positions: readonly number[] | null): { label: string; detail: string } {
  const part = partOfQuote(runs.length, positions);
  const feet = totalFeet(selectRuns(runs, part));
  if (part === null) {
    const count = runs.length === 1 ? "1 run" : `${runs.length} runs`;
    return { label: "Full quote", detail: `${count}, ${feet} ft` };
  }
  return { label: choiceLabel(optionName(runs, part)), detail: `Start smaller, ${feet} ft` };
}

// ---------------------------------------------------------------- quote

type QuoteForCard = { status: string; created_at: string };

// The quote the card is about: the lead's accepted quote while it has one
// (a newer draft saved in meeting mode after the yes must not hide it),
// otherwise its newest quote of any status.
export function pickOutcomeQuote<T extends QuoteForCard>(rows: readonly T[]): T | null {
  const accepted = rows.find((row) => row.status === "accepted");
  if (accepted) return accepted;
  return [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}

// ------------------------------------------------------------ commission

export type CommissionRow = {
  id: string;
  profile_id: string;
  amount: number;
  status: "pending" | "paid" | "void";
  payable_at: string | null;
  paid_at: string | null;
  note: string | null;
  quote_id: string | null;
  source_quote_id: string | null;
  created_at: string;
};

// The lead's commission the card talks about: the one pending or paid (a
// lead never has two), else the newest voided one that came from this
// quote, else none.
export function currentCommission<T extends CommissionRow>(rows: readonly T[], quoteId: string): T | null {
  const newest = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    newest.find((row) => row.status !== "void") ??
    newest.find((row) => row.status === "void" && (row.source_quote_id ?? row.quote_id) === quoteId) ??
    null
  );
}

// Who the commission goes to: the lead's setter, the same person as the
// booking pay. Only a sales associate earns; a lead of Keenan's earns
// nothing.
export type Receiver = { name: string; role: string | null };

// What accepting would pay on an option, worked out the database's way
// (lib/pay/commission.ts), for the Accepted sheet's preview.
export function previewCommission({
  receiver,
  existing,
  quote,
  positions,
  rate,
}: {
  receiver: Receiver;
  existing: CommissionRow | null;
  quote: CommissionQuoteRow;
  positions: readonly number[] | null;
  rate: number;
}): CommissionLine {
  if (receiver.role === "owner") return { kind: "none", reason: "owner_lead" };
  if (receiver.role !== "sales") return { kind: "none", reason: null };
  if (existing?.status === "paid") return { kind: "none", reason: "already_paid" };
  const amount =
    existing?.status === "pending" ? existing.amount : commissionFor(commissionQuoteFromRow(quote, positions), rate).amount;
  return { kind: "earning", amount, setterName: receiver.name, status: "pending", payableAt: null, paidAt: null };
}

// The commission line as it stands, from the earning: coming, owed, paid
// or voided; or why there is none.
export function standingCommission(earning: CommissionRow | null, receiver: Receiver, names: ReadonlyMap<string, string>): CommissionLine {
  if (!earning) {
    return { kind: "none", reason: receiver.role === "owner" ? "owner_lead" : null };
  }
  return {
    kind: "earning",
    amount: earning.amount,
    setterName: names.get(earning.profile_id) ?? receiver.name,
    status: earning.status,
    payableAt: earning.payable_at,
    paidAt: earning.paid_at,
  };
}

// What Cancelled and Undo acceptance do to the commission, said before the
// tap: an unpaid one is voided; a paid one stays paid.
export function voidWords(line: CommissionLine): string | null {
  if (line.kind !== "earning" || line.status === "void") return null;
  const what = `The ${formatMoney(line.amount)} commission to ${line.setterName}`;
  return line.status === "paid" ? `${what} is already paid, so it stays paid.` : `${what} is voided.`;
}

// What Installed does to it: a commission still coming becomes owed.
export function installedWords(line: CommissionLine): string | null {
  if (line.kind !== "earning" || line.status !== "pending" || line.payableAt) return null;
  return `The ${formatMoney(line.amount)} commission to ${line.setterName} becomes owed, ready to mark paid in Pay.`;
}

// The feet on a quote's accepted runs, for the card.
export function acceptedFeet(runs: QuoteRun[], positions: readonly number[] | null): number {
  const part = partOfQuote(runs.length, positions);
  return selectRuns(runs, part).reduce((sum, run) => sum + cleanFeet(run.feet), 0);
}
