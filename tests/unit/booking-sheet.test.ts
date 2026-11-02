import { describe, expect, it } from "vitest";
import {
  canSaveLead,
  draftProblems,
  draftToLeadInput,
  emptyDraft,
  firstScreenToVisit,
  guidedPhotoCount,
  isScreenComplete,
  nextScreen,
  previousScreen,
  PROBLEM_SCREENS,
  savedFingerprint,
  SCREEN_TITLES,
  SCREENS,
  stepOf,
  STEPS,
  type SheetDraft,
} from "@/lib/booking/sheet";
import { parseLeadForm } from "@/lib/leads/schema";
import { sentence, timePhrase } from "@/lib/schedule/meetings";
import { calgaryInstant } from "@/lib/time";

// A lead ready to book: every Before you book item is met.
function ready(): SheetDraft {
  return {
    ...emptyDraft(),
    leadId: "00000000-0000-0000-0000-000000000001",
    first_name: "Sarah",
    last_name: "Chen",
    phone: "403 555 0177",
    owns_home: true,
    wants_price: true,
    christmas_lights_now: "hires",
    looked_into_before: "new_to_them",
    areas_wanted: "front_and_sides",
    install_timing: "before_christmas",
    everyone: true,
    address_line: "123 Evanston Way NW",
    neighbourhood: "Evanston",
    lat: 51.17,
    lng: -114.11,
    place_id: "abc",
    position_source: "picked",
    soffit_colour: "white",
    photo_slots: ["front", "left_corner", "right_corner"],
  };
}

describe("The booking sheet's steps", () => {
  it("has Keenan's three steps, in order, one screen at a time", () => {
    expect(STEPS.map((step) => step.label)).toEqual(["At the door", "After the door", "Book"]);
    expect(SCREENS).toEqual(["who", "find1", "find2", "everyone", "address", "soffit", "photos", "book"]);
    expect(SCREENS.map(stepOf)).toEqual(["door", "door", "door", "door", "after", "after", "after", "book"]);
    expect(SCREENS.every((screen) => SCREEN_TITLES[screen].length > 0)).toBe(true);
  });

  it("walks a new person through every screen, in order", () => {
    const draft = emptyDraft();
    const visited = ["who"];
    let screen = SCREENS[0];
    while (screen !== "book") {
      screen = nextScreen(screen, draft, false);
      visited.push(screen);
    }
    expect(visited).toEqual(SCREENS);
  });

  it("goes back one screen at a time, and nowhere from the first", () => {
    expect(previousScreen("who")).toBeNull();
    expect(previousScreen("find1")).toBe("who");
    expect(previousScreen("address")).toBe("everyone");
    expect(previousScreen("book")).toBe("photos");
  });

  it("skips what an existing lead already has, but never skips Book", () => {
    const draft = { ...ready(), everyone: false, soffit_colour: null };
    expect(firstScreenToVisit(draft)).toBe("everyone");
    expect(nextScreen("everyone", draft, true)).toBe("soffit");
    expect(nextScreen("soffit", draft, true)).toBe("book");
    expect(firstScreenToVisit(ready())).toBe("book");
    expect(firstScreenToVisit(emptyDraft())).toBe("who");
  });
});

describe("When a screen is done", () => {
  it("needs a first name and phone on who, and every answer on the Find out screens", () => {
    const draft = emptyDraft();
    expect(isScreenComplete("who", { ...draft, first_name: "Sarah" })).toBe(false);
    expect(isScreenComplete("who", { ...draft, first_name: "Sarah", phone: "4035550177" })).toBe(true);
    expect(isScreenComplete("find1", { ...draft, owns_home: false, wants_price: false, christmas_lights_now: "none" })).toBe(true);
    expect(isScreenComplete("find1", { ...draft, owns_home: true, wants_price: true })).toBe(false);
    expect(isScreenComplete("find2", { ...draft, looked_into_before: "got_quotes", areas_wanted: "not_sure" })).toBe(false);
  });

  it("needs a map position on the address, not just the words", () => {
    const draft = { ...emptyDraft(), address_line: "305 Brand New Way NW" };
    expect(isScreenComplete("address", draft)).toBe(false);
    expect(isScreenComplete("address", { ...draft, lat: 51.2, lng: -114.1, position_source: "device" })).toBe(true);
  });

  it("takes three guided photos, or a skip reason, with a note when the reason is Other", () => {
    const draft = emptyDraft();
    expect(isScreenComplete("photos", draft)).toBe(false);
    expect(isScreenComplete("photos", { ...draft, photo_slots: ["front", "left_corner", "soffit"] })).toBe(false);
    expect(guidedPhotoCount({ ...draft, photo_slots: ["front", "left_corner", "soffit"] })).toBe(2);
    expect(isScreenComplete("photos", { ...draft, photo_slots: ["front", "left_corner", "right_corner"] })).toBe(true);
    expect(isScreenComplete("photos", { ...draft, skip: "homeowner_said_no" })).toBe(true);
    expect(isScreenComplete("photos", { ...draft, skip: "other" })).toBe(false);
    expect(isScreenComplete("photos", { ...draft, skip: "other", skip_note: "Dog in the yard" })).toBe(true);
  });
});

