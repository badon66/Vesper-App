import { SOFFIT_LABELS, SOFFIT_OPTIONS, type SoffitColour } from "@/lib/leads/status";
import type { Database } from "@/types/database";

// The door process (Keenan, 2026-10-31): open, find out, photos, book.
// The Find out questions and the guided photo slots live here so the form,
// the lead page and the timeline all use the same words. Nothing here is
// required to save a lead; M3's booking check uses some of it.

export type ChristmasLightsNow = Database["public"]["Enums"]["christmas_lights_now"];
export type RooflineAreas = Database["public"]["Enums"]["roofline_areas"];
export type InstallTiming = Database["public"]["Enums"]["install_timing"];
export type LookedIntoBefore = Database["public"]["Enums"]["looked_into_before"];
export type PhotoSlot = Database["public"]["Enums"]["photo_slot"];

type Option<T extends string> = { value: T; label: string };

// Yes or no answers are stored as booleans. In the form they travel as these
// words, and a question nobody answered sends nothing.
export const OWNS_HOME_OPTIONS: Option<"yes" | "no">[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

export const WANTS_PRICE_OPTIONS: Option<"yes" | "not_yet">[] = [
  { value: "yes", label: "Yes" },
  { value: "not_yet", label: "Not yet" },
];

export const CHRISTMAS_LIGHTS_OPTIONS: Option<ChristmasLightsNow>[] = [
  { value: "hires", label: "Hires someone" },
  { value: "diy", label: "Does it themselves" },
  { value: "none", label: "None" },
];

// M3.5 (Keenan, 2026-11-02): have they looked into permanent lights before?
export const LOOKED_INTO_BEFORE_OPTIONS: Option<LookedIntoBefore>[] = [
  { value: "got_quotes", label: "Got quotes" },
  { value: "thought_about_it", label: "Thought about it" },
  { value: "new_to_them", label: "New to them" },
];

export const AREAS_OPTIONS: Option<RooflineAreas>[] = [
  { value: "front", label: "Front only" },
  { value: "front_and_sides", label: "Front and sides" },
  { value: "full_wrap", label: "Full wrap" },
  { value: "not_sure", label: "Not sure" },
];

export const TIMING_OPTIONS: Option<InstallTiming>[] = [
  { value: "before_christmas", label: "Before Christmas" },
  { value: "new_year", label: "New year" },
  { value: "no_rush", label: "No rush" },
];

export type FindOutAnswers = {
  owns_home: boolean | null;
  wants_price: boolean | null;
  soffit_colour: SoffitColour | null;
  soffit_note: string | null;
  christmas_lights_now: ChristmasLightsNow | null;
  looked_into_before: LookedIntoBefore | null;
  areas_wanted: RooflineAreas | null;
  install_timing: InstallTiming | null;
};

export type FindOutField =
  | "owns_home"
  | "wants_price"
  | "soffit_colour"
  | "christmas_lights_now"
  | "looked_into_before"
  | "areas_wanted"
  | "install_timing";

// The seven questions, in the order they are asked, with the choices the form
// offers. `choice` is what the form holds for a stored answer.
export const FIND_OUT_QUESTIONS: {
  field: FindOutField;
  question: string;
  options: Option<string>[];
  columns: 2 | 3 | 4;
}[] = [
  { field: "owns_home", question: "Owns the home", options: OWNS_HOME_OPTIONS, columns: 2 },
  { field: "wants_price", question: "Wants a price", options: WANTS_PRICE_OPTIONS, columns: 2 },
  { field: "soffit_colour", question: "Soffit colour", options: SOFFIT_OPTIONS, columns: 4 },
  {
    field: "christmas_lights_now",
    question: "Christmas lights now",
    options: CHRISTMAS_LIGHTS_OPTIONS,
    columns: 3,
  },
  {
    field: "looked_into_before",
    question: "Looked into it before",
    options: LOOKED_INTO_BEFORE_OPTIONS,
    columns: 3,
  },
  { field: "areas_wanted", question: "Which areas", options: AREAS_OPTIONS, columns: 4 },
  { field: "install_timing", question: "Timing", options: TIMING_OPTIONS, columns: 3 },
];

export function yesNoChoice(value: boolean | null, no: "no" | "not_yet"): string | null {
  if (value === null) return null;
  return value ? "yes" : no;
}

// What the form holds for each stored answer.
export function findOutChoices(answers: FindOutAnswers): Record<FindOutField, string | null> {
  return {
    owns_home: yesNoChoice(answers.owns_home, "no"),
    wants_price: yesNoChoice(answers.wants_price, "not_yet"),
    soffit_colour: answers.soffit_colour,
    christmas_lights_now: answers.christmas_lights_now,
    looked_into_before: answers.looked_into_before,
    areas_wanted: answers.areas_wanted,
    install_timing: answers.install_timing,
  };
}

const optionLabel = (options: Option<string>[], value: string | null) =>
  options.find((option) => option.value === value)?.label ?? null;

// Each question with its answer as shown on the lead page. null means not
// asked yet.
export function findOutAnswerList(
  answers: FindOutAnswers,
): { field: FindOutField; question: string; answer: string | null }[] {
  const choices = findOutChoices(answers);
  return FIND_OUT_QUESTIONS.map(({ field, question, options }) => {
    if (field === "soffit_colour") {
      const soffit = answers.soffit_colour ? SOFFIT_LABELS[answers.soffit_colour] : null;
      const answer = soffit && answers.soffit_note ? `${soffit}: ${answers.soffit_note}` : soffit;
      return { field, question, answer };
    }
    return { field, question, answer: optionLabel(options, choices[field]) };
  });
}

export function findOutAnsweredCount(answers: FindOutAnswers): number {
  return findOutAnswerList(answers).filter((item) => item.answer !== null).length;
}

// The four guided photos.
export const PHOTO_SLOTS: { slot: PhotoSlot; label: string; hint: string }[] = [
  { slot: "front", label: "Front", hint: "Straight on, whole house in frame" },
  { slot: "left_corner", label: "Left corner", hint: "Angled so the left side's roofline shows" },
  { slot: "right_corner", label: "Right corner", hint: "Angled so the right side's roofline shows" },
  { slot: "soffit", label: "Soffit close-up", hint: "Close enough to see its colour" },
];

export const PHOTO_SLOT_HINT =
  "Hold the phone sideways and get the whole roofline in. At night, hold still while night mode finishes.";

export function photoSlotLabel(slot: PhotoSlot): string {
  return PHOTO_SLOTS.find((item) => item.slot === slot)?.label ?? slot;
}

// The form field that carries a slot photo's uploaded path.
export function slotFieldName(slot: PhotoSlot): string {
  return `photo_slot_${slot}`;
}
