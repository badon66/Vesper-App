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
  meetsLeadRules,
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
  toFinishLater,
  toggleHotButton,
  typedProblem,
  withAnswer,
  withDraftDefaults,
  type SheetDraft,
} from "@/lib/booking/sheet";
import { addressToCome, nameToCome, NAME_OR_ADDRESS, parseSheetLead } from "@/lib/booking/sheet-lead";
import { defaultsFromDraft, readDraft } from "@/lib/leads/draft";
import { handOffToNewLead, takeHandOff } from "@/lib/leads/hand-off";
import { NOT_COLLECTED } from "@/lib/leads/questions";
import { parseLeadForm } from "@/lib/leads/schema";
import { sentence, timePhrase } from "@/lib/schedule/meetings";
import { calgaryInstant } from "@/lib/time";

// A lead with everything in: nothing left to finish later.
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
    expect(LEARNED_QUESTIONS).toEqual(["christmas_lights_now", "looked_into_before"]);
  });

  it("counts the answers still missing on every step (round 3)", () => {
    const empty = emptyDraft();
    expect(stepCount("who", empty)).toEqual({ number: 1, total: 6, left: sheetMissing(empty).length });
    expect(stepCount("learned", empty)).toEqual({ number: 3, total: 6, left: sheetMissing(empty).length });
    // Not collected is dealt with on the steps, though it's still to finish later.
    const marked = withAnswer(ready(), "christmas_lights_now", NOT_COLLECTED);
    expect(stepCount("book", marked).left).toBe(0);
    expect(toFinishLater(marked).map((item) => item.key)).toEqual(["christmas_lights_now"]);
    expect(stepCount("book", ready())).toEqual({ number: 6, total: 6, left: 0 });
    // An answer missing on a step already passed still counts.
    expect(stepCount("book", { ...ready(), christmas_lights_now: null })).toEqual({ number: 6, total: 6, left: 1 });
    expect(stepCount("book", { ...ready(), christmas_lights_now: null, looked_into_before: null })).toEqual({ number: 6, total: 6, left: 2 });
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
    expect([...marked.not_collected].sort()).toEqual(["looked_into_before"]);
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

  it("says at once when an answer rules this time out: only a No on owns the home (2026-11-10)", () => {
    expect(bookingBlockers(ready())).toEqual([]);
    expect(bookingBlockers(emptyDraft())).toEqual([]);
    expect(bookingBlockers({ ...ready(), owns_home: false })).toEqual(["owns_home"]);
    // Not collected, and a No on wants a price or on everyone who decides, are finished later or are answers.
    const marked = markScreenNotCollected("door", { ...ready(), owns_home: null, wants_price: null, everyone: null });
    expect(bookingBlockers(marked)).toEqual([]);
    expect(bookingBlockers({ ...ready(), wants_price: false, everyone: false })).toEqual([]);
    expect(bookingBlockers(withAnswer(ready(), "phone", NOT_COLLECTED))).toEqual([]);
  });
});

