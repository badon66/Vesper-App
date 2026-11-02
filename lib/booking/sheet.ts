import type {
  ChristmasLightsNow,
  InstallTiming,
  LookedIntoBefore,
  PhotoSlot,
  RooflineAreas,
} from "@/lib/leads/door";
import type { SoffitColour } from "@/lib/leads/status";
import { bookingProblems, type PhotoSkip, type ReadinessLead } from "@/lib/schedule/readiness";

// The booking sheet (Keenan, 2026-11-02): one full-screen sheet with three
// steps that follow the door process. This module is the sheet's logic with
// no screen in it: which screens each step has, when a screen is done, where
// Next and Back go, and which screen fixes each Before you book item.

export type SheetScreen = "who" | "find1" | "find2" | "everyone" | "address" | "soffit" | "photos" | "book";
export type StepKey = "door" | "after" | "book";

export const STEPS: { key: StepKey; label: string; screens: SheetScreen[] }[] = [
  { key: "door", label: "At the door", screens: ["who", "find1", "find2", "everyone"] },
  { key: "after", label: "After the door", screens: ["address", "soffit", "photos"] },
  { key: "book", label: "Book", screens: ["book"] },
];

export const SCREENS: SheetScreen[] = STEPS.flatMap((step) => step.screens);

// Each screen's question, as its heading.
export const SCREEN_TITLES: Record<SheetScreen, string> = {
  who: "Who are we meeting?",
  find1: "Find out",
  find2: "Find out",
  everyone: "Will everyone who decides be there?",
  address: "Where's the house?",
  soffit: "What colour is the soffit?",
  photos: "Photos of the house",
  book: "Book it",
};

export function stepOf(screen: SheetScreen): StepKey {
  return STEPS.find((step) => step.screens.includes(screen))?.key ?? "door";
}

// Everything the sheet asks, held on the phone until the lead is saved.
// Unanswered choices are null, as in the lead form.
export type SheetDraft = {
  leadId: string | null;
  first_name: string;
  last_name: string;
  phone: string;
  owns_home: boolean | null;
  wants_price: boolean | null;
  christmas_lights_now: ChristmasLightsNow | null;
  looked_into_before: LookedIntoBefore | null;
  areas_wanted: RooflineAreas | null;
  install_timing: InstallTiming | null;
  everyone: boolean;
  address_line: string;
  city: string;
  postal_code: string;
  neighbourhood: string;
  lat: number | null;
  lng: number | null;
  place_id: string | null;
  position_source: "picked" | "device" | null;
  position_accuracy_m: number | null;
  soffit_colour: SoffitColour | null;
  soffit_note: string;
  // Guided slots that already hold a saved photo.
  photo_slots: PhotoSlot[];
  skip: PhotoSkip | null;
  skip_note: string;
};

export function emptyDraft(): SheetDraft {
  return {
    leadId: null,
    first_name: "",
    last_name: "",
    phone: "",
    owns_home: null,
    wants_price: null,
    christmas_lights_now: null,
    looked_into_before: null,
    areas_wanted: null,
    install_timing: null,
    everyone: false,
    address_line: "",
    city: "Calgary",
    postal_code: "",
    neighbourhood: "",
    lat: null,
    lng: null,
    place_id: null,
    position_source: null,
    position_accuracy_m: null,
    soffit_colour: null,
    soffit_note: "",
    photo_slots: [],
    skip: null,
    skip_note: "",
  };
}

const GUIDED: PhotoSlot[] = ["front", "left_corner", "right_corner"];

export function guidedPhotoCount(draft: SheetDraft): number {
  return GUIDED.filter((slot) => draft.photo_slots.includes(slot)).length;
}

export function readinessLead(draft: SheetDraft): ReadinessLead {
  return {
    phone: draft.phone.trim() === "" ? null : draft.phone,
    owns_home: draft.owns_home,
    wants_price: draft.wants_price,
    soffit_colour: draft.soffit_colour,
    lat: draft.lat,
    lng: draft.lng,
  };
}

// Before you book, worked out from the draft: the same codes the database
// checks again when booking.
export function draftProblems(draft: SheetDraft): string[] {
  return bookingProblems(readinessLead(draft), guidedPhotoCount(draft), {
    everyone: draft.everyone,
    skip: draft.skip,
    skipNote: draft.skip_note,
  });
}

