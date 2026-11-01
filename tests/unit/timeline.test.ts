import { describe, expect, it } from "vitest";
import { describeEvent } from "@/lib/leads/timeline";

const base = { from_status: null, to_status: null, payload: null };

describe("describeEvent", () => {
  it("says plainly what happened", () => {
    expect(describeEvent({ ...base, type: "created", to_status: "new" })).toBe("Added the lead.");
    expect(describeEvent({ ...base, type: "photo_added" })).toBe("Added a photo.");
    expect(
      describeEvent({ ...base, type: "status_change", from_status: "new", to_status: "follow_up" }),
    ).toBe("Moved from New to Follow up.");
  });

  it("includes the lost reason", () => {
    expect(
      describeEvent({
        ...base,
        type: "status_change",
        from_status: "follow_up",
        to_status: "lost",
        payload: { reason: "price" },
      }),
    ).toBe("Moved from Follow up to Lost. Reason: price.");
  });

  it("includes the follow-up day", () => {
    expect(
      describeEvent({
        ...base,
        type: "status_change",
        from_status: "new",
        to_status: "follow_up",
        payload: { follow_up_on: "2026-10-30" },
      }),
    ).toBe("Moved from New to Follow up. Follow up on Fri, Oct 30.");
    expect(describeEvent({ ...base, type: "edited", payload: { fields: ["follow_up_on"] } })).toBe(
      "Changed the follow-up day.",
    );
  });

  it("returns a note as written", () => {
    expect(describeEvent({ ...base, type: "note", payload: { text: "Come back Thursday.\nAsk for Sam." } })).toBe(
      "Come back Thursday.\nAsk for Sam.",
    );
  });

  it("names changed fields in words, once each, never their values", () => {
    expect(
      describeEvent({ ...base, type: "edited", payload: { fields: ["first_name", "last_name", "lat", "lng", "place_id", "phone"] } }),
    ).toBe("Changed the name, map position and phone.");
    expect(describeEvent({ ...base, type: "edited", payload: { fields: ["notes"] } })).toBe("Changed the notes.");
    expect(describeEvent({ ...base, type: "edited", payload: null })).toBe("Edited the lead.");
  });

  it("names the slot of a guided photo", () => {
    expect(describeEvent({ ...base, type: "photo_added", payload: { photo_id: "x", slot: "front" } })).toBe(
      "Added the front photo.",
    );
    expect(describeEvent({ ...base, type: "photo_added", payload: { slot: "left_corner" } })).toBe(
      "Added the left corner photo.",
    );
    expect(describeEvent({ ...base, type: "photo_added", payload: { slot: "soffit" } })).toBe(
      "Added the soffit close-up photo.",
    );
    expect(describeEvent({ ...base, type: "photo_added", payload: { photo_id: "x" } })).toBe("Added a photo.");
    expect(describeEvent({ ...base, type: "photo_added", payload: { slot: "roof" } })).toBe("Added a photo.");
  });

  it("names the Find out questions that changed, never their answers", () => {
    expect(
      describeEvent({ ...base, type: "edited", payload: { fields: ["install_timing", "owns_home"] } }),
    ).toBe("Updated Find out: timing and owns the home.");
    expect(
      describeEvent({ ...base, type: "edited", payload: { fields: ["soffit_colour", "soffit_note"] } }),
    ).toBe("Updated Find out: soffit colour.");
    expect(
      describeEvent({
        ...base,
        type: "edited",
        payload: { fields: ["areas_wanted", "christmas_lights_now", "phone", "wants_price"] },
      }),
    ).toBe("Changed the phone. Updated Find out: which areas, Christmas lights now and wants a price.");
  });

  it("names a track colour change once", () => {
    expect(
      describeEvent({ ...base, type: "edited", payload: { fields: ["track_colour_id", "track_ral_code"] } }),
    ).toBe("Changed the track colour.");
  });

  it("copes with event types from later milestones", () => {
    expect(describeEvent({ ...base, type: "quote_created" })).toBe("Quote created.");
  });

  it("says when a meeting was booked, moved, cancelled or marked, never an amount", () => {
    expect(describeEvent({ ...base, type: "meeting_booked", payload: { meeting_id: "m", starts_at: "2026-11-02T23:35:00+00:00" } })).toBe(
      "Booked a meeting for Mon, Nov 2 at 5:35 p.m.",
    );
    expect(
      describeEvent({
        ...base,
        type: "meeting_moved",
        payload: { from_starts_at: "2026-11-02T23:35:00Z", starts_at: "2026-11-04T00:10:00Z" },
      }),
    ).toBe("Moved the meeting from Mon, Nov 2 at 5:35 p.m. to Tue, Nov 3 at 6:10 p.m.");
    expect(describeEvent({ ...base, type: "meeting_cancelled", payload: { starts_at: "2026-11-02T23:35:00Z" } })).toBe(
      "Cancelled the meeting on Mon, Nov 2 at 5:35 p.m. Follow up tomorrow.",
    );
    expect(describeEvent({ ...base, type: "meeting_outcome", payload: { outcome: "not_qualified", reason: "Decision maker missing" } })).toBe(
      "Marked the meeting Not qualified: Decision maker missing.",
    );
    expect(describeEvent({ ...base, type: "meeting_outcome", payload: { outcome: "qualified" } })).toBe("Marked the meeting Qualified.");
    expect(describeEvent({ ...base, type: "meeting_booked" })).toBe("Booked a meeting.");
  });
});
