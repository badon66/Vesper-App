import { addDays } from "@/lib/time";

// Round 23 (Keenan, 2026-11-17): install days the customer picks from
// Keenan's calendar. The pure parts, kept apart from the screens so unit
// tests hold them: Keenan's month view (Installs), and the open days a
// customer picks from (the meeting's What happens next and their link).
// The database is the gate (a day must be open and can never go over its
// limit); these only lay the days out and say how full they are.

export type InstallDayRow = { day: string; open: boolean; job_limit: number | null };
export type BookedJob = { id: string; name: string; day: string };

export type InstallDayView = {
  day: string;
  open: boolean;
  // How many jobs the day takes while open (its own number, else Settings').
  limit: number;
  // Its own number, set on this day (null: the default from Settings).
  ownLimit: number | null;
  booked: BookedJob[];
  // Spots left while open, never below 0.
  left: number;
  past: boolean;
};

const WEEK = 7;
const isDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
const isMonth = (value: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const weekdayOf = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();

// "2026-12", from a day or a month param; anything else is today's month.
export function monthOf(value: string | null | undefined, today: string): string {
  if (value && isMonth(value)) return value;
  if (value && isDay(value)) return value.slice(0, 7);
  return today.slice(0, 7);
}

export function shiftMonth(month: string, by: number): string {
  const [year, at] = month.split("-").map(Number);
  const moved = new Date(Date.UTC(year, at - 1 + by, 1));
  return moved.toISOString().slice(0, 7);
}

const monthName = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", month: "long", year: "numeric" });
export const monthLabel = (month: string) => monthName.format(new Date(`${month}-01T12:00:00Z`));

// The month as weeks, Sunday first; days outside the month are null.
export function monthWeeks(month: string): (string | null)[][] {
  const first = `${month}-01`;
  const days: string[] = [];
  for (let day = first; day.startsWith(month); day = addDays(day, 1)) days.push(day);
  const cells: (string | null)[] = [...Array.from({ length: weekdayOf(first) }, () => null), ...days];
  while (cells.length % WEEK !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let at = 0; at < cells.length; at += WEEK) weeks.push(cells.slice(at, at + WEEK));
  return weeks;
}

// Every day of the month with its state, from Keenan's rows and the jobs
// booked on it.
export function monthDays(
  month: string,
  rows: InstallDayRow[],
  booked: BookedJob[],
  defaultLimit: number,
  today: string,
): Map<string, InstallDayView> {
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const views = new Map<string, InstallDayView>();
  for (const week of monthWeeks(month)) {
    for (const day of week) {
      if (!day) continue;
      const row = byDay.get(day);
      const open = row?.open === true;
      const ownLimit = row?.job_limit ?? null;
      const limit = ownLimit ?? defaultLimit;
      const jobs = booked.filter((job) => job.day === day).sort((a, b) => a.name.localeCompare(b.name));
      views.set(day, {
        day,
        open,
        limit,
        ownLimit,
        booked: jobs,
        left: open ? Math.max(0, limit - jobs.length) : 0,
        past: day < today,
      });
    }
  }
  return views;
}

const spots = (count: number) => `${count} ${count === 1 ? "spot" : "spots"} left`;
const jobs = (count: number) => `${count} ${count === 1 ? "job" : "jobs"}`;

// The short line under a day on Keenan's calendar.
export function dayLine(view: InstallDayView): string {
  if (!view.open) return view.booked.length > 0 ? `Closed, ${jobs(view.booked.length)} booked` : "Closed";
  if (view.left === 0) return "Full";
  return spots(view.left);
}

// The sentence in the day's panel.
export function daySummary(view: InstallDayView): string {
  if (!view.open) {
    return view.booked.length > 0
      ? `Closed for installs, with ${jobs(view.booked.length)} still booked on it.`
      : "Closed for installs.";
  }
  const takes = `Open for ${jobs(view.limit)}`;
  if (view.left === 0) return `${takes}. Full.`;
  return `${takes}. ${spots(view.left)}.`;
}

// ---------------------------------------------------------------- what the customer picks from

export type PickDay = { day: string; full: boolean };
export type PickCell = { day: string; kind: "open" | "full" | "closed" } | null;

// The open days laid out as a calendar, Sunday first, from the week of the
// first open day to the week of the last. Days in between that aren't open
// show as closed (shaded, no button); full ones say Full. A day already
// theirs counts as open to them.
export function pickWeeks(days: PickDay[], chosen: string | null = null): PickCell[][] {
  const open = new Map(days.filter((day) => isDay(day.day)).map((day) => [day.day, day.full && day.day !== chosen]));
  if (chosen && isDay(chosen) && !open.has(chosen)) open.set(chosen, false);
  const sorted = [...open.keys()].sort();
  if (sorted.length === 0) return [];
  const start = addDays(sorted[0], -weekdayOf(sorted[0]));
  const last = sorted[sorted.length - 1];
  const end = addDays(last, WEEK - 1 - weekdayOf(last));
  const weeks: PickCell[][] = [];
  let week: PickCell[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) {
    const full = open.get(day);
    week.push(full === undefined ? { day, kind: "closed" } : { day, kind: full ? "full" : "open" });
    if (week.length === WEEK) {
      weeks.push(week);
      week = [];
    }
  }
  return weeks;
}

// Whether a day can still be picked: open, not full, and on or after the
// earliest day.
export function canPick(days: PickDay[], day: string, earliest: string): boolean {
  if (!isDay(day) || day < earliest) return false;
  const found = days.find((one) => one.day === day);
  return Boolean(found && !found.full);
}

// The open days a customer may pick from, for a lead, from Keenan's rows
// and the jobs booked (leaving the lead's own day out of the count): the
// same list the link's database function makes, for the meeting, which
// reads with Keenan's session and keeps a copy on the iPad.
export function pickDays(rows: InstallDayRow[], booked: BookedJob[], defaultLimit: number, earliest: string, leadId: string | null, span = 63): PickDay[] {
  const last = addDays(earliest, span - 1);
  return rows
    .filter((row) => row.open && row.day >= earliest && row.day <= last)
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((row) => {
      const taken = booked.filter((job) => job.day === row.day && job.id !== leadId).length;
      return { day: row.day, full: taken >= (row.job_limit ?? defaultLimit) };
    });
}

export type TrackKind = "white" | "colour";

// The earliest day a customer can pick: white track 3 days out, any other
// colour (or none yet) 7, both from Settings. The same rule as the database
// (private.install_earliest).
export function earliestDay(today: string, kind: TrackKind, leadDays: { white: number; colour: number }): string {
  return addDays(today, kind === "white" ? leadDays.white : leadDays.colour);
}

// The last day a customer can still change their day on the link: 2 days
// before it. After that, they call or text Keenan.
export const CHANGE_DAYS_BEFORE = 2;
export function changeUntil(day: string): string {
  return addDays(day, -CHANGE_DAYS_BEFORE);
}
export function canChange(day: string | null, today: string): boolean {
  return day === null || today <= changeUntil(day);
}
