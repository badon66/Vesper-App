import { addDays, formatDay } from "@/lib/time";
import type { Database } from "@/types/database";

// The schedule board: every meeting time in the booking window with its
// state, as the database works it out (schedule_board). No double booking
// is a hard rule, so the screens never decide what is free themselves;
// they show what the board says and ask the database to hold or book.

// The generated type says every column is filled; a free time has no
// holder or meeting, so each column may be empty.
type GeneratedBoardRow = Database["public"]["Functions"]["schedule_board"]["Returns"][number];
export type BoardRow = { [K in keyof GeneratedBoardRow]: GeneratedBoardRow[K] | null };
export type SlotState = "open" | "held" | "booked" | "blocked" | "closed";

export type BoardSlot = {
  day: string;
  startsAt: string;
  endsAt: string;
  state: SlotState;
  holderName: string | null;
  heldByViewer: boolean;
  meetingId: string | null;
  leadId: string | null;
  neighbourhood: string | null;
  setterName: string | null;
  setterIsViewer: boolean;
};

const STATES: readonly SlotState[] = ["open", "held", "booked", "blocked", "closed"];

export function toBoardSlots(rows: BoardRow[] | null | undefined): BoardSlot[] {
  return (rows ?? []).map((row) => ({
    day: row.day ?? "",
    startsAt: new Date(row.starts_at ?? 0).toISOString(),
    endsAt: new Date(row.ends_at ?? 0).toISOString(),
    state: (STATES as readonly string[]).includes(row.state ?? "") ? (row.state as SlotState) : "closed",
    holderName: row.holder_name,
    heldByViewer: Boolean(row.held_by_viewer),
    meetingId: row.meeting_id,
    leadId: row.lead_id,
    neighbourhood: row.neighbourhood,
    setterName: row.setter_name,
    setterIsViewer: Boolean(row.setter_is_viewer),
  }));
}

// "Zane Salem" is ZS; a single name gives one letter.
export function initials(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length === 1 ? [words[0][0]] : [words[0][0], words[words.length - 1][0]];
  return letters.join("").toUpperCase();
}

// A time this person can tap to book: open, or already held by them.
export function isBookable(slot: BoardSlot): boolean {
  return slot.state === "open" || (slot.state === "held" && slot.heldByViewer);
}

export type Evening = { day: string; slots: BoardSlot[]; open: number };

// Every evening in the window, tonight first, including ones with no
// meeting times (a day off), so each stays one tap away.
export function eveningsOf(slots: BoardSlot[], today: string, windowDays: number): Evening[] {
  const days = Array.from({ length: windowDays + 1 }, (_, i) => addDays(today, i));
  return days.map((day) => {
    const daySlots = slots.filter((slot) => slot.day === day);
    return { day, slots: daySlots, open: daySlots.filter(isBookable).length };
  });
}

// Which evening the time picker opens on: tonight, or when tonight has
// nothing left, the next evening with an opening.
export function pickEvening(evenings: Evening[], today: string): { day: string; tonightFull: boolean } {
  const tonight = evenings.find((evening) => evening.day === today);
  if (tonight && tonight.open > 0) return { day: today, tonightFull: false };
  const next = evenings.find((evening) => evening.day > today && evening.open > 0);
  return { day: next?.day ?? today, tonightFull: true };
}

export function eveningLabel(day: string, today: string): string {
  if (day === today) return "Tonight";
  if (day === addDays(today, 1)) return "Tomorrow";
  return formatDay(day);
}
