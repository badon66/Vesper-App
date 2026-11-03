import { describe, expect, it } from "vitest";
import {
  answersOf,
  collectedCount,
  completenessLabel,
  COUNTED_QUESTIONS,
  markRestNotCollected,
  NOT_COLLECTED,
  openQuestions,
  questionState,
  type QuestionLead,
} from "@/lib/leads/questions";

// Round 2 (Keenan, 2026-11-03): every question takes an answer or Not
// collected, and "6 of 8 collected" counts the real answers only.

function lead(patch: Partial<QuestionLead> = {}): QuestionLead {
  return {
    phone: null,
    owns_home: null,
    wants_price: null,
    both_decision_makers: null,
    christmas_lights_now: null,
    looked_into_before: null,
    areas_wanted: null,
    install_timing: null,
    not_collected: [],
    ...patch,
  };
}

describe("How complete a lead is", () => {
  it("counts the eight questions in the order they're asked", () => {
    expect(COUNTED_QUESTIONS).toEqual([
      "phone",
      "owns_home",
      "wants_price",
      "both_decision_makers",
      "christmas_lights_now",
      "looked_into_before",
      "areas_wanted",
      "install_timing",
    ]);
  });

  it("counts real answers only: No and Not yet count, Not collected doesn't", () => {
    const some = lead({
      phone: "+14035550199",
      owns_home: false,
      wants_price: true,
      both_decision_makers: true,
      christmas_lights_now: "none",
      looked_into_before: "new_to_them",
      not_collected: ["areas_wanted", "install_timing"],
    });
    expect(collectedCount(some)).toBe(6);
    expect(completenessLabel(some)).toBe("6 of 8 collected");
    expect(completenessLabel(lead())).toBe("0 of 8 collected");
    expect(questionState(some, "areas_wanted")).toBe("not_collected");
    expect(questionState(some, "owns_home")).toBe("answered");
    expect(questionState(lead(), "phone")).toBe("open");
  });

  it("lets an answer win over a stale Not collected mark", () => {
    const both = lead({ phone: "+14035550199", not_collected: ["phone"] });
    expect(questionState(both, "phone")).toBe("answered");
    expect(answersOf(both).phone).toBe("+14035550199");
  });
});

describe("Finishing a group of questions", () => {
  it("finds the open ones and marks only those Not collected", () => {
    const answers = { owns_home: "yes", wants_price: null, both_decision_makers: NOT_COLLECTED };
    const group = ["owns_home", "wants_price", "both_decision_makers"] as const;
    expect(openQuestions(answers, [...group])).toEqual(["wants_price"]);
    expect(markRestNotCollected(answers, [...group])).toEqual({
      owns_home: "yes",
      wants_price: NOT_COLLECTED,
      both_decision_makers: NOT_COLLECTED,
    });
  });

  it("reads a stored lead back as the form holds it", () => {
    expect(answersOf(lead({ owns_home: false, wants_price: false, both_decision_makers: false, not_collected: ["phone"] }))).toMatchObject({
      phone: NOT_COLLECTED,
      owns_home: "no",
      wants_price: "not_yet",
      both_decision_makers: "no",
      install_timing: null,
    });
  });
});