describe("Before you book in the sheet", () => {
  it("is met by a ready lead, with nothing missing", () => {
    expect(draftProblems(ready())).toEqual([]);
    expect(isScreenComplete("book", ready())).toBe(true);
  });

  it("names every missing item with the database's codes, and each has a screen that fixes it", () => {
    const problems = draftProblems(emptyDraft());
    expect(problems).toEqual(["phone", "owns_home", "wants_price", "soffit_colour", "map_position", "photos", "everyone_deciding_present"]);
    expect(draftProblems({ ...ready(), photo_slots: [], skip: "other" })).toEqual(["photos_skip_note"]);
    for (const code of [...problems, "photos_skip_note"]) expect(PROBLEM_SCREENS[code]).toBeDefined();
    expect(PROBLEM_SCREENS.map_position).toBe("address");
    expect(PROBLEM_SCREENS.everyone_deciding_present).toBe("everyone");
  });

  it("treats No and Not yet as missing, the same as the database", () => {
    expect(draftProblems({ ...ready(), owns_home: false, wants_price: false })).toEqual(["owns_home", "wants_price"]);
  });
});

describe("Saving the lead from the sheet", () => {
  it("saves once there is a first name and an address, as the database needs", () => {
    expect(canSaveLead(emptyDraft())).toBe(false);
    expect(canSaveLead({ ...emptyDraft(), first_name: "Sarah" })).toBe(false);
    expect(canSaveLead({ ...emptyDraft(), first_name: "Sarah", address_line: "123 Evanston Way NW" })).toBe(true);
  });

  it("builds input the lead form's validator accepts, with the answers it expects", () => {
    const parsed = parseLeadForm(draftToLeadInput(ready()));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.values.owns_home).toBe(true);
    expect(parsed.values.wants_price).toBe(true);
    expect(parsed.values.looked_into_before).toBe("new_to_them");
    expect(parsed.values.lat).toBe(51.17);
    const notYet = parseLeadForm(draftToLeadInput({ ...ready(), owns_home: false, wants_price: false }));
    expect(notYet.ok && notYet.values.owns_home === false && notYet.values.wants_price === false).toBe(true);
  });

  it("saves again only when a lead field changed, not for the booking choices", () => {
    const draft = ready();
    const print = savedFingerprint(draft);
    expect(savedFingerprint({ ...draft, everyone: false, skip: "homeowner_said_no", photo_slots: [] })).toBe(print);
    expect(savedFingerprint({ ...draft, phone: "403 555 0100" })).not.toBe(print);
    expect(savedFingerprint({ ...draft, looked_into_before: "got_quotes" })).not.toBe(print);
  });
});

describe("Saying the time", () => {
  it("says tonight for tonight, and the day otherwise", () => {
    const tonight = calgaryInstant("2026-11-14", "19:30");
    expect(timePhrase(tonight, "2026-11-14")).toBe("7:30 p.m. tonight");
    expect(timePhrase(tonight, "2026-11-13")).toBe("Sat, Nov 14 at 7:30 p.m.");
  });

  it("ends the done screen's sentence once, after a time that ends in p.m.", () => {
    const at = calgaryInstant("2026-11-14", "17:00");
    expect(sentence(`Booked for ${timePhrase(at, "2026-11-13")}`)).toBe("Booked for Sat, Nov 14 at 5:00 p.m.");
    expect(sentence(`Booked for ${timePhrase(at, "2026-11-14")}`)).toBe("Booked for 5:00 p.m. tonight.");
  });
});
