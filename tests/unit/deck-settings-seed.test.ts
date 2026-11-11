import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DECK_LINE_DEFAULTS, hasDash, hasExclamation, parseDeckWords, parseLooks, WORDS_PAGES, type Look, type PageWords } from "@/lib/deck";
import {
  DECK_SEED,
  deckWordIssues,
  LINES_HELP,
  lookTextWidth,
  lookWrapIssues,
  looksIssues,
  LOOKS_SEED,
  PAGE_HELP,
  ROUND7_SEED,
  type MeasureLabel,
} from "@/lib/settings/deck-schema";

// The words and looks Settings marks as Draft are exactly what the seed
// migrations wrote (round 7's, then round 9's changes where the words still
// match round 7's), and they pass every rule Settings enforces.

const migration = readFileSync(
  new URL("../../supabase/migrations/20261108080527_round7_deck_words_and_looks.sql", import.meta.url),
  "utf8",
);
const between = (tag: string) => {
  const match = migration.match(new RegExp(`\\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$`));
  if (!match) throw new Error(`No $${tag}$ block in the seed migration`);
  return JSON.parse(match[1]);
};

// Round 9's seed migration: named TEMP_ until it is applied, then by the
// version the database records for it.
const round9File = readdirSync(new URL("../../supabase/migrations/", import.meta.url)).find((name) => /round9_deck_words\.sql$/.test(name));
const round9 = round9File ? readFileSync(new URL(`../../supabase/migrations/${round9File}`, import.meta.url), "utf8") : "";

const FIELD: Record<string, keyof PageWords> = { headline: "headline", words: "words", more_label: "moreLabel", more_text: "moreText" };
const stored = (page: PageWords) => ({ headline: page.headline, words: page.words, more_label: page.moreLabel, more_text: page.moreText });

describe("the seeded deck words and looks", () => {
  it("are word for word what the round 7 migration seeded", () => {
    const pages = between("deck").pages as Record<string, Record<string, string>>;
    for (const [key, page] of Object.entries(ROUND7_SEED)) expect(stored(page), key).toEqual(pages[key]);
    expect(Object.keys(ROUND7_SEED).sort()).toEqual(Object.keys(pages).sort());
    expect(LOOKS_SEED).toEqual(parseLooks(between("looks")));
  });

  it("change in round 9 only where the words still read as round 7 seeded them, to the five seats' words", () => {
    expect(round9).not.toBe("");
    const updates = [
      ...round9.matchAll(
        /jsonb_set\(deck, '\{pages,(\w+),(\w+)\}', to_jsonb\(\$new\$([\s\S]*?)\$new\$::text\)\)\s+where id = 1\s+and deck #>> '\{pages,(\w+),(\w+)\}' = \$old\$([\s\S]*?)\$old\$;/g,
      ),
    ];
    expect(updates.map((match) => `${match[1]}.${match[2]}`)).toEqual([
      "what_vesper_is.more_text",
      "hidden_by_day.more_text",
      "phone_control.words",
      "light_picker.words",
      "mockup.headline",
      "mockup.words",
    ]);
    const after = JSON.parse(JSON.stringify(ROUND7_SEED)) as Record<string, PageWords>;
    for (const [, page, field, next, wherePage, whereField, old] of updates) {
      expect(`${wherePage}.${whereField}`).toBe(`${page}.${field}`);
      expect(old, `${page}.${field}`).toBe(ROUND7_SEED[page][FIELD[field]]);
      after[page][FIELD[field]] = next;
    }
    // The new pages, added only where the deck has none.
    const house = round9.match(/'\{pages,your_house\}', \$page\$([\s\S]*?)\$page\$::jsonb\)\s+where id = 1[\s\S]*?#> '\{pages,your_house\}' is null;/);
    expect(house).not.toBeNull();
    // What happens next carries What we'll need over from How install day works.
    expect(round9).toMatch(/'\{pages,next_steps\}', jsonb_build_object\(\s+'headline', 'What happens next',\s+'words', '',/);
    expect(round9).toContain("coalesce(nullif(deck #>> '{pages,install_day,more_label}', ''), $t$What we'll need$t$)");
    expect(round9).toContain(`coalesce(nullif(deck #>> '{pages,install_day,more_text}', ''), $t$${ROUND7_SEED.install_day.moreText}$t$)`);
    expect(round9).toMatch(/#> '\{pages,next_steps\}' is null;/);
    const nextSteps = { headline: "What happens next", words: "", more_label: ROUND7_SEED.install_day.moreLabel, more_text: ROUND7_SEED.install_day.moreText };
    // Every line, word for word, added only where the deck has none.
    const lines = round9.match(/'\{lines\}', \$lines\$([\s\S]*?)\$lines\$::jsonb\)\s+where id = 1\s+and deck -> 'lines' is null;/);
    // Round 10's thank you and round 13's lowest-price line came later: a
    // deck without them reads ours.
    const round9Lines = Object.fromEntries(Object.entries(DECK_LINE_DEFAULTS).filter(([key]) => key !== "thanks" && key !== "price_lowest"));
    expect(JSON.parse(lines?.[1] ?? "{}")).toEqual(round9Lines);
    const pages = Object.fromEntries(Object.entries(after).map(([key, page]) => [key, stored(page)]));
    const seeded = parseDeckWords({
      pages: { ...pages, your_house: JSON.parse(house?.[1] ?? "{}"), next_steps: nextSteps },
      warranty_lines_up_front: 3,
      lines: JSON.parse(lines?.[1] ?? "{}"),
    });
    expect(seeded).toEqual(DECK_SEED);
  });

  it("are plain statements the connector runs without asking: no blocks, nothing that takes anything away", () => {
    expect(round9).not.toMatch(/\bdo\s*\$|\bdrop\b|\bdelete\b|\btruncate\b/i);
    expect(round9).not.toMatch(/[‒-―]/);
  });

  it("pass every rule Settings enforces", () => {
    expect(deckWordIssues(DECK_SEED)).toEqual({});
    expect(looksIssues(LOOKS_SEED)).toEqual({ looks: {} });
  });

  it("carry no dashes or exclamation marks, and neither does Settings' help", () => {
    const strings: string[] = [LINES_HELP, ...Object.values(DECK_SEED.lines)];
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
