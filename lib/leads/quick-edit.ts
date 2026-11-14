import type { LeadStatus } from "@/lib/leads/status";
import { tabOf, type LeadTab } from "@/lib/leads/tabs";
import type { UserRole } from "@/lib/roles";

// Round 20 (Keenan, 2026-11-14): the quick edit pop-up's rules, kept apart
// from the screen so the unit tests can hold them.

export type QuickTab = LeadTab;

export const LEAD_CHANGED = "This lead changed since you opened it. Reopen it to see the latest, then make your change.";

// What moving a lead to a tab does to its status. Staying in its tab
// changes nothing (Later can still move its day). Active is New, Later is
// Follow up with a day, Met is Met, Closed is Lost with a reason. A Sold or
// Installed lead takes its status from its quote, so it stays in Closed.
export type QuickStatus =
  | { kind: "same" }
  | { kind: "follow_up" }
  | { kind: "change"; to: LeadStatus }
  | { kind: "refused"; message: string };

export function quickEditStatus(tab: QuickTab, current: LeadStatus): QuickStatus {
  if (tab === "later") return { kind: "follow_up" };
  if (tabOf(current) === tab) return { kind: "same" };
  if (current === "sold" || current === "installed") {
    return { kind: "refused", message: "This lead's status comes from its quote. Use the Outcome card on its page." };
  }
  if (tab === "active") return { kind: "change", to: "new" };
  if (tab === "met") return { kind: "change", to: "met" };
  return { kind: "change", to: "lost" };
}

// The tabs a person may pick in the pop-up: setters move their leads only
// between New, Follow up and Lost, so Met is Keenan's; a lead that's
// already Met stays where it is for a setter.
export function quickTabs(role: UserRole, current: LeadStatus): QuickTab[] {
  const all: QuickTab[] = ["active", "later", "met", "closed"];
  if (role === "owner") return all;
  const here = tabOf(current);
  if (here === "met" || current === "meeting_booked" || current === "sold" || current === "installed") return [here];
  return all.filter((tab) => tab !== "met");
}
