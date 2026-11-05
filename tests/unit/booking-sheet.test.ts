import { describe, expect, it } from "vitest";
import {
  bookingBlockers,
  bookNeed,
  canBookDraft,
  canSaveLead,
  DOOR_QUESTIONS,
  draftAnswers,
  draftProblems,
  draftToLeadInput,
  emptyDraft,
  firstScreenToVisit,
  guidedPhotoCount,
  isScreenComplete,
  leadDraftFromSheet,
  LEARNED_QUESTIONS,
  markScreenNotCollected,
  nextScreen,
  previousScreen,
  PROBLEM_SCREENS,
  savedFingerprint,
  SCREEN_QUESTIONS,
  SCREEN_TITLES,
  SCREENS,
  screenMissing,
  screenOpenQuestions,
  sheetMissing,
  stepCount,
  stepOf,
  STEPS,
  toggleHotButton,
  withAnswer,
  withDraftDefaults,
  type SheetDraft,
} from "@/lib/booking/sheet";
import { defaultsFromDraft, readDraft } from "@/lib/leads/draft";
import { handOffToNewLead, takeHandOff } from "@/lib/leads/hand-off";
import { NOT_COLLECTED } from "@/lib/leads/questions";
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
  it("follows the visit: at the door, after the door, then Book, six screens", () => {
    expect(STEPS.map((step) => step.label)).toEqual(["At the door", "After the door", "Book"]);
    expect(SCREENS).toEqual(["who", "door", "learned", "address", "house", "book"]);
    expect(SCREENS.map(stepOf)).toEqual(["door", "door", "after", "after", "after", "book"]);
    expect(SCREENS.every((screen) => SCREEN_TITLES[screen].length > 0)).toBe(true);
  });

  it("asks only what booking needs at the door, the rest after it, and the phone last, on Book", () => {
    expect(SCREEN_QUESTIONS.who).toBeUndefined();
    expect(SCREEN_QUESTIONS.book).toEqual(["phone"]);
    expect(DOOR_QUESTIONS).toEqual(["owns_home", "wants_price", "both_decision_makers"]);
    expect(LEARNED_QUESTIONS).toEqual(["christmas_lights_now", "looked_into_before", "areas_wanted", "install_timing"]);
  });

  it("counts the steps that still need something, wherever the setter is (round 3)", () => {
    expect(stepCount("who", emptyDraft())).toEqual({ number: 1, total: 6, left: 6 });
    expect(stepCount("learned", emptyDraft())).toEqual({ number: 3, total: 6, left: 6 });
    expect(stepCount("book", ready())).toEqual({ number: 6, total: 6, left: 0 });
    // A step passed with an answer missing still counts.
    expect(stepCount("book", { ...ready(), install_timing: null })).toEqual({ number: 6, total: 6, left: 1 });
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
    expect(previousScreen("door")).toBe("who");
    expect(previousScreen("address")).toBe("learned");
    expect(previousScreen("book")).toBe("house");
  });

  it("skips what an existing lead already has, but never skips Book", () => {
    const draft = { ...ready(), everyone: null, soffit_colour: null };
    expect(firstScreenToVisit(draft)).toBe("door");
    // The soffit colour is asked with the address now.
    expect(nextScreen("door", draft, true)).toBe("address");
    expect(nextScreen("address", draft, true)).toBe("book");
    expect(nextScreen("door", { ...draft, soffit_colour: "white", photo_slots: [] }, true)).toBe("house");
    expect(firstScreenToVisit(ready())).toBe("book");
    expect(firstScreenToVisit(emptyDraft())).toBe("who");
  });
});

