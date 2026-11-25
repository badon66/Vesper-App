import { z } from "zod";
import type { PickDay } from "@/lib/installs/calendar";

// Round 23 (Keenan, 2026-11-17): Pick your install day on the customer's
// link. What quote_link_install(token) returns, checked, and the words the
// section says. Customer-facing: plain words, no dashes, nothing promised
// that the business can't keep.

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export type LinkInstall = {
  // Shown once they've booked an option (or signed), a day is already
  // theirs, or the quote is accepted.
  ready: boolean;
  day: string | null;
  today: string;
  earliest: string;
  kind: "white" | "colour";
  canChange: boolean;
  // The open days from the earliest, nine weeks out, with which are full.
  days: PickDay[];
};

const schema = z.object({
  state: z.literal("live"),
  ready: z.boolean().catch(false),
  day: isoDay.nullable().catch(null),
  today: isoDay,
  earliest: isoDay,
  kind: z.enum(["white", "colour"]).catch("colour"),
  can_change: z.boolean().catch(false),
  days: z.array(z.object({ day: isoDay, full: z.boolean() })).catch([]),
});

export function parseLinkInstall(data: unknown): LinkInstall | null {
  const parsed = schema.safeParse(data);
  if (!parsed.success) return null;
  const v = parsed.data;
  return { ready: v.ready, day: v.day, today: v.today, earliest: v.earliest, kind: v.kind, canChange: v.can_change, days: v.days };
}

export const INSTALL_WORDS = {
  pick: "Pick your install day",
  yours: "Your install day",
  // Keenan's own words (2026-11-17).
  note: "We'll confirm your day with you a few days before. If the weather won't allow it, we'll move you to the next good day.",
  none: "Keenan hasn't opened install days yet. He'll be in touch to set your day.",
  change: "Change your day",
  keep: "Keep this day",
  tooLate: "It's close to your install day, so to change it, call or text Keenan.",
  full: "Someone just took that day. Pick another one.",
  closed: "That day isn't open any more. Pick another one.",
  failed: "That didn't go through. Check your signal and try again, or call or text us.",
  preview: "Preview only. You're signed in to Vesper on this device, so nothing was saved.",
} as const;

// "The first day you can pick is Tuesday, December 1, so there's time to
// get your track ready." White and colour-matched track differ in how long.
export function earliestLine(day: string, longDay: (day: string) => string): string {
  return `The first day you can pick is ${longDay(day)}, so there's time to get your track ready.`;
}

export function pickButtonLabel(day: string | null, current: string | null, shortDay: (day: string) => string): string {
  if (!day) return "Pick a day above";
  return current ? `Move to ${shortDay(day)}` : `Book ${shortDay(day)}`;
}
