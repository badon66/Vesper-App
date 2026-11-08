import { COUNTED_QUESTIONS, QUESTION_LABELS, questionState, type CountedQuestion, type QuestionState } from "@/lib/leads/questions";
import { SOFFIT_LABELS, SOFFIT_OPTIONS, type SoffitColour } from "@/lib/leads/status";
import { formatPhone } from "@/lib/phone";
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

// Round 6 (Keenan, 2026-11-07): two answers that can be given together.
// Christmas lights now can be Hires someone and Does it themselves; Looked
// into it before can be Got quotes and Thought about it. None and New to
// them stay on their own. The pair is stored as one combined value, so the
// column stays a single answer.
export type PairedQuestion = "christmas_lights_now" | "looked_into_before";
export const PAIRED_ANSWERS: Record<PairedQuestion, { pair: [string, string]; both: string; alone: string }> = {
  christmas_lights_now: { pair: ["hires", "diy"], both: "hires_and_diy", alone: "none" },
  looked_into_before: { pair: ["got_quotes", "thought_about_it"], both: "quotes_and_thought", alone: "new_to_them" },
};

export const ANSWER_LABELS: Record<PairedQuestion, Record<string, string>> = {
  christmas_lights_now: {
    hires: "Hires someone",
    diy: "Does it themselves",
    none: "None",
    hires_and_diy: "Hires someone and does it themselves",
  },
  looked_into_before: {
    got_quotes: "Got quotes",
    thought_about_it: "Thought about it",
    new_to_them: "New to them",
    quotes_and_thought: "Got quotes and thought about it",
  },
};

// A stored answer as the choices it stands for.
export function splitAnswer(question: PairedQuestion, value: string | null | undefined): string[] {
  if (!value) return [];
  const { pair, both } = PAIRED_ANSWERS[question];
  return value === both ? [...pair] : [value];
}

// The choices tapped, as the one answer stored. The one that stands alone
// clears the others; the pair together is the combined answer.
export function joinAnswer(question: PairedQuestion, values: readonly string[]): string | null {
  const { pair, both, alone } = PAIRED_ANSWERS[question];
  if (values.includes(alone)) return alone;
  const chosen = pair.filter((item) => values.includes(item));
  if (chosen.length === 2) return both;
  return chosen[0] ?? null;
}

// A tap on a choice: the one that stands alone replaces the rest; either of
// the pair adds to the other, or comes off on a second tap.
export function toggleAnswer(question: PairedQuestion, current: string | null | undefined, tapped: string): string | null {
  const chosen = splitAnswer(question, current);
  const { alone } = PAIRED_ANSWERS[question];
  if (chosen.includes(tapped)) return joinAnswer(question, chosen.filter((item) => item !== tapped));
  if (tapped === alone) return alone;
  return joinAnswer(question, [...chosen.filter((item) => item !== alone), tapped]);
}

// Round 6: a split soffit takes two colours, then a short note. Not sure
// stands alone. A third colour replaces the older of the two.
export function toggleSoffit(current: readonly SoffitColour[], tapped: SoffitColour): SoffitColour[] {
  if (current.includes(tapped)) return current.filter((item) => item !== tapped);
  if (tapped === "not_sure") return ["not_sure"];
  const rest = current.filter((item) => item !== "not_sure");
  return [...rest, tapped].slice(-2);
}

export function soffitAnswer(first: SoffitColour | null, second: SoffitColour | null | undefined, note: string | null): string | null {
  if (!first) return null;
  const colours = second ? `${SOFFIT_LABELS[first]} and ${SOFFIT_LABELS[second].toLowerCase()}` : SOFFIT_LABELS[first];
  return note ? `${colours}: ${note}` : colours;
}

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
  soffit_colour_2?: SoffitColour | null;
  soffit_note: string | null;
  christmas_lights_now: ChristmasLightsNow | null;
  looked_into_before: LookedIntoBefore | null;
};

