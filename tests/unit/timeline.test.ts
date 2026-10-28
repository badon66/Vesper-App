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

  it("copes with event types from later milestones", () => {
    expect(describeEvent({ ...base, type: "meeting_booked" })).toBe("Meeting booked.");
  });
});
