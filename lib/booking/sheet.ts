import type {
  ChristmasLightsNow,
  LookedIntoBefore,
  PhotoSlot,
} from "@/lib/leads/door";
import type { LeadDraft } from "@/lib/leads/draft";
import { isQuestionDone, NOT_COLLECTED, type AnswerMap, type AnswerNotes, type CountedQuestion } from "@/lib/leads/questions";
import type { HouseType, SoffitColour } from "@/lib/leads/status";
import type { HotButton, SetterRead } from "@/lib/leads/extras";
import { bookingProblems, type PhotoSkip, type ReadinessLead } from "@/lib/schedule/readiness";

// The booking sheet (Keenan, 2026-11-02; round 2, 2026-11-03; round 3,
// 2026-11-05): one full-screen sheet whose steps follow the visit. This
// module is the sheet's logic with no screen in it: which screens each part
// of the visit has, what each screen still needs, where Next and Back go,
// and what Book lists before it books. Round 3: answers come out of order
// at the door, so Next never stops a setter; Book is the only gate. The
// phone is asked last, on Book.

export type SheetScreen = "who" | "door" | "learned" | "address" | "house" | "book";
export type StepKey = "door" | "after" | "book";

// At the door: who they are and the three questions booking needs. After
// the door, on the sidewalk: the rest of what they learned, the house (its
// address, soffit colour and house type), then its photos. Then Book, where
// the phone is asked for last.
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
  address: "The house",
  house: "Photos",
  book: "Ready to book?",
};

// The counted questions each screen asks.
export const DOOR_QUESTIONS: CountedQuestion[] = ["owns_home", "wants_price", "both_decision_makers"];
// Round 6 (Keenan, 2026-11-07): Which areas and Timing are no longer asked.
export const LEARNED_QUESTIONS: CountedQuestion[] = ["christmas_lights_now", "looked_into_before"];
export const SCREEN_QUESTIONS: Partial<Record<SheetScreen, CountedQuestion[]>> = {
  door: DOOR_QUESTIONS,
  learned: LEARNED_QUESTIONS,
  // Round 3: the number comes last, right above the Book button.
  book: ["phone"],
};

export function stepOf(screen: SheetScreen): StepKey {
  return STEPS.find((step) => step.screens.includes(screen))?.key ?? "door";
}

// "Step 3 of 6, 7 to answer": where the setter is, and how many answers are
// still missing on all the steps (round 3: a step can be passed with answers
// missing). The same count as Book's button, "7 left to answer", so the two
// never disagree.
export function stepCount(screen: SheetScreen, draft: SheetDraft): { number: number; total: number; left: number } {
  const number = SCREENS.indexOf(screen) + 1;
  return { number, total: SCREENS.length, left: sheetMissing(draft).length };
}

// Everything the sheet asks, held on the phone until the lead is saved.
// Unanswered choices are null; questions marked Not collected are listed.
export type SheetDraft = {
  leadId: string | null;
  // A new person's save key (2026-11-04): made on this phone at their first
  // save and sent with every try, so a try after a lost answer gets back the
  // lead the first try made. Drafts from before it have none until then.
  saveKey?: string | null;
  first_name: string;
  last_name: string;
  phone: string;
  owns_home: boolean | null;
  wants_price: boolean | null;
  christmas_lights_now: ChristmasLightsNow | null;
  looked_into_before: LookedIntoBefore | null;
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
  // Round 6: a split soffit's second colour; it needs the note.
  soffit_colour_2: SoffitColour | null;
  soffit_note: string;
  // Round 6: a short note on each required question, private to the lead's
  // setter and Keenan.
  answer_notes: AnswerNotes;
  // Guided slots that already hold a photo: saved on the lead, or uploaded
  // and waiting in photo_paths.
  photo_slots: PhotoSlot[];
  // A person not saved yet (round 3): photos taken before the first save are
  // uploaded at once to the setter's own folder and attached to their slots
  // when the lead is saved, which with the phone asked last is usually at
  // Book. Empty once saved.
  photo_paths: Partial<Record<PhotoSlot, string>>;
  skip: PhotoSkip | null;
  skip_note: string;
  // Round 3: optional, one tap each, never part of the 8 count.
  house_type: HouseType | null;
  setter_read: SetterRead | null;
  hot_buttons: HotButton[];
  // False for a draft kept before round 3: its optional answers weren't
  // asked, so a saved lead's own come back from the database before any
  // save, never blanked.
  extras?: boolean;
};

