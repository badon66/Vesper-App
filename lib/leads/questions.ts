// The questions a lead counts (round 2, Keenan, 2026-11-03): each takes an
// answer or "Not collected", and "5 of 6 collected" counts the real
// answers. Round 6 (Keenan, 2026-11-07): Which areas and Timing are no
// longer asked (Keenan presents the full wrap first, and timing is told, not
// asked); their columns and saved answers stay, they just aren't counted. Kept pure so the form, the booking sheet, the lead page and the
// meeting cards all agree, and so it is unit tested.

export const NOT_COLLECTED = "not_collected";
export const NOT_COLLECTED_LABEL = "Not collected";

export type CountedQuestion =
  | "phone"
  | "owns_home"
  | "wants_price"
  | "both_decision_makers"
  | "christmas_lights_now"
  | "looked_into_before";

// In the order they are asked: at the door, then after it.
export const COUNTED_QUESTIONS: CountedQuestion[] = [
  "phone",
  "owns_home",
  "wants_price",
  "both_decision_makers",
  "christmas_lights_now",
  "looked_into_before",
];

export const QUESTION_LABELS: Record<CountedQuestion, string> = {
  phone: "Phone",
  owns_home: "Owns the home",
  wants_price: "Wants a price",
  both_decision_makers: "Everyone who decides will be there",
  christmas_lights_now: "Christmas lights now",
  looked_into_before: "Looked into it before",
};

// Round 6 (Keenan, 2026-11-07): a short note on each required question,
// for Keenan to read before the meeting. Private, like the phone: only the
// lead's own setter and Keenan read them (lead_notes).
export type NoteKey = CountedQuestion | "soffit_colour";
export const NOTE_KEYS: NoteKey[] = [...COUNTED_QUESTIONS, "soffit_colour"];
export const NOTE_LABELS: Record<NoteKey, string> = { ...QUESTION_LABELS, soffit_colour: "Soffit colour" };
export const NOTE_MAX = 300;
export type AnswerNotes = Partial<Record<NoteKey, string>>;

// The notes as stored: trimmed, the empty ones left out, known keys only.
export function cleanAnswerNotes(input: unknown): AnswerNotes {
  const out: AnswerNotes = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return out;
  for (const key of NOTE_KEYS) {
    const value = (input as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim() !== "") out[key] = value.trim().slice(0, NOTE_MAX);
  }
  return out;
}

export const EVERYONE_OPTIONS: { value: "yes" | "no"; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

// What a lead holds for the counted questions. On someone else's lead the
// phone itself isn't shown (contact privacy, 2026-11-04); phone_saved still
// says a number is saved, so the lead counts it.
export type QuestionLead = {
  phone: string | null;
  phone_saved?: boolean | null;
  owns_home: boolean | null;
  wants_price: boolean | null;
  both_decision_makers: boolean | null;
  christmas_lights_now: string | null;
  looked_into_before: string | null;
  not_collected: string[] | null;
};

export type QuestionState = "answered" | "not_collected" | "open";

export function questionState(lead: QuestionLead, question: CountedQuestion): QuestionState {
  const value = lead[question];
  if (value !== null && value !== undefined && value !== "") return "answered";
  if (question === "phone" && lead.phone_saved === true) return "answered";
  return (lead.not_collected ?? []).includes(question) ? "not_collected" : "open";
}

export function collectedCount(lead: QuestionLead): number {
  return COUNTED_QUESTIONS.filter((question) => questionState(lead, question) === "answered").length;
}

// "5 of 6 collected": information only, never pay.
export function completenessLabel(lead: QuestionLead): string {
  return `${collectedCount(lead)} of ${COUNTED_QUESTIONS.length} collected`;
}

// A form's answers for some questions, as they travel: the answer's value,
// NOT_COLLECTED, or nothing yet.
export type AnswerMap = Partial<Record<CountedQuestion, string | null>>;

export function isQuestionDone(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && value !== "";
}

// The questions in a group that still need an answer or Not collected.
export function openQuestions(answers: AnswerMap, questions: CountedQuestion[]): CountedQuestion[] {
  return questions.filter((question) => !isQuestionDone(answers[question]));
}

// "Mark the rest Not collected": every open question in the group, in one tap.
export function markRestNotCollected(answers: AnswerMap, questions: CountedQuestion[]): AnswerMap {
  const next: AnswerMap = { ...answers };
  for (const question of openQuestions(answers, questions)) next[question] = NOT_COLLECTED;
  return next;
}

// A stored lead's answers as the form holds them.
export function answersOf(lead: QuestionLead): AnswerMap {
  const yesNo = (value: boolean | null, no: string) => (value === null ? null : value ? "yes" : no);
  const raw: Record<CountedQuestion, string | null> = {
    phone: lead.phone,
    owns_home: yesNo(lead.owns_home, "no"),
    wants_price: yesNo(lead.wants_price, "not_yet"),
    both_decision_makers: yesNo(lead.both_decision_makers, "no"),
    christmas_lights_now: lead.christmas_lights_now,
    looked_into_before: lead.looked_into_before,
  };
  const out: AnswerMap = {};
  for (const question of COUNTED_QUESTIONS) {
    out[question] = isQuestionDone(raw[question])
      ? raw[question]
      : (lead.not_collected ?? []).includes(question)
        ? NOT_COLLECTED
        : null;
  }
  return out;
}
