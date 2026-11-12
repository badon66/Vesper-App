import { describe, expect, it } from "vitest";
import { DEFAULT_LINES } from "@/lib/deck";
import { openingStep, trackerSteps, type TrackerInput } from "@/lib/quote-link/tracker";

// Where you're at (round 17, Keenan, 2026-11-12): four steps as lights along
// a roofline, the same words on the customer's link and on the meeting's
// What happens next. Done steps are lit, the first one not done is current,
// the ones after it wait.

const words = DEFAULT_LINES;
const base: TrackerInput = { words, chosen: false };
const states = (input: TrackerInput) => trackerSteps(input).map((step) => [step.key, step.state]);

describe("where you're at", () => {
  it("has the four steps in Keenan's words, in order", () => {
    expect(trackerSteps(base).map((step) => [step.label, step.text])).toEqual([
      ["Meeting", "We met and walked through your house."],
      ["Choose your option", "Pick the option you want and book your install."],
      [
        "Site visit",
        "Keenan comes by to measure up close, take photos for your install and check your track colour against your soffit. Then you pick your install day.",
      ],
      [
        "Install day",
        "We fit your custom track, wire and test every light, clean up, set up the app on your phone with you, and leave your warranty and documents.",
      ],
    ]);
    expect(words.tracker_title).toBe("Where you're at");
    expect(words.tracker_pay).toBe("You pay nothing until it's installed and you're happy with it.");
  });

  it("has the meeting done on every link, and choosing current until they choose", () => {
    expect(states(base)).toEqual([
      ["meeting", "done"],
      ["choose", "current"],
      ["visit", "later"],
      ["install", "later"],
    ]);
  });

  it("names step 2 Choose and sign when the agreement is ticked for their link", () => {
    expect(trackerSteps({ ...base, sign: true })[1].label).toBe("Choose and sign");
    expect(trackerSteps({ ...base, sign: false })[1].label).toBe("Choose your option");
  });

  it("lights step 2 once they book, sign or Keenan marks it accepted, and the site visit is next", () => {
    expect(states({ ...base, chosen: true })).toEqual([
      ["meeting", "done"],
      ["choose", "done"],
      ["visit", "current"],
      ["install", "later"],
    ]);
  });

  it("shows the site visit's date until it is done, then the install day is current", () => {
    const planned = trackerSteps({ ...base, chosen: true, siteVisitOn: "2026-12-03" });
    expect(planned[2].date).toEqual({ short: "Thu, Dec 3", long: "Thursday, December 3" });
    const visited = trackerSteps({ ...base, chosen: true, siteVisitOn: "2026-12-03", siteVisitDone: true });
    expect(visited[2]).toMatchObject({ state: "done", date: null });
    expect(visited[3].state).toBe("current");
  });

  it("shows the install date once set, and every step lit once Installed", () => {
    const day = trackerSteps({ ...base, chosen: true, siteVisitDone: true, installOn: "2026-12-10" });
    expect(day[3]).toMatchObject({ state: "current", date: { short: "Thu, Dec 10", long: "Thursday, December 10" } });
    const installed = trackerSteps({ ...base, installed: true, installOn: "2026-12-10" });
    expect(installed.map((step) => step.state)).toEqual(["done", "done", "done", "done"]);
    expect(installed[3].date?.long).toBe("Thursday, December 10");
  });

  it("ignores a date that isn't a day", () => {
    const odd = trackerSteps({ ...base, siteVisitOn: "soon", installOn: "2026-13" });
    expect([odd[2].date, odd[3].date]).toEqual([null, null]);
  });

  it("opens on the current step, or the last when every step is done", () => {
    expect(openingStep(trackerSteps(base))).toBe("choose");
    expect(openingStep(trackerSteps({ ...base, chosen: true }))).toBe("visit");
    expect(openingStep(trackerSteps({ ...base, installed: true }))).toBe("install");
  });

  it("uses Keenan's own words when he changes them in Settings", () => {
    const own = trackerSteps({ ...base, words: { ...words, tracker_visit_label: "Measure up", tracker_visit: "Keenan measures." } });
    expect([own[2].label, own[2].text]).toEqual(["Measure up", "Keenan measures."]);
  });
});
