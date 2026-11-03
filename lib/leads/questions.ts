// The questions a lead counts (round 2, Keenan, 2026-11-03): each takes an
// answer or "Not collected", and "6 of 8 collected" counts the real
// answers. Kept pure so the form, the booking sheet, the lead page and the
// meeting cards all agree, and so it is unit tested.

export const NOT_COLLECTED = "not_collected";
export const NOT_COLLECTED_LABEL = "Not collected";

export type CountedQuestion =
  | "phone"
  | "owns_home"
  | "wants_price"
  | "both_decision_makers"
  | "christmas_lights_now"
  | "looked_into_before"
  | "areas_wanted"
  | "install_timing";

// In the order they are asked: at the door, then after it.
export const COUNTED_QUESTIONS: CountedQuestion[] = [
  "phone",
  "owns_home",
  "wants_price",
  "both_decision_makers",
  "christmas_lights_now",
  "looked_into_before",
  "areas_wanted",
  "install_timing",
];

export const QUESTION_LABELS: Record<CountedQuestion, string> = {
  phone: "Phone",
  owns_home: "Owns the home",
  wants_price: "Wants a price",
  both_decision_makers: "Everyone who decides will be there",
  christmas_lights_now: "Christmas lights now",
  looked_into_before: "Looked into it before",
  areas_wanted: "Which areas",
  install_timing: "Timing",
};

export const EVERYONE_OPTIONS: { value: "yes" | "no"; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

// What a lead holds for the counted questions.
export type QuestionLead = {
  phone: string | null;
  owns_home: boolean | null;
  wants_price: boolean | null;
  both_decision_makers: boolean | null;
  christmas_lights_now: string | null;
  looked_into_before: string | null;
  areas_wanted: string | null;
  install_timing: string | null;
  not_collected: string[] | null;
};

export type QuestionState = "answered" | "not_collected" | "open";

export function questionState(lead: QuestionLead, question: CountedQuestion): QuestionState {
  const value = lead[question];
  if (value !== null && value !== undefined && value !== "") return "answered";
  return (lead.not_collected ?? []).includes(question) ? "not_collected" : "open";
}

export function collectedCount(lead: QuestionLead): number {
  return COUNTED_QUESTIONS.filter((question) => questionState(lead, question) === "answered").length;
}

// "6 of 8 collected": information only, never pay.
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
    areas_wanted: lead.areas_wanted,
    install_timing: lead.install_timing,
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