export function emptyDraft(): SheetDraft {
  return {
    leadId: null,
    saveKey: null,
    first_name: "",
    last_name: "",
    phone: "",
    owns_home: null,
    wants_price: null,
    christmas_lights_now: null,
    looked_into_before: null,
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
    soffit_colour_2: null,
    soffit_note: "",
    answer_notes: {},
    photo_slots: [],
    photo_paths: {},
    skip: null,
    skip_note: "",
    house_type: null,
    setter_read: null,
    hot_buttons: [],
    extras: true,
  };
}

// A draft kept on the phone before round 3 lacks the newer fields: they
// come back empty, marked as not asked.
export function withDraftDefaults(draft: Partial<SheetDraft>): SheetDraft {
  const asked = Object.prototype.hasOwnProperty.call(draft, "hot_buttons");
  return { ...emptyDraft(), ...draft, extras: asked ? (draft.extras ?? true) : false };
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
  }
}

// The questions a booking needs a real answer to; Not collected, No or Not
// yet on any of them means the time can't be booked.
export const BOOKING_QUESTIONS: CountedQuestion[] = ["phone", "owns_home", "wants_price", "both_decision_makers"];

// Which of them, as things stand, rule booking out: answered No or Not
// yet, or marked Not collected. Blank ones aren't listed: they're still open.
export function bookingBlockers(draft: SheetDraft): CountedQuestion[] {
  const answers = draftAnswers(draft);
  return BOOKING_QUESTIONS.filter((question) => {
    const value = answers[question];
    if (value === NOT_COLLECTED) return true;
    if (question === "phone") return false;
    return value === "no" || value === "not_yet";
  });
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

// The address is in with a map position.
export function addressPlaced(draft: SheetDraft): boolean {
  return draft.address_line.trim() !== "" && draft.lat !== null && draft.lng !== null;
}

// What a screen still needs (round 3). A question counts once it has an
// answer or is marked Not collected; the optional answers (house type,
// setter's read, hot buttons, call or text) never count.
export type MissingItem = { key: string; label: string; screen: SheetScreen };

const MISSING_NAMES: Record<CountedQuestion, string> = {
  phone: "Phone",
  owns_home: "Owns the home",
  wants_price: "Wants a price",
  both_decision_makers: "Everyone who decides",
  christmas_lights_now: "Christmas lights now",
  looked_into_before: "Looked into it before",
};

export function screenMissing(screen: SheetScreen, draft: SheetDraft): MissingItem[] {
  const questions = screenOpenQuestions(screen, draft).map((question) => ({ key: question, label: MISSING_NAMES[question], screen }));
  switch (screen) {
    case "who":
      return draft.first_name.trim() === "" ? [{ key: "first_name", label: "First name", screen }] : [];
    case "door":
    case "learned":
    case "book":
      return questions;
    case "address": {
      const out: MissingItem[] = [];
      if (!addressPlaced(draft)) out.push({ key: "map_position", label: draft.address_line.trim() ? "Map position for the address" : "Address", screen });
      if (draft.soffit_colour === null) out.push({ key: "soffit_colour", label: "Soffit colour", screen });
      else if (draft.soffit_colour_2 !== null && draft.soffit_note.trim() === "") out.push({ key: "soffit_note", label: "Which soffit colour is where", screen });
      return out;
    }
    case "house": {
      const done = guidedPhotoCount(draft) >= 3 || (draft.skip !== null && (draft.skip !== "other" || draft.skip_note.trim() !== ""));
      if (done) return [];
      if (draft.skip === "other") return [{ key: "photos_skip_note", label: "Why the photos were skipped", screen }];
      const left = 3 - guidedPhotoCount(draft);
      return [{ key: "photos", label: left === 3 ? "Photos" : `${left} more photo${left === 1 ? "" : "s"}`, screen }];
    }
  }
}

// Everything still missing, in the order of the steps, for Book's list.
export function sheetMissing(draft: SheetDraft): MissingItem[] {
  return SCREENS.flatMap((screen) => screenMissing(screen, draft));
}

// When a screen has everything it asks for.
export function isScreenComplete(screen: SheetScreen, draft: SheetDraft): boolean {
  return screenMissing(screen, draft).length === 0;
}

// Book is the only gate (round 3): everything answered (Not collected
// included), no answer that rules booking out, and the same Before you book
// rules the database checks again.
export function canBookDraft(draft: SheetDraft): boolean {
  return sheetMissing(draft).length === 0 && bookingBlockers(draft).length === 0 && draftProblems(draft).length === 0;
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
  phone: "book",
  owns_home: "door",
  wants_price: "door",
  everyone_deciding_present: "door",
  map_position: "address",
  soffit_colour: "address",
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
    save_key: draft.saveKey ?? "",
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
    house_type: draft.house_type ?? "",
    setter_read: draft.setter_read ?? "",
    hot_buttons: draft.hot_buttons,
    soffit_colour: draft.soffit_colour ?? "",
    soffit_colour_2: draft.soffit_colour_2 ?? "",
    soffit_note: draft.soffit_note,
    answer_notes: draft.answer_notes ?? {},
    owns_home: answer("owns_home"),
    wants_price: answer("wants_price"),
    both_decision_makers: answer("both_decision_makers"),
    christmas_lights_now: answer("christmas_lights_now"),
    looked_into_before: answer("looked_into_before"),
    notes: "",
    source: "door",
    photo_paths: [],
    // A person's first save attaches the photos taken before it.
    photo_slot_front: draft.leadId ? "" : (draft.photo_paths.front ?? ""),
    photo_slot_left_corner: draft.leadId ? "" : (draft.photo_paths.left_corner ?? ""),
    photo_slot_right_corner: draft.leadId ? "" : (draft.photo_paths.right_corner ?? ""),
    photo_slot_soffit: draft.leadId ? "" : (draft.photo_paths.soffit ?? ""),
  };
}

