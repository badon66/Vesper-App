// Plain words for what the booking functions say. The database puts a
// stable code in each error's hint.

const MESSAGES: Record<string, string> = {
  slot_taken: "That time was just taken. Here are the open times now.",
  slot_closed: "Booking for that time has closed.",
  slot_blocked: "That time is blocked.",
  too_far: "That time is past the booking window.",
  not_a_slot: "That isn't one of the meeting times.",
  not_ready: "This lead can't be booked yet.",
  wrong_status: "Only a New or Follow up lead can be booked.",
  already_booked: "This lead already has a meeting booked.",
  not_your_lead: "You can only book, move or cancel your own leads.",
  started: "This meeting has started. Keenan marks the outcome now.",
  not_live: "This booking has already changed. Refresh to see it.",
  same_time: "That's the time it already has.",
  not_started: "Outcomes open when the meeting starts.",
  reason_needed: "Pick a reason.",
  already_paid: "This booking fee has been paid, so the outcome can no longer change.",
  moved: "This booking was moved. Mark the new time instead.",
  not_allowed: "Not for your role.",
  no_host: "No one is set up to run meetings yet.",
  no_lead: "That lead was not found.",
  no_meeting: "That booking was not found.",
  bad_template: "Meetings are 15 to 180 minutes, 1 to 12 an evening, and the last one starts before midnight.",
  outside_window: "Pick an evening inside the booking window.",
  bad_block: "Pick the times to block.",
};

export type DbError = { message?: string; hint?: string | null; details?: string | null } | null | undefined;

export function errorCode(error: DbError): string {
  return error?.hint ?? "unknown";
}

// Book now, finish later (2026-11-10): what still stops a booking, by the
// code the database lists in the error's details.
const NOT_READY: Record<string, string> = {
  owns_home: "Only homeowners can be booked.",
  photos_skip_note: "Say why the photos were skipped, or leave the reason off.",
};

// The message to show. A held time names who is booking it.
export function bookingMessage(error: DbError): string {
  const code = errorCode(error);
  if (code === "slot_held") {
    const message = error?.message?.trim();
    return message ? `${message.charAt(0).toUpperCase()}${message.slice(1)}.` : "Someone else is booking this time.";
  }
  if (code === "not_ready") {
    const first = (error?.details ?? "").split(",").find((problem) => NOT_READY[problem]);
    if (first) return NOT_READY[first];
  }
  return MESSAGES[code] ?? "That didn't save. Check your signal and try again.";
}
