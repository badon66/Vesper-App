// What rules a booking out (Keenan, 2026-11-10: book now, finish later). A
// booking needs only a time and a name or an address; everything the old
// Before you book list asked for (the phone, the door questions, the soffit
// colour, the photos, the map position) can be finished after booking. The
// one answer that still rules a booking out is a No on owns the home. The
// database checks it again when booking (booking_problems); this is the same
// check, worked out for the screen. What a lead is still missing is
// lib/leads/to-finish.ts.

export type ReadinessLead = { owns_home: boolean | null };

export const PHOTO_SKIP_OPTIONS = [
  { value: "homeowner_said_no", label: "Homeowner said no" },
  { value: "other", label: "Other" },
] as const;
export type PhotoSkip = (typeof PHOTO_SKIP_OPTIONS)[number]["value"];

// The database's rule (booking_problems), with its code. Not asked yet and
// Not collected both pass: only a No rules the booking out. The database's
// one other code, photos_skip_note, never comes from the app, which sends
// Other only with its note (bookingSkip).
export function bookingProblems(lead: ReadinessLead): string[] {
  return lead.owns_home === false ? ["owns_home"] : [];
}

// The photo skip a booking sends. Other needs its note, as the meetings
// table does, so an Other with no note goes as no skip at all, and the
// photos stay on the list of what's still to finish.
export function bookingSkip(skip: PhotoSkip | null, note: string): { skip: PhotoSkip | null; note: string } {
  const text = note.trim();
  if (skip === "other" && text === "") return { skip: null, note: "" };
  return { skip, note: skip ? text : "" };
}
