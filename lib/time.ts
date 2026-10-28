// Every time in the app is shown in Calgary time, whatever the device says.
export const APP_TIME_ZONE = "America/Edmonton";

const dateTime = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const time = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
});
const date = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
});

export const formatDateTime = (iso: string) => dateTime.format(new Date(iso));
export const formatTime = (iso: string) => time.format(new Date(iso));
export const formatDate = (iso: string) => date.format(new Date(iso));

const calendarDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const offsetName = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  timeZoneName: "shortOffset",
});

// The calendar date in Calgary as YYYY-MM-DD, the form a Postgres `date`
// column uses.
export function calgaryToday(now: Date = new Date()): string {
  return calendarDay.format(now);
}

// Adds whole days to a YYYY-MM-DD date. It works on the calendar date alone,
// so a daylight saving change cannot move it.
export function addDays(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}

// The moment a Calgary day starts, as an ISO timestamp, for "today" queries.
// Calgary's midnight is 06:00 or 07:00 UTC; the offset is read at 06:30 UTC,
// which is before the 2 am daylight saving switch on either side.
export function calgaryDayStart(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, date, 6, 30));
  const name = offsetName.formatToParts(probe).find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  const offsetMinutes = match ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0)) : 0;
  return new Date(Date.UTC(year, month - 1, date) - offsetMinutes * 60_000).toISOString();
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
