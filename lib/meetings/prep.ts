import { traceStillValid } from "@/lib/deck";
import { COUNTED_QUESTIONS, QUESTION_LABELS, questionState, type CountedQuestion, type QuestionLead } from "@/lib/leads/questions";
import { cleanFeet } from "@/lib/pricing";
import { parseOffers } from "@/lib/quotes/offers";

// The prep list (Keenan, 2026-11-08): what each meeting still needs before
// Keenan walks in. Each item says whether it's done; a meeting is Ready when
// they all are. Kept pure so the Meetings page, his Home, Schedule and the
// prep page agree, and so it is unit tested. Owner only: setters never see
// it, and setters don't confirm meetings.

export type PrepKey = "mockup" | "track_colour" | "quote" | "confirmed" | "answers" | "roofline";

export type PrepFacts = {
  hasMockup: boolean;
  hasTrackColour: boolean;
  // A quote drafted ahead (round 9): the lead has a quote with an offer
  // that covers at least one measured run (quoteDraftedAhead).
  hasQuoteWithRuns: boolean;
  // A booked meeting Keenan has confirmed with them; null when there's no
  // booked meeting (Start a meeting for someone walking in), and the item
  // doesn't apply.
  confirmedAt: string | null | undefined;
  hasMeeting: boolean;
  // The lead's six questions, for any left Not collected or unanswered.
  lead: QuestionLead;
  // Round 7, Branch B: the roofline traced for the light picker, on a photo
  // still on the lead and still in its slot (rooflineState below). Since
  // 2026-11-11 (Keenan: no light picker, no tracing) these are ignored and
  // no roofline item shows; the fields stay so nothing that passes them
  // breaks.
  rooflineTraced?: boolean;
  // A trace was saved, but its photo was replaced or removed since.
  rooflinePhotoChanged?: boolean;
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

// The prep list's items, in order. No "Roofline traced" item since
// 2026-11-11: the light picker left the meeting, so a meeting's readiness
// never asks for a trace ("roofline" stays in PrepKey, unused). Round 13
// (Keenan, 2026-11-11): the quote and the time to confirm come first, so
// they sit above the fold on the iPad however many mockups the house has;
// the mockups follow (an offer's picture is picked on the offer, in the
// quote, so the quote comes before them anyway), then the track colour.
export function prepItems(facts: PrepFacts): PrepItem[] {
  const missing = missingAnswers(facts.lead);
  const items: PrepItem[] = [{ key: "quote", label: PREP_LABELS.quote, done: facts.hasQuoteWithRuns }];
  if (facts.hasMeeting) items.push({ key: "confirmed", label: PREP_LABELS.confirmed, done: Boolean(facts.confirmedAt) });
  items.push(
    { key: "mockup", label: PREP_LABELS.mockup, done: facts.hasMockup },
    { key: "track_colour", label: PREP_LABELS.track_colour, done: facts.hasTrackColour },
  );
  items.push({
    key: "answers",
    label: PREP_LABELS.answers,
    done: missing.length === 0,
    detail: missing.length > 0 ? missing.map((question) => QUESTION_LABELS[question]).join(", ") : undefined,
  });
  return items;
}

// Quote drafted ahead (round 9, the spec 3.7): a quote counts once any of
// its offers covers at least one run with feet. A quote saved before offers
// is one full wrap over every run (parseOffers), so it counts as soon as a
// run has feet, as before.
export function quoteDraftedAhead(quote: { runs: unknown; offers?: unknown } | null | undefined): boolean {
  if (!quote || !Array.isArray(quote.runs)) return false;
  const feet = quote.runs.map((run) => (run && typeof run === "object" ? cleanFeet(Number((run as { feet?: unknown }).feet)) : 0));
  return parseOffers(quote.offers ?? [], feet.length).some((offer) => offer.runs.some((p) => feet[p] > 0));
}

// The offers a drafted quote shows, for prep's line: those covering a run
// with feet.
export function draftedOfferCount(quote: { runs: unknown; offers?: unknown } | null | undefined): number {
  if (!quote || !Array.isArray(quote.runs)) return 0;
  const feet = quote.runs.map((run) => (run && typeof run === "object" ? cleanFeet(Number((run as { feet?: unknown }).feet)) : 0));
  return parseOffers(quote.offers ?? [], feet.length).filter((offer) => offer.runs.some((p) => feet[p] > 0)).length;
}

// Prep item 6 (light_picker.tracing), word for word. Not on the prep list
// since 2026-11-11; the tracer, which nothing links to now, still reads
// ROOFLINE_PHOTO_CHANGED.
export const ROOFLINE_NOT_TRACED = "Roofline not traced. The light picker page is skipped.";
export const ROOFLINE_PHOTO_CHANGED = "The front photo changed. Trace it again.";

export type RooflineState = "traced" | "none" | "photo_changed";

// Whether a lead's roofline counts as traced: a trace exists and its photo
// is still the lead's, in the slot it had when traced (a replaced Front
// photo leaves the slot, so it's traced again).
export function rooflineState(
  trace: { photo_id: string; photo_slot: string | null } | null | undefined,
  photos: { id: string; slot: string | null }[],
): RooflineState {
  if (!trace) return "none";
  return traceStillValid(trace, photos) ? "traced" : "photo_changed";
}

// The prep facts for a roofline state.
export function rooflineFacts(state: RooflineState): Pick<PrepFacts, "rooflineTraced" | "rooflinePhotoChanged"> {
  return { rooflineTraced: state === "traced", rooflinePhotoChanged: state === "photo_changed" };
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

// What a traced roofline's item says: "Traced on the Front photo, about
// 155 lights."
const TRACE_PHOTO_NAMES: Record<string, string> = {
  front: "the Front photo",
  left_corner: "the Left corner photo",
  right_corner: "the Right corner photo",
};

export function rooflineDoneLine(slot: string | null, lightCount: number | null): string {
  const photo = (slot && TRACE_PHOTO_NAMES[slot]) || "your own photo";
  if (lightCount == null || !(lightCount > 0)) return `Traced on ${photo}.`;
  return `Traced on ${photo}, about ${lightCount} ${lightCount === 1 ? "light" : "lights"}.`;
}
