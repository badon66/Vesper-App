import { describe, expect, it } from "vitest";
import {
  confirmationDay,
  confirmationText,
  confirmationTime,
  DEFAULT_CONFIRM_TEXT,
  missingAnswers,
  prepItems,
  prepSummary,
  smsLink,
  type PrepFacts,
} from "@/lib/meetings/prep";

// Round 7, Branch A (Keenan, 2026-11-08): the prep list each meeting shows.
const answered = {
  phone: "+14035550199",
  owns_home: true,
  wants_price: true,
  both_decision_makers: true,
  christmas_lights_now: "hires",
  looked_into_before: "new_to_them",
  not_collected: [],
};
const ready: PrepFacts = {
  hasMockup: true,
  hasTrackColour: true,
  hasQuoteWithRuns: true,
  confirmedAt: "2026-11-08T00:12:00Z",
  hasMeeting: true,
  lead: answered,
};

describe("The prep list", () => {
  it("is Ready when every item is done", () => {
    expect(prepSummary(ready)).toMatchObject({ ready: true, left: 0, line: "Ready" });
    expect(prepItems(ready).map((item) => item.key)).toEqual(["mockup", "track_colour", "quote", "confirmed", "answers"]);
  });

  it("says how many are left, and which", () => {
    const summary = prepSummary({ ...ready, hasMockup: false, confirmedAt: null });
    expect(summary).toMatchObject({ ready: false, left: 2, line: "2 left: mockup, confirm the time" });
  });

  it("names the questions left Not collected or never answered", () => {
    const lead = { ...answered, phone: null, christmas_lights_now: null, not_collected: ["phone"] };
    expect(missingAnswers(lead)).toEqual(["phone", "christmas_lights_now"]);
    const item = prepItems({ ...ready, lead }).find((entry) => entry.key === "answers");
    expect(item).toMatchObject({ done: false, detail: "Phone, Christmas lights now" });
  });

  it("counts a phone saved on someone else's lead as answered", () => {
    expect(missingAnswers({ ...answered, phone: null, phone_saved: true })).toEqual([]);
  });

  it("has no confirm item without a booked meeting, and a roofline item once Branch B adds it", () => {
    expect(prepItems({ ...ready, hasMeeting: false, confirmedAt: null }).map((item) => item.key)).not.toContain("confirmed");
    expect(prepItems({ ...ready, rooflineTraced: false }).at(-1)).toMatchObject({ key: "roofline", done: false });
  });
});

describe("The confirmation text", () => {
  it("fills in the name, the day and the time", () => {
    expect(confirmationText(DEFAULT_CONFIRM_TEXT, { firstName: "Todd ", day: "tonight", time: "7:30" })).toBe(
      "Hi Todd, it's Keenan with Vesper Lighting. Just confirming tonight at 7:30. See you then!",
    );
  });

  it("says tonight, tomorrow or the weekday, and the time without p.m.", () => {
    expect(confirmationDay("2026-11-07", "2026-11-07", "2026-11-08", "Saturday")).toBe("tonight");
    expect(confirmationDay("2026-11-08", "2026-11-07", "2026-11-08", "Sunday")).toBe("tomorrow");
    expect(confirmationDay("2026-11-10", "2026-11-07", "2026-11-08", "Tuesday")).toBe("Tuesday");
    expect(confirmationTime("7:30 p.m.")).toBe("7:30");
  });

  it("opens Messages with the text filled in", () => {
    expect(smsLink("+14035550199", "Hi Todd, see you at 7:30!")).toBe("sms:+14035550199?&body=Hi%20Todd%2C%20see%20you%20at%207%3A30!");
  });
});
