import { describe, expect, it } from "vitest";
import {
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
  areas_wanted: null,
  install_timing: null,
};

describe("Find out questions", () => {
  it("asks Keenan's six questions, in his order and his words", () => {
    expect(
      FIND_OUT_QUESTIONS.map((q) => [q.question, q.options.map((option) => option.label).join(" / ")]),
    ).toEqual([
      ["Owns the home", "Yes / No"],
      ["Wants a price", "Yes / Not yet"],
      ["Soffit colour", "White / Off-white or cream / Other / Not sure"],
      ["Christmas lights now", "Hires someone / Does it themselves / None"],
      ["Which areas", "Front only / Front and sides / Full wrap / Not sure"],
      ["Timing", "Before Christmas / New year / No rush"],
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
      areas_wanted: "full_wrap",
      install_timing: "new_year",
    };
    expect(findOutChoices(answers)).toEqual({
      owns_home: "yes",
      wants_price: "not_yet",
      soffit_colour: "other",
      christmas_lights_now: "diy",
      areas_wanted: "full_wrap",
      install_timing: "new_year",
    });
    expect(findOutAnswerList(answers).map((item) => item.answer)).toEqual([
      "Yes",
      "Not yet",
      "Other: dark green",
      "Does it themselves",
      "Full wrap",
      "New year",
    ]);
    expect(findOutAnsweredCount(answers)).toBe(6);
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
