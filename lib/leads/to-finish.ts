// Book now, finish later (Keenan, 2026-11-10). A booking needs only a time
// and a name or an address; everything the old Before you book list asked
// for can be finished later. This is that list, worked out once for the
// setter's reminder bar ("2 bookings to finish") and the lead page's To be
// completed, so both agree, and so it is unit tested. Kept pure: no
// database, no React.
//
// How things are stored:
//   - a booking made without a name saves first_name "Name to come" and
//     name_to_come = true; without an address, address_line "Address to
//     come" and address_to_come = true. The database clears each flag the
//     moment its field changes to anything else.
//   - Not collected leaves the answer's column empty and lists the question
//     in not_collected. It is not an answer, so it stays to be finished.
//   - the phone is never read here (contact privacy, 2026-11-04):
//     phone_saved says whether a number is saved.
//   - a No on wants a price or on everyone who decides is an answer, not
//     something missing. A No on owns the home rules a booking out; on a
//     lead it is an answer too.

import { NOT_COLLECTED_LABEL, QUESTION_LABELS, questionState, type CountedQuestion } from "@/lib/leads/questions";

export const NAME_TO_COME = "Name to come";
export const ADDRESS_TO_COME = "Address to come";

export type ToFinishKey =
  | "name"
  | "address"
  | "map_position"
  | "phone"
  | "owns_home"
  | "wants_price"
  | "both_decision_makers"
  | "christmas_lights_now"
  | "looked_into_before"
  | "soffit_colour"
  | "photos";

// What a booking still needs (the old Before you book list), in the order
// it's listed: who and where first, then the door questions, then the house.
export const BOOKING_ITEMS: readonly ToFinishKey[] = [
  "name",
  "address",
  "map_position",
  "phone",
  "owns_home",
  "wants_price",
  "both_decision_makers",
  "soffit_colour",
  "photos",
];

// The lead page's To be completed adds the two other counted questions,
// after the door questions, where they're asked.
export const LEAD_ITEMS: readonly ToFinishKey[] = [
  "name",
  "address",
  "map_position",
  "phone",
  "owns_home",
  "wants_price",
  "both_decision_makers",
  "christmas_lights_now",
  "looked_into_before",
  "soffit_colour",
  "photos",
];

export const TO_FINISH_LABELS: Record<ToFinishKey, string> = {
  name: "Name",
  address: "Address",
  map_position: "Map position",
  phone: "Phone number",
  owns_home: QUESTION_LABELS.owns_home,
  wants_price: QUESTION_LABELS.wants_price,
  both_decision_makers: "Everyone who decides",
  christmas_lights_now: QUESTION_LABELS.christmas_lights_now,
  looked_into_before: QUESTION_LABELS.looked_into_before,
  soffit_colour: "Soffit colour",
  photos: "Photos",
};

// The three guided photos a booking needs.
export const GUIDED_PHOTO_SLOTS = ["front", "left_corner", "right_corner"] as const;

// How many of the three guided photos a lead has, from its photos' slots.
export function guidedPhotoCount(slots: readonly (string | null)[]): number {
  return GUIDED_PHOTO_SLOTS.filter((slot) => slots.includes(slot)).length;
}

export type ToFinishLead = {
  id: string;
  name_to_come: boolean | null;
  address_to_come: boolean | null;
  lat: number | null;
  lng: number | null;
  phone_saved: boolean | null;
  owns_home: boolean | null;
  wants_price: boolean | null;
  both_decision_makers: boolean | null;
  christmas_lights_now: string | null;
  looked_into_before: string | null;
  soffit_colour: string | null;
  not_collected: string[] | null;
};

export type ToFinishPhotos = {
  // The Front, Left corner and Right corner photos the lead has (0 to 3).
  guided: number;
  // The booking says why they were skipped (Homeowner said no, or Other
  // with a note), which counts as done.
  skipped: boolean;
};

export type ToFinishItem = {
  key: ToFinishKey;
  label: string;
  // What the lead says now, in a few words: "Not collected", "1 of 3 taken".
  detail: string;
  // Straight to the field that finishes it.
  href: string;
};

