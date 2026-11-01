// Every time in the app is shown in Calgary time, whatever the device says.
//
// Alberta stopped changing its clocks on November 1, 2026 at 2:00 am: from
// then on it stays on UTC-6 all year ("Alberta Time"; law since 2026-06-18,
// time zone data 2026c). Phones and servers with older time zone data still
// fall back to UTC-7, which would show every later time an hour early. So
// moments from the change on use a fixed UTC-6 zone, and earlier moments the
// America/Edmonton rules, which every version of the data agrees on. The
// database (Postgres with 2026c) works out the same times.
export const APP_TIME_ZONE = "America/Edmonton";
export const ALBERTA_TIME_FROM = Date.UTC(2026, 10, 1, 8, 0, 0);
const ALBERTA_TIME_ZONE = "Etc/GMT+6";

// Two formatters for each format: one for each side of the change.
function zoned(options: Intl.DateTimeFormatOptions, locale = "en-CA") {
  const before = new Intl.DateTimeFormat(locale, { ...options, timeZone: APP_TIME_ZONE });
  const after = new Intl.DateTimeFormat(locale, { ...options, timeZone: ALBERTA_TIME_ZONE });
  return (moment: Date) => (moment.getTime() >= ALBERTA_TIME_FROM ? after : before);
}

const dateTime = zoned({ month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const time = zoned({ hour: "numeric", minute: "2-digit" });
const date = zoned({ month: "short", day: "numeric", year: "numeric" });
const calendarDay = zoned({ year: "numeric", month: "2-digit", day: "2-digit" });
const offsetName = zoned({ timeZoneName: "shortOffset" }, "en-US");

const at = (iso: string) => new Date(iso);
export const formatDateTime = (iso: string) => dateTime(at(iso)).format(at(iso));
export const formatTime = (iso: string) => time(at(iso)).format(at(iso));
export const formatDate = (iso: string) => date(at(iso)).format(at(iso));

// The calendar date in Calgary as YYYY-MM-DD, the form a Postgres `date`
// column uses.
export function calgaryToday(now: Date = new Date()): string {
  return calendarDay(now).format(now);
}

// The Calgary date a moment falls on.
export function calgaryDateOf(iso: string): string {
  return calgaryToday(at(iso));
}

// Adds whole days to a YYYY-MM-DD date. It works on the calendar date alone,
// so a clock change cannot move it.
export function addDays(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

// Calgary's offset from UTC, in minutes, at a moment.
function offsetMinutesAt(moment: Date): number {
  const name =
    offsetName(moment)
      .formatToParts(moment)
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  return match ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0)) : 0;
}

// The moment a Calgary wall time happens, as an ISO timestamp. Times at the
// meeting hours are never ambiguous: the old clock changes happened at 2 am.
export function calgaryInstant(day: string, hhmm: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const [hour, minute] = hhmm.split(":").map(Number);
  const wall = Date.UTC(year, month - 1, date, hour, minute);
  let guess = wall + 6 * 60 * 60_000;
  for (let pass = 0; pass < 2; pass += 1) {
    const offset = offsetMinutesAt(new Date(guess));
    guess = wall - offset * 60_000;
  }
  return new Date(guess).toISOString();
}

// The moment a Calgary day starts, for "today" queries.
export function calgaryDayStart(day: string): string {
  return calgaryInstant(day, "00:00");
}

const weekdayDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
});
const longDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "UTC",
  weekday: "long",
  month: "long",
  day: "numeric",
});

// A YYYY-MM-DD date as "Thu, Oct 30" or "Thursday, October 30". The date has
// no time of day, so it is formatted as is, with no time zone shift.
export const formatDay = (day: string) => weekdayDate.format(new Date(`${day}T12:00:00Z`));
export const formatLongDay = (day: string) => longDay.format(new Date(`${day}T12:00:00Z`));
