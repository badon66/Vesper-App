import { describe, expect, it } from "vitest";
import {
  confirmationDay,
  confirmationText,
  confirmationTime,
  DEFAULT_CONFIRM_TEXT,
  missingAnswers,
  draftedOfferCount,
  prepItems,
  prepSummary,
  quoteDraftedAhead,
  ROOFLINE_NOT_TRACED,
  ROOFLINE_PHOTO_CHANGED,
  rooflineDoneLine,
  rooflineFacts,
  rooflineState,
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
  rooflineTraced: true,
};

describe("The prep list", () => {
  it("is Ready when every item is done", () => {
    expect(prepSummary(ready)).toMatchObject({ ready: true, left: 0, line: "Ready" });
    expect(prepItems(ready).map((item) => item.key)).toEqual(["mockup", "track_colour", "quote", "confirmed", "answers", "roofline"]);
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

  it("has no confirm item without a booked meeting, and no roofline item when it isn't known", () => {
    expect(prepItems({ ...ready, hasMeeting: false, confirmedAt: null }).map((item) => item.key)).not.toContain("confirmed");
    expect(prepItems({ ...ready, rooflineTraced: undefined }).map((item) => item.key)).not.toContain("roofline");
  });
});

// Round 7, Branch B (light_picker.tracing): prep item 6, Roofline traced.
describe("The roofline item", () => {
  const photos = [
    { id: "front-1", slot: "front" },
    { id: "extra-1", slot: null },
  ];

  it("says the light picker page is skipped until the roofline is traced", () => {
    const item = prepItems({ ...ready, ...rooflineFacts(rooflineState(null, photos)) }).at(-1);
    expect(item).toMatchObject({ key: "roofline", label: "Roofline traced", done: false, detail: ROOFLINE_NOT_TRACED });
    expect(ROOFLINE_NOT_TRACED).toBe("Roofline not traced. The light picker page is skipped.");
    expect(prepSummary({ ...ready, rooflineTraced: false })).toMatchObject({ ready: false, line: "1 left: roofline" });
  });

  it("is done while the photo it was traced on is still the lead's, in its slot", () => {
    expect(rooflineState({ photo_id: "front-1", photo_slot: "front" }, photos)).toBe("traced");
    expect(rooflineState({ photo_id: "extra-1", photo_slot: null }, photos)).toBe("traced");
    const item = prepItems({ ...ready, ...rooflineFacts("traced") }).at(-1);
    expect(item).toMatchObject({ done: true, detail: undefined });
  });

  it("asks for it again once the front photo is replaced or removed", () => {
    // A new Front photo takes the slot: the old one becomes an extra.
    const replaced = [
      { id: "front-2", slot: "front" },
      { id: "front-1", slot: null },
    ];
    expect(rooflineState({ photo_id: "front-1", photo_slot: "front" }, replaced)).toBe("photo_changed");
    expect(rooflineState({ photo_id: "front-1", photo_slot: "front" }, [])).toBe("photo_changed");
    const item = prepItems({ ...ready, ...rooflineFacts("photo_changed") }).at(-1);
    expect(item).toMatchObject({ done: false, detail: ROOFLINE_PHOTO_CHANGED });
    expect(ROOFLINE_PHOTO_CHANGED).toBe("The front photo changed. Trace it again.");
  });

  it("names the photo and the lights once traced", () => {
    expect(rooflineDoneLine("front", 155)).toBe("Traced on the Front photo, about 155 lights.");
    expect(rooflineDoneLine("left_corner", 1)).toBe("Traced on the Left corner photo, about 1 light.");
    expect(rooflineDoneLine(null, null)).toBe("Traced on your own photo.");
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

// Round 9 (2026-11-10): Quote drafted ahead counts once an offer covers a
// measured run.
describe("Quote drafted ahead", () => {
  const runs = [
    { name: "Front", feet: 60, level: "lower" },
    { name: "Garage", feet: 0, level: "lower" },
  ];

  it("counts a quote saved before offers once a run has feet", () => {
    expect(quoteDraftedAhead({ runs, offers: [] })).toBe(true);
    expect(quoteDraftedAhead({ runs })).toBe(true);
    expect(quoteDraftedAhead({ runs: [{ name: "Front", feet: 0, level: "lower" }], offers: [] })).toBe(false);
    expect(quoteDraftedAhead({ runs: [], offers: [] })).toBe(false);
    expect(quoteDraftedAhead(null)).toBe(false);
  });

  it("counts offers only once one covers a run with feet", () => {
    expect(quoteDraftedAhead({ runs, offers: [{ id: "a", name: "Garage", runs: [1] }] })).toBe(false);
    expect(quoteDraftedAhead({ runs, offers: [{ id: "a", name: "Garage", runs: [1] }, { id: "b", name: "Front", runs: [0] }] })).toBe(true);
    expect(draftedOfferCount({ runs, offers: [{ id: "a", name: "Garage", runs: [1] }, { id: "b", name: "Front", runs: [0, 1] }] })).toBe(1);
  });
});