describe("When a screen is done", () => {
  it("needs only a first name on who; the phone or Not collected is Book's", () => {
    const draft = emptyDraft();
    expect(isScreenComplete("who", { ...draft, first_name: "Sarah" })).toBe(true);
    expect(isScreenComplete("who", draft)).toBe(false);
    expect(isScreenComplete("book", { ...draft, first_name: "Sarah" })).toBe(false);
    expect(isScreenComplete("book", { ...draft, phone: "4035550177" })).toBe(true);
    expect(isScreenComplete("book", withAnswer(draft, "phone", NOT_COLLECTED))).toBe(true);
  });

  it("needs every question at the door answered, Not collected included", () => {
    const draft = { ...emptyDraft(), owns_home: true, wants_price: true };
    expect(isScreenComplete("door", draft)).toBe(false);
    expect(screenOpenQuestions("door", draft)).toEqual(["both_decision_makers"]);
    expect(isScreenComplete("door", withAnswer(draft, "both_decision_makers", NOT_COLLECTED))).toBe(true);
    expect(isScreenComplete("door", { ...draft, everyone: false })).toBe(true);
  });

  it("finishes a screen in one tap with Mark the rest Not collected, keeping the answers given", () => {
    const draft = { ...emptyDraft(), christmas_lights_now: "diy" as const };
    expect(isScreenComplete("learned", draft)).toBe(false);
    const marked = markScreenNotCollected("learned", draft);
    expect(isScreenComplete("learned", marked)).toBe(true);
    expect(marked.christmas_lights_now).toBe("diy");
    expect([...marked.not_collected].sort()).toEqual(["areas_wanted", "install_timing", "looked_into_before"]);
    // Only that screen's questions.
    expect(isScreenComplete("door", marked)).toBe(false);
  });

  it("lets an answer replace Not collected, and clearing it leaves the question open", () => {
    let draft = withAnswer(emptyDraft(), "owns_home", NOT_COLLECTED);
    expect(draftAnswers(draft).owns_home).toBe(NOT_COLLECTED);
    draft = withAnswer(draft, "owns_home", "yes");
    expect(draft.owns_home).toBe(true);
    expect(draft.not_collected).toEqual([]);
    draft = withAnswer(draft, "owns_home", null);
    expect(draftAnswers(draft).owns_home).toBeNull();
    expect(withAnswer({ ...emptyDraft(), phone: "403" }, "phone", NOT_COLLECTED).phone).toBe("");
  });

  it("needs a map position on the address, not just the words, and the soffit colour with it", () => {
    const draft = { ...emptyDraft(), address_line: "305 Brand New Way NW", soffit_colour: "not_sure" as const };
    expect(isScreenComplete("address", draft)).toBe(false);
    const placed = { ...draft, lat: 51.2, lng: -114.1, position_source: "device" as const };
    expect(isScreenComplete("address", placed)).toBe(true);
    expect(isScreenComplete("address", { ...placed, soffit_colour: null })).toBe(false);
  });

  it("needs three guided photos on the photo step, or a skip reason with a note when it's Other", () => {
    const draft = emptyDraft();
    expect(isScreenComplete("house", draft)).toBe(false);
    expect(isScreenComplete("house", { ...draft, photo_slots: ["front", "left_corner", "soffit"] })).toBe(false);
    expect(guidedPhotoCount({ ...draft, photo_slots: ["front", "left_corner", "soffit"] })).toBe(2);
    expect(isScreenComplete("house", { ...draft, photo_slots: ["front", "left_corner", "right_corner"] })).toBe(true);
    expect(isScreenComplete("house", { ...draft, skip: "homeowner_said_no" })).toBe(true);
    expect(isScreenComplete("house", { ...draft, skip: "other" })).toBe(false);
    expect(isScreenComplete("house", { ...draft, skip: "other", skip_note: "Dog in the yard" })).toBe(true);
  });

  it("says at once which booking questions rule this time out: Not collected, No or Not yet", () => {
    expect(bookingBlockers(ready())).toEqual([]);
    expect(bookingBlockers(emptyDraft())).toEqual([]);
    const marked = markScreenNotCollected("door", { ...ready(), owns_home: true, wants_price: null, everyone: null });
    expect(bookingBlockers(marked)).toEqual(["wants_price", "both_decision_makers"]);
    expect(bookingBlockers({ ...ready(), owns_home: false, wants_price: false })).toEqual(["owns_home", "wants_price"]);
    expect(bookingBlockers(withAnswer(ready(), "phone", NOT_COLLECTED))).toEqual(["phone"]);
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
    expect(PROBLEM_SCREENS.everyone_deciding_present).toBe("door");
    expect(PROBLEM_SCREENS.soffit_colour).toBe("address");
    expect(PROBLEM_SCREENS.photos).toBe("house");
  });

  it("treats No and Not yet as missing, the same as the database", () => {
    expect(draftProblems({ ...ready(), owns_home: false, wants_price: false })).toEqual(["owns_home", "wants_price"]);
    expect(draftProblems({ ...ready(), everyone: false })).toEqual(["everyone_deciding_present"]);
  });

  it("never counts Not collected as an answer where booking needs a real one", () => {
    let draft = ready();
    for (const question of ["phone", "owns_home", "wants_price", "both_decision_makers"] as const) {
      draft = withAnswer(draft, question, NOT_COLLECTED);
    }
    expect(draftProblems(draft)).toEqual(["phone", "owns_home", "wants_price", "everyone_deciding_present"]);
    // What they learned after the door never blocks booking.
    expect(draftProblems(markScreenNotCollected("learned", { ...ready(), christmas_lights_now: null, looked_into_before: null, areas_wanted: null, install_timing: null }))).toEqual([]);
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
    expect(parsed.values.both_decision_makers).toBe(true);
    expect(parsed.values.looked_into_before).toBe("new_to_them");
    expect(parsed.values.lat).toBe(51.17);
    expect(parsed.values.not_collected).toEqual([]);
    const notYet = parseLeadForm(draftToLeadInput({ ...ready(), owns_home: false, wants_price: false, everyone: false }));
    expect(notYet.ok && notYet.values.owns_home === false && notYet.values.wants_price === false && notYet.values.both_decision_makers === false).toBe(true);
  });

  it("carries Not collected to the validator, the phone included", () => {
    let draft = { ...ready(), phone: "" };
    draft = withAnswer(draft, "phone", NOT_COLLECTED);
    draft = markScreenNotCollected("learned", { ...draft, christmas_lights_now: null, looked_into_before: null, areas_wanted: null, install_timing: null });
    const parsed = parseLeadForm(draftToLeadInput(draft));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.values.phone).toBeNull();
    expect([...parsed.values.not_collected].sort()).toEqual(["areas_wanted", "christmas_lights_now", "install_timing", "looked_into_before", "phone"]);
  });

  it("refuses to save while a question has neither an answer nor Not collected", () => {
    const parsed = parseLeadForm(draftToLeadInput({ ...ready(), install_timing: null }));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors.install_timing).toBe("Answer this, or mark it Not collected.");
  });

  it("saves again only when a lead field changed, not for the booking's own choices", () => {
    const draft = ready();
    const print = savedFingerprint(draft);
    expect(savedFingerprint({ ...draft, skip: "homeowner_said_no", photo_slots: [] })).toBe(print);
    expect(savedFingerprint({ ...draft, phone: "403 555 0100" })).not.toBe(print);
    expect(savedFingerprint({ ...draft, looked_into_before: "got_quotes" })).not.toBe(print);
    expect(savedFingerprint({ ...draft, everyone: false })).not.toBe(print);
    expect(savedFingerprint(withAnswer(draft, "install_timing", NOT_COLLECTED))).not.toBe(print);
  });

  it("sends a new person's save key with the save, and a new draft has none until its first save (2026-11-04)", () => {
    expect(emptyDraft().saveKey).toBeNull();
    expect(draftToLeadInput(emptyDraft()).save_key).toBe("");
    const key = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
    expect(draftToLeadInput({ ...ready(), leadId: null, saveKey: key }).save_key).toBe(key);
    // A draft kept on the phone before the save key existed.
    const { saveKey: _none, ...older } = emptyDraft();
    void _none;
    expect(draftToLeadInput(older as SheetDraft).save_key).toBe("");
  });

  it("doesn't count the save key as a change to save", () => {
    const draft = ready();
    expect(savedFingerprint({ ...draft, saveKey: "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b" })).toBe(savedFingerprint(draft));
  });
});

