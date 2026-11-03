import type {
  ChristmasLightsNow,
  InstallTiming,
  LookedIntoBefore,
  PhotoSlot,
  RooflineAreas,
} from "@/lib/leads/door";
import { isQuestionDone, NOT_COLLECTED, type AnswerMap, type CountedQuestion } from "@/lib/leads/questions";
import type { SoffitColour } from "@/lib/leads/status";
import { bookingProblems, type PhotoSkip, type ReadinessLead } from "@/lib/schedule/readiness";

// The booking sheet (Keenan, 2026-11-02; round 2, 2026-11-03): one
// full-screen sheet whose steps follow the visit. This module is the
// sheet's logic with no screen in it: which screens each part of the visit
// has, when a screen is done, where Next and Back go, and which screen
// fixes each Before you book item.

export type SheetScreen = "who" | "door" | "learned" | "address" | "house" | "book";
export type StepKey = "door" | "after" | "book";

// At the door: only what is needed face to face to book. After the door,
// on the sidewalk: the rest of what they learned, the house, the soffit
// and the photos. Then Book.
export const STEPS: { key: StepKey; label: string; screens: SheetScreen[] }[] = [
  { key: "door", label: "At the door", screens: ["who", "door"] },
  { key: "after", label: "After the door", screens: ["learned", "address", "house"] },
  { key: "book", label: "Book", screens: ["book"] },
];

export const SCREENS: SheetScreen[] = STEPS.flatMap((step) => step.screens);

// Each screen's title.
export const SCREEN_TITLES: Record<SheetScreen, string> = {
  who: "Who are we meeting?",
  door: "Three questions to book",
  learned: "What else did you learn?",
  address: "Where's the house?",
  house: "Soffit and photos",
  book: "Ready to book?",
};

// The counted questions each screen asks.
export const DOOR_QUESTIONS: CountedQuestion[] = ["owns_home", "wants_price", "both_decision_makers"];
export const LEARNED_QUESTIONS: CountedQuestion[] = ["christmas_lights_now", "looked_into_before", "areas_wanted", "install_timing"];
export const SCREEN_QUESTIONS: Partial<Record<SheetScreen, CountedQuestion[]>> = {
  who: ["phone"],
  door: DOOR_QUESTIONS,
  learned: LEARNED_QUESTIONS,
};

export function stepOf(screen: SheetScreen): StepKey {
  return STEPS.find((step) => step.screens.includes(screen))?.key ?? "door";
}

// "Step 3 of 6, 3 left".
export function stepCount(screen: SheetScreen): { number: number; total: number; left: number } {
  const number = SCREENS.indexOf(screen) + 1;
  return { number, total: SCREENS.length, left: SCREENS.length - number };
}

// Everything the sheet asks, held on the phone until the lead is saved.
// Unanswered choices are null; questions marked Not collected are listed.
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
  // "Everyone who decides will be there": Yes true, No false.
  everyone: boolean | null;
  not_collected: CountedQuestion[];
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
    everyone: null,
    not_collected: [],
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

const yesNo = (value: boolean | null, no: string) => (value === null ? null : value ? "yes" : no);

// The counted questions' answers as the screens hold them: the answer's
// value, NOT_COLLECTED, or nothing yet.
export function draftAnswers(draft: SheetDraft): AnswerMap {
  const raw: Record<CountedQuestion, string | null> = {
    phone: draft.phone.trim() === "" ? null : draft.phone,
    owns_home: yesNo(draft.owns_home, "no"),
    wants_price: yesNo(draft.wants_price, "not_yet"),
    both_decision_makers: yesNo(draft.everyone, "no"),
    christmas_lights_now: draft.christmas_lights_now,
    looked_into_before: draft.looked_into_before,
    areas_wanted: draft.areas_wanted,
    install_timing: draft.install_timing,
  };
  const out: AnswerMap = {};
  for (const [question, value] of Object.entries(raw) as [CountedQuestion, string | null][]) {
    out[question] = isQuestionDone(value) ? value : draft.not_collected.includes(question) ? NOT_COLLECTED : null;
  }
  return out;
}

