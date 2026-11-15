import { statusChoices, STATUS_LABELS, STATUS_ORDER, type LeadStatus } from "@/lib/leads/status";
import type { UserRole } from "@/lib/roles";
import { addDays, calgaryDateOf, formatDay } from "@/lib/time";

// Round 21 (Keenan, 2026-11-15): the lead page's At a glance panel, kept
// apart from the screen so the unit tests can hold its rules.

export type StatusOption = { value: LeadStatus; label: string; disabled: boolean };

// What sets a status that can't be picked by hand.
const SET_ELSEWHERE: Partial<Record<LeadStatus, string>> = {
  meeting_booked: "set by booking a meeting",
  sold: "set when the quote is accepted",
  installed: "set when the job is marked installed",
};

// Every status, in the usual order, for the dropdown. The ones this person
// can pick are open; the ones that come from something else (Meeting
// booked, Sold, Installed) show what sets them; Keenan's own steps show as
// his to a setter. The lead's own status is always there, selected.
export function statusOptions(role: UserRole, current: LeadStatus): StatusOption[] {
  const open = new Set(statusChoices(role, current).filter((status) => !SET_ELSEWHERE[status]));
  return STATUS_ORDER.map((status) => {
    const label = STATUS_LABELS[status];
    if (status === current) return { value: status, label, disabled: false };
    if (open.has(status)) return { value: status, label, disabled: false };
    const why = SET_ELSEWHERE[status] ?? (role === "owner" ? null : "Keenan sets this");
    return { value: status, label: why ? `${label} (${why})` : label, disabled: true };
  });
}

// Whether the dropdown can change anything at all for this person.
export function canPickStatus(options: StatusOption[], current: LeadStatus): boolean {
  return options.some((option) => !option.disabled && option.value !== current);
}

const times = (count: number) => (count === 1 ? "once" : count === 2 ? "twice" : `${count} times`);

// The customer's link: "Opened today, 3 times", "Opened yesterday, once",
// "Opened Thu, Nov 12, twice", or "Not opened yet".
export function linkOpenedLine(views: number, lastViewedAt: string | null, today: string): string {
  if (views <= 0 || !lastViewedAt) return "Not opened yet";
  const day = calgaryDateOf(lastViewedAt);
  const when = day === today ? "today" : day === addDays(today, -1) ? "yesterday" : formatDay(day);
  return `Opened ${when}, ${times(views)}`;
}

// The follow-up day, short: "Today", "Tomorrow", "Thu, Nov 19", or
// "Overdue since Thu, Nov 12".
export function followUpShort(day: string, today: string): { text: string; overdue: boolean } {
  if (day < today) return { text: `Overdue since ${formatDay(day)}`, overdue: true };
  if (day === today) return { text: "Today", overdue: false };
  if (day === addDays(today, 1)) return { text: `Tomorrow, ${formatDay(day)}`, overdue: false };
  return { text: formatDay(day), overdue: false };
}

// "3 things to finish", "1 thing to finish".
export function thingsToFinish(count: number): string {
  return `${count} ${count === 1 ? "thing" : "things"} to finish`;
}
