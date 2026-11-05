import { streetOf } from "@/lib/push/notices";
import { addDays, calgaryDateOf, formatDay, formatTime } from "@/lib/time";

// The team's schedule on a setter's Home (Keenan, 2026-11-05): every
// meeting that evening with its time, its area and who booked it. Never a
// customer's name, phone or email: only where and when, which is what
// setters cluster by.

export type TeamMeeting = {
  id: string;
  starts_at: string;
  status: string;
  booked_by: string;
  setter_id: string | null;
  lead: { neighbourhood: string | null; address_line: string };
};

// whose: "Your booking" for the viewer's own lead (the same bookings as How
// mine went), "Your lead, booked by Keenan" when Keenan picked the time for
// it, otherwise "Booked by Zane".
export type TeamRow = { id: string; startsAt: string; area: string; whose: string; mine: boolean };

const GONE = new Set(["moved", "cancelled"]);

export function teamRows(meetings: TeamMeeting[], names: Map<string, string>, viewerId: string): TeamRow[] {
  return meetings
    .filter((meeting) => !GONE.has(meeting.status))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .map((meeting) => {
      const mine = meeting.setter_id === viewerId;
      const booker = meeting.booked_by === viewerId ? "you" : (names.get(meeting.booked_by) ?? "someone");
      return {
        id: meeting.id,
        startsAt: meeting.starts_at,
        area: meeting.lead.neighbourhood?.trim() || streetOf(meeting.lead.address_line) || "Area not set",
        whose: mine ? (meeting.booked_by === viewerId ? "Your booking" : `Your lead, booked by ${booker}`) : `Booked by ${booker}`,
        mine,
      };
    });
}

// A setter's own bookings for "How mine went": what already happened, newest
// first, then what's coming up, soonest first. Moved bookings are left out
// (their new time is its own booking). A cancelled booking is never "coming
// up": once Keenan or the setter cancels it, it leaves that list at once and
// shows under the last 7 days as Cancelled when its time has passed.
const STILL_ON = new Set(["booked", "confirmed"]);

export function splitMine<T extends { starts_at: string; status: string }>(meetings: T[], now: number): { coming: T[]; past: T[] } {
  const kept = meetings.filter((meeting) => meeting.status !== "moved");
  const coming = kept
    .filter((meeting) => STILL_ON.has(meeting.status) && new Date(meeting.starts_at).getTime() > now)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = kept.filter((meeting) => new Date(meeting.starts_at).getTime() <= now).sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  return { coming, past };
}

// When a past booking was, as the setter says it: "Tonight, 6:00 p.m.",
// "Last night, 6:00 p.m.", "Tue, Nov 3, 6:00 p.m." (the booking sheet's own
// "Tonight, 6:00 p.m." style, looking back).
export function pastTimeLabel(startsAt: string, today: string): string {
  const day = calgaryDateOf(startsAt);
  if (day === today) return `Tonight, ${formatTime(startsAt)}`;
  if (day === addDays(today, -1)) return `Last night, ${formatTime(startsAt)}`;
  return `${formatDay(day)}, ${formatTime(startsAt)}`;
}
