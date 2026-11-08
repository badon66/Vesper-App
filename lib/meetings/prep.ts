import { COUNTED_QUESTIONS, QUESTION_LABELS, questionState, type CountedQuestion, type QuestionLead } from "@/lib/leads/questions";

// The prep list (Keenan, 2026-11-08): what each meeting still needs before
// Keenan walks in. Each item says whether it's done; a meeting is Ready when
// they all are. Kept pure so the Meetings page, his Home, Schedule and the
// prep page agree, and so it is unit tested. Owner only: setters never see
// it, and setters don't confirm meetings.

export type PrepKey = "mockup" | "track_colour" | "quote" | "confirmed" | "answers" | "roofline";

export type PrepFacts = {
  hasMockup: boolean;
  hasTrackColour: boolean;
  // A quote drafted ahead: the lead has a quote with at least one run.
  hasQuoteWithRuns: boolean;
  // A booked meeting Keenan has confirmed with them; null when there's no
  // booked meeting (Start a meeting for someone walking in), and the item
  // doesn't apply.
  confirmedAt: string | null | undefined;
  hasMeeting: boolean;
  // The lead's six questions, for any left Not collected or unanswered.
  lead: QuestionLead;
  // Round 7, Branch B: the roofline traced on the front photo for the light
  // picker. undefined until that branch adds it, and the item doesn't show.
  rooflineTraced?: boolean;
};

export type PrepItem = { key: PrepKey; label: string; done: boolean; detail?: string };

export const PREP_LABELS: Record<PrepKey, string> = {
  mockup: "Mockup uploaded",
  track_colour: "Track colour set",
  quote: "Quote drafted",
  confirmed: "Time confirmed",
  answers: "Missing answers filled",
  roofline: "Roofline traced",
};

// The six questions still without a real answer: Not collected, or never
// asked.
export function missingAnswers(lead: QuestionLead): CountedQuestion[] {
  return COUNTED_QUESTIONS.filter((question) => questionState(lead, question) !== "answered");
}

export function prepItems(facts: PrepFacts): PrepItem[] {
  const missing = missingAnswers(facts.lead);
  const items: PrepItem[] = [
    { key: "mockup", label: PREP_LABELS.mockup, done: facts.hasMockup },
    { key: "track_colour", label: PREP_LABELS.track_colour, done: facts.hasTrackColour },
    { key: "quote", label: PREP_LABELS.quote, done: facts.hasQuoteWithRuns },
  ];
  if (facts.hasMeeting) items.push({ key: "confirmed", label: PREP_LABELS.confirmed, done: Boolean(facts.confirmedAt) });
  items.push({
    key: "answers",
    label: PREP_LABELS.answers,
    done: missing.length === 0,
    detail: missing.length > 0 ? missing.map((question) => QUESTION_LABELS[question]).join(", ") : undefined,
  });
  if (facts.rooflineTraced !== undefined) items.push({ key: "roofline", label: PREP_LABELS.roofline, done: facts.rooflineTraced });
  return items;
}

export type PrepSummary = { ready: boolean; left: number; items: PrepItem[]; line: string };

// "Ready", or "3 left: mockup, quote, time confirmed".
export function prepSummary(facts: PrepFacts): PrepSummary {
  const items = prepItems(facts);
  const open = items.filter((item) => !item.done);
  const line =
    open.length === 0
      ? "Ready"
      : `${open.length} left: ${open.map((item) => SHORT[item.key]).join(", ")}`;
  return { ready: open.length === 0, left: open.length, items, line };
}

const SHORT: Record<PrepKey, string> = {
  mockup: "mockup",
  track_colour: "track colour",
  quote: "quote",
  confirmed: "confirm the time",
  answers: "missing answers",
  roofline: "roofline",
};

// The ready-made confirmation text (Keenan, 2026-11-08), from the wording in
// Settings: {first_name}, {day} ("tonight", "tomorrow" or "Thursday") and
// {time} ("7:30") are filled in. Keenan edits it in Messages before sending.
export function confirmationText(template: string, values: { firstName: string; day: string; time: string }): string {
  return template
    .replaceAll("{first_name}", values.firstName.trim())
    .replaceAll("{day}", values.day)
    .replaceAll("{time}", values.time)
    .replace(/\s+/g, " ")
    .trim();
}

// "tonight", "tomorrow", or the weekday ("Thursday"), for the text.
export function confirmationDay(meetingDay: string, today: string, tomorrow: string, weekday: string): string {
  if (meetingDay === today) return "tonight";
  if (meetingDay === tomorrow) return "tomorrow";
  return weekday;
}

// "7:30" from "7:30 p.m.": the meetings are all in the evening.
export function confirmationTime(time: string): string {
  return time.replace(/\s*[ap]\.m\.$/i, "").trim();
}

// An sms: link that opens Messages with the text filled in, on an iPhone
// and elsewhere ("?&body=" is the form both read).
export function smsLink(phone: string, body: string): string {
  return `sms:${phone}?&body=${encodeURIComponent(body)}`;
}

export const DEFAULT_CONFIRM_TEXT = "Hi {first_name}, it's Keenan with Vesper Lighting. Just confirming {day} at {time}. See you then!";
