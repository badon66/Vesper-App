import { formatMoney as roundedMoney } from "@/lib/pricing";
import { formatDate } from "@/lib/time";
import type { Database } from "@/types/database";

// Setter pay as the app shows it. "Owed now" is pending and payable (booking
// fees, and commission once the job is installed); "coming once installed"
// (pendingInstall) is pending commission on a sold job not installed yet;
// "paid" is paid. Voided earnings count for nothing (data model, earnings).

export type EarningStatus = Database["public"]["Enums"]["earning_status"];

export type PayLine = { amount: number; status: EarningStatus; payable_at: string | null };

export type PayTotals = { owedNow: number; pendingInstall: number; paid: number };

const cents = (n: number) => Math.round(n * 100) / 100;

export function payTotals(lines: PayLine[]): PayTotals {
  let owedNow = 0;
  let pendingInstall = 0;
  let paid = 0;
  for (const line of lines) {
    if (line.status === "paid") paid += line.amount;
    else if (line.status === "pending" && line.payable_at) owedNow += line.amount;
    else if (line.status === "pending") pendingInstall += line.amount;
  }
  return { owedNow: cents(owedNow), pendingInstall: cents(pendingInstall), paid: cents(paid) };
}

const money = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });

// Pay's own style: always with cents ("$20.00"), so a column of fees lines up.
export function formatMoney(amount: number): string {
  return money.format(amount).replace("CA$", "$");
}

export function isOwed(line: PayLine): boolean {
  return line.status === "pending" && line.payable_at !== null;
}

// ------------------------------------------------------------- commission
// Round 8 (Keenan, 2026-11-09). A commission is made when Keenan marks a
// quote accepted (coming), becomes owed when he marks the job Installed,
// then paid; an undone or cancelled sale voids it while it is unpaid.

export type CommissionStage = "coming" | "owed" | "paid" | "void";

export function commissionStage(line: PayLine): CommissionStage {
  if (line.status === "paid") return "paid";
  if (line.status === "void") return "void";
  return line.payable_at ? "owed" : "coming";
}

// Why a line was voided, in words that follow "Voided: ". The database
// writes a fixed note on every void, never anything typed by hand:
// "Cancelled: timing" for a cancelled sale, "Acceptance undone", "The lead
// left Sold", or "Outcome changed to no show" for a booking fee.
export function voidReason(note: string | null | undefined): string | null {
  const text = (note ?? "").trim();
  if (text === "") return null;
  const cancelled = /^Cancelled:\s*(.+)$/i.exec(text);
  if (cancelled) return `cancelled, ${cancelled[1]}`;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

export type CommissionPayLine = PayLine & { paid_at: string | null; note: string | null };

// My pay's words for where a commission stands: "Coming once it's
// installed", "Owed", "Paid Nov 20, 2026" or "Voided: cancelled, timing".
export function commissionStatusText(line: CommissionPayLine): string {
  switch (commissionStage(line)) {
    case "coming":
      return "Coming once it's installed";
    case "owed":
      return "Owed";
    case "paid":
      return line.paid_at ? `Paid ${formatDate(line.paid_at)}` : "Paid";
    default: {
      const reason = voidReason(line.note);
      return reason ? `Voided: ${reason}` : "Voided";
    }
  }
}

// Home's line for one of the setter's own commissions, in whole dollars when
// there are no cents ("$142"), as Keenan wrote it. A voided one says why
// from the database's fixed note, never typed words: a cancel, an
// acceptance undone (the sale is reopened, not cancelled), or the lead
// leaving Sold another way.
export function homeCommissionText(line: PayLine & { note?: string | null }): string {
  const amount = roundedMoney(line.amount);
  switch (commissionStage(line)) {
    case "coming":
      return `Sold. ${amount} commission once it's installed.`;
    case "owed":
      return `Installed. ${amount} commission to be paid.`;
    case "paid":
      return `Paid. ${amount} commission.`;
    default: {
      const note = (line.note ?? "").trim();
      if (/^Cancelled:/i.test(note)) return "Cancelled. No commission.";
      if (/^Acceptance undone$/i.test(note)) return "Sale reopened. No commission for now.";
      return "No longer sold. No commission.";
    }
  }
}

export type HomeCommission = CommissionPayLine & { lead_id: string; updated_at: string };

const DAY_MS = 24 * 60 * 60 * 1000;

// Which of the setter's own commissions Home shows under How mine went:
// every one still coming or owed, and those paid or voided in the last
// `days` days. A voided one is left out when the same lead has a live or
// paid commission (an acceptance undone, then accepted again), and only the
// newest void shows per lead. Newest change first.
export function homeCommissions<T extends HomeCommission>(lines: readonly T[], now: number, days = 7): T[] {
  const since = now - days * DAY_MS;
  const recent = (moment: string | null) => {
    const at = moment ? Date.parse(moment) : Number.NaN;
    return !Number.isNaN(at) && at >= since;
  };
  const live = new Set(lines.filter((line) => line.status !== "void").map((line) => line.lead_id));
  const byNewest = [...lines].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  const voidShown = new Set<string>();
  return byNewest.filter((line) => {
    if (line.status === "pending") return true;
    if (line.status === "paid") return recent(line.paid_at);
    if (live.has(line.lead_id) || voidShown.has(line.lead_id) || !recent(line.updated_at)) return false;
    voidShown.add(line.lead_id);
    return true;
  });
}

// A commission's rate for Keenan's Pay: 0.05 reads "5%".
export function ratePercent(rate: number): string {
  return `${Math.round(rate * 10000) / 100}%`;
}