describe("Saying the time", () => {
  it("gives the held time its day in the sheet's header, and the weekday on Book unless it's tonight", async () => {
    const { heldTimeLabel, bookButtonLabel } = await import("@/lib/schedule/meetings");
    const at = calgaryInstant("2026-11-17", "17:00");
    expect(heldTimeLabel(at, "2026-11-17")).toBe("Tonight, 5:00 p.m.");
    expect(heldTimeLabel(at, "2026-11-16")).toBe("Tomorrow, 5:00 p.m.");
    expect(heldTimeLabel(at, "2026-11-03")).toBe("Tue, Nov 17, 5:00 p.m.");
    expect(bookButtonLabel(at, "2026-11-17")).toBe("Book 5:00 p.m.");
    expect(bookButtonLabel(at, "2026-11-16")).toBe("Book tomorrow 5:00 p.m.");
    expect(bookButtonLabel(at, "2026-11-03")).toBe("Book Tue 5:00 p.m.");
  });

  it("says tonight for tonight, tomorrow for tomorrow, and the day otherwise", () => {
    const tonight = calgaryInstant("2026-11-14", "19:30");
    expect(timePhrase(tonight, "2026-11-14")).toBe("7:30 p.m. tonight");
    expect(timePhrase(tonight, "2026-11-13")).toBe("7:30 p.m. tomorrow");
    expect(timePhrase(tonight, "2026-11-12")).toBe("Sat, Nov 14 at 7:30 p.m.");
  });

  it("ends the done screen's sentence once, after a time that ends in p.m.", () => {
    const at = calgaryInstant("2026-11-14", "17:00");
    expect(sentence(`Booked for ${timePhrase(at, "2026-11-12")}`)).toBe("Booked for Sat, Nov 14 at 5:00 p.m.");
    expect(sentence(`Booked for ${timePhrase(at, "2026-11-13")}`)).toBe("Booked for 5:00 p.m. tomorrow.");
    expect(sentence(`Booked for ${timePhrase(at, "2026-11-14")}`)).toBe("Booked for 5:00 p.m. tonight.");
  });
});

