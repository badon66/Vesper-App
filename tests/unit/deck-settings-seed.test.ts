import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hasDash, hasExclamation, parseDeckWords, parseLooks, WORDS_PAGES, type Look } from "@/lib/deck";
import {
  DECK_SEED,
  deckWordIssues,
  lookTextWidth,
  lookWrapIssues,
  looksIssues,
  LOOKS_SEED,
  PAGE_HELP,
  type MeasureLabel,
} from "@/lib/settings/deck-schema";

// The words and looks Settings marks as Draft are exactly what the seed
// migration wrote, and they pass every rule Settings enforces.

const migration = readFileSync(
  new URL("../../supabase/migrations/20261108080527_round7_deck_words_and_looks.sql", import.meta.url),
  "utf8",
);
const between = (tag: string) => {
  const match = migration.match(new RegExp(`\\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$`));
  if (!match) throw new Error(`No $${tag}$ block in the seed migration`);
  return JSON.parse(match[1]);
};

describe("the seeded deck words and looks", () => {
  it("are word for word what the migration seeded", () => {
    expect(DECK_SEED).toEqual(parseDeckWords(between("deck")));
    expect(LOOKS_SEED).toEqual(parseLooks(between("looks")));
  });

  it("pass every rule Settings enforces", () => {
    expect(deckWordIssues(DECK_SEED)).toEqual({});
    expect(looksIssues(LOOKS_SEED)).toEqual({ looks: {} });
  });

  it("carry no dashes or exclamation marks, and neither does Settings' help", () => {
    const strings: string[] = [];
    for (const page of WORDS_PAGES) strings.push(...Object.values(DECK_SEED.pages[page]), PAGE_HELP[page]);
    for (const look of LOOKS_SEED) strings.push(look.name, look.words, ...look.colours.map((colour) => colour.name));
    for (const text of strings) {
      expect(hasDash(text), text).toBe(false);
      expect(hasExclamation(text), text).toBe(false);
    }
  });

  it("fit one row with all five on, at the widths Manrope draws them", () => {
    // Measured once with a canvas measureText in Chromium, from the app's
    // own Manrope (22 px semibold names, 20 px regular colour words).
    const widths: Record<string, number> = {
      "name:Warm white": 123.6,
      "name:Cool white": 111.7,
      "name:Christmas": 108.7,
      "name:Game night": 120.8,
      "name:Halloween": 109.1,
      "words:Like a porch light": 154.1,
      "words:Like daylight": 114.3,
      "words:Red, green, white": 159.8,
      "words:Red and gold": 119.1,
      "words:Orange and purple": 169.7,
    };
    const measure: MeasureLabel = (text, kind) => {
      const width = widths[`${kind}:${text}`];
      if (width === undefined) throw new Error(`No width for ${kind} ${text}`);
      return width;
    };
    expect(lookWrapIssues(LOOKS_SEED, measure)).toEqual({});
    // With a sixth look on, the buttons narrow and the longer labels would
    // wrap, so they are refused until shortened.
    const sixth: Look = { ...LOOKS_SEED[1], key: "look_sixth0", name: "Cool white", words: "Like daylight" };
    expect(lookTextWidth(6)).toBeLessThan(150);
    const issues = lookWrapIssues([...LOOKS_SEED, sixth], measure);
    expect(Object.keys(issues).filter((key) => issues[key].words)).toEqual(["warm_white", "christmas", "halloween"]);
    expect(issues.cool_white?.name).toMatch(/6 looks on/);
  });
});
