import { describe, expect, it } from "vitest";
import { DECK_SLOTS, hasDash, hasExclamation, SHOOTING_STANDARD, SHOT_TIMES, SLOT_BY_KEY, type DeckSlot } from "@/lib/deck";
import { formatTime } from "@/lib/time";
import {
  BAND_PHOTO_ASPECT,
  blueHourAfter,
  calgarySunset,
  deckPhotoPaths,
  filledSlotCount,
  focusFromPoint,
  galleryPhotos,
  isDeckPhotoId,
  isFocus,
  isGallerySlot,
  movedSorts,
  nudgeFocus,
  photosInOrder,
  placeNewPhoto,
  referencesBySlot,
  slotCrop,
  slotsByWhen,
  slotStatus,
  sortGroup,
  SPLIT_PHOTO_ASPECT,
  standardPoints,
  withSortChanges,
} from "@/lib/photos-deck";

const ID = "0b8f5a3c-1d2e-4f50-9a6b-7c8d9e0f1a2b";
const slot = (key: string): DeckSlot => {
  const found = SLOT_BY_KEY.get(key);
  if (!found) throw new Error(key);
  return found;
};
let clock = 0;
const photo = (id: string, slotKey: string, sort: number) => ({ id, slot: slotKey, sort, created_at: `2026-11-08T0${clock++ % 10}:00:00Z` });

describe("where a photo lives", () => {
  it("names both files from the row's own id", () => {
    expect(deckPhotoPaths(ID)).toEqual({ path: `deck/${ID}.jpg`, thumbPath: `deck/${ID}-640.jpg` });
  });

  it("takes only a lowercase uuid as an id", () => {
    expect(isDeckPhotoId(ID)).toBe(true);
    expect(isDeckPhotoId(ID.toUpperCase())).toBe(false);
    expect(isDeckPhotoId("../other/file")).toBe(false);
    expect(isDeckPhotoId(undefined)).toBe(false);
  });
});