describe("Move freely, check at Book (round 3, Keenan, 2026-11-05)", () => {
  it("names what each step still needs, the photos with how many are left", () => {
    const none = { ...ready(), photo_slots: [] as SheetDraft["photo_slots"] };
    expect(screenMissing("house", none).map((item) => item.label)).toEqual(["Photos"]);
    expect(screenMissing("house", { ...none, photo_slots: ["front"] }).map((item) => item.label)).toEqual(["2 more photos"]);
    expect(screenMissing("house", { ...none, photo_slots: ["front", "left_corner"] }).map((item) => item.label)).toEqual(["1 more photo"]);
    expect(screenMissing("house", { ...none, skip: "other" }).map((item) => item.key)).toEqual(["photos_skip_note"]);
    expect(screenMissing("house", { ...none, skip: "other", skip_note: "Dog in the yard" })).toEqual([]);
    expect(screenMissing("house", { ...none, skip: "homeowner_said_no" })).toEqual([]);
    expect(screenMissing("address", { ...ready(), lat: null, lng: null }).map((item) => item.label)).toEqual(["Map position for the address"]);
    expect(screenMissing("address", { ...ready(), address_line: "", lat: null, lng: null }).map((item) => item.label)).toEqual(["Address"]);
  });

  it("lists everything missing in the order of the steps, each with its step", () => {
    const draft = { ...ready(), first_name: "", install_timing: null, phone: "", soffit_colour: null };
    expect(sheetMissing(draft).map((item) => [item.screen, item.key])).toEqual([
      ["who", "first_name"],
      ["learned", "install_timing"],
      ["address", "soffit_colour"],
      ["book", "phone"],
    ]);
    expect(sheetMissing(ready())).toEqual([]);
  });

  it("never counts the optional answers", () => {
    const bare = { ...ready(), house_type: null, setter_read: null, hot_buttons: [], confirm_by: null };
    expect(sheetMissing(bare)).toEqual([]);
    expect(canBookDraft(bare)).toBe(true);
  });

  it("books only once everything is answered, nothing rules it out and Before you book is met", () => {
    expect(canBookDraft(ready())).toBe(true);
    expect(canBookDraft({ ...ready(), install_timing: null })).toBe(false);
    expect(canBookDraft(withAnswer(ready(), "install_timing", NOT_COLLECTED))).toBe(true);
    expect(canBookDraft({ ...ready(), wants_price: false })).toBe(false);
    expect(canBookDraft(withAnswer(ready(), "phone", NOT_COLLECTED))).toBe(false);
    expect(canBookDraft({ ...ready(), photo_slots: ["front"] })).toBe(false);
  });

  it("walks the steps in order whatever is missing: Next never stops", () => {
    let screen = SCREENS[0];
    const visited = [screen];
    while (screen !== "book") {
      screen = nextScreen(screen, emptyDraft(), false);
      visited.push(screen);
    }
    expect(visited).toEqual(SCREENS);
  });

  it("says Book can't book yet while an answer rules it out, and how much is left otherwise", () => {
    expect(bookNeed(ready())).toBeNull();
    expect(bookNeed({ ...ready(), wants_price: false })).toBe("Can't book yet");
    expect(bookNeed(withAnswer(ready(), "phone", NOT_COLLECTED))).toBe("Can't book yet");
    expect(bookNeed({ ...ready(), soffit_colour: null })).toBe("1 left to answer");
    expect(bookNeed({ ...ready(), soffit_colour: null, photo_slots: [] })).toBe("2 left to answer");
    expect(bookNeed({ ...ready(), soffit_colour: null, owns_home: false })).toBe("Can't book yet");
    for (const label of ["Can't book yet", "9 left to answer", "Fix 7 first"]) expect(label.length).toBeLessThanOrEqual(21);
  });

  it("sends the phone to Book when the database refuses it", () => {
    expect(PROBLEM_SCREENS.phone).toBe("book");
  });
});

