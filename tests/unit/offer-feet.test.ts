import { describe, expect, it } from "vitest";
import { DEFAULT_LINES } from "@/lib/deck";
import type { QuoteRun } from "@/lib/pricing";
import { feetWords, offerFeet } from "@/lib/quotes/offers";

// Round 16 (Keenan, 2026-11-11): each option shows its feet under its name
// ("165 ft of lights") in place of the list of areas it covers.
const run = (name: string, feet: number, level: "lower" | "upper" = "lower") => ({ name, feet, level }) as unknown as QuoteRun;

describe("an option's feet line", () => {
  const runs = [run("Front", 64), run("Garage", 28), run("Left gable", 74, "upper")];

  it("adds up the feet of the runs the option covers, each once", () => {
    expect(offerFeet(runs, { runs: [0, 1] })).toBe(92);
    expect(offerFeet(runs, { runs: [0, 1, 2, 2] })).toBe(166);
    expect(offerFeet(runs, { runs: [0, 9] })).toBe(64);
  });

  it("reads like Keenan's line, and is empty with no feet", () => {
    expect(feetWords(DEFAULT_LINES.price_feet, 165)).toBe("165 ft of lights");
    expect(feetWords(DEFAULT_LINES.price_feet, 1234)).toBe("1,234 ft of lights");
    expect(feetWords(DEFAULT_LINES.price_feet, 92.25)).toBe("92.3 ft of lights");
    expect(feetWords(DEFAULT_LINES.price_feet, 0)).toBe("");
    expect(feetWords("{feet} feet lit", 40)).toBe("40 feet lit");
  });
});