// When a screen has everything it asks for.
export function isScreenComplete(screen: SheetScreen, draft: SheetDraft): boolean {
  switch (screen) {
    case "who":
      return draft.first_name.trim() !== "" && draft.phone.trim() !== "";
    case "find1":
      return draft.owns_home !== null && draft.wants_price !== null && draft.christmas_lights_now !== null;
    case "find2":
      return draft.looked_into_before !== null && draft.areas_wanted !== null && draft.install_timing !== null;
    case "everyone":
      return draft.everyone;
    case "address":
      return draft.address_line.trim() !== "" && draft.lat !== null && draft.lng !== null;
    case "soffit":
      return draft.soffit_colour !== null;
    case "photos":
      return guidedPhotoCount(draft) >= 3 || (draft.skip !== null && (draft.skip !== "other" || draft.skip_note.trim() !== ""));
    case "book":
      return draftProblems(draft).length === 0;
  }
}

// Where Next goes. For a lead that was already filled in, every screen that
// is done is skipped; a new person walks the screens in order.
export function nextScreen(current: SheetScreen, draft: SheetDraft, skipDone: boolean): SheetScreen {
  const index = SCREENS.indexOf(current);
  for (let i = index + 1; i < SCREENS.length; i += 1) {
    const screen = SCREENS[i];
    if (screen === "book" || !skipDone || !isScreenComplete(screen, draft)) return screen;
  }
  return "book";
}

export function previousScreen(current: SheetScreen): SheetScreen | null {
  const index = SCREENS.indexOf(current);
  return index > 0 ? SCREENS[index - 1] : null;
}

// Where a lead that was already filled in starts: its first screen that
// still needs something, or Book.
export function firstScreenToVisit(draft: SheetDraft): SheetScreen {
  return SCREENS.find((screen) => screen !== "book" && !isScreenComplete(screen, draft)) ?? "book";
}

// The screen that fixes each Before you book item.
export const PROBLEM_SCREENS: Record<string, SheetScreen> = {
  phone: "who",
  owns_home: "find1",
  wants_price: "find1",
  everyone_deciding_present: "everyone",
  map_position: "address",
  soffit_colour: "soffit",
  photos: "photos",
  photos_skip_note: "photos",
};

// The lead can be saved once it has a first name and an address: the
// database needs both. Until then the sheet keeps everything on the phone.
export function canSaveLead(draft: SheetDraft): boolean {
  return draft.first_name.trim() !== "" && draft.address_line.trim() !== "";
}

// What the lead form's validator reads, built from the draft. Fields the
// sheet doesn't ask about go in blank; the server writes only the sheet's own
// columns on an existing lead.
export function draftToLeadInput(draft: SheetDraft): Record<string, unknown> {
  const yesNo = (value: boolean | null, no: string) => (value === null ? "" : value ? "yes" : no);
  return {
    first_name: draft.first_name,
    last_name: draft.last_name,
    phone: draft.phone,
    email: "",
    address_line: draft.address_line,
    city: draft.city || "Calgary",
    postal_code: draft.postal_code,
    neighbourhood: draft.neighbourhood,
    lat: draft.lat === null ? "" : String(draft.lat),
    lng: draft.lng === null ? "" : String(draft.lng),
    place_id: draft.place_id ?? "",
    position_source: draft.position_source ?? "",
    position_accuracy_m: draft.position_accuracy_m === null ? "" : String(draft.position_accuracy_m),
    house_type: "",
    soffit_colour: draft.soffit_colour ?? "",
    soffit_note: draft.soffit_note,
    owns_home: yesNo(draft.owns_home, "no"),
    wants_price: yesNo(draft.wants_price, "not_yet"),
    christmas_lights_now: draft.christmas_lights_now ?? "",
    looked_into_before: draft.looked_into_before ?? "",
    areas_wanted: draft.areas_wanted ?? "",
    install_timing: draft.install_timing ?? "",
    notes: "",
    source: "door",
    photo_paths: [],
    photo_slot_front: "",
    photo_slot_left_corner: "",
    photo_slot_right_corner: "",
    photo_slot_soffit: "",
  };
}

// The fields a save sends, so the sheet can tell whether anything changed
// since the last save.
export function savedFingerprint(draft: SheetDraft): string {
  const { leadId: _lead, everyone: _everyone, photo_slots: _photos, skip: _skip, skip_note: _note, ...fields } = draft;
  void _lead;
  void _everyone;
  void _photos;
  void _skip;
  void _note;
  return JSON.stringify(fields);
}