// Book now, finish later (Keenan, 2026-11-10): Book needs a held time, a
// first name or the address, and no No on owns the home.
describe("What Book needs", () => {
  it("books a person with only a name, or only an address, and nothing else", () => {
    const nameOnly = { ...emptyDraft(), first_name: "Sarah" };
    const addressOnly = { ...emptyDraft(), address_line: "305 Brand New Way NW" };
    expect(canBookDraft(nameOnly)).toBe(true);
    expect(canBookDraft(addressOnly)).toBe(true);
    expect(bookNeed(nameOnly)).toBeNull();
    expect(canBookDraft(emptyDraft())).toBe(false);
    expect(bookNeed(emptyDraft())).toBe("Add a name or address");
    // A last name alone isn't the first name the database needs.
    expect(canBookDraft({ ...emptyDraft(), last_name: "Chen" })).toBe(false);
  });

  it("can't book a No on owns the home, and says so before anything else", () => {
    expect(bookNeed({ ...ready(), owns_home: false })).toBe("Can't book");
    expect(bookNeed({ ...emptyDraft(), owns_home: false })).toBe("Can't book");
    expect(canBookDraft({ ...ready(), owns_home: false })).toBe(false);
    expect(draftProblems({ ...ready(), owns_home: false })).toEqual(["owns_home"]);
    expect(draftProblems({ ...emptyDraft(), owns_home: null })).toEqual([]);
  });

  it("never stops for the phone, the door questions, the soffit, the photos or the map position", () => {
    const thin = { ...emptyDraft(), first_name: "Sarah" };
    expect(canBookDraft(withAnswer(thin, "phone", NOT_COLLECTED))).toBe(true);
    expect(canBookDraft({ ...thin, wants_price: false, everyone: false })).toBe(true);
    expect(canBookDraft(markScreenNotCollected("door", thin))).toBe(true);
    expect(canBookDraft({ ...ready(), photo_slots: ["front"], soffit_colour: null, lat: null, lng: null })).toBe(true);
  });

  it("keeps what Book says short enough for its button", () => {
    for (const label of ["Can't book", "Add a name or address", "Check the phone", "Check the soffit"]) expect(label.length).toBeLessThanOrEqual(21);
  });

  it("points at what was typed and can't be saved: a phone that isn't one, a split soffit without its note", () => {
    expect(typedProblem(ready())).toBeNull();
    expect(typedProblem({ ...ready(), phone: "12" })).toMatchObject({ key: "phone", screen: "book" });
    expect(typedProblem(withAnswer({ ...ready(), phone: "" }, "phone", NOT_COLLECTED))).toBeNull();
    expect(typedProblem({ ...ready(), soffit_colour_2: "off_white", soffit_note: "" })).toMatchObject({ key: "soffit_note", screen: "address" });
    expect(typedProblem({ ...ready(), soffit_colour_2: "off_white", soffit_note: "White at the front" })).toBeNull();
    // Book says it on its button, and the list to finish later leaves it out.
    expect(canBookDraft({ ...ready(), phone: "12" })).toBe(false);
    expect(bookNeed({ ...ready(), phone: "12" })).toBe("Check the phone");
    expect(bookNeed({ ...ready(), soffit_colour_2: "off_white", soffit_note: "" })).toBe("Check the soffit");
    expect(toFinishLater({ ...ready(), soffit_colour_2: "off_white", soffit_note: "" })).toEqual([]);
    // A name or address comes first, then what was typed.
    expect(bookNeed({ ...emptyDraft(), phone: "12" })).toBe("Add a name or address");
  });

  it("sends a database refusal to the step that fixes it", () => {
    expect(PROBLEM_SCREENS.owns_home).toBe("door");
    expect(PROBLEM_SCREENS.photos_skip_note).toBe("house");
  });
});

describe("To finish later, on Book", () => {
  it("is empty for a lead with everything in", () => {
    expect(toFinishLater(ready())).toEqual([]);
  });

  it("lists everything still missing in the order of the steps, each with its step", () => {
    const thin = { ...emptyDraft(), first_name: "Sarah" };
    expect(toFinishLater(thin).map((item) => [item.screen, item.key])).toEqual([
      ["door", "owns_home"],
      ["door", "wants_price"],
      ["door", "both_decision_makers"],
      ["learned", "christmas_lights_now"],
      ["learned", "looked_into_before"],
      ["address", "map_position"],
      ["address", "soffit_colour"],
      ["house", "photos"],
      ["book", "phone"],
    ]);
    expect(toFinishLater({ ...emptyDraft(), address_line: "1 Test Street NW", lat: 51.04, lng: -114.07 })[0]).toMatchObject({ key: "first_name", screen: "who" });
  });

  it("counts Not collected as still to finish, as the lead page and the reminder do", () => {
    let draft = ready();
    for (const question of ["phone", "owns_home", "wants_price", "both_decision_makers"] as const) draft = withAnswer(draft, question, NOT_COLLECTED);
    expect(toFinishLater(draft).map((item) => item.key)).toEqual(["owns_home", "wants_price", "both_decision_makers", "phone"]);
    // Every step is still dealt with, so Next skips them for a lead.
    expect(sheetMissing(draft)).toEqual([]);
  });

  it("takes a No on wants a price or on everyone who decides as an answer", () => {
    expect(toFinishLater({ ...ready(), wants_price: false, everyone: false })).toEqual([]);
  });

  it("takes a skip reason for the photos, Other only with its note", () => {
    const none = { ...ready(), photo_slots: [] as SheetDraft["photo_slots"] };
    expect(toFinishLater({ ...none, skip: "homeowner_said_no" })).toEqual([]);
    expect(toFinishLater({ ...none, skip: "other" }).map((item) => item.key)).toEqual(["photos_skip_note"]);
    expect(toFinishLater({ ...none, skip: "other", skip_note: "Dog in the yard" })).toEqual([]);
    expect(toFinishLater({ ...none, photo_slots: ["front"] }).map((item) => item.label)).toEqual(["2 more photos"]);
  });
});