describe("The optional answers (round 3)", () => {
  it("takes any hot buttons that apply, with Not sure on its own", () => {
    expect(toggleHotButton([], "no_ladders")).toEqual(["no_ladders"]);
    expect(toggleHotButton(["no_ladders"], "curb_appeal")).toEqual(["no_ladders", "curb_appeal"]);
    expect(toggleHotButton(["no_ladders", "curb_appeal"], "not_sure")).toEqual(["not_sure"]);
    expect(toggleHotButton(["not_sure"], "safety_security")).toEqual(["safety_security"]);
    expect(toggleHotButton(["no_ladders"], "no_ladders")).toEqual([]);
  });

  it("saves them with the lead, and Not sure gives way to a real hot button", () => {
    const draft = { ...ready(), house_type: "two_storey" as const, setter_read: "hot" as const, hot_buttons: ["no_ladders" as const, "up_for_christmas" as const], confirm_by: "text" as const };
    const parsed = parseLeadForm(draftToLeadInput(draft));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.values.house_type).toBe("two_storey");
    expect(parsed.values.setter_read).toBe("hot");
    expect(parsed.values.hot_buttons).toEqual(["no_ladders", "up_for_christmas"]);
    expect(parsed.values.confirm_by).toBe("text");
    const mixed = parseLeadForm(draftToLeadInput({ ...draft, hot_buttons: ["not_sure", "curb_appeal"] }));
    expect(mixed.ok && mixed.values.hot_buttons).toEqual(["curb_appeal"]);
    const bare = parseLeadForm(draftToLeadInput(ready()));
    expect(bare.ok && [bare.values.setter_read, bare.values.hot_buttons, bare.values.confirm_by]).toEqual([null, [], null]);
  });

  it("changes the saved fingerprint, so a change to them is saved", () => {
    const print = savedFingerprint(ready());
    expect(savedFingerprint({ ...ready(), setter_read: "warm" })).not.toBe(print);
    expect(savedFingerprint({ ...ready(), hot_buttons: ["curb_appeal"] })).not.toBe(print);
    expect(savedFingerprint({ ...ready(), confirm_by: "call" })).not.toBe(print);
    expect(savedFingerprint({ ...ready(), house_type: "bungalow" })).not.toBe(print);
  });

  it("brings a draft kept before round 3 back with them empty and marked as not asked", () => {
    const { house_type: _h, setter_read: _r, hot_buttons: _b, confirm_by: _c, photo_paths: _p, extras: _e, ...older } = ready();
    void [_h, _r, _b, _c, _p, _e];
    const back = withDraftDefaults(older);
    expect([back.house_type, back.setter_read, back.hot_buttons, back.confirm_by, back.photo_paths, back.extras]).toEqual([null, null, [], null, {}, false]);
    expect(withDraftDefaults(ready()).extras).toBe(true);
  });
});

