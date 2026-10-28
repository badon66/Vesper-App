import { addDays, formatDay, formatLongDay } from "@/lib/time";
import type { LeadStatus } from "@/lib/leads/status";

// The Active list on Leads: New, Follow up and Meeting booked, ordered by
// what needs attention first (Keenan, 2026-10-28):
//   1. follow-ups due today or overdue, oldest date first
//   2. new leads, oldest first
//   3. follow-ups for later days, soonest first
//   4. booked meetings, soonest first (by meeting time from M3; until then,
//      oldest lead first)

export const ACTIVE_STATUSES = ["new", "follow_up", "meeting_booked"] as const satisfies readonly LeadStatus[];

export type AttentionLead = {
  status: LeadStatus;
  follow_up_on: string | null;
  created_at: string;
};

export type AttentionGroupKey = "due" | "new" | "later" | "booked";

export type AttentionGroup<T> = { key: AttentionGroupKey; title: string; leads: T[] };

const TITLES: Record<AttentionGroupKey, string> = {
  due: "Follow-ups due",
  new: "New",
  later: "Follow up later",
  booked: "Meeting booked",
};

const byCreated = (a: AttentionLead, b: AttentionLead) => a.created_at.localeCompare(b.created_at);
const byFollowUp = (a: AttentionLead, b: AttentionLead) =>
  (a.follow_up_on ?? "").localeCompare(b.follow_up_on ?? "") || byCreated(a, b);

// A follow-up without a date cannot exist (the database requires one), but
// if one did it would count as due.
export function isDue(lead: AttentionLead, today: string): boolean {
  return lead.status === "follow_up" && (lead.follow_up_on === null || lead.follow_up_on <= today);
}

export function groupByAttention<T extends AttentionLead>(leads: T[], today: string): AttentionGroup<T>[] {
  const groups: Record<AttentionGroupKey, T[]> = { due: [], new: [], later: [], booked: [] };
  for (const lead of leads) {
    if (lead.status === "follow_up") groups[isDue(lead, today) ? "due" : "later"].push(lead);
    else if (lead.status === "new") groups.new.push(lead);
    else if (lead.status === "meeting_booked") groups.booked.push(lead);
  }
  groups.due.sort(byFollowUp);
  groups.new.sort(byCreated);
  groups.later.sort(byFollowUp);
  groups.booked.sort(byCreated);
  return (Object.keys(groups) as AttentionGroupKey[])
    .filter((key) => groups[key].length > 0)
    .map((key) => ({ key, title: TITLES[key], leads: groups[key] }));
}

// "Due today", "Overdue since Mon, Oct 26", "Due tomorrow" or "Due Fri, Oct 30".
export function followUpLabel(day: string, today: string): string {
  if (day === today) return "Due today";
  if (day < today) return `Overdue since ${formatDay(day)}`;
  if (day === addDays(today, 1)) return "Due tomorrow";
  return `Due ${formatDay(day)}`;
}

// One plain sentence for the lead page.
export function followUpSentence(day: string, today: string): string {
  if (day === today) return "Follow up today.";
  if (day < today) return `Follow-up overdue since ${formatLongDay(day)}.`;
  if (day === addDays(today, 1)) return `Follow up tomorrow, ${formatLongDay(day)}.`;
  return `Follow up on ${formatLongDay(day)}.`;
}

// The quick choices offered when a lead moves to Follow up. The server works
// the date out from the choice in Calgary time, so a phone with the wrong
// clock cannot set the wrong day.
export const FOLLOW_UP_CHOICES = [
  { value: "tomorrow", label: "Tomorrow", days: 1 },
  { value: "three_days", label: "In 3 days", days: 3 },
  { value: "next_week", label: "Next week", days: 7 },
] as const;

export type FollowUpChoice = (typeof FOLLOW_UP_CHOICES)[number]["value"] | "date" | "keep";

// The furthest ahead a follow-up can be set.
export const FOLLOW_UP_MAX_DAYS = 365;

export function followUpDateFor(
  choice: string,
  pickedDate: string | null,
  today: string,
): { ok: true; date: string } | { ok: false; error: string } {
  const quick = FOLLOW_UP_CHOICES.find((option) => option.value === choice);
  if (quick) return { ok: true, date: addDays(today, quick.days) };
  if (choice !== "date") return { ok: false, error: "Pick when to follow up." };
  if (!pickedDate || !/^\d{4}-\d{2}-\d{2}$/.test(pickedDate) || Number.isNaN(Date.parse(`${pickedDate}T12:00:00Z`))) {
    return { ok: false, error: "Pick the day to follow up." };
  }
  if (addDays(pickedDate, 0) !== pickedDate) return { ok: false, error: "Pick the day to follow up." };
  if (pickedDate < today) return { ok: false, error: "Pick today or a later day." };
  if (pickedDate > addDays(today, FOLLOW_UP_MAX_DAYS)) return { ok: false, error: "Pick a day within the next year." };
  return { ok: true, date: pickedDate };
}