describe("Saving the lead from the sheet", () => {
  it("saves at Book once there is a first name or the address (2026-11-10)", () => {
    expect(canSaveLead(emptyDraft())).toBe(false);
    expect(canSaveLead({ ...emptyDraft(), first_name: "Sarah" })).toBe(true);
    expect(canSaveLead({ ...emptyDraft(), address_line: "123 Evanston Way NW" })).toBe(true);
    expect(canSaveLead({ ...emptyDraft(), first_name: " ", address_line: " " })).toBe(false);
  });

  it("saves on Next only what New lead could save", () => {
    expect(meetsLeadRules(ready())).toBe(true);
    expect(meetsLeadRules({ ...ready(), first_name: "" })).toBe(false);
    expect(meetsLeadRules({ ...ready(), address_line: "" })).toBe(false);
    expect(meetsLeadRules({ ...ready(), looked_into_before: null })).toBe(false);
    expect(meetsLeadRules(withAnswer(ready(), "looked_into_before", NOT_COLLECTED))).toBe(true);
    expect(meetsLeadRules({ ...ready(), phone: "12" })).toBe(false);
    expect(meetsLeadRules(withAnswer({ ...ready(), phone: "" }, "phone", NOT_COLLECTED))).toBe(true);
    expect(meetsLeadRules({ ...ready(), phone: "" })).toBe(false);
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
    draft = markScreenNotCollected("learned", { ...draft, christmas_lights_now: null, looked_into_before: null });
    const parsed = parseLeadForm(draftToLeadInput(draft));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.values.phone).toBeNull();
    expect([...parsed.values.not_collected].sort()).toEqual(["christmas_lights_now", "looked_into_before", "phone"]);
  });

  it("refuses to save while a question has neither an answer nor Not collected", () => {
    const parsed = parseLeadForm(draftToLeadInput({ ...ready(), looked_into_before: null }));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors.looked_into_before).toBe("Answer this, or mark it Not collected.");
  });

  it("saves again only when a lead field changed, not for the booking's own choices", () => {
    const draft = ready();
    const print = savedFingerprint(draft);
    expect(savedFingerprint({ ...draft, skip: "homeowner_said_no", photo_slots: [] })).toBe(print);
    expect(savedFingerprint({ ...draft, phone: "403 555 0100" })).not.toBe(print);
    expect(savedFingerprint({ ...draft, looked_into_before: "got_quotes" })).not.toBe(print);
    expect(savedFingerprint({ ...draft, everyone: false })).not.toBe(print);
    expect(savedFingerprint(withAnswer(draft, "christmas_lights_now", NOT_COLLECTED))).not.toBe(print);
    // Round 6: a note on an answer is saved like any change.
    expect(savedFingerprint({ ...draft, answer_notes: { owns_home: "Wife owns it" } })).not.toBe(print);
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
    const draft = { ...ready(), first_name: "", looked_into_before: null, phone: "", soffit_colour: null };
    expect(sheetMissing(draft).map((item) => [item.screen, item.key])).toEqual([
      ["who", "first_name"],
      ["learned", "looked_into_before"],
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

  it("books with answers still missing, and only a No on owns the home stops it (2026-11-10)", () => {
    expect(canBookDraft(ready())).toBe(true);
    expect(canBookDraft({ ...ready(), christmas_lights_now: null })).toBe(true);
    expect(canBookDraft({ ...ready(), wants_price: false })).toBe(true);
    expect(canBookDraft(withAnswer(ready(), "phone", NOT_COLLECTED))).toBe(true);
    expect(canBookDraft({ ...ready(), photo_slots: ["front"] })).toBe(true);
    expect(canBookDraft({ ...ready(), owns_home: false })).toBe(false);
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

  it("says on Book only what stops it, never how much is left to finish", () => {
    expect(bookNeed(ready())).toBeNull();
    expect(bookNeed({ ...ready(), wants_price: false })).toBeNull();
    expect(bookNeed(withAnswer(ready(), "phone", NOT_COLLECTED))).toBeNull();
    expect(bookNeed({ ...ready(), soffit_colour: null, photo_slots: [] })).toBeNull();
    expect(bookNeed({ ...ready(), soffit_colour: null, owns_home: false })).toBe("Can't book");
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
    const draft = { ...ready(), house_type: "two_storey" as const, setter_read: "hot" as const, hot_buttons: ["no_ladders" as const, "up_for_christmas" as const] };
    const parsed = parseLeadForm(draftToLeadInput(draft));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.values.house_type).toBe("two_storey");
    expect(parsed.values.setter_read).toBe("hot");
    expect(parsed.values.hot_buttons).toEqual(["no_ladders", "up_for_christmas"]);
    const mixed = parseLeadForm(draftToLeadInput({ ...draft, hot_buttons: ["not_sure", "curb_appeal"] }));
    expect(mixed.ok && mixed.values.hot_buttons).toEqual(["curb_appeal"]);
    const bare = parseLeadForm(draftToLeadInput(ready()));
    expect(bare.ok && [bare.values.setter_read, bare.values.hot_buttons]).toEqual([null, []]);
  });

  it("changes the saved fingerprint, so a change to them is saved", () => {
    const print = savedFingerprint(ready());
    expect(savedFingerprint({ ...ready(), setter_read: "warm" })).not.toBe(print);
    expect(savedFingerprint({ ...ready(), hot_buttons: ["curb_appeal"] })).not.toBe(print);
    expect(savedFingerprint({ ...ready(), house_type: "bungalow" })).not.toBe(print);
  });

  it("brings a draft kept before round 3 back with them empty and marked as not asked", () => {
    const { house_type: _h, setter_read: _r, hot_buttons: _b, photo_paths: _p, extras: _e, answer_notes: _n, soffit_colour_2: _s, ...older } = ready();
    void [_h, _r, _b, _p, _e, _n, _s];
    const back = withDraftDefaults(older);
    expect([back.house_type, back.setter_read, back.hot_buttons, back.photo_paths, back.extras, back.answer_notes, back.soffit_colour_2]).toEqual([null, null, [], {}, false, {}, null]);
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

// Round 6 (Keenan, 2026-11-07): a split soffit, two answers together, and
// a note on each answer, from the sheet to the lead.
describe("Round 6 answers from the sheet", () => {
  it("saves a split soffit with its note, and asks for the note before it saves", () => {
    const split = { ...ready(), soffit_colour: "white" as const, soffit_colour_2: "off_white" as const, soffit_note: "" };
    expect(sheetMissing(split).map((item) => item.key)).toContain("soffit_note");
    expect(parseLeadForm(draftToLeadInput(split)).ok).toBe(false);
    const noted = { ...split, soffit_note: "White at the front, cream at the back" };
    expect(sheetMissing(noted).map((item) => item.key)).not.toContain("soffit_note");
    const parsed = parseLeadForm(draftToLeadInput(noted));
    expect(parsed.ok && [parsed.values.soffit_colour, parsed.values.soffit_colour_2, parsed.values.soffit_note]).toEqual([
      "white",
      "off_white",
      "White at the front, cream at the back",
    ]);
  });

  it("drops a second colour beside Not sure or the same colour", () => {
    const parsed = parseLeadForm(draftToLeadInput({ ...ready(), soffit_colour: "not_sure" as const, soffit_colour_2: "white" as const, soffit_note: "x" }));
    expect(parsed.ok && parsed.values.soffit_colour_2).toBeNull();
  });

  it("saves two answers given together, and each answer's note", () => {
    const draft = { ...ready(), christmas_lights_now: "hires_and_diy" as const, looked_into_before: "quotes_and_thought" as const, answer_notes: { owns_home: "Wife's name on title", phone: " " } };
    const parsed = parseLeadForm(draftToLeadInput(draft));
    expect(parsed.ok && [parsed.values.christmas_lights_now, parsed.values.looked_into_before]).toEqual(["hires_and_diy", "quotes_and_thought"]);
    expect(parsed.ok && parsed.values.answer_notes).toEqual({ owns_home: "Wife's name on title" });
  });

  it("never sends Which areas, Timing or Call or text, so a save can't touch them", () => {
    const input = draftToLeadInput(ready());
    expect(Object.keys(input)).not.toContain("areas_wanted");
    expect(Object.keys(input)).not.toContain("install_timing");
    expect(Object.keys(input)).not.toContain("confirm_by");
  });
});

// The save at Book (2026-11-10): a first name or the address is enough, the
// other saved as Name to come or Address to come with its flag, and every
// question not asked yet stays open.
describe("The save at Book", () => {
  it("saves a person with only a first name, the address to come", () => {
    const parsed = parseSheetLead(draftToLeadInput({ ...emptyDraft(), first_name: "Sarah" }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect([parsed.values.first_name, parsed.values.address_line]).toEqual(["Sarah", "Address to come"]);
    expect([parsed.values.name_to_come, parsed.values.address_to_come]).toEqual([false, true]);
    expect([parsed.values.lat, parsed.values.lng, parsed.values.position_source]).toEqual([null, null, null]);
    // Nothing was asked, and nothing is marked Not collected.
    expect(parsed.values.not_collected).toEqual([]);
    expect([parsed.values.phone, parsed.values.owns_home, parsed.values.looked_into_before]).toEqual([null, null, null]);
  });

  it("saves a person with only the address, the name to come", () => {
    const parsed = parseSheetLead(
      draftToLeadInput({ ...emptyDraft(), address_line: "1 Test Street NW", lat: 51.04, lng: -114.07, position_source: "picked", place_id: "abc" }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect([parsed.values.first_name, parsed.values.address_line]).toEqual(["Name to come", "1 Test Street NW"]);
    expect([parsed.values.name_to_come, parsed.values.address_to_come]).toEqual([true, false]);
    expect(parsed.values.lat).toBe(51.04);
  });

  it("refuses a person with neither, pointing at the name", () => {
    const parsed = parseSheetLead(draftToLeadInput(emptyDraft()));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors.first_name).toBe(NAME_OR_ADDRESS);
  });

  it("keeps what was answered and marked, and leaves the rest open", () => {
    let draft: SheetDraft = { ...emptyDraft(), first_name: "Sarah", owns_home: true, wants_price: false };
    draft = withAnswer(draft, "phone", NOT_COLLECTED);
    draft = withAnswer(draft, "christmas_lights_now", NOT_COLLECTED);
    const parsed = parseSheetLead(draftToLeadInput(draft));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect([parsed.values.owns_home, parsed.values.wants_price, parsed.values.both_decision_makers]).toEqual([true, false, null]);
    expect([...parsed.values.not_collected].sort()).toEqual(["christmas_lights_now", "phone"]);
  });

  it("still checks what was typed as New lead does", () => {
    const badPhone = parseSheetLead(draftToLeadInput({ ...emptyDraft(), first_name: "Sarah", phone: "12" }));
    expect(badPhone.ok === false && badPhone.errors.phone).toBeTruthy();
    const split = parseSheetLead(draftToLeadInput({ ...emptyDraft(), first_name: "Sarah", soffit_colour: "white", soffit_colour_2: "off_white" }));
    expect(split.ok === false && split.errors.soffit_note).toBeTruthy();
    const phone = parseSheetLead(draftToLeadInput({ ...emptyDraft(), first_name: "Sarah", phone: "403 555 0177" }));
    expect(phone.ok && phone.values.phone).toBe("+14035550177");
  });

  it("leaves New lead's own rules as they are", () => {
    const parsed = parseLeadForm(draftToLeadInput({ ...emptyDraft(), first_name: "Sarah" }));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors.address_line).toBeTruthy();
  });

  it("reads a name or an address still to come from the flag, or the words saved in its place", () => {
    expect(nameToCome({ first_name: "Name to come", name_to_come: true })).toBe(true);
    expect(nameToCome({ first_name: "Sarah", name_to_come: false })).toBe(false);
    expect(nameToCome({ first_name: "Name to come" })).toBe(true);
    expect(addressToCome({ address_line: "Address to come", address_to_come: true })).toBe(true);
    expect(addressToCome({ address_line: "1 Test Street NW" })).toBe(false);
  });
});
