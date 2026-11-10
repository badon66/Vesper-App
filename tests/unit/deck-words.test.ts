import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DECK_LINE_KEYS,
  DEFAULT_LINES,
  hasDash,
  hasExclamation,
  LINE_SPECS,
  NO_PAYMENT_LINE,
  PAGE_LAYOUT,
  parseLooks,
  WORD_LIMITS,
  WORDS_PAGES,
  wordCount,
} from "@/lib/deck";
import { CHECK_TOGETHER, CHOOSER_LINES, galleryCounter, moreWords, seeAllLabel, soffitView } from "@/lib/meeting/deck-pages";
import { DECK_SEED } from "@/lib/settings/deck-schema";
import { smartApostrophes } from "@/lib/typography";

// Every seeded page's words fit the copy rules' limits (round 7, copy_rules),
// as the seed migrations leave them (round 9's DECK_SEED, which
// deck-settings-seed.test.ts checks against both), and so do the built
// pages' lines (settings.deck.lines). A layout test on the iPad sizes is
// separate; this one holds the counts and the words that must never appear.

const migration = readFileSync(
  new URL("../../supabase/migrations/20261108080527_round7_deck_words_and_looks.sql", import.meta.url),
  "utf8",
);
const seeded = (tag: string) => JSON.parse(migration.match(new RegExp(`\\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$`))?.[1] ?? "null");
const WORDS = DECK_SEED;
const LOOKS = parseLooks(seeded("looks"));
// The customer's link names Keenan in one line ("Call or text Keenan."), as
// the five seats settled; the meeting never does.
const LINK_LINES = DECK_LINE_KEYS.filter((key) => LINE_SPECS[key].group === "link");

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
    ...DECK_LINE_KEYS.filter((key) => !LINK_LINES.includes(key)).map((key) => WORDS.lines[key]),
    ...Object.values(CHOOSER_LINES),
    seeAllLabel(WORDS.pages.gallery.moreLabel, 12),
    galleryCounter(1, 6, 6) ?? "",
    soffitView({ soffitColour: "white", soffitColour2: "off_white" }).label,
    soffitView({ soffitColour: "other", soffitColour2: null }).names[0],
  );
  return strings.filter((text) => text.trim() !== "");
}

describe("every seeded page's words", () => {
  it("are all there: a headline on every page, and words wherever the spec gives them", () => {
    for (const key of WORDS_PAGES) expect(WORDS.pages[key].headline.trim(), key).not.toBe("");
    for (const key of ["what_vesper_is", "hidden_by_day", "whites_first", "light_picker", "phone_control", "your_house", "mockup"] as const) {
      expect(WORDS.pages[key].words.trim(), key).not.toBe("");
    }
    // What happens next's words are its built lines.
    expect(WORDS.pages.next_steps.words).toBe("");
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
    for (const key of ["what_vesper_is", "hidden_by_day", "whites_first", "phone_control", "your_house", "next_steps"] as const) {
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

  it("read with typographic apostrophes on screen, while what Settings stores stays as typed", () => {
    const stored = customerStrings();
    expect(stored.some((text) => /\p{L}'\p{L}/u.test(text))).toBe(true);
    for (const text of stored) expect(/\p{L}'\p{L}/u.test(smartApostrophes(text)), text).toBe(false);
    expect(smartApostrophes(WORDS.pages.gallery.headline)).toBe("Homes we’ve lit");
  });

  it("put the colour book in front of the customer, never RAL Classic, the RAL K7 book or powder coating", () => {
    for (const text of Object.values(CHOOSER_LINES)) expect(/RAL|powder/i.test(text), text).toBe(false);
    for (const key of DECK_LINE_KEYS) expect(/RAL|powder/i.test(WORDS.lines[key]), key).toBe(false);
    // The chooser reads the page's own colour book line, not a second wording.
    expect(WORDS.lines.colour_book).toBe("Screens can't show colour exactly, so we choose it from the colour book together.");
    expect(CHOOSER_LINES.legend).toBe("Choose the colour");
    expect(CHOOSER_LINES.codeLabel).toBe("Colour number");
    expect(CHOOSER_LINES.codeHint).toBe("From the colour book.");
  });

  it("say No payment until your install is complete. word for word", () => {
    expect(NO_PAYMENT_LINE).toBe("No payment until your install is complete.");
    // Fixed by CLAUDE.md: never a line Keenan can edit.
    for (const key of DECK_LINE_KEYS) expect(WORDS.lines[key], key).not.toContain("No payment until");
  });

  it("keep the built pages' lines within their words, and the meeting's final wording word for word (round 9)", () => {
    for (const key of DECK_LINE_KEYS) expect(wordCount(WORDS.lines[key]), key).toBeLessThanOrEqual(LINE_SPECS[key].words);
    expect(WORDS.lines).toEqual(DEFAULT_LINES);
    expect(DEFAULT_LINES).toMatchObject({
      cover_line: "What it is, your house lit up, and your price.",
      next_prefix: "Next: {page}",
      colour_headline: "Your track colour",
      colour_opener: "By day you see the track, so you choose its colour.",
      colour_one: "One track colour for the whole house.",
      colour_stock: "White is in stock and included.",
      colour_made: "{colour} is made to order.",
      colour_spring_label: "Install in spring",
      colour_spring_value: "Included",
      colour_season_label: "Install this season",
      colour_season_value: "{fee} rush colour fee",
      initials_prompt: "Your initials confirm the colour on your quote.",
      initials_done: "Confirmed with your initials.",
      price_held: "Price held until {date}.",
      financing: "Financing is available. Just ask.",
      price_empty: "Your options show here once we've measured.",
      recap: "Your choice: {name}, {total}",
      step_colour_label: "Your colour",
      step_colour_done: "{colour}, confirmed with your initials.",
      step_colour_todo: "We confirm it with you from the colour book.",
      step_day_none: "We pick the day together.",
      step_day_button: "Pick a day",
      step_on_day: "A small crew fits the track and plugs in the control box. We clean up and set up the app with you.",
      step_pay_label: "Paying",
      closing: "We'll text you a link to this quote, with every option.",
    });
    // App set-up is said once, on What happens next; colour once, on the colour page.
    const appSetUp = [...Object.values(WORDS.pages).flatMap((page) => Object.values(page)), ...Object.values(WORDS.lines)].filter((text) =>
      /set up the app/i.test(text),
    );
    expect(appSetUp).toEqual([WORDS.pages.next_steps.moreText, DEFAULT_LINES.step_on_day]);
    expect(WORDS.pages.hidden_by_day.moreText).not.toMatch(/colour/i);
    expect(WORDS.pages.what_vesper_is.moreText).not.toMatch(/app/i);
  });
});
