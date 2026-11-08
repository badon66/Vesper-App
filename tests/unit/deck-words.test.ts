import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  hasDash,
  hasExclamation,
  NO_PAYMENT_LINE,
  PAGE_LAYOUT,
  parseDeckWords,
  parseLooks,
  WORD_LIMITS,
  WORDS_PAGES,
  wordCount,
} from "@/lib/deck";
import { CHECK_TOGETHER, COLOUR_LINES, moreWords, soffitView } from "@/lib/meeting/deck-pages";

// Every seeded page's words fit the copy rules' limits (round 7, copy_rules),
// read straight from the seed migration, and so do the lines the deck builds
// itself. A layout test on the iPad sizes is separate; this one holds the
// counts and the words that must never appear.

const migration = readFileSync(
  new URL("../../supabase/migrations/20261108080527_round7_deck_words_and_looks.sql", import.meta.url),
  "utf8",
);
const seeded = (tag: string) => JSON.parse(migration.match(new RegExp(`\\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$`))?.[1] ?? "null");
const WORDS = parseDeckWords(seeded("deck"));
const LOOKS = parseLooks(seeded("looks"));

// Words a customer never reads (copy rules 4, 5, 7, 8 and 11).
const NEVER = [
  /colou?r[- ]matched/i,
  /matches its colou?r/i,
  /\bnodes?\b/i,
  /\bpixels?\b/i,
  /\bbulbs?\b/i,
  /\bRGBW?\b/,
  /\b24 ?V\b/i,
  /\b24 volts?\b/i,
  /kelvin/i,
  /lumens?/i,
  /per (metre|meter|foot)/i,
  /RAL book/i,
  /\bKeenan\b/,
  /lifetime|maintenance-free|guaranteed|invisible/i,
  /before Christmas|every day the weather allows|no hardwiring|no ladders/i,
  /starting at|book now|\$\d/i,
  /\b(as you saw|just now|now let's see)\b/i,
];

function customerStrings(): string[] {
  const strings: string[] = [];
  for (const key of WORDS_PAGES) {
    const page = WORDS.pages[key];
    strings.push(page.headline, page.words, page.moreLabel, page.moreText);
  }
  for (const look of LOOKS) strings.push(look.name, look.words);
  strings.push(
    NO_PAYMENT_LINE,
    CHECK_TOGETHER,
    ...Object.values(COLOUR_LINES),
    soffitView({ soffitColour: "white", soffitColour2: "off_white" }).label,
    soffitView({ soffitColour: "other", soffitColour2: null }).names[0],
  );
  return strings.filter((text) => text.trim() !== "");
}

describe("every seeded page's words", () => {
  it("are all there: a headline on every page, and words wherever the spec gives them", () => {
    for (const key of WORDS_PAGES) expect(WORDS.pages[key].headline.trim(), key).not.toBe("");
    for (const key of ["what_vesper_is", "hidden_by_day", "whites_first", "light_picker", "phone_control", "install_day"] as const) {
      expect(WORDS.pages[key].words.trim(), key).not.toBe("");
    }
    expect(WORDS.warrantyLinesUpFront).toBe(3);
  });

  it("keep headlines to 32 characters, with no full stop", () => {
    for (const key of WORDS_PAGES) {
      const { headline } = WORDS.pages[key];
      expect(headline.length, headline).toBeLessThanOrEqual(WORD_LIMITS.headlineChars);
      expect(headline.trim().endsWith("."), headline).toBe(false);
    }
  });

  it("keep band words to 25 and split pages to 40", () => {
    for (const key of WORDS_PAGES) {
      const { words } = WORDS.pages[key];
      const limit = PAGE_LAYOUT[key] === "split" ? WORD_LIMITS.splitWords : WORD_LIMITS.bandWords;
      expect(wordCount(words), `${key}: ${words}`).toBeLessThanOrEqual(limit);
    }
  });

  it("keep each More to 60 words with a label of 4 words at most", () => {
    for (const key of WORDS_PAGES) {
      const page = WORDS.pages[key];
      expect(wordCount(page.moreLabel), page.moreLabel).toBeLessThanOrEqual(WORD_LIMITS.moreLabelWords);
      expect(wordCount(page.moreText), `${key}: ${page.moreText}`).toBeLessThanOrEqual(WORD_LIMITS.moreWords);
      expect(/^(more|learn more|the details)$/i.test(page.moreLabel.trim()), page.moreLabel).toBe(false);
    }
    // The pages with a More in the spec have one; the picker, the mockup and
    // the price never do.
    for (const key of ["what_vesper_is", "hidden_by_day", "whites_first", "phone_control", "install_day"] as const) {
      expect(moreWords(WORDS.pages[key]), key).not.toBeNull();
    }
    expect(moreWords(WORDS.pages.light_picker)).toBeNull();
    expect(moreWords(WORDS.pages.mockup)).toBeNull();
  });

  it("keep look names to 14 characters and colour words to 18", () => {
    expect(LOOKS.length).toBe(5);
    for (const look of LOOKS) {
      expect(look.name.length, look.name).toBeLessThanOrEqual(WORD_LIMITS.lookNameChars);
      expect(look.words.length, look.words).toBeLessThanOrEqual(WORD_LIMITS.lookWordsChars);
    }
  });

  it("carry no dash, exclamation mark, jargon, matching claim or promise the business can't keep", () => {
    for (const text of customerStrings()) {
      expect(hasDash(text), text).toBe(false);
      expect(hasExclamation(text), text).toBe(false);
      for (const never of NEVER) expect(never.test(text), `${text} (${never})`).toBe(false);
    }
  });

  it("say No payment until your install is complete. word for word", () => {
    expect(NO_PAYMENT_LINE).toBe("No payment until your install is complete.");
  });
});