// One answer from a screen: a value, NOT_COLLECTED, or null to clear it.
// The phone's number is typed, so here it only takes Not collected or null.
export function withAnswer(draft: SheetDraft, question: CountedQuestion, value: string | null): SheetDraft {
  const marked = value === NOT_COLLECTED;
  const not_collected = marked
    ? Array.from(new Set([...draft.not_collected, question]))
    : draft.not_collected.filter((item) => item !== question);
  const answer = marked ? null : value;
  const next: SheetDraft = { ...draft, not_collected };
  switch (question) {
    case "phone":
      return marked ? { ...next, phone: "" } : next;
    case "owns_home":
      return { ...next, owns_home: answer === null ? null : answer === "yes" };
    case "wants_price":
      return { ...next, wants_price: answer === null ? null : answer === "yes" };
    case "both_decision_makers":
      return { ...next, everyone: answer === null ? null : answer === "yes" };
    case "christmas_lights_now":
      return { ...next, christmas_lights_now: answer as ChristmasLightsNow | null };
    case "looked_into_before":
      return { ...next, looked_into_before: answer as LookedIntoBefore | null };
    case "areas_wanted":
      return { ...next, areas_wanted: answer as RooflineAreas | null };
    case "install_timing":
      return { ...next, install_timing: answer as InstallTiming | null };
  }
}

// The questions on a screen that still need an answer or Not collected.
export function screenOpenQuestions(screen: SheetScreen, draft: SheetDraft): CountedQuestion[] {
  const answers = draftAnswers(draft);
  return (SCREEN_QUESTIONS[screen] ?? []).filter((question) => !isQuestionDone(answers[question]));
}

// "Mark the rest Not collected" on a screen.
export function markScreenNotCollected(screen: SheetScreen, draft: SheetDraft): SheetDraft {
  return screenOpenQuestions(screen, draft).reduce((current, question) => withAnswer(current, question, NOT_COLLECTED), draft);
}

export function readinessLead(draft: SheetDraft): ReadinessLead {
  return {
    phone: draft.phone.trim() === "" ? null : draft.phone,
    owns_home: draft.owns_home,
    wants_price: draft.wants_price,
    soffit_colour: draft.soffit_colour,
    lat: draft.lat,
    lng: draft.lng,
    both_decision_makers: draft.everyone,
    not_collected: draft.not_collected,
  };
}

// Before you book, worked out from the draft: the same codes the database
// checks again when booking. Not collected is never an answer here.
export function draftProblems(draft: SheetDraft): string[] {
  return bookingProblems(readinessLead(draft), guidedPhotoCount(draft), {
    everyone: draft.everyone === true,
    skip: draft.skip,
    skipNote: draft.skip_note,
  });
}

// When a screen has everything it asks for. A question counts once it has
// an answer or is marked Not collected.
export function isScreenComplete(screen: SheetScreen, draft: SheetDraft): boolean {
  switch (screen) {
    case "who":
      return draft.first_name.trim() !== "" && screenOpenQuestions("who", draft).length === 0;
    case "door":
    case "learned":
      return screenOpenQuestions(screen, draft).length === 0;
    case "address":
      return draft.address_line.trim() !== "" && draft.lat !== null && draft.lng !== null;
    case "house": {
      const photosDone = guidedPhotoCount(draft) >= 3 || (draft.skip !== null && (draft.skip !== "other" || draft.skip_note.trim() !== ""));
      return draft.soffit_colour !== null && photosDone;
    }
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
  owns_home: "door",
  wants_price: "door",
  everyone_deciding_present: "door",
  map_position: "address",
  soffit_colour: "house",
  photos: "house",
  photos_skip_note: "house",
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
  const answers = draftAnswers(draft);
  const answer = (question: CountedQuestion) => answers[question] ?? "";
  return {
    first_name: draft.first_name,
    last_name: draft.last_name,
    phone: draft.phone,
    phone_not_collected: draft.not_collected.includes("phone") ? "1" : "",
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
    owns_home: answer("owns_home"),
    wants_price: answer("wants_price"),
    both_decision_makers: answer("both_decision_makers"),
    christmas_lights_now: answer("christmas_lights_now"),
    looked_into_before: answer("looked_into_before"),
    areas_wanted: answer("areas_wanted"),
    install_timing: answer("install_timing"),
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
// since the last save. The photo skip is the booking's own choice.
export function savedFingerprint(draft: SheetDraft): string {
  const { leadId: _lead, photo_slots: _photos, skip: _skip, skip_note: _note, ...fields } = draft;
  void _lead;
  void _photos;
  void _skip;
  void _note;
  return JSON.stringify({ ...fields, not_collected: [...fields.not_collected].sort() });
}
