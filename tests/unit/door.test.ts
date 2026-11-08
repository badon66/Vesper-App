import { describe, expect, it } from "vitest";
import {
  joinAnswer,
  soffitAnswer,
  splitAnswer,
  toggleAnswer,
  toggleSoffit,
  findOutAnsweredCount,
  findOutAnswerList,
  findOutChoices,
  FIND_OUT_QUESTIONS,
  PHOTO_SLOT_HINT,
  PHOTO_SLOTS,
  photoSlotLabel,
  slotFieldName,
  type FindOutAnswers,
} from "@/lib/leads/door";

const nothing: FindOutAnswers = {
  owns_home: null,
  wants_price: null,
  soffit_colour: null,
  soffit_note: null,
  christmas_lights_now: null,
  looked_into_before: null,
};

describe("Find out questions", () => {
  it("asks Keenan's five Find out questions, in his order and his words (round 6: no Which areas or Timing)", () => {
    expect(
      FIND_OUT_QUESTIONS.map((q) => [q.question, q.options.map((option) => option.label).join(" / ")]),
    ).toEqual([
      ["Owns the home", "Yes / No"],
      ["Wants a price", "Yes / Not yet"],
      ["Soffit colour", "White / Off-white or cream / Other / Not sure"],
      ["Christmas lights now", "Hires someone / Does it themselves / None"],
      ["Looked into it before", "Got quotes / Thought about it / New to them"],
    ]);
  });

  it("shows nothing answered on a quick lead", () => {
    expect(findOutAnswerList(nothing).every((item) => item.answer === null)).toBe(true);
    expect(findOutAnsweredCount(nothing)).toBe(0);
    expect(Object.values(findOutChoices(nothing)).every((choice) => choice === null)).toBe(true);
  });

  it("turns stored answers back into the form's choices and the lead page's words", () => {
    const answers: FindOutAnswers = {
      owns_home: true,
      wants_price: false,
      soffit_colour: "other",
      soffit_note: "dark green",
      christmas_lights_now: "diy",
      looked_into_before: "got_quotes",
    };
    expect(findOutChoices(answers)).toEqual({
      owns_home: "yes",
      wants_price: "not_yet",
      soffit_colour: "other",
      christmas_lights_now: "diy",
      looked_into_before: "got_quotes",
    });
    expect(findOutAnswerList(answers).map((item) => item.answer)).toEqual([
      "Yes",
      "Not yet",
      "Other: dark green",
      "Does it themselves",
      "Got quotes",
    ]);
    expect(findOutAnsweredCount(answers)).toBe(5);
  });

  it("tells No apart from not answered", () => {
    const list = findOutAnswerList({ ...nothing, owns_home: false });
    expect(list[0]).toEqual({ field: "owns_home", question: "Owns the home", answer: "No" });
    expect(list[1].answer).toBeNull();
  });

  it("still names a soffit colour the app no longer offers", () => {
    expect(findOutAnswerList({ ...nothing, soffit_colour: "brown" })[2].answer).toBe("Brown");
  });
});

describe("Guided photos", () => {
  it("has the four slots in order, with the hint Keenan wrote", () => {
    expect(PHOTO_SLOTS.map((slot) => slot.label)).toEqual([
      "Front",
      "Left corner",
      "Right corner",
      "Soffit close-up",
    ]);
    expect(PHOTO_SLOT_HINT).toBe(
      "Hold the phone sideways and get the whole roofline in. At night, hold still while night mode finishes.",
    );
    expect(photoSlotLabel("right_corner")).toBe("Right corner");
    expect(slotFieldName("left_corner")).toBe("photo_slot_left_corner");
  });
});

describe("The lead page's answers (round 2)", async () => {
  const { leadAnswerList } = await import("@/lib/leads/door");
  it("lists the eight counted questions in the order asked, then the soffit, each answered, Not collected or open", () => {
    const rows = leadAnswerList({
      phone: null,
      owns_home: true,
      wants_price: false,
      both_decision_makers: false,
      soffit_colour: null,
      soffit_note: null,
      christmas_lights_now: null,
      looked_into_before: "got_quotes",
      not_collected: ["phone"],
    });
    expect(rows.map((row) => [row.key, row.state, row.answer])).toEqual([
      ["phone", "not_collected", null],
      ["owns_home", "answered", "Yes"],
      ["wants_price", "answered", "Not yet"],
      ["both_decision_makers", "answered", "No"],
      ["christmas_lights_now", "open", null],
      ["looked_into_before", "answered", "Got quotes"],
      ["soffit_colour", "open", null],
    ]);
  });
});

// Round 6 (Keenan, 2026-11-07): two answers together, and a split soffit.
describe("Answers given together", () => {
  it("joins Hires someone and Does it themselves, and Got quotes and Thought about it", () => {
    expect(toggleAnswer("christmas_lights_now", "hires", "diy")).toBe("hires_and_diy");
    expect(toggleAnswer("christmas_lights_now", "hires_and_diy", "hires")).toBe("diy");
    expect(toggleAnswer("christmas_lights_now", "hires_and_diy", "none")).toBe("none");
    expect(toggleAnswer("christmas_lights_now", "none", "diy")).toBe("diy");
    expect(toggleAnswer("christmas_lights_now", "diy", "diy")).toBeNull();
    expect(toggleAnswer("looked_into_before", "got_quotes", "thought_about_it")).toBe("quotes_and_thought");
    expect(toggleAnswer("looked_into_before", "quotes_and_thought", "new_to_them")).toBe("new_to_them");
    expect(splitAnswer("looked_into_before", "quotes_and_thought")).toEqual(["got_quotes", "thought_about_it"]);
    expect(splitAnswer("christmas_lights_now", null)).toEqual([]);
    expect(joinAnswer("christmas_lights_now", ["diy", "hires"])).toBe("hires_and_diy");
  });

  it("names a joined answer in words", () => {
    const answers = { ...nothing, christmas_lights_now: "hires_and_diy" as const, looked_into_before: "quotes_and_thought" as const };
    const listed = findOutAnswerList(answers);
    expect(listed.find((item) => item.field === "christmas_lights_now")?.answer).toBe("Hires someone and does it themselves");
    expect(listed.find((item) => item.field === "looked_into_before")?.answer).toBe("Got quotes and thought about it");
  });

  it("takes two soffit colours for a split soffit, Not sure on its own, and a third replaces the older", () => {
    expect(toggleSoffit([], "white")).toEqual(["white"]);
    expect(toggleSoffit(["white"], "off_white")).toEqual(["white", "off_white"]);
    expect(toggleSoffit(["white", "off_white"], "other")).toEqual(["off_white", "other"]);
    expect(toggleSoffit(["white", "off_white"], "not_sure")).toEqual(["not_sure"]);
    expect(toggleSoffit(["not_sure"], "white")).toEqual(["white"]);
    expect(toggleSoffit(["white", "off_white"], "white")).toEqual(["off_white"]);
    expect(soffitAnswer("white", "off_white", "white at the front")).toBe("White and off-white or cream: white at the front");
  });
});
