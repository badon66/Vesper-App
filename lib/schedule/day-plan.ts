// Keenan's Schedule tools, worked out with no screen in them (M3.5, after
// the critique): what an evening would look like with new times, and which
// open times "the whole evening" blocks.

export type PlanBooking = { startsAt: string; endsAt: string; label: string | null };
export type PlanBlock = { startsAt: string; endsAt: string };

export type PlanRow =
  // A booking stays where it is. aligned: it starts at one of the new times.
  | { kind: "booked"; startsAt: string; label: string | null; aligned: boolean }
  | { kind: "open"; startsAt: string }
  | { kind: "blocked"; startsAt: string }
  // A new time that overlaps a booking at another time is left off the board
  // (nobody is booked into two meetings at once). because: that booking's start.
  | { kind: "left-off"; startsAt: string; because: string };

const ms = (iso: string) => Date.parse(iso);

// The evening as the board would show it after the change, in time order:
// the same rule the database's board uses. Every booking shows at its own
// time; a new time shows only when no booking overlaps it.
export function dayPlan(times: string[], minutes: number, bookings: PlanBooking[], blocks: PlanBlock[]): PlanRow[] {
  const length = minutes * 60_000;
  const starts = new Set(times.map((time) => new Date(time).toISOString()));
  const rows: PlanRow[] = bookings.map((booking) => ({
    kind: "booked",
    startsAt: booking.startsAt,
    label: booking.label,
    aligned: starts.has(new Date(booking.startsAt).toISOString()),
  }));
  for (const time of times) {
    const start = ms(time);
    const end = start + length;
    const overlapping = bookings.filter((booking) => ms(booking.startsAt) < end && ms(booking.endsAt) > start);
    if (overlapping.some((booking) => ms(booking.startsAt) === start)) continue;
    if (overlapping.length > 0) {
      rows.push({ kind: "left-off", startsAt: time, because: overlapping[0].startsAt });
    } else if (blocks.some((block) => ms(block.startsAt) < end && ms(block.endsAt) > start)) {
      rows.push({ kind: "blocked", startsAt: time });
    } else {
      rows.push({ kind: "open", startsAt: time });
    }
  }
  return rows.sort((a, b) => ms(a.startsAt) - ms(b.startsAt));
}

export type BlockRun = { startsAt: string; endsAt: string; count: number };

// The open times of an evening, joined into runs of back-to-back open times:
// what "the whole evening" blocks. Booked, held, blocked and closed times end
// a run and are never blocked, so the database never refuses it for a
// booking. Slots come in time order, as the board gives them.
export function openRuns(slots: { startsAt: string; endsAt: string; state: string }[]): BlockRun[] {
  const runs: BlockRun[] = [];
  let current: BlockRun | null = null;
  for (const slot of slots) {
    if (slot.state === "open") {
      if (current) {
        current.endsAt = slot.endsAt;
        current.count += 1;
      } else {
        current = { startsAt: slot.startsAt, endsAt: slot.endsAt, count: 1 };
      }
    } else if (current) {
      runs.push(current);
      current = null;
    }
  }
  if (current) runs.push(current);
  return runs;
}
