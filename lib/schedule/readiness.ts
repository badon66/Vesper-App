// Before you book (Keenan, 2026-10-31 and 2026-11-01). The database checks
// all of it again when booking (booking_problems); this is the same list,
// worked out for the screen so each missing item can be shown with a way to
// fix it.

export type ReadinessLead = {
  phone: string | null;
  owns_home: boolean | null;
  wants_price: boolean | null;
  soffit_colour: string | null;
  lat: number | null;
  lng: number | null;
};

export type ReadinessKey =
  | "phone"
  | "owns_home"
  | "wants_price"
  | "soffit_colour"
  | "photos"
  | "map_position"
  | "everyone_deciding_present";

export type ReadinessItem = { key: ReadinessKey; label: string; ok: boolean; fix: string };

export const PHOTO_SKIP_OPTIONS = [
  { value: "homeowner_said_no", label: "Homeowner said no" },
  { value: "other", label: "Other" },
] as const;
export type PhotoSkip = (typeof PHOTO_SKIP_OPTIONS)[number]["value"];

// What the lead itself needs. guidedPhotos counts the Front, Left corner and
// Right corner photos it has.
export function leadReadiness(lead: ReadinessLead, guidedPhotos: number): ReadinessItem[] {
  return [
    { key: "phone", label: "Phone number saved", ok: lead.phone !== null, fix: "Add the phone number." },
    { key: "owns_home", label: "Owns the home: Yes", ok: lead.owns_home === true, fix: "They must own the home." },
    { key: "wants_price", label: "Wants a price: Yes", ok: lead.wants_price === true, fix: "They must want a price." },
    {
      key: "soffit_colour",
      label: "Soffit colour answered",
      ok: lead.soffit_colour !== null,
      fix: "Answer the soffit colour. Not sure is fine.",
    },
    {
      key: "photos",
      label: "Front, Left corner and Right corner photos",
      ok: guidedPhotos >= 3,
      fix: "Take them, or say why they were skipped.",
    },
    {
      key: "map_position",
      label: "Map position",
      ok: lead.lat !== null && lead.lng !== null,
      fix: "Pick the address from the suggestions, or use where you're standing at the door.",
    },
  ];
}

export type BookingChoices = { everyone: boolean; skip: PhotoSkip | null; skipNote: string };

// The same codes the database uses (booking_problems), in the same order.
export function bookingProblems(lead: ReadinessLead, guidedPhotos: number, choices: BookingChoices): string[] {
  const problems = leadReadiness(lead, guidedPhotos)
    .filter((item) => !item.ok && item.key !== "photos")
    .map((item) => item.key as string);
  if (guidedPhotos < 3) {
    if (!choices.skip) problems.push("photos");
    else if (choices.skip === "other" && choices.skipNote.trim() === "") problems.push("photos_skip_note");
  }
  if (!choices.everyone) problems.push("everyone_deciding_present");
  return problems;
}

export const PROBLEM_LABELS: Record<string, string> = {
  phone: "A phone number",
  owns_home: "Owns the home: Yes",
  wants_price: "Wants a price: Yes",
  soffit_colour: "The soffit colour",
  photos: "The Front, Left corner and Right corner photos, or a reason they were skipped",
  photos_skip_note: "A note saying why the photos were skipped",
  map_position: "A map position",
  everyone_deciding_present: "Confirm everyone who decides will be at the meeting",
};

// The same list on a lead's own page (2026-11-03): an item that isn't met
// says what the lead says now and what booking needs, never the needed
// answer as if it were given.
export const READINESS_NAMES: Record<ReadinessKey, string> = {
  phone: "Phone number",
  owns_home: "Owns the home",
  wants_price: "Wants a price",
  soffit_colour: "Soffit colour",
  photos: "Front, Left corner and Right corner photos",
  map_position: "Map position",
  everyone_deciding_present: "Everyone who decides",
};

export function readinessNow(item: ReadinessItem, lead: ReadinessLead, guidedPhotos: number): string {
  switch (item.key) {
    case "phone":
      return "No phone number yet.";
    case "owns_home":
      return lead.owns_home === false ? "They said they don't own it. Booking needs Yes." : "Not asked yet. Booking needs Yes.";
    case "wants_price":
      return lead.wants_price === false ? "They said not yet. Booking needs Yes." : "Not asked yet. Booking needs Yes.";
    case "soffit_colour":
      return "Not answered yet. Not sure is fine.";
    case "photos":
      return `${Math.min(guidedPhotos, 3)} of 3 taken. Or say why when you book.`;
    case "map_position":
      return "None yet. Pick the address from the suggestions, or use where you're standing at the door.";
    default:
      return item.fix;
  }
}
