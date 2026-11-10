import { describe, expect, it } from "vitest";
import { mainPicture, offerPicture, parseLinkMockups } from "@/lib/quote-link/view";
import { mockupJobs, withOffer, withRole, type LeadMockupItem } from "@/lib/leads/mockup-roles";

// Mockups per house (round 10, Keenan, 2026-11-10): the customer's link
// shows each option's own mockup, else the Main, else nothing; the lead
// page's taps keep one Main, one Day and one Night per house.

describe("parseLinkMockups", () => {
  it("keeps the path, Main and offers, and drops anything malformed", () => {
    expect(
      parseLinkMockups([
        { path: "a/b.jpg", main: true, offers: [] },
        { path: "a/c.jpg", main: false, offers: ["front"] },
        { path: "", main: true, offers: [] },
        { main: true },
        "nonsense",
        { path: "a/d.jpg", main: "yes", offers: "front" },
      ]),
    ).toEqual([
      { path: "a/b.jpg", main: true, offers: [] },
      { path: "a/c.jpg", main: false, offers: ["front"] },
      { path: "a/d.jpg", main: false, offers: [] },
    ]);
  });

  it("is empty for anything that isn't a list", () => {
    expect(parseLinkMockups(null)).toEqual([]);
    expect(parseLinkMockups({ path: "a/b.jpg" })).toEqual([]);
  });
});

describe("offerPicture", () => {
  const main = { url: "main", main: true, offers: [] as string[] };
  const lower = { url: "lower", main: false, offers: ["front_lower"] };
  const both = { url: "both", main: false, offers: ["front", "full"] };

  it("shows the option's own mockup first", () => {
    expect(offerPicture([main, lower, both], "front_lower")).toEqual({ picture: lower, own: true });
    expect(offerPicture([main, lower, both], "full")).toEqual({ picture: both, own: true });
  });

  it("falls back to the Main", () => {
    expect(offerPicture([main, lower], "full")).toEqual({ picture: main, own: false });
    expect(offerPicture([main], null)).toEqual({ picture: main, own: false });
  });

  it("is nothing without its own picture or a Main", () => {
    expect(offerPicture([lower], "full")).toBeNull();
    expect(offerPicture([], "full")).toBeNull();
  });

  it("a Main marked for an offer is that offer's own", () => {
    const mainForFront = { url: "m", main: true, offers: ["front"] };
    expect(offerPicture([mainForFront], "front")).toEqual({ picture: mainForFront, own: true });
    expect(mainPicture([lower, mainForFront])).toBe(mainForFront);
  });
});

describe("the Mockups section's taps", () => {
  const item = (id: string, extra: Partial<LeadMockupItem> = {}): LeadMockupItem => ({
    id,
    url: null,
    name: id,
    main: false,
    day: false,
    night: false,
    scene: false,
    offers: [],
    ...extra,
  });

  it("moves Main, Day and Night to the picture tapped", () => {
    const list = [item("a", { main: true, day: true }), item("b")];
    const moved = withRole(list, "b", "main", true);
    expect(moved.map((m) => m.main)).toEqual([false, true]);
    expect(moved[0].day).toBe(true);
    expect(withRole(list, "b", "day", true).map((m) => m.day)).toEqual([false, true]);
  });

  it("lets many pictures be phone scenes", () => {
    const list = [item("a", { scene: true }), item("b")];
    expect(withRole(list, "b", "scene", true).map((m) => m.scene)).toEqual([true, true]);
  });

  it("turns a role off on that picture only", () => {
    const list = [item("a", { main: true }), item("b", { night: true })];
    expect(withRole(list, "a", "main", false).map((m) => [m.main, m.night])).toEqual([
      [false, false],
      [false, true],
    ]);
  });

  it("toggles an offer without doubling it", () => {
    const list = [item("a", { offers: ["front"] })];
    expect(withOffer(list, "a", "front", true)[0].offers).toEqual(["front"]);
    expect(withOffer(list, "a", "full", true)[0].offers).toEqual(["front", "full"]);
    expect(withOffer(list, "a", "front", false)[0].offers).toEqual([]);
  });

  it("names what a picture does", () => {
    const offers = [{ id: "front_lower", name: "Front lower" }];
    expect(mockupJobs(item("a", { main: true, scene: true, offers: ["front_lower", "gone"] }), offers)).toEqual([
      "Main",
      "Phone scene",
      "Front lower",
    ]);
  });
});
