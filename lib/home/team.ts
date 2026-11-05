import { streetOf } from "@/lib/push/notices";

// The team's schedule on a setter's Home (Keenan, 2026-11-05): every
// meeting that evening with its time, its area and who booked it. Never a
// customer's name, phone or email: only where and when, which is what
// setters cluster by.

export type TeamMeeting = {
  id: string;
  starts_at: string;
  status: string;
  booked_by: string;
  lead: { neighbourhood: string | null; address_line: string };
};

export type TeamRow = { id: string; startsAt: string; area: string; bookedBy: string; mine: boolean };

const GONE = new Set(["moved", "cancelled"]);

export function teamRows(meetings: TeamMeeting[], names: Map<string, string>, viewerId: string): TeamRow[] {
  return meetings
    .filter((meeting) => !GONE.has(meeting.status))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .map((meeting) => ({
      id: meeting.id,
      startsAt: meeting.starts_at,
      area: meeting.lead.neighbourhood?.trim() || streetOf(meeting.lead.address_line) || "Area not set",
      bookedBy: meeting.booked_by === viewerId ? "You" : (names.get(meeting.booked_by) ?? "Someone"),
      mine: meeting.booked_by === viewerId,
    }));
}

// A setter's own bookings for "How mine went": what's coming up, soonest
// first, then what already happened, newest first. Moved bookings are left
// out (their new time is its own booking).
export function splitMine<T extends { starts_at: string; status: string }>(meetings: T[], now: number): { coming: T[]; past: T[] } {
  const kept = meetings.filter((meeting) => meeting.status !== "moved");
  const coming = kept.filter((meeting) => new Date(meeting.starts_at).getTime() > now).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = kept.filter((meeting) => new Date(meeting.starts_at).getTime() <= now).sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  return { coming, past };
}
