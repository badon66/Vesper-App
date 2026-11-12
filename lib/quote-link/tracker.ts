// "Where you're at" (round 17, Keenan, 2026-11-12), kept pure: four steps as
// lights along a roofline, the same words on the customer's link and on What
// happens next in the meeting (settings.deck.lines, tracker_*).
//
//   1. Meeting: done on every link.
//   2. Choose your option ("Choose and sign" when the agreement is ticked on
//      the link): done once they book, sign, or Keenan marks it accepted; in
//      the meeting, once they say yes at the table.
//   3. Site visit: done when Keenan marks it Done on the lead's Outcome card;
//      its date shows once he sets one.
//   4. Install day: shows the install date once set, done when Installed.
//
// Done steps are lit, the first one not done glows gently (the current
// step), and the ones after it are dim.

import { deckLine, type DeckLines } from "@/lib/deck";
import { formatDay, formatLongDay } from "@/lib/time";

export type TrackerStepKey = "meeting" | "choose" | "visit" | "install";
export type TrackerState = "done" | "current" | "later";

export type TrackerStep = {
  key: TrackerStepKey;
  label: string;
  text: string;
  state: TrackerState;
  // The step's date, short under its light ("Thu, Dec 3") and in full when
  // it is read ("Thursday, December 3"); null without one.
  date: { short: string; long: string } | null;
};

export type TrackerInput = {
  words: DeckLines;
  // Step 2 done: booked, signed or accepted on the link; said yes at the table.
  chosen: boolean;
  // The agreement is ticked for their link: step 2 reads "Choose and sign".
  sign?: boolean;
  siteVisitOn?: string | null;
  siteVisitDone?: boolean;
  installOn?: string | null;
  installed?: boolean;
};

const isDay = (value: string | null | undefined): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
const dateOf = (day: string | null | undefined) => (isDay(day) ? { short: formatDay(day), long: formatLongDay(day) } : null);

export function trackerSteps(input: TrackerInput): TrackerStep[] {
  const w = input.words;
  const installed = input.installed === true;
  const done: Record<TrackerStepKey, boolean> = {
    meeting: true,
    choose: input.chosen || installed,
    visit: input.siteVisitDone === true || installed,
    install: installed,
  };
  const order: TrackerStepKey[] = ["meeting", "choose", "visit", "install"];
  const current = order.find((key) => !done[key]) ?? null;
  const steps: Omit<TrackerStep, "state">[] = [
    { key: "meeting", label: deckLine(w, "tracker_meeting_label"), text: deckLine(w, "tracker_meeting"), date: null },
    {
      key: "choose",
      label: deckLine(w, input.sign ? "tracker_choose_sign_label" : "tracker_choose_label"),
      text: deckLine(w, "tracker_choose"),
      date: null,
    },
    { key: "visit", label: deckLine(w, "tracker_visit_label"), text: deckLine(w, "tracker_visit"), date: done.visit ? null : dateOf(input.siteVisitOn) },
    { key: "install", label: deckLine(w, "tracker_install_label"), text: deckLine(w, "tracker_install"), date: dateOf(input.installOn) },
  ];
  return steps.map((step) => ({
    ...step,
    state: done[step.key] ? "done" : step.key === current ? "current" : "later",
  }));
}

// The step read first: the current one, else the last (every step done).
export function openingStep(steps: readonly TrackerStep[]): TrackerStepKey {
  return steps.find((step) => step.state === "current")?.key ?? steps[steps.length - 1]?.key ?? "meeting";
}

// On the customer's link (round 17 critique): no step is open until they
// have chosen. Before then the current step's words only repeat the page
// ("Pick the option you want and book your install."), and on a phone they
// pushed the price under the bottom bar; a tap reads any step, as Keenan
// asked. Once they have chosen, the next step opens to start (the site
// visit, its day when set), since that is news.
export function linkOpeningStep(steps: readonly TrackerStep[]): TrackerStepKey | null {
  return steps.find((step) => step.key === "choose")?.state === "done" ? openingStep(steps) : null;
}