// Round 6: Which areas and Timing are no longer asked.
export type FindOutField = "owns_home" | "wants_price" | "soffit_colour" | "christmas_lights_now" | "looked_into_before";

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
      return { field, question, answer: soffitAnswer(answers.soffit_colour, answers.soffit_colour_2, answers.soffit_note) };
    }
    if (field === "christmas_lights_now" || field === "looked_into_before") {
      const value = choices[field];
      return { field, question, answer: value ? (ANSWER_LABELS[field][value] ?? value) : null };
    }
    return { field, question, answer: optionLabel(options, choices[field]) };
  });
}

// Round 2 (Keenan, 2026-11-03): the lead page lists the eight counted
// questions in the order they're asked, each answered, Not collected or not
// asked yet, then the soffit colour.
// The phone on someone else's lead (contact privacy, 2026-11-04): saved,
// but shown only to the lead's own setter.
export const PHONE_HIDDEN = "Saved, hidden";

export type LeadAnswers = FindOutAnswers & {
  phone: string | null;
  phone_saved?: boolean | null;
  both_decision_makers: boolean | null;
  not_collected: string[] | null;
};

export type LeadAnswerRow = {
  key: CountedQuestion | "soffit_colour";
  question: string;
  answer: string | null;
  state: QuestionState;
};

export function leadAnswerList(lead: LeadAnswers): LeadAnswerRow[] {
  const listed = new Map(findOutAnswerList(lead).map((item) => [item.field, item.answer]));
  const shown: Record<CountedQuestion, string | null> = {
    // Someone else's lead: saved, but the number is only for its own setter.
    phone: lead.phone ? formatPhone(lead.phone) : lead.phone_saved ? PHONE_HIDDEN : null,
    owns_home: listed.get("owns_home") ?? null,
    wants_price: listed.get("wants_price") ?? null,
    both_decision_makers: lead.both_decision_makers === null ? null : lead.both_decision_makers ? "Yes" : "No",
    christmas_lights_now: listed.get("christmas_lights_now") ?? null,
    looked_into_before: listed.get("looked_into_before") ?? null,
  };
  const rows: LeadAnswerRow[] = COUNTED_QUESTIONS.map((key) => ({
    key,
    question: QUESTION_LABELS[key],
    answer: shown[key],
    state: questionState(lead, key),
  }));
  const soffit = listed.get("soffit_colour") ?? null;
  rows.push({ key: "soffit_colour", question: "Soffit colour", answer: soffit, state: soffit ? "answered" : "open" });
  return rows;
}

export function findOutAnsweredCount(answers: FindOutAnswers): number {
  return findOutAnswerList(answers).filter((item) => item.answer !== null).length;
}

// The four guided photos.
// Each has a hint, and a few words for the booking sheet's tiles: where to
// stand, as you face the house.
export const PHOTO_SLOTS: { slot: PhotoSlot; label: string; hint: string; short: string }[] = [
  { slot: "front", label: "Front", hint: "Straight on, whole house in frame", short: "Straight on" },
  { slot: "left_corner", label: "Left corner", hint: "Angled so the left side's roofline shows", short: "From the front left" },
  { slot: "right_corner", label: "Right corner", hint: "Angled so the right side's roofline shows", short: "From the front right" },
  { slot: "soffit", label: "Soffit close-up", hint: "Close enough to see its colour", short: "Optional, for its colour" },
];

export const PHOTO_SLOT_HINT =
  "Hold the phone sideways and get the whole roofline in. At night, hold still while night mode finishes.";
// The booking sheet's one line: the drawings show the angles.
export const PHOTO_SLOT_HINT_SHORT = "Hold it sideways. At night, hold still.";

export function photoSlotLabel(slot: PhotoSlot): string {
  return PHOTO_SLOTS.find((item) => item.slot === slot)?.label ?? slot;
}

// The form field that carries a slot photo's uploaded path.
export function slotFieldName(slot: PhotoSlot): string {
  return `photo_slot_${slot}`;
}