// The fields a save sends, so the sheet can tell whether anything changed
// since the last save. The photo skip is the booking's own choice.
export function savedFingerprint(draft: SheetDraft): string {
  const { leadId: _lead, saveKey: _key, photo_slots: _photos, photo_paths: _paths, skip: _skip, skip_note: _note, extras: _extras, ...fields } = draft;
  void _extras;
  void _lead;
  void _key;
  void _photos;
  void _paths;
  void _skip;
  void _note;
  return JSON.stringify({ ...fields, not_collected: [...fields.not_collected].sort(), hot_buttons: [...(fields.hot_buttons ?? [])].sort() });
}

// What Book says while it can't book. An answer that rules booking out
// isn't something to fix: the homeowner said it, so Book says it can't book
// yet, and the screen offers Keep as a lead. Otherwise it says how much is
// left, listed just above it.
export function bookNeed(draft: SheetDraft): string | null {
  if (bookingBlockers(draft).length > 0) return "Can't book yet";
  const missing = sheetMissing(draft).length;
  if (missing > 0) return `${missing} left to answer`;
  const problems = draftProblems(draft);
  return problems.length > 0 ? `Fix ${problems.length} first` : null;
}

// Hot buttons (round 3): any that apply, or Not sure on its own.
export function toggleHotButton(current: HotButton[], value: HotButton): HotButton[] {
  if (current.includes(value)) return current.filter((item) => item !== value);
  if (value === "not_sure") return ["not_sure"];
  return [...current.filter((item) => item !== "not_sure"), value];
}

// Keep as a lead: a new person the sheet can't book goes on to New lead with
// everything entered, in New lead's own draft form, its save key included, so
// a first save whose answer was lost can't become a second lead there.
export function leadDraftFromSheet(draft: SheetDraft, now: number): LeadDraft {
  const values: Record<string, string> = {};
  for (const [name, value] of Object.entries(draftToLeadInput(draft))) {
    if (typeof value === "string" && value !== "") values[name] = value;
  }
  // Hot buttons travel as one comma-separated value in New lead's draft.
  if (draft.hot_buttons.length > 0) values.hot_buttons = draft.hot_buttons.join(",");
  // Round 6: each question's note, as New lead's note fields.
  for (const [key, note] of Object.entries(draft.answer_notes ?? {})) if (note) values[`note_${key}`] = note;
  return { savedAt: now, values, extraPhotos: 0, from: "sheet" };
}