describe("order", () => {
  it("sorts by Keenan's order, then by when each was added", () => {
    const list = [
      { id: "c", slot: "gallery.more", sort: 1, created_at: "2026-11-08T03:00:00Z" },
      { id: "a", slot: "gallery.more", sort: 0, created_at: "2026-11-08T05:00:00Z" },
      { id: "b", slot: "gallery.more", sort: 1, created_at: "2026-11-08T01:00:00Z" },
    ];
    expect(photosInOrder(list).map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps one order across every gallery slot, and each other slot to itself", () => {
    expect(sortGroup("gallery.snow")).toBe("gallery");
    expect(sortGroup("gallery.more")).toBe("gallery");
    expect(sortGroup("phone_control.screens")).toBe("phone_control.screens");
    expect(isGallerySlot("gallery.holiday")).toBe(true);
    expect(isGallerySlot("warranty.hero")).toBe(false);
    const list = [photo("x", "gallery.snow", 2), photo("y", "warranty.hero", 0), photo("z", "gallery.bungalow", 1)];
    expect(galleryPhotos(list).map((item) => item.id)).toEqual(["z", "x"]);
  });

  it("adds a photo at the end of its slot", () => {
    const screens = [photo("s1", "phone_control.screens", 0), photo("s2", "phone_control.screens", 1)];
    expect(placeNewPhoto(screens, "new", "phone_control.screens")).toEqual({ sort: 2, changes: [] });
    expect(placeNewPhoto([], "new", "warranty.hero")).toEqual({ sort: 0, changes: [] });
  });

  it("keeps warm whites first and the holiday look last in the gallery", () => {
    const gallery = [photo("g1", "gallery.two_storey", 0), photo("h1", "gallery.holiday", 1)];
    expect(placeNewPhoto(gallery, "new", "gallery.snow")).toEqual({ sort: 1, changes: [{ id: "h1", sort: 2 }] });
    expect(placeNewPhoto(gallery, "new", "gallery.holiday")).toEqual({ sort: 2, changes: [] });
    // Gaps left by a removed photo close up as the order is renumbered.
    const gappy = [photo("g1", "gallery.two_storey", 0), photo("g2", "gallery.more", 5)];
    expect(placeNewPhoto(gappy, "new", "gallery.more")).toEqual({ sort: 2, changes: [{ id: "g2", sort: 1 }] });
  });

  it("moves a photo one place, and nowhere past either end", () => {
    const list = [photo("a", "gallery.more", 0), photo("b", "gallery.more", 1), photo("c", "gallery.more", 2)];
    expect(movedSorts(list, "c", -1)).toEqual([
      { id: "c", sort: 1 },
      { id: "b", sort: 2 },
    ]);
    expect(movedSorts(list, "a", -1)).toEqual([]);
    expect(movedSorts(list, "c", 1)).toEqual([]);
    expect(movedSorts(list, "missing", 1)).toEqual([]);
  });

  it("updates the screen's own copy with the new order", () => {
    const list = [photo("a", "gallery.more", 0), photo("b", "gallery.more", 1)];
    const moved = withSortChanges(list, [
      { id: "a", sort: 1 },
      { id: "b", sort: 0 },
    ]);
    expect(photosInOrder(moved).map((item) => item.id)).toEqual(["b", "a"]);
    expect(withSortChanges(list, [])).toBe(list);
  });
});

describe("what a customer sees today", () => {
  it("counts each slot once, however many photos it holds, out of 20", () => {
    expect(DECK_SLOTS).toHaveLength(20);
    expect(filledSlotCount([])).toBe(0);
    expect(filledSlotCount([{ slot: "gallery.more" }, { slot: "gallery.more" }, { slot: "warranty.hero" }, { slot: "nowhere.at_all" }])).toBe(2);
  });

  it("says Your photo once one is in", () => {
    expect(slotStatus(slot("warranty.hero"), [{ slot: "warranty.hero" }])).toEqual({ filled: true, text: "Your photo" });
    expect(slotStatus(slot("phone_control.screens"), [{ slot: "phone_control.screens" }])).toEqual({ filled: true, text: "Your photos, 1 of 3" });
  });

  it("names the fallback an empty slot shows", () => {
    expect(slotStatus(slot("what_vesper_is.hero"), []).text).toBe("Empty: customers see the drawing");
    expect(slotStatus(slot("phone_control.hero"), []).text).toBe("Empty: customers see the drawing");
    expect(slotStatus(slot("install_day.hero"), []).text).toBe("Empty: words only");
    // Up close shows the eave drawn by day until its photo is in (round 7 review).
    expect(slot("hidden_by_day.more").fallback).toBe("drawing_eave");
    expect(slotStatus(slot("hidden_by_day.more"), []).text).toBe("Empty: customers see the drawing");
    expect(slotStatus(slot("install_day.more"), []).text).toBe("Empty: words only");
    expect(slotStatus(slot("gallery.snow"), []).text).toBe("Empty: page skipped");
    expect(slotStatus(slot("gallery.snow"), [{ slot: "gallery.more" }]).text).toBe("Empty: the gallery shows your other photos");
  });

  it("says the drawn pair stays until both halves of a pair are in", () => {
    expect(slotStatus(slot("hidden_by_day.day"), [{ slot: "hidden_by_day.day" }])).toEqual({
      filled: true,
      text: "Your photo. Customers see the drawings until its pair is in.",
    });
    expect(slotStatus(slot("hidden_by_day.night"), [{ slot: "hidden_by_day.day" }]).text).toBe("Empty: customers see the drawings until this is in");
    expect(slotStatus(slot("whites_first.cool"), [{ slot: "whites_first.warm" }, { slot: "whites_first.cool" }]).text).toBe("Your photo");
  });
});

describe("crops and the focus point", () => {
  it("crops band photos wide and split pages and Mores tall, and leaves screenshots and the pair whole", () => {
    expect(BAND_PHOTO_ASPECT).toBeCloseTo(2.056, 2);
    expect(SPLIT_PHOTO_ASPECT).toBeCloseTo(0.806, 2);
    expect(slotCrop(slot("what_vesper_is.hero"))?.aspect).toBe(BAND_PHOTO_ASPECT);
    expect(slotCrop(slot("hidden_by_day.night"))?.aspect).toBe(BAND_PHOTO_ASPECT);
    expect(slotCrop(slot("gallery.garage"))?.aspect).toBe(BAND_PHOTO_ASPECT);
    expect(slotCrop(slot("install_day.hero"))?.aspect).toBe(SPLIT_PHOTO_ASPECT);
    expect(slotCrop(slot("warranty.hero"))?.aspect).toBe(SPLIT_PHOTO_ASPECT);
    expect(slotCrop(slot("what_vesper_is.more"))?.aspect).toBe(SPLIT_PHOTO_ASPECT);
    expect(slotCrop(slot("phone_control.screens"))).toBeNull();
    expect(slotCrop(slot("whites_first.warm"))).toBeNull();
  });

  it("turns a tap into a point from 0 to 1, kept on the photo", () => {
    const box = { left: 100, top: 50, width: 400, height: 300 };
    expect(focusFromPoint(box, 300, 200)).toEqual({ x: 0.5, y: 0.5 });
    expect(focusFromPoint(box, 100, 50)).toEqual({ x: 0, y: 0 });
    expect(focusFromPoint(box, 700, -20)).toEqual({ x: 1, y: 0 });
    expect(focusFromPoint(box, 233, 140)).toEqual({ x: 0.333, y: 0.3 });
    expect(focusFromPoint({ ...box, width: 0 }, 1, 1)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("moves the point a step with the arrow keys", () => {
    expect(nudgeFocus({ x: 0.5, y: 0.5 }, "ArrowLeft")).toEqual({ x: 0.45, y: 0.5 });
    expect(nudgeFocus({ x: 0.5, y: 0.5 }, "ArrowDown")).toEqual({ x: 0.5, y: 0.55 });
    expect(nudgeFocus({ x: 0.98, y: 0.02 }, "ArrowRight")).toEqual({ x: 1, y: 0.02 });
    expect(nudgeFocus({ x: 0.5, y: 0.02 }, "ArrowUp")).toEqual({ x: 0.5, y: 0 });
    expect(nudgeFocus({ x: 0.5, y: 0.5 }, "Enter")).toBeNull();
  });

  it("takes only a point on the photo", () => {
    expect(isFocus(0, 1)).toBe(true);
    expect(isFocus(1.01, 0.5)).toBe(false);
    expect(isFocus("0.5", 0.5)).toBe(false);
    expect(isFocus(Number.NaN, 0.5)).toBe(false);
  });
});

describe("the shot list's text", () => {
  it("lists the shooting standard point by point", () => {
    const { night, day } = standardPoints(SHOOTING_STANDARD);
    expect(night[0]).toBe("15 to 30 minutes after that day's sunset (in Calgary in November, sunset is about 5:45 pm), sky deep blue, not black");
    expect(night).toContain("Landscape (phone held sideways). Any iPhone photo is big enough");
    expect(night).toContain("Garage closed and driveway empty");
    expect(night.at(-1)).toMatch(/^The roofline inside the middle 60% of the height/);
    expect(night.every((point) => !point.endsWith(".") && /^[A-Z0-9]/.test(point))).toBe(true);
    expect(day).toBe("Bright overcast or open shade, sun behind the camera.");
  });

  it("says it in plain words, with the looks' own names", () => {
    // No pixel counts or exposure values for Keenan to work out.
    for (const text of [SHOOTING_STANDARD, ...DECK_SLOTS.map((item) => item.scenario), ...SHOT_TIMES.map((time) => time.note)]) {
      expect(text).not.toMatch(/\b\d+\s?px\b|\bEV\b/);
    }
    expect(slot("what_vesper_is.hero").scenario).toMatch(/Landscape \(phone held sideways\)\. Any iPhone photo is big enough\.$/);
    // Game night is "Red and gold" in the looks, so the shot list says so.
    expect(slot("gallery.holiday").scenario).toContain("Game night (red and gold)");
    expect(DECK_SLOTS.some((item) => /amber/i.test(item.scenario))).toBe(false);
  });

  it("asks for a white balance step the iPhone's own Camera app can do, or names an app that can", () => {
    for (const item of DECK_SLOTS) {
      if (/white balance/i.test(item.scenario)) expect(item.scenario, item.key).toMatch(/camera app that can lock it/);
    }
    expect(slot("whites_first.warm").scenario).toMatch(/Lightroom or Halide/);
  });

  it("groups example links by slot, best first", () => {
    const refs = [
      { slot: "warranty.hero", rank: 2, id: "b" },
      { slot: "gallery.snow", rank: 1, id: "c" },
      { slot: "warranty.hero", rank: 1, id: "a" },
    ];
    const grouped = referencesBySlot(refs);
    expect(grouped.get("warranty.hero")?.map((ref) => ref.id)).toEqual(["a", "b"]);
    expect(grouped.get("gallery.snow")?.map((ref) => ref.id)).toEqual(["c"]);
    expect(grouped.get("cover.none")).toBeUndefined();
  });
});

describe("the shot list by when to shoot", () => {
  it("gives every slot a time and the shot in one short line", () => {
    const times = new Set(SHOT_TIMES.map((time) => time.key));
    for (const item of DECK_SLOTS) {
      expect(times.has(item.when), item.key).toBe(true);
      expect(item.line.length, item.key).toBeGreaterThan(10);
      expect(item.line.length, item.key).toBeLessThanOrEqual(80);
      expect(item.line, item.key).toMatch(/^[A-Z].*\.$/);
      expect(hasDash(item.line) || hasExclamation(item.line), item.key).toBe(false);
    }
  });

  it("groups the slots under Daylight, Blue hour, After a snowfall and Install day, each in deck order", () => {
    const groups = slotsByWhen();
    expect(groups.map((group) => group.label)).toEqual(["Daylight", "Blue hour", "After a snowfall", "Install day"]);
    expect(groups.flatMap((group) => group.slots)).toHaveLength(DECK_SLOTS.length);
    for (const group of groups) {
      const order = group.slots.map((item) => DECK_SLOTS.indexOf(item));
      expect(order).toEqual([...order].sort((a, b) => a - b));
    }
    const keys = (label: string) => groups.find((group) => group.label === label)?.slots.map((item) => item.key);
    expect(keys("Daylight")).toEqual(["hidden_by_day.day", "hidden_by_day.more", "phone_control.screens"]);
    expect(keys("After a snowfall")).toEqual(["gallery.snow", "warranty.hero"]);
    expect(keys("Install day")).toEqual(["install_day.hero", "install_day.more"]);
    expect(keys("Blue hour")).toContain("hidden_by_day.night");
    expect(keys("Blue hour")).toContain("whites_first.warm");
  });

  it("says when blue hour is in Calgary's own time (Alberta Time, UTC-6 all year)", () => {
    const blue = SHOT_TIMES.find((time) => time.key === "blue_hour");
    expect(blue?.note).toBe("Sunset is about 5:45 pm in November, so shoot from about 6:00 to 6:15 while the sky is deep blue.");
    // November's sunsets, worked out: about 6:10 pm on the 1st, 5:35 pm on the 30th.
    const clock = (day: string) => formatTime((calgarySunset(day) as Date).toISOString());
    const minutes = (day: string) => {
      const sunset = calgarySunset(day) as Date;
      return ((sunset.getUTCHours() - 6 + 24) % 24) * 60 + sunset.getUTCMinutes();
    };
    expect(minutes("2026-11-01")).toBeGreaterThan(17 * 60 + 45);
    expect(minutes("2026-11-30")).toBeLessThan(17 * 60 + 45);
    expect(Math.abs(minutes("2026-11-15") - (17 * 60 + 45))).toBeLessThanOrEqual(5);
    expect(clock("2026-11-15")).toMatch(/^5:4\d p\.m\.$/);
  });

  it("works out today's sunset on the device, to within a few minutes of the almanac", () => {
    const at = (day: string) => (calgarySunset(day) as Date).getTime();
    const near = (day: string, utc: string) => expect(Math.abs(at(day) - Date.parse(utc))).toBeLessThan(4 * 60_000);
    // Calgary's published sunsets (Alberta Time from 2026-11-01, Mountain before).
    near("2026-11-09", "2026-11-09T23:55:00Z");
    near("2026-12-21", "2026-12-21T23:30:00Z");
    // Summer sunsets fall after midnight UTC: still that Calgary evening.
    near("2027-06-21", "2027-06-22T03:56:00Z");
    expect(calgarySunset("2026-02-30")).toBeNull();
    expect(calgarySunset("today")).toBeNull();
    const sunset = calgarySunset("2026-11-09") as Date;
    const blue = blueHourAfter(sunset);
    expect(blue.from.getTime() - sunset.getTime()).toBe(15 * 60_000);
    expect(blue.to.getTime() - sunset.getTime()).toBe(30 * 60_000);
  });

  it("leaves out a time with no slots", () => {
    expect(slotsByWhen([slot("gallery.snow")]).map((group) => group.key)).toEqual(["snowfall"]);
    expect(slotsByWhen([])).toEqual([]);
  });
});
