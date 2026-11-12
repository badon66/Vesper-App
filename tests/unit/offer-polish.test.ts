import { describe, expect, it } from "vitest";
import type { QuoteRun } from "@/lib/pricing";
import { checkSuggestion, POLISH_MODEL, POLISH_SYSTEM, POLISH_WORDS, polishFacts, polishMessage } from "@/lib/quotes/polish";

// Round 17 (Keenan, 2026-11-12): the AI polish for an offer's description.
const runs: QuoteRun[] = [
  { name: "Front", feet: 64, level: "lower", part: "eave", area: "front" },
  { name: "Front gable", feet: 18, level: "upper", part: "gable", area: "front", gable: true, track: "j", trackRate: 30 },
  { name: "Garage", feet: 22, level: "lower", part: "garage", area: "front" },
  { name: "Back", feet: 50, level: "lower", part: "eave", area: "back" },
];
const offer = { name: "Full front", runs: [0, 1, 2] };
const facts = polishFacts(offer, runs);
const notes = "does the whole front, both gables, garage too, best value";

describe("what a polish may send", () => {
  it("is the offer's own facts and Keenan's notes: name, areas, feet, track type, and nothing about the customer", () => {
    expect(facts.name).toBe("Full front");
    expect(facts.totalFeet).toBe(104);
    expect(facts.areas.map((area) => [area.feet, area.track])).toEqual([
      [64, null],
      [18, "J track"],
      [22, null],
    ]);
    const message = polishMessage(notes, facts);
    expect(message).toContain("Offer: Full front");
    expect(message).toContain("18 ft, J track");
    expect(message).toContain("Total: 104 ft of lights");
    expect(message).toContain(`Keenan's notes: ${notes}`);
    // The polish never receives a lead: its inputs are an offer and the runs.
    expect(Object.keys(facts).sort()).toEqual(["areas", "name", "totalFeet"]);
  });

  it("asks Claude Haiku for one to three sentences, Canadian spelling, no em dashes and nothing invented", () => {
    expect(POLISH_MODEL).toBe("claude-haiku-5-5");
    expect(POLISH_SYSTEM).toMatch(/one to three short, friendly sentences/);
    expect(POLISH_SYSTEM).toMatch(/Never add prices, dollar amounts, discounts, dates, timelines, warranty terms, guarantees or promises/);
    expect(POLISH_SYSTEM).toMatch(/Canadian spelling/);
    expect(`${POLISH_SYSTEM}${Object.values(POLISH_WORDS).join("")}`).not.toMatch(/[—–]/);
  });
});

describe("the suggestion Keenan sees", () => {
  it("is tidied: quotes, dashes and exclamation marks out, Canadian spelling, at most three sentences", () => {
    const checked = checkSuggestion(
      '"Your whole front lit — both gables and the garage too! The color is yours to pick. It is our best value. Every evening it looks the part. Ask us anything."',
      notes,
      facts,
    );
    expect(checked).toEqual({
      ok: true,
      text: "Your whole front lit, both gables and the garage too. The colour is yours to pick. It is our best value.",
    });
  });

  it("may name the areas and feet in the facts", () => {
    expect(checkSuggestion("All 104 ft of your front, gables and garage included.", notes, facts)).toEqual({
      ok: true,
      text: "All 104 ft of your front, gables and garage included.",
    });
  });

  it("is never shown when it adds a price, a number, a date, a timeline or a promise Keenan didn't write", () => {
    for (const invented of [
      "The whole front for $3,936.",
      "Save 10% when you book this week.",
      "Lit in 3 days.",
      "We can have it up before Christmas.",
      "Installed this winter, guaranteed.",
      "Backed by our lifetime warranty.",
      "Free control box included.",
    ]) {
      expect(checkSuggestion(invented, notes, facts), invented).toEqual({ ok: false, reason: "invented" });
    }
  });

  it("keeps a promise word or a date Keenan wrote himself", () => {
    const own = "whole front, 10-year warranty like every job, up before christmas";
    expect(checkSuggestion("The whole front, with the same 10-year warranty as every job, and up before Christmas.", own, facts).ok).toBe(true);
  });

  it("refuses an empty answer", () => {
    expect(checkSuggestion('  ""  ', notes, facts)).toEqual({ ok: false, reason: "empty" });
  });
});