// Where each item is finished: the lead's edit page, on the field itself,
// or the lead page's Photos card. A map position comes from picking the
// address from the suggestions, so it goes to the address too.
export function toFinishHref(leadId: string, key: ToFinishKey): string {
  const edit = `/app/leads/${leadId}/edit`;
  switch (key) {
    case "name":
      return `${edit}#lead-first_name`;
    case "address":
    case "map_position":
      return `${edit}#lead-address`;
    case "phone":
      return `${edit}#lead-phone`;
    case "photos":
      return `/app/leads/${leadId}#photos`;
    default:
      return `${edit}#q-${key}`;
  }
}

// The counted questions, as questionState reads them. The phone itself is
// never passed: phone_saved answers for it.
function stateOf(lead: ToFinishLead, question: CountedQuestion) {
  return questionState(
    {
      phone: null,
      phone_saved: lead.phone_saved,
      owns_home: lead.owns_home,
      wants_price: lead.wants_price,
      both_decision_makers: lead.both_decision_makers,
      christmas_lights_now: lead.christmas_lights_now,
      looked_into_before: lead.looked_into_before,
      not_collected: lead.not_collected,
    },
    question,
  );
}

// Whether one item is still missing, and what the lead says now.
function missing(lead: ToFinishLead, key: ToFinishKey, photos: ToFinishPhotos): string | null {
  switch (key) {
    case "name":
      return lead.name_to_come === true ? "Not taken yet" : null;
    case "address":
      return lead.address_to_come === true ? "Not taken yet" : null;
    case "map_position":
      // An address still to come carries its map position with it: picking
      // the address from the suggestions finishes both, so it's one item.
      if (lead.address_to_come === true) return null;
      return lead.lat === null || lead.lng === null ? "Pick the address from the suggestions" : null;
    case "soffit_colour":
      return lead.soffit_colour === null || lead.soffit_colour === "" ? "Not answered yet. Not sure is fine." : null;
    case "photos":
      if (photos.skipped) return null;
      return photos.guided >= GUIDED_PHOTO_SLOTS.length ? null : `${Math.min(photos.guided, 3)} of 3 taken`;
    default: {
      const state = stateOf(lead, key);
      if (state === "answered") return null;
      if (state === "not_collected") return NOT_COLLECTED_LABEL;
      return key === "phone" ? "No number yet" : "Not asked yet";
    }
  }
}

// What a lead or a booking still needs, in order. "booking" is the old
// Before you book list, for the reminder bar; "lead" adds Christmas lights
// now and Looked into it before, for the lead page.
export function toFinish(lead: ToFinishLead, photos: ToFinishPhotos, scope: "booking" | "lead"): ToFinishItem[] {
  const keys = scope === "booking" ? BOOKING_ITEMS : LEAD_ITEMS;
  return keys.flatMap((key) => {
    const detail = missing(lead, key, photos);
    return detail === null ? [] : [{ key, label: TO_FINISH_LABELS[key], detail, href: toFinishHref(lead.id, key) }];
  });
}

// "To be completed (4)", the lead page's dropdown.
export function toBeCompletedLabel(count: number): string {
  return `To be completed (${count})`;
}

// "1 booking to finish", "2 bookings to finish": the reminder bar.
export function bookingsToFinishLabel(count: number): string {
  return `${count} ${count === 1 ? "booking" : "bookings"} to finish`;
}

// A setter's own lead: one they made or one assigned to them.
export function isOwnLead(lead: { created_by: string; assigned_to: string | null }, personId: string): boolean {
  return lead.created_by === personId || lead.assigned_to === personId;
}

// The bookings the reminder bar counts: still on (booked or confirmed) and
// not started yet.
export function isUpcomingBooking(meeting: { status: string; starts_at: string }, now: number): boolean {
  return (meeting.status === "booked" || meeting.status === "confirmed") && Date.parse(meeting.starts_at) > now;
}
