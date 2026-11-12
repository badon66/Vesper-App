// Changing a quote after a yes (round 18, Keenan, 2026-11-12), kept pure.
// An accepted quote stays editable by Keenan on the lead page. A save
// updates the quote and the customer's link at once, and the link shows
// "Updated by Keenan on [date]" at the top of the price with what changed
// under it, so the customer is never surprised: worked out here from the
// option they said yes to, before and after, line by line (each area on its
// own, never a track's sum), in plain words with no dash. The lead's
// timeline records each change with the old and new totals, on Keenan's
// side only (quote_revisions is owner only: totals never go where setters
// read). The signed agreement keeps its own copy and never changes.

import { flatLines, formatMoney, type QuoteLine, type QuoteTotals } from "@/lib/pricing";

export const REVISION_CHANGES_MAX = 12;

const money = (amount: number) => (amount < 0 ? `minus ${formatMoney(-amount)}` : formatMoney(amount));
const cents = (amount: number) => Math.round(amount * 100);

// Lines by label, a second line with the same label kept apart ("Extra
// work", "Extra work 2"), in the breakdown's order.
function keyed(lines: readonly QuoteLine[]): { key: string; line: QuoteLine }[] {
  const seen = new Map<string, number>();
  return lines.map((line) => {
    const label = line.label.trim();
    const count = (seen.get(label) ?? 0) + 1;
    seen.set(label, count);
    return { key: count > 1 ? `${label} ${count}` : label, line };
  });
}

// What changed between the option as it was and as it is, in the customer's
// words: "Added: Extra outlet, $150", "Removed: Back lower, $1,200", "Front
// lower: $1,536 to $1,680 (70 ft)", "Front lower is now Street side lower".
// At most twelve; empty when nothing a customer reads changed.
export function revisionChanges(before: QuoteTotals | null, after: QuoteTotals | null): string[] {
  const was = keyed(before ? flatLines(before.lines) : []);
  const now = keyed(after ? flatLines(after.lines) : []);
  const wasByKey = new Map(was.map((item) => [item.key, item.line]));
  const nowByKey = new Map(now.map((item) => [item.key, item.line]));
  const removed = was.filter((item) => !nowByKey.has(item.key));
  const added = now.filter((item) => !wasByKey.has(item.key));
  const out: string[] = [];

  // An area renamed at the same feet and price reads as a rename, not as
  // one line gone and another added. Lines with no feet (an extra charge)
  // never pair up: a new charge at the same price is a new charge.
  const renamed = new Set<string>();
  const taken = new Set<string>();
  for (const gone of removed) {
    const match = gone.line.detail
      ? added.find((item) => !taken.has(item.key) && cents(item.line.amount) === cents(gone.line.amount) && item.line.detail === gone.line.detail)
      : undefined;
    if (!match) continue;
    renamed.add(gone.key);
    taken.add(match.key);
    out.push(`${gone.line.label.trim()} is now ${match.line.label.trim()}`);
  }

  for (const { key, line } of now) {
    const old = wasByKey.get(key);
    if (!old) continue;
    if (cents(old.amount) !== cents(line.amount)) {
      out.push(`${line.label.trim()}: ${money(old.amount)} to ${money(line.amount)}${line.detail && line.detail !== old.detail ? ` (${line.detail})` : ""}`);
    } else if ((line.detail ?? "") !== (old.detail ?? "") && line.detail) {
      out.push(`${line.label.trim()}: ${line.detail}`);
    }
  }
  for (const { key, line } of added) {
    if (taken.has(key)) continue;
    out.push(`Added: ${line.label.trim()}, ${money(line.amount)}`);
  }
  for (const { key, line } of removed) {
    if (renamed.has(key)) continue;
    out.push(`Removed: ${line.label.trim()}, ${money(line.amount)}`);
  }
  return out.slice(0, REVISION_CHANGES_MAX);
}

// "Updated by Keenan on November 14" with the changes since they said yes.
export type QuoteRevision = { at: string; changes: string[] };

// The timeline's line, on Keenan's side: "Quote changed after the yes:
// $4,959 to $5,109. Added: Extra outlet, $150."
export function revisionTimelineLine(totalBefore: number, totalAfter: number, changes: readonly string[]): string {
  const totals = cents(totalBefore) === cents(totalAfter) ? `still ${formatMoney(totalAfter)}` : `${formatMoney(totalBefore)} to ${formatMoney(totalAfter)}`;
  const list = changes.length > 0 ? ` ${changes.join(". ")}.` : "";
  return `Quote changed after the yes: ${totals}.${list}`;
}
