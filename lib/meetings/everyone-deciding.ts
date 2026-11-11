// Round 12 (Keenan, 2026-11-11): the meeting carries the lead's real answer
// to "everyone who decides will be there": yes, no, or not asked yet. The
// database fills meetings.everyone_deciding from the lead when a meeting is
// booked or moved, and keeps the meetings that haven't started in step when
// the lead's answer changes (book now, finish later). Booking is never
// blocked by it, and neither booking pay nor Qualified reads it. Shown where
// Keenan prepares: the prep page, the Meetings page and Home's meeting
// cards. (Until this round every booking recorded a yes.)

export type EveryoneDeciding = "yes" | "no" | "not_asked";

// The column as the database stores it; anything else counts as not asked.
export function everyoneDecidingOf(value: unknown): EveryoneDeciding {
  return value === "yes" || value === "no" ? value : "not_asked";
}

// The lead's own answer in the same words, for a lead with no meeting yet.
export function everyoneDecidingFromLead(answer: boolean | null | undefined): EveryoneDeciding {
  if (answer === true) return "yes";
  if (answer === false) return "no";
  return "not_asked";
}

export const EVERYONE_DECIDING_WORDS: Record<Exclude<EveryoneDeciding, "yes">, string> = {
  no: "Someone who decides won't be there.",
  not_asked: "Not asked yet whether everyone who decides will be there.",
};

// A plain line when it matters, and nothing when everyone will be there.
export function everyoneDecidingLine(answer: EveryoneDeciding): string | null {
  return answer === "yes" ? null : EVERYONE_DECIDING_WORDS[answer];
}
