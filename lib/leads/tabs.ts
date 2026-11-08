import type { UserRole } from "@/lib/roles";
import type { LeadStatus } from "@/lib/leads/status";
import { calgaryDateOf, formatDay } from "@/lib/time";

// The Leads list's filters (Keenan, round 6, 2026-11-08): one compact row
// of four status tabs, and a small menu for whose leads.

export type LeadTab = "active" | "later" | "met" | "closed";

export const LEAD_TABS: readonly { value: LeadTab; label: string; statuses: readonly LeadStatus[] }[] = [
  // Not met yet.
  { value: "active", label: "Active", statuses: ["new", "meeting_booked"] },
  { value: "later", label: "Later", statuses: ["follow_up"] },
  // Met and waiting on their decision.
  { value: "met", label: "Met", statuses: ["met", "quoted"] },
  { value: "closed", label: "Closed", statuses: ["sold", "installed", "lost"] },
];

export const DEFAULT_TAB: LeadTab = "active";

export function parseTab(raw: unknown): LeadTab {
  return LEAD_TABS.find((tab) => tab.value === raw)?.value ?? DEFAULT_TAB;
}

export function tabStatuses(tab: LeadTab): readonly LeadStatus[] {
  return LEAD_TABS.find((entry) => entry.value === tab)?.statuses ?? [];
}

export function tabOf(status: LeadStatus): LeadTab {
  return LEAD_TABS.find((tab) => tab.statuses.includes(status))?.value ?? DEFAULT_TAB;
}

// Whose leads. Keenan opens on Everyone; Mine is the leads he adds himself
// (phone calls, referrals) and Setters the ones setters added. A setter
// opens on their own leads, with Everyone one tap away.
export type LeadWho = "everyone" | "setters" | "mine";

const OWNER_WHO: readonly { value: LeadWho; label: string }[] = [
  { value: "everyone", label: "Everyone" },
  { value: "setters", label: "Setters" },
  { value: "mine", label: "Mine" },
];

const SETTER_WHO: readonly { value: LeadWho; label: string }[] = [
  { value: "mine", label: "Mine" },
  { value: "everyone", label: "Everyone" },
];

export function whoOptions(role: UserRole): readonly { value: LeadWho; label: string }[] {
  return role === "owner" ? OWNER_WHO : SETTER_WHO;
}

export function defaultWho(role: UserRole): LeadWho {
  return whoOptions(role)[0].value;
}

// `who` from the address, for this role. Links from before round 6 carried
// scope=mine|everyone, which still lands in the same place.
export function parseWho(role: UserRole, params: { who?: unknown; scope?: unknown }): LeadWho {
  const options = whoOptions(role);
  const picked = options.find((option) => option.value === params.who);
  if (picked) return picked.value;
  if (params.scope === "everyone" || params.scope === "mine") return params.scope;
  return defaultWho(role);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The PostgREST "or" filter for whose leads, or null for everyone's. It is
// worked out from the person the screen is for (the viewed person under
// View as), never from RLS alone.
export function whoFilter(role: UserRole, who: LeadWho, userId: string): string | null {
  if (who === "everyone") return null;
  if (!UUID.test(userId)) throw new Error("Not a person id.");
  if (role === "owner") {
    return who === "mine" ? `created_by.eq.${userId}` : `created_by.neq.${userId}`;
  }
  // A setter's own leads: the ones they added or that are assigned to them.
  // A setter has no Setters choice; it reads as their own.
  return `created_by.eq.${userId},assigned_to.eq.${userId}`;
}

// How a lead in Met or Closed turned out, in a few words. Never a price:
// setters read this list, and quotes are not read here at all.
export type OutcomeLead = {
  status: LeadStatus;
  sold_at: string | null;
  installed_at: string | null;
  lost_reason: string | null;
};

const dayOf = (iso: string) => formatDay(calgaryDateOf(iso));

// metAt is the start of the lead's latest held meeting, when there is one.
export function outcomeLine(lead: OutcomeLead, metAt?: string | null): string | null {
  switch (lead.status) {
    case "met":
      return metAt ? `Met ${dayOf(metAt)}` : "Met";
    case "quoted":
      return "Quoted";
    case "sold":
      return lead.sold_at ? `Sold ${dayOf(lead.sold_at)}` : "Sold";
    case "installed":
      return lead.installed_at ? `Installed ${dayOf(lead.installed_at)}` : "Installed";
    case "lost": {
      const reason = lead.lost_reason?.trim();
      return reason ? `Lost: ${reason}` : "Lost";
    }
    default:
      return null;
  }
}

// The moment a Met or Closed lead got where it is, for "newest first": the
// meeting, the sale, the install or the loss, else when it was added.
export function outcomeAt(
  lead: OutcomeLead & { id: string; created_at: string; lost_at: string | null },
  metAt: Map<string, string> = new Map(),
): string {
  switch (lead.status) {
    case "met":
      return metAt.get(lead.id) ?? lead.created_at;
    case "sold":
      return lead.sold_at ?? lead.created_at;
    case "installed":
      return lead.installed_at ?? lead.created_at;
    case "lost":
      return lead.lost_at ?? lead.created_at;
    default:
      return lead.created_at;
  }
}

// Met and Closed: grouped by status in status order, newest outcome first.
export function groupByOutcome<T extends OutcomeLead & { id: string; created_at: string; lost_at: string | null }>(
  leads: T[],
  tab: LeadTab,
  metAt: Map<string, string> = new Map(),
): { status: LeadStatus; leads: T[] }[] {
  return tabStatuses(tab)
    .map((status) => ({
      status,
      leads: leads
        .filter((lead) => lead.status === status)
        .map((lead) => ({ lead, at: new Date(outcomeAt(lead, metAt)).getTime() }))
        .sort((a, b) => b.at - a.at || b.lead.created_at.localeCompare(a.lead.created_at))
        .map(({ lead }) => lead),
    }))
    .filter((group) => group.leads.length > 0);
}

// The latest held meeting per lead, from meetings rows in any order.
export function latestMeetingByLead(rows: { lead_id: string; starts_at: string }[]): Map<string, string> {
  const latest = new Map<string, string>();
  for (const row of rows) {
    const at = new Date(row.starts_at).toISOString();
    const seen = latest.get(row.lead_id);
    if (!seen || at > seen) latest.set(row.lead_id, at);
  }
  return latest;
}

// The address for a tab and who, keeping only what differs from the
// defaults so links stay short.
export function leadsHref(role: UserRole, next: { tab: LeadTab; who: LeadWho; q?: string }): string {
  const params = new URLSearchParams();
  if (next.tab !== DEFAULT_TAB) params.set("tab", next.tab);
  if (next.who !== defaultWho(role)) params.set("who", next.who);
  if (next.q) params.set("q", next.q);
  const query = params.toString();
  return query ? `/app/leads?${query}` : "/app/leads";
}
