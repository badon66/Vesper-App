import type { Database } from "@/types/database";

// Setter pay as the app shows it. "Owed now" is pending and payable;
// "pending install" is pending commission waiting for the install (M5);
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

export function formatMoney(amount: number): string {
  return money.format(amount).replace("CA$", "$");
}

export function isOwed(line: PayLine): boolean {
  return line.status === "pending" && line.payable_at !== null;
}