describe("Photos before the first save (round 3)", () => {
  it("attaches a new person's uploaded photos to their slots at the first save, never a saved lead's", () => {
    const paths = { front: "u/1.jpg", left_corner: "u/2.jpg" };
    const person = { ...ready(), leadId: null, photo_paths: paths };
    expect(draftToLeadInput(person)).toMatchObject({ photo_slot_front: "u/1.jpg", photo_slot_left_corner: "u/2.jpg", photo_slot_right_corner: "" });
    expect(draftToLeadInput({ ...ready(), photo_paths: paths })).toMatchObject({ photo_slot_front: "", photo_slot_left_corner: "" });
  });

  it("leaves uploads out of the saved fingerprint", () => {
    expect(savedFingerprint({ ...ready(), photo_paths: { front: "u/1.jpg" } })).toBe(savedFingerprint(ready()));
  });
});

describe("Keep as a lead", () => {
  const person = (): SheetDraft => ({
    ...emptyDraft(),
    first_name: "Sarah",
    last_name: "Chen",
    phone: "403 555 0177",
    owns_home: true,
    wants_price: false,
  });

  it("hands New lead everything entered, in New lead's own draft form", () => {
    const handed = leadDraftFromSheet(withAnswer(person(), "christmas_lights_now", NOT_COLLECTED), 1_000);
    expect(handed.from).toBe("sheet");
    expect(handed.savedAt).toBe(1_000);
    expect(handed.extraPhotos).toBe(0);
    const defaults = defaultsFromDraft(handed);
    expect(defaults.first_name).toBe("Sarah");
    expect(defaults.last_name).toBe("Chen");
    expect(defaults.phone).toBe("403 555 0177");
    expect(defaults.questions.owns_home).toBe("yes");
    expect(defaults.questions.wants_price).toBe("not_yet");
    expect(defaults.questions.christmas_lights_now).toBe(NOT_COLLECTED);
    expect(defaults.questions.both_decision_makers).toBeNull();
    expect(defaults.source).toBe("door");
  });

  it("carries a phone marked Not collected and an address already placed", () => {
    const placed = {
      ...withAnswer(person(), "phone", NOT_COLLECTED),
      address_line: "1 Test Street NW",
      lat: 51.04,
      lng: -114.07,
      position_source: "device" as const,
      position_accuracy_m: 12,
    };
    const defaults = defaultsFromDraft(leadDraftFromSheet(placed, 1_000));
    expect(defaults.phone_not_collected).toBe(true);
    expect(defaults.address.addressLine).toBe("1 Test Street NW");
    expect(defaults.address.lat).toBe(51.04);
    expect(defaults.address.positionSource).toBe("device");
    expect(defaults.address.accuracy).toBe(12);
  });

  it("hands New lead the save key of a first save whose answer was lost, so New lead can't make a copy", () => {
    const key = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
    const handed = leadDraftFromSheet({ ...person(), saveKey: key }, 1_000);
    expect(handed.values.save_key).toBe(key);
    expect(defaultsFromDraft(handed).saveKey).toBe(key);
    expect(leadDraftFromSheet(person(), 1_000).values.save_key).toBeUndefined();
    expect(defaultsFromDraft(leadDraftFromSheet(person(), 1_000)).saveKey).toBeNull();
  });

  it("keeps the hand-off's mark through New lead's storage, and only a recent one", () => {
    const handed = leadDraftFromSheet(person(), Date.now());
    expect(readDraft(JSON.stringify(handed), Date.now())?.from).toBe("sheet");
    expect(readDraft(JSON.stringify({ ...handed, from: undefined }), Date.now())?.from).toBeUndefined();
    handOffToNewLead(handed);
    expect(takeHandOff(Date.now())?.values.first_name).toBe("Sarah");
    expect(takeHandOff(Date.now())).toBeNull();
    handOffToNewLead({ ...handed, savedAt: Date.now() - 11 * 60_000 });
    expect(takeHandOff(Date.now())).toBeNull();
  });
});
