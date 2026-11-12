import { z } from "zod";
import {
  DECK_LINE_DEFAULTS,
  DECK_LINE_KEYS,
  DECK_SLOTS,
  DEFAULT_LINES,
  hasDash,
  hasExclamation,
  LINE_SPECS,
  linePlaceholders,
  MAX_ACTIVE_LOOKS,
  MAX_LOOK_COLOURS,
  MAX_SHOWN_PAGES,
  PAGE_DEFAULTS,
  PAGE_LAYOUT,
  WORD_LIMITS,
  WORDS_PAGES,
  wordCount,
  type DeckLineKey,
  type DeckLines,
  type DeckWords,
  type Look,
  type PageWords,
  type WordsPageKey,
} from "@/lib/deck";
import { smartApostrophes } from "@/lib/typography";
import type { Json } from "@/types/database";

// Settings for the deck (round 7, Branch B): the rules Keenan's words and
// looks are checked against, live as he types and again on the server when
// he saves. Pure, so it is unit tested and runs in the browser and on the
// server alike. lib/deck.ts holds the shapes and the stored formats; this
// module holds what Settings refuses and why, in plain words.
//
// CONTRACT
//   PAGE_FIELDS[page]          which of headline, words, More label and More
//                              text a page has in Settings, with its limits
//   pageWordIssues(page, w)    { field: message } for one page's words
//   lineIssue(key, text)       a built page's line (settings.deck.lines)
//   deckWordIssues(words, warrantyText?)
//                              { "page.field": message } for the whole deck,
//                              plus "warranty.linesUpFront" and
//                              "lines.<key>" for each line
//   parseDeckWordsInput(x, warrantyText?)
//                              the server's check: { ok, words } or { ok, errors }
//   tidyDeckWords, tidyLook, sameWords, sameLooks
//                              what a save stores, and whether anything changed
//   mergeEditableWords(stored, edited)
//                              the edited fields over what is stored, so a
//                              field Settings doesn't show is never touched
//   lookIssues / looksIssues / parseLooksInput / looksToJson
//                              the looks editor's rules and the stored shape
//   LOOK_ROW, lookTextWidth(n), lookWrapIssues(looks, measure)
//                              the meeting's row of look buttons, and which
//                              labels would wrap in it (measured in the browser)
//   BAND_FIT, PICKER_LINE_FIT, lineCount, bandWordsFitIssue,
//   pickerLineFitIssue         whether a band's words stay above the bottom
//                              row, and the picker's line within two lines,
//                              at 1180 and 1366 (measured in the browser)
//   MORE_FIT, moreLabelFitIssue
//                              whether a More button stays clear of the dots
//                              and chevrons in the bottom row
//   SPLIT_FIT, warrantyFitIssue
//                              whether the warranty's words fit beside its
//                              photo, above the bottom row
//   deckFitIssues(words, measure, { warrantyText, company })
//                              all of the above, as { "page.field": message }
//   captionIssue(text)         a gallery caption: the look only
//   referenceIssues(input) / parseReferenceInput(input)
//                              a replaced example link
//   wordsToAvoid(text)         copy-rule reminders that never block a save
//   ROUND7_SEED, DECK_SEED, LOOKS_SEED, isDraftField, isDraftLine, isDraftLook
//                              the seeded words, to mark them Draft (round 7's
//                              as first seeded, and the deck as round 9's
//                              seed migration leaves it)
//   PAGE_HELP[page]            Settings-only help: lines Keenan may add once
//                              he confirms them

// ---------------------------------------------------------------- what each page has

export type WordsField = keyof PageWords;

export type PageFieldRules = {
  // The words under the headline, or null when the page has none in Settings
  // (the gallery's are its captions, the warranty's are the warranty itself).
  words: null | { max: number; aim?: number; steps?: boolean };
  // The More button. countAdded: the meeting adds the real count ("See all 6").
  moreLabel: null | { required: boolean; maxWords: number; countAdded?: boolean };
  // Whether the More layer carries words from Settings.
  moreText: boolean;
};

// The light picker's line sits beside the effects in the tray, at most two
// lines at 20 px (round 9: "Most nights, warm white." joined it): it stops
// at 16 words (judgment call, docs/decisions.md). Band and split pages use
// the copy rules' numbers.
export const PICKER_WORDS_MAX = 16;

const BAND = { max: WORD_LIMITS.bandWords, aim: 20 };
const MORE = { required: false, maxWords: WORD_LIMITS.moreLabelWords };

export const PAGE_FIELDS: Record<WordsPageKey, PageFieldRules> = {
  what_vesper_is: { words: BAND, moreLabel: MORE, moreText: true },
  hidden_by_day: { words: BAND, moreLabel: MORE, moreText: true },
  phone_control: { words: BAND, moreLabel: MORE, moreText: true },
  gallery: { words: null, moreLabel: { required: true, maxWords: WORD_LIMITS.moreLabelWords - 1, countAdded: true }, moreText: false },
  warranty: { words: null, moreLabel: { required: true, maxWords: WORD_LIMITS.moreLabelWords }, moreText: false },
  // Round 9: their house by day. The line is built from the quote's runs
  // ({feet}) and hidden while nothing is measured; What we measured shows
  // our drawing of the roofline, with these words under it.
  your_house: { words: BAND, moreLabel: MORE, moreText: true },
  // The stand-in for Your house: their mockup, with a line under the title.
  mockup: { words: BAND, moreLabel: null, moreText: false },
  light_picker: { words: { max: PICKER_WORDS_MAX, aim: 12 }, moreLabel: null, moreText: false },
  whites_first: { words: BAND, moreLabel: MORE, moreText: true },
  // Round 9: the steps are the built lines (settings.deck.lines); here, the
  // headline and What we'll need.
  next_steps: { words: null, moreLabel: MORE, moreText: true },
};

// The names a page's words may use in braces: only Your house's line.
export const PAGE_FILL: Partial<Record<WordsPageKey, Partial<Record<keyof PageWords, readonly string[]>>>> = {
  your_house: { words: ["feet"] },
};

export function editableFields(page: WordsPageKey): WordsField[] {
  const rules = PAGE_FIELDS[page];
  const fields: WordsField[] = ["headline"];
  if (rules.words) fields.push("words");
  if (rules.moreLabel) fields.push("moreLabel");
  if (rules.moreText) fields.push("moreText");
  return fields;
}

// ---------------------------------------------------------------- the words' rules

// Labels that never say what's behind them (copy rules).
const VAGUE_LABELS = new Set(["more", "learn more", "read more", "more info", "more information", "the details", "details", "info", "i", "+", "see more", "tap here", "click here"]);

function textIssue(text: string, fill: readonly string[] = []): string | null {
  if (hasDash(text)) return "No dashes. Use a comma or a full stop instead.";
  if (hasExclamation(text)) return "No exclamation marks.";
  return braceIssue(text, fill);
}

// A name in braces is filled in at the meeting; any other is refused, so a
// customer never reads "{name}".
const braced = (names: readonly string[]) => names.map((name) => `{${name}}`).join(", ");
export function braceIssue(text: string, fill: readonly string[] = []): string | null {
  const unknown = linePlaceholders(text).filter((name) => !fill.includes(name));
  if (unknown.length === 0 && !/[{}]/.test(text.replace(/\{[^{}]*\}/g, ""))) return null;
  if (fill.length === 0) return "No braces here: nothing is filled in on this line.";
  return `Only ${braced(fill)} can go in braces here.`;
}

export const headlineLength = (text: string) => Array.from(text.trim()).length;

export function headlineIssue(text: string): string | null {
  const headline = text.trim();
  if (headline === "") return "Add a headline.";
  if (headlineLength(headline) > WORD_LIMITS.headlineChars) {
    return `${WORD_LIMITS.headlineChars} characters at most, so it stays on one line.`;
  }
  if (/[.]$/.test(headline)) return "No full stop at the end of a headline.";
  return textIssue(headline);
}

export function pageWordIssues(page: WordsPageKey, words: PageWords): Partial<Record<WordsField, string>> {
  const rules = PAGE_FIELDS[page];
  const issues: Partial<Record<WordsField, string>> = {};
  const headline = headlineIssue(words.headline);
  if (headline) issues.headline = headline;

  if (rules.words) {
    const count = wordCount(words.words);
    if (count > rules.words.max) {
      issues.words = rules.words.aim
        ? `${rules.words.max} words at most. Aim for ${rules.words.aim}.`
        : `${rules.words.max} words at most.`;
    } else {
      const problem = textIssue(words.words, PAGE_FILL[page]?.words);
      if (problem) issues.words = problem;
    }
  }

  if (rules.moreLabel) {
    const label = words.moreLabel.trim();
    const text = words.moreText.trim();
    if (label === "") {
      if (rules.moreLabel.required) issues.moreLabel = "Add the button's label.";
      else if (rules.moreText && text !== "") issues.moreLabel = "Add the button's label, or clear the words behind it.";
    } else if (wordCount(label) > rules.moreLabel.maxWords) {
      issues.moreLabel = rules.moreLabel.countAdded
        ? `${rules.moreLabel.maxWords} words at most, because the meeting adds the count.`
        : `${rules.moreLabel.maxWords} words at most.`;
    } else if (VAGUE_LABELS.has(label.toLowerCase().replace(/[.…]+$/, ""))) {
      issues.moreLabel = "Say what's behind it, like What's in it or Up close. Never More, Learn more or The details.";
    } else {
      const problem = textIssue(label);
      if (problem) issues.moreLabel = problem;
    }
  }

  if (rules.moreText) {
    const label = words.moreLabel.trim();
    const text = words.moreText.trim();
    if (text === "" && label !== "") {
      issues.moreText = "Add the words behind the button, or clear its label.";
    } else if (wordCount(text) > WORD_LIMITS.moreWords) {
      issues.moreText = `${WORD_LIMITS.moreWords} words at most, so it fits one screen.`;
    } else {
      const problem = textIssue(text);
      if (problem) issues.moreText = problem;
    }
  }
  return issues;
}

// The warranty's lines, as the meeting splits them: one per line, blanks
// dropped.
export function warrantyLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export const MAX_LINES_UP_FRONT = 8;

// How many of the warranty's lines show up front: at least 1, at most 8,
// and never every line, because the full text is one tap away.
export function linesUpFrontIssue(count: number, warrantyText?: string): string | null {
  if (!Number.isInteger(count) || count < 1 || count > MAX_LINES_UP_FRONT) {
    return `A whole number from 1 to ${MAX_LINES_UP_FRONT}.`;
  }
  if (warrantyText !== undefined) {
    const total = warrantyLines(warrantyText).length;
    if (total > 1 && count >= total) {
      return `Fewer than all ${total} lines: the full warranty is one tap away.`;
    }
  }
  return null;
}

export type DeckWordErrors = Record<string, string>;

export const fieldKey = (page: WordsPageKey, field: WordsField) => `${page}.${field}`;
export const lineKey = (key: DeckLineKey) => `lines.${key}`;
export const LINES_UP_FRONT_KEY = "warranty.linesUpFront";

// A built page's line (round 9, settings.deck.lines): never empty (ours is
// one tap away), within its words, the copy rules, and only the names it may
// use in braces, keeping the ones it needs.
export function lineIssue(key: DeckLineKey, text: string): string | null {
  const spec = LINE_SPECS[key];
  const line = text.trim();
  if (line === "") return "Add the words, or use ours.";
  if (wordCount(line) > spec.words) return `${spec.words} ${spec.words === 1 ? "word" : "words"} at most.`;
  const problem = textIssue(line, spec.fill ?? []);
  if (problem) return problem;
  const used = linePlaceholders(line);
  const missing = (spec.need ?? []).filter((name) => !used.includes(name));
  if (missing.length > 0) return `Keep ${braced(missing)}: it is filled in on screen.`;
  return null;
}

export function deckWordIssues(words: DeckWords, warrantyText?: string): DeckWordErrors {
  const errors: DeckWordErrors = {};
  for (const page of WORDS_PAGES) {
    const issues = pageWordIssues(page, words.pages[page]);
    for (const [field, message] of Object.entries(issues)) {
      if (message) errors[fieldKey(page, field as WordsField)] = message;
    }
  }
  const lines = linesUpFrontIssue(words.warrantyLinesUpFront, warrantyText);
  if (lines) errors[LINES_UP_FRONT_KEY] = lines;
  for (const key of DECK_LINE_KEYS) {
    // A retired line isn't on any screen or in Settings, so it never blocks a save.
    if (LINE_SPECS[key].retired) continue;
    const issue = lineIssue(key, words.lines[key]);
    if (issue) errors[lineKey(key)] = issue;
  }
  return errors;
}

// Newlines kept (install day's steps and a More's lines are one per line);
// each line trimmed, runs of spaces made one, blank lines dropped.
export function tidyText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

const tidyLine = (text: string) => text.replace(/\s+/g, " ").trim();

const pageWordsShape = z.object({
  headline: z.string().max(400),
  words: z.string().max(4000),
  moreLabel: z.string().max(400),
  moreText: z.string().max(4000),
});

const deckWordsShape = z.object({
  pages: z.object(Object.fromEntries(WORDS_PAGES.map((page) => [page, pageWordsShape])) as Record<WordsPageKey, typeof pageWordsShape>),
  warrantyLinesUpFront: z.number(),
  // Every line a save sends; a key it leaves out keeps ours.
  lines: z.record(z.string(), z.string().max(400)).optional(),
});

// What a save stores: each line tidied (see tidyText), headlines, labels and
// the built pages' lines on one line.
export function tidyDeckWords(words: DeckWords): DeckWords {
  const pages = {} as Record<WordsPageKey, PageWords>;
  for (const page of WORDS_PAGES) {
    const value = words.pages[page];
    pages[page] = {
      headline: tidyLine(value.headline),
      words: tidyText(value.words),
      moreLabel: tidyLine(value.moreLabel),
      moreText: tidyText(value.moreText),
    };
  }
  const lines = {} as DeckLines;
  for (const key of DECK_LINE_KEYS) lines[key] = tidyLine(words.lines[key] ?? "");
  return { pages, warrantyLinesUpFront: words.warrantyLinesUpFront, lines };
}

// The server's check of what Settings sends: the shape, then every rule.
export function parseDeckWordsInput(
  input: unknown,
  warrantyText?: string,
): { ok: true; words: DeckWords } | { ok: false; errors: DeckWordErrors } {
  const shaped = deckWordsShape.safeParse(input);
  if (!shaped.success) return { ok: false, errors: { form: "These words could not be read. Reload the page and try again." } };
  const sent = shaped.data.lines ?? {};
  const lines = {} as DeckLines;
  for (const key of DECK_LINE_KEYS) lines[key] = Object.hasOwn(sent, key) ? sent[key] : DEFAULT_LINES[key];
  const words = tidyDeckWords({ pages: shaped.data.pages, warrantyLinesUpFront: shaped.data.warrantyLinesUpFront, lines });
  const errors = deckWordIssues(words, warrantyText);
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, words };
}

// Only the fields Settings shows are taken from the edit; everything else
// keeps what is stored, so a field with no box is never wiped. Every line
// has its box.
export function mergeEditableWords(stored: DeckWords, edited: DeckWords): DeckWords {
  const pages = {} as Record<WordsPageKey, PageWords>;
  for (const page of WORDS_PAGES) {
    const next = { ...stored.pages[page] };
    for (const field of editableFields(page)) next[field] = edited.pages[page][field];
    pages[page] = next;
  }
  return { pages, warrantyLinesUpFront: edited.warrantyLinesUpFront, lines: { ...edited.lines } };
}

// ---------------------------------------------------------------- the looks

export const MAX_LOOKS = 12;
export const MAX_COLOUR_NAME_CHARS = 20;
const LOOK_KEY = /^[a-z0-9_]{1,40}$/;
const HEX = /^#[0-9A-F]{6}$/;

export type LookField = "name" | "words" | "block" | "active" | "colours" | `colour.${number}.hex` | `colour.${number}.name`;
export type LookIssues = Partial<Record<LookField, string>>;

// "#ffb46b", "ffb46b" and " #FFB46B " all mean #FFB46B; anything else is
// left as typed so it can be refused.
export function normaliseHex(value: string): string {
  const trimmed = value.trim();
  const bare = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  return /^[0-9a-fA-F]{6}$/.test(bare) ? `#${bare.toUpperCase()}` : trimmed;
}

export const isHex = (value: string) => HEX.test(normaliseHex(value));

export const nameLength = (text: string) => Array.from(text.trim()).length;

// Every meeting opens on Warm white (light_picker.effects), so it stays on.
export const OPENING_LOOK_KEY = "warm_white";

export function lookIssues(look: Look): LookIssues {
  const issues: LookIssues = {};
  const name = look.name.trim();
  if (name === "") issues.name = "Add a name.";
  else if (nameLength(name) > WORD_LIMITS.lookNameChars) issues.name = `${WORD_LIMITS.lookNameChars} characters at most.`;
  else {
    const problem = textIssue(name);
    if (problem) issues.name = problem;
  }

  const words = look.words.trim();
  if (words === "") issues.words = "Add its colour words, like Red and gold. Colour is never the only label.";
  else if (nameLength(words) > WORD_LIMITS.lookWordsChars) issues.words = `${WORD_LIMITS.lookWordsChars} characters at most.`;
  else {
    const problem = textIssue(words);
    if (problem) issues.words = problem;
  }

  if (look.colours.length === 0) issues.colours = "Add at least one light colour.";
  else if (look.colours.length > MAX_LOOK_COLOURS) issues.colours = `${MAX_LOOK_COLOURS} light colours at most.`;
  look.colours.forEach((colour, at) => {
    if (!isHex(colour.hex)) issues[`colour.${at}.hex`] = "A hex colour like #FFB46B.";
    const colourName = colour.name.trim();
    if (colourName === "") issues[`colour.${at}.name`] = "Name it, like Red or Warm white.";
    else if (nameLength(colourName) > MAX_COLOUR_NAME_CHARS) issues[`colour.${at}.name`] = `${MAX_COLOUR_NAME_CHARS} characters at most.`;
  });

  if (look.colours.length > 1 && !(Number.isInteger(look.block) && look.block >= 2 && look.block <= 6)) {
    issues.block = "From 2 to 6 lights of each colour.";
  }

  if (look.key === OPENING_LOOK_KEY && !look.active) {
    issues.active = "Every meeting opens on this look, so it stays on.";
  }
  return issues;
}

export type LooksIssues = { list?: string; looks: Record<string, LookIssues> };

export function looksIssues(looks: Look[]): LooksIssues {
  const result: LooksIssues = { looks: {} };
  const add = (key: string, field: LookField, message: string) => {
    result.looks[key] = { ...result.looks[key], [field]: result.looks[key]?.[field] ?? message };
  };
  const names = new Map<string, number>();
  for (const look of looks) {
    for (const [field, message] of Object.entries(lookIssues(look))) {
      if (message) add(look.key, field as LookField, message);
    }
    const name = look.name.trim().toLowerCase();
    if (name) names.set(name, (names.get(name) ?? 0) + 1);
  }
  for (const look of looks) {
    if ((names.get(look.name.trim().toLowerCase()) ?? 0) > 1) add(look.key, "name", "Another look has this name.");
  }
  const on = looks.filter((look) => look.active).length;
  if (looks.length > MAX_LOOKS) result.list = `${MAX_LOOKS} looks at most. Remove one first.`;
  else if (on > MAX_ACTIVE_LOOKS) result.list = `At most ${MAX_ACTIVE_LOOKS} looks on, so they fit one row. Turn one off.`;
  else if (on === 0) result.list = "Turn at least one look on.";
  return result;
}

export function hasLooksIssues(issues: LooksIssues): boolean {
  return Boolean(issues.list) || Object.values(issues.looks).some((look) => Object.keys(look).length > 0);
}

const lookShape = z.object({
  key: z.string().regex(LOOK_KEY),
  name: z.string().max(200),
  words: z.string().max(200),
  colours: z.array(z.object({ hex: z.string().max(20), name: z.string().max(200) })).max(MAX_LOOK_COLOURS * 2),
  block: z.number(),
  active: z.boolean(),
});

export function tidyLook(look: Look): Look {
  const colours = look.colours.map((colour) => ({ hex: normaliseHex(colour.hex), name: tidyLine(colour.name) }));
  return {
    key: look.key,
    name: tidyLine(look.name),
    words: tidyLine(look.words),
    colours,
    // One colour is one light per block; whites never come in blocks.
    block: colours.length === 1 ? 1 : look.block,
    active: look.active,
  };
}

// Whether the editor holds anything not yet saved.
export function sameWords(a: DeckWords, b: DeckWords): boolean {
  return JSON.stringify(tidyDeckWords(a)) === JSON.stringify(tidyDeckWords(b));
}

export function sameLooks(a: Look[], b: Look[]): boolean {
  return JSON.stringify(a.map(tidyLook)) === JSON.stringify(b.map(tidyLook));
}

// The server's check of the looks Settings sends.
export function parseLooksInput(input: unknown): { ok: true; looks: Look[] } | { ok: false; error: string } {
  const shaped = z.array(lookShape).max(MAX_LOOKS * 2).safeParse(input);
  if (!shaped.success) return { ok: false, error: "The looks could not be read. Reload the page and try again." };
  const looks = shaped.data.map(tidyLook);
  const keys = new Set(looks.map((look) => look.key));
  if (keys.size !== looks.length) return { ok: false, error: "Two looks share a key. Reload the page and try again." };
  const issues = looksIssues(looks);
  if (hasLooksIssues(issues)) return { ok: false, error: issues.list ?? "Some looks need fixing." };
  return { ok: true, looks };
}

// The stored shape of settings.light_looks (parseLooks reads it back).
export function looksToJson(looks: Look[]): Json {
  return looks.map((look) => ({
    key: look.key,
    name: look.name,
    words: look.words,
    colours: look.colours.map((colour) => ({ hex: colour.hex, name: colour.name })),
    block: look.colours.length === 1 ? 1 : look.block,
    active: look.active,
  }));
}

// A key for a new look: stable, unique, never shown. `random` is for tests.
export function newLookKey(existing: string[], random: () => number = Math.random): string {
  const taken = new Set(existing);
  for (let tries = 0; tries < 100; tries++) {
    const key = `look_${Math.floor(random() * 36 ** 6).toString(36).padStart(6, "0")}`;
    if (!taken.has(key)) return key;
  }
  return `look_${existing.length + 1}_${Date.now().toString(36)}`;
}

export function blankLook(existing: string[], random?: () => number): Look {
  return { key: newLookKey(existing, random), name: "", words: "", colours: [{ hex: "", name: "" }], block: 3, active: false };
}

// ---------------------------------------------------------------- will a look's label wrap at the meeting?

// The light picker's row of look buttons (light_picker.controls): equal
// widths across the tray at 1180 x 820 (the smaller iPad, so the tighter
// case), 12 px apart, the name at 22 px semibold and the colour words at
// 20 px under it. The side padding, the button's own padding and the tick
// beside a chosen name are the deck's layout; keep these in step with it.
export const LOOK_ROW = {
  viewportWidth: 1180,
  sidePadding: 48,
  gap: 12,
  buttonPadding: 16,
  tick: 28,
  name: { weight: 600, size: 22 },
  words: { weight: 400, size: 20 },
} as const;

// The text width inside one look button with `activeCount` looks on.
export function lookTextWidth(activeCount: number, row: typeof LOOK_ROW = LOOK_ROW): number {
  const n = Math.max(1, Math.min(MAX_ACTIVE_LOOKS, Math.floor(activeCount)));
  const button = (row.viewportWidth - 2 * row.sidePadding - (n - 1) * row.gap) / n;
  return button - 2 * row.buttonPadding;
}

// How wide a label draws, in CSS px, at the meeting's size: a canvas
// measureText in the browser, a stand-in in tests.
export type MeasureLabel = (text: string, kind: "name" | "words") => number;

// The looks that are on and whose name or colour words would wrap in the
// meeting's row with the current number on. Looks that are off are never
// shown, so they are never refused for this.
export function lookWrapIssues(looks: Look[], measure: MeasureLabel): Record<string, LookIssues> {
  const on = looks.filter((look) => look.active);
  const width = lookTextWidth(on.length);
  const message = `Too long for one line with ${on.length} ${on.length === 1 ? "look" : "looks"} on. Shorten it, or turn a look off.`;
  const out: Record<string, LookIssues> = {};
  for (const look of on.slice(0, MAX_ACTIVE_LOOKS)) {
    const issues: LookIssues = {};
    // Measured as the meeting draws them, typographic apostrophes and all.
    if (look.name.trim() && measure(smartApostrophes(look.name.trim()), "name") + LOOK_ROW.tick > width) issues.name = message;
    if (look.words.trim() && measure(smartApostrophes(look.words.trim()), "words") > width) issues.words = message;
    if (Object.keys(issues).length > 0) out[look.key] = issues;
  }
  return out;
}

// ---------------------------------------------------------------- will the words fit at the meeting?

// How wide a line of text draws at a weight and size, in CSS px: a canvas
// measureText in the browser (Manrope, as the meeting draws it), a stand-in
// in tests.
export type TextMeasure = (text: string, font: { weight: number; size: number }) => number;

// The band under a page's photo, at both iPads (round 7 review). The words
// sit in the band's right 44%, 40 px from the line at 56% and 48 px from
// the edge, 24 px below the band's top, at the words size (27 px at 1180,
// 30 px at 1366) on 1.3 lines. The bottom row is 56 px tall and 20 px up:
// round 9 put the Next label at its right, under these words (the More
// button moved to its left), and the words must end above its top. These
// are the deck's numbers (lib/meeting/deck-pages.ts: BAND_AT_AIR,
// BAND_AT_PRO, DECK_SIZES.body, DECK_ROW; components/meeting/deck-parts.tsx:
// BandPage); a unit test keeps them in step.
export const BAND_FIT = {
  split: 0.56,
  padLeft: 40,
  padRight: 48,
  padTop: 24,
  lineHeight: 1.3,
  weight: 400,
  buttonBottom: 20,
  buttonHeight: 56,
  screens: [
    { width: 1180, height: 820, band: 0.3 * 820, size: 27 },
    { width: 1366, height: 1024, band: 0.28 * 1024, size: 30 },
  ],
} as const;

// The light picker's line under its headline, at both iPads: left of the
// four joined effect buttons (their edges overlap by 1 px), 48 px from the
// tray's edge and 24 px from the effects, at 20 px (1180) and 22 px (1366).
// It stays within two lines (round 9: the tray keeps room for two). The
// tray's numbers (components/meeting/picker/layout.ts: TRAY, TRAY_AT_PRO);
// a unit test keeps them in step.
export const PICKER_LINE_FIT = {
  sidePadding: 48,
  columnGap: 24,
  effects: 4,
  weight: 400,
  maxLines: 2,
  screens: [
    { width: 1180, effectSegment: 132, size: 20 },
    { width: 1366, effectSegment: 144, size: 22 },
  ],
} as const;

// How many lines a paragraph wraps to in a column that wide, breaking
// between words as the browser does. A word wider than the column is a
// line of its own.
export function lineCount(text: string, width: number, measureLine: (line: string) => number): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  let lines = 0;
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && measureLine(next) > width) {
      lines += 1;
      line = word;
    } else {
      line = next;
    }
  }
  return line ? lines + 1 : lines;
}

// The band's words as the meeting draws them: one paragraph, typographic
// apostrophes, a name in braces as a three-figure number ("We measured 166
// ft of roofline." is measured as 888 ft).
const shownWords = (text: string) => smartApostrophes(text.replace(/\{[^{}]*\}/g, "888").replace(/\s+/g, " ").trim());

export function bandWordsFit(screen: (typeof BAND_FIT.screens)[number]): { width: number; maxLines: number } {
  const width = screen.width * (1 - BAND_FIT.split) - BAND_FIT.padLeft - BAND_FIT.padRight;
  const top = screen.height - screen.band + BAND_FIT.padTop;
  const buttonTop = screen.height - BAND_FIT.buttonBottom - BAND_FIT.buttonHeight;
  return { width, maxLines: Math.floor((buttonTop - top) / (screen.size * BAND_FIT.lineHeight)) };
}

// Refused when, on either iPad, the words would run down into the bottom
// row (the Next label under them).
export function bandWordsFitIssue(text: string, measure: TextMeasure): string | null {
  const shown = shownWords(text);
  if (!shown) return null;
  for (const screen of BAND_FIT.screens) {
    const { width, maxLines } = bandWordsFit(screen);
    const lines = lineCount(shown, width, (line) => measure(line, { weight: BAND_FIT.weight, size: screen.size }));
    if (lines > maxLines) {
      return `Too long for the band: at the meeting it runs to ${lines} lines and reaches the page dots. Keep it to ${maxLines}.`;
    }
  }
  return null;
}

export function pickerLineWidth(screen: (typeof PICKER_LINE_FIT.screens)[number]): number {
  const effects = PICKER_LINE_FIT.effects * screen.effectSegment - (PICKER_LINE_FIT.effects - 1);
  return screen.width - 2 * PICKER_LINE_FIT.sidePadding - effects - PICKER_LINE_FIT.columnGap;
}

// Refused when, on either iPad, the line would wrap to a third line.
export function pickerLineFitIssue(text: string, measure: TextMeasure): string | null {
  const shown = shownWords(text);
  if (!shown) return null;
  for (const screen of PICKER_LINE_FIT.screens) {
    const lines = lineCount(shown, pickerLineWidth(screen), (line) => measure(line, { weight: PICKER_LINE_FIT.weight, size: screen.size }));
    if (lines > PICKER_LINE_FIT.maxLines) {
      return "Keep it to two lines: at the meeting it would run on under the headline. Shorten it.";
    }
  }
  return null;
}

// ---------------------------------------------------------------- will a More button's label fit the bottom row?

// The bottom row (round 7 review; round 9 moved the More button to its
// left, so the Next label has the right of the row beside the forward
// chevron): every page's More button sits bottom left, 48 px from the edge,
// an outline button with its label at 20 px semibold, 24 px of padding and
// a 1 px border each side. The page dots and the Previous and Next chevrons
// sit in the middle of the same row: with the most pages a meeting shows
// (11) the dots' 40 px targets in a pill with 4 px ends, then a 44 px
// chevron 6 px out on each side. A label is refused when its button's right
// edge would come within 16 px of that middle on either iPad, so a long
// label never slides under the Previous chevron or the first dot. The row
// is centred, so the room is the same as it was on the right (moreRowRight
// measures it from that side). These are the deck's numbers
// (lib/meeting/deck-pages.ts: DECK_ROW, bottomRowRight;
// components/meeting/deck-parts.tsx: DeckButton, BottomCorner); a unit test
// keeps them in step.
export const MORE_FIT = {
  pages: MAX_SHOWN_PAGES,
  rightInset: 48,
  padding: 24,
  border: 1,
  weight: 600,
  size: 20,
  clearance: 16,
  row: { dot: 40, pillEnds: 4, chevron: 44, gap: 6 },
  widths: [1180, 1366],
} as const;

// The gallery's button adds the number of photos ("See all 6"): the most
// the gallery's slots can hold, so a label that fits today still fits once
// every photo is in.
export const GALLERY_MAX_PHOTOS = DECK_SLOTS.filter((slot) => slot.page === "gallery").reduce((sum, slot) => sum + slot.max, 0);

// Where the middle of the bottom row ends, in px, on a deck that wide.
export function moreRowRight(deckWidth: number): number {
  const { pages, row } = MORE_FIT;
  return (deckWidth + pages * row.dot + 2 * row.pillEnds + 2 * (row.chevron + row.gap)) / 2;
}

// The widest label a More button can carry on a deck that wide, in px.
export function moreLabelRoom(deckWidth: number): number {
  return deckWidth - MORE_FIT.rightInset - (moreRowRight(deckWidth) + MORE_FIT.clearance) - 2 * (MORE_FIT.padding + MORE_FIT.border);
}

// Refused when, on either iPad, the button would reach the dots or a chevron.
export function moreLabelFitIssue(label: string, measure: TextMeasure, { countAdded = false }: { countAdded?: boolean } = {}): string | null {
  const shown = shownWords(label);
  if (!shown) return null;
  const drawn = countAdded ? `${shown} ${GALLERY_MAX_PHOTOS}` : shown;
  for (const width of MORE_FIT.widths) {
    if (measure(drawn, { weight: MORE_FIT.weight, size: MORE_FIT.size }) > moreLabelRoom(width)) {
      return countAdded
        ? "Too long for the bottom row: with the count added, this button would run into the page dots at the meeting. Shorten it."
        : "Too long for the bottom row: at the meeting this button would run into the page dots. Shorten it.";
    }
  }
  return null;
}

// ---------------------------------------------------------------- will a split page's words fit beside its photo?

// Our 10-year warranty, once its photo is in (round 9: How install day works
// joined What happens next, whose steps are the built lines):
// the picture on the left 56%, the words in the right 44%, 40 px from the
// line and 48 px from the edge (431 px wide at 1180, 513 px at 1366), 64 px
// from the top, the headline, then the page's words, 28 px apart. The
// column keeps 112 px clear at its foot: words that ran into it would make
// the column scroll (the walk-through refuses that), and its foot is above
// the bottom row's clear line (78 px) anyway, so ending above it ends above
// the More button, the dots and the chevrons. Measured at the installed
// app's real deck heights (1180 x 796 and 1366 x 1000: the status bar takes
// 24 px), the tighter case. Headlines 52/60 px semibold on 1.1 lines at
// -0.015em, never broken inside a hyphenated word; words 27/30 px on 1.3
// lines; the warranty's lines 12 px apart, then the company and phone at
// 20/22 px. These are the deck's numbers (components/meeting/deck-parts.tsx:
// SplitPage, Lines, DECK_TYPE; components/meeting/deck-pages.tsx:
// WarrantyPage); a unit test keeps them in step.
export const SPLIT_FIT = {
  split: 0.56,
  padLeft: 40,
  padRight: 48,
  padTop: 64,
  padBottom: 112,
  gap: 28,
  headline: { weight: 600, lineHeight: 1.1, tracking: -0.015 },
  body: { weight: 400, lineHeight: 1.3 },
  lines: { gap: 12 },
  small: { weight: 400, lineHeight: 1.3 },
  screens: [
    { width: 1180, height: 796, headline: 52, body: 27, small: 20 },
    { width: 1366, height: 1000, headline: 60, body: 30, small: 22 },
  ],
} as const;

type SplitScreen = (typeof SPLIT_FIT.screens)[number];

// The words column's width, and the height its words may take.
export function splitColumn(screen: SplitScreen): { width: number; room: number } {
  return {
    width: screen.width * (1 - SPLIT_FIT.split) - SPLIT_FIT.padLeft - SPLIT_FIT.padRight,
    room: screen.height - SPLIT_FIT.padTop - SPLIT_FIT.padBottom,
  };
}

// A paragraph's height in that column at a size and weight.
function paragraphHeight(text: string, width: number, font: { weight: number; size: number; lineHeight: number; tracking?: number }, measure: TextMeasure): number {
  const shown = shownWords(text);
  if (!shown) return 0;
  const tracking = (font.tracking ?? 0) * font.size;
  const lines = lineCount(shown, width, (line) => measure(line, font) + tracking * Array.from(line).length);
  return lines * font.size * font.lineHeight;
}

function headlineHeight(headline: string, screen: SplitScreen, width: number, measure: TextMeasure): number {
  return paragraphHeight(headline, width, { ...SPLIT_FIT.headline, size: screen.headline }, measure);
}

// The column's blocks, top to bottom, with the gap between each: what
// SplitPage draws.
function stackHeight(blocks: number[]): number {
  return blocks.reduce((sum, block) => sum + block, 0) + SPLIT_FIT.gap * Math.max(0, blocks.length - 1);
}

// Our 10-year warranty: the headline, the warranty's first lines word for
// word, then the company and phone.
export function warrantyHeight(
  { headline, linesUpFront, warrantyText, company }: { headline: string; linesUpFront: number; warrantyText: string; company: string[] },
  screen: SplitScreen,
  measure: TextMeasure,
): number {
  const { width } = splitColumn(screen);
  const body = { ...SPLIT_FIT.body, size: screen.body };
  const small = { ...SPLIT_FIT.small, size: screen.small };
  const blocks: number[] = [];
  if (headline.trim()) blocks.push(headlineHeight(headline, screen, width, measure));
  const lines = warrantyLines(warrantyText).slice(0, linesUpFront);
  blocks.push(lines.reduce((sum, line) => sum + paragraphHeight(line, width, body, measure), 0) + SPLIT_FIT.lines.gap * Math.max(0, lines.length - 1));
  blocks.push(company.reduce((sum, line) => sum + paragraphHeight(line, width, small, measure), 0));
  return stackHeight(blocks);
}

// What the warranty page reads besides Settings' own words: the warranty
// text (Settings, the warranty) and the company and phone lines.
export type SplitContext = { warrantyText?: string; company?: string[] };

export function warrantyFitIssue(headline: string, linesUpFront: number, context: Required<SplitContext>, measure: TextMeasure): string | null {
  for (const screen of SPLIT_FIT.screens) {
    const height = warrantyHeight({ headline, linesUpFront, warrantyText: context.warrantyText, company: context.company }, screen, measure);
    if (height > splitColumn(screen).room) {
      return `Too much for the page once its photo is in: with ${linesUpFront} ${linesUpFront === 1 ? "line" : "lines"} up front, the warranty would run into the bottom row at the meeting. Show fewer lines up front, or shorten the headline.`;
    }
  }
  return null;
}

// { "page.field": message } for whatever would not fit at the meeting: the
// band pages' words (above the bottom row), the picker's line (two lines at
// most), every More button's label (clear of the dots and chevrons), and
// the warranty's lines up front beside its photo, when the warranty text is
// given. Settings refuses a save with any of them; the server, which can't
// measure a font, checks the counts only.
export function deckFitIssues(words: DeckWords, measure: TextMeasure, context: SplitContext = {}): DeckWordErrors {
  const errors: DeckWordErrors = {};
  for (const page of WORDS_PAGES) {
    const rules = PAGE_FIELDS[page];
    const value = words.pages[page];
    if (rules.words) {
      const issue =
        page === "light_picker"
          ? pickerLineFitIssue(value.words, measure)
          : PAGE_LAYOUT[page] === "band"
            ? bandWordsFitIssue(value.words, measure)
            : null;
      if (issue) errors[fieldKey(page, "words")] = issue;
    }
    if (rules.moreLabel) {
      const issue = moreLabelFitIssue(value.moreLabel, measure, { countAdded: rules.moreLabel.countAdded });
      if (issue) errors[fieldKey(page, "moreLabel")] = issue;
    }
  }
  if (context.warrantyText !== undefined) {
    const issue = warrantyFitIssue(words.pages.warranty.headline, words.warrantyLinesUpFront, { warrantyText: context.warrantyText, company: context.company ?? [] }, measure);
    if (issue) errors[LINES_UP_FRONT_KEY] = issue;
  }
  return errors;
}

// ---------------------------------------------------------------- gallery captions

export const MAX_CAPTION_CHARS = 40;

// The look only ("Warm white", "After a snowfall"): never an address,
// street, neighbourhood, house number or name. Empty is allowed.
export function captionIssue(caption: string): string | null {
  const text = caption.trim();
  if (text === "") return null;
  if (wordCount(text) > WORD_LIMITS.captionWords) return `${WORD_LIMITS.captionWords} words at most: the look only.`;
  if (nameLength(text) > MAX_CAPTION_CHARS) return `${MAX_CAPTION_CHARS} characters at most.`;
  if (/\d/.test(text)) return "No numbers. Name the look, never an address.";
  return textIssue(text);
}

export function tidyCaption(caption: string): string | null {
  const text = tidyLine(caption);
  return text === "" ? null : text;
}

// ---------------------------------------------------------------- example links

export type ReferenceInput = { pageUrl: string; imageUrl: string; site: string; why: string; shot: string };
export type ReferenceField = keyof ReferenceInput;

export const MAX_REFERENCE_TEXT = 4000;

export function isWebUrl(value: string, httpsOnly = false): boolean {
  try {
    const url = new URL(value.trim());
    return httpsOnly ? url.protocol === "https:" : url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function referenceIssues(input: ReferenceInput): Partial<Record<ReferenceField, string>> {
  const issues: Partial<Record<ReferenceField, string>> = {};
  if (!isWebUrl(input.pageUrl)) issues.pageUrl = "The web address of the page, starting https://";
  // Shown inside the app's https page, so only an https image can load.
  if (input.imageUrl.trim() !== "" && !isWebUrl(input.imageUrl, true)) {
    issues.imageUrl = "An image address starting https://, or leave it empty.";
  }
  if (input.site.trim() === "") issues.site = "Name the site.";
  else if (input.site.trim().length > 120) issues.site = "120 characters at most.";
  if (input.why.trim() === "") issues.why = "Say why it works.";
  else if (input.why.length > MAX_REFERENCE_TEXT) issues.why = "Too long.";
  if (input.shot.trim() === "") issues.shot = "Say the shot to take.";
  else if (input.shot.length > MAX_REFERENCE_TEXT) issues.shot = "Too long.";
  return issues;
}

export function parseReferenceInput(
  input: unknown,
): { ok: true; value: { page_url: string; image_url: string | null; site: string; why: string; shot: string } } | { ok: false; error: string } {
  const shaped = z
    .object({ pageUrl: z.string().max(2000), imageUrl: z.string().max(2000), site: z.string().max(400), why: z.string().max(8000), shot: z.string().max(8000) })
    .safeParse(input);
  if (!shaped.success) return { ok: false, error: "That link could not be read." };
  const issues = referenceIssues(shaped.data);
  const first = Object.values(issues)[0];
  if (first) return { ok: false, error: first };
  return {
    ok: true,
    value: {
      page_url: shaped.data.pageUrl.trim(),
      image_url: shaped.data.imageUrl.trim() || null,
      site: tidyLine(shaped.data.site),
      why: shaped.data.why.trim(),
      shot: shaped.data.shot.trim(),
    },
  };
}

// ---------------------------------------------------------------- reminders that never block

// The copy rules, as gentle reminders beside a field. They never stop a
// save: Keenan may have a reason, and some are only true once he confirms.
const AVOID: { pattern: RegExp; say: string }[] = [
  { pattern: /\b(nodes?|pixels?|bulbs?)\b/i, say: "Say lights, not nodes, pixels or bulbs." },
  { pattern: /\bRGBW?\b/, say: "Say red, green and blue, plus its own white." },
  { pattern: /\b(24|12)\s?v(olts?)?\b|\bvolts?\b/i, say: "No voltages." },
  { pattern: /\bkelvin\b|\b\d{4}\s?K\b/i, say: "Warm or cool, not Kelvin." },
  { pattern: /\blumens?\b|\bIP\s?6\d\b/i, say: "No lumens or IP ratings." },
  { pattern: /\bper (metre|meter|foot|ft)\b/i, say: "The spacing is about 8 inches apart, and no prices per foot." },
  { pattern: /colou?r[- ]?match|match(es|ed)? (its|your|the) colou?r/i, say: "White is the only stock track. Say: White track is in stock. Other colours are made to order." },
  { pattern: /\$|\bstarting at\b|\bdiscount\b|\bbook now\b|\blimited time\b/i, say: "No prices, discounts or deadlines before the price page." },
  { pattern: /\b(lifetime|guaranteed?|maintenance[- ]free|invisible|never)\b|\bno ladders?\b|\bno hardwiring\b|\bbefore christmas\b/i, say: "A promise to keep only once you've confirmed it." },
  { pattern: /\bKeenan\b/, say: "We, never a name." },
  { pattern: /\b(color|center|gray|meter|neighbor|license)\b/i, say: "Canadian spelling: colour, centre, grey, metre, neighbour, licence." },
];

export function wordsToAvoid(text: string): string[] {
  return AVOID.filter(({ pattern }) => pattern.test(text)).map(({ say }) => say);
}

// ---------------------------------------------------------------- what was seeded, to mark it Draft

// Word for word what supabase/migrations/20261108080527_round7_deck_words_and_looks.sql
// seeded (a unit test reads the migration and checks), page by page as
// stored. Round 9's seed migration (round9_deck_words) changes a page's
// words only where they still match these, so nothing Keenan has edited is
// overwritten.
export const ROUND7_SEED: Record<string, PageWords> = {
  what_vesper_is: {
    headline: "Up once, there all year",
    words: "A slim track under the edge of your roof, with the lights built in. Nothing to hang every fall.",
    moreLabel: "What's in it",
    moreText:
      "The lights sit in a slim aluminum track, about 8 inches apart, tucked under the soffit, the underside of your roof's edge.\nEach light has red, green and blue, plus its own white.\nA control box plugs into a standard outlet.\nYou run it from an app on your phone, over your home Wi-Fi.",
  },
  hidden_by_day: {
    headline: "Hidden by day",
    words: "The track tucks under the soffit. By day you see your house. By night you choose the light.",
    moreLabel: "Up close",
    moreText:
      "The track tucks under the soffit, where it's hard to spot by day. White track is in stock. Other colours are made to order. If your community has guidelines, we're happy to answer questions.",
  },
  whites_first: {
    headline: "Warm white, most nights",
    words: "Every light has its own white, so white looks clean. Colour is there for the nights you want it.",
    moreLabel: "Warm or cool",
    moreText: "Warm white is soft, like a porch light. Cool white is closer to daylight. Pick either one, any night, from your phone.",
  },
  light_picker: { headline: "Try it on your house", words: "A preview drawn on our photo of your house. Tap a look.", moreLabel: "", moreText: "" },
  phone_control: {
    headline: "Run it from your phone",
    words: "Pick a look in the app and your house changes. We set up the app with you on install day.",
    moreLabel: "What the app does",
    moreText: "Turn the lights on or off and change the look from your phone. It works over your home Wi-Fi.",
  },
  gallery: { headline: "Homes we've lit", words: "", moreLabel: "See all", moreText: "" },
  install_day: {
    headline: "How install day works",
    words: "We confirm the plan and the colours with you.\nA small crew fits the track and plugs in the control box.\nWe clean up and set up the app with you.",
    moreLabel: "What we'll need",
    moreText: "An outlet near where the control box will go, in the garage or outside.\nYour Wi-Fi name and password, so we can set up the app with you.",
  },
  warranty: { headline: "Our 10-year warranty", words: "", moreLabel: "The full warranty", moreText: "" },
  mockup: { headline: "Where your lights would go", words: "", moreLabel: "", moreText: "" },
};

// The deck as round 9's seed migration leaves it on a deck nobody has
// edited (a unit test reads that migration and checks each change against
// this and ROUND7_SEED): the five seats' words (2026-11-10) for the pages
// that changed, the two new pages, and every line. A field or line that
// still holds these words shows "Draft" in Settings only, never at a meeting.
export const DECK_SEED: DeckWords = {
  pages: {
    what_vesper_is: {
      ...ROUND7_SEED.what_vesper_is,
      moreText:
        "The lights sit in a slim aluminum track, about 8 inches apart, tucked under the soffit, the underside of your roof's edge.\nEach light has red, green and blue, plus its own white.\nA control box plugs into a standard outlet.",
    },
    hidden_by_day: {
      ...ROUND7_SEED.hidden_by_day,
      moreText: "The track tucks under the soffit, where it's hard to spot by day. If your community has guidelines, we're happy to answer questions.",
    },
    phone_control: {
      ...ROUND7_SEED.phone_control,
      words: "Pick a look in the app and your house changes. On or off, warm white or colour.",
    },
    gallery: ROUND7_SEED.gallery,
    warranty: ROUND7_SEED.warranty,
    your_house: PAGE_DEFAULTS.your_house as PageWords,
    mockup: { headline: "Your house, lit", words: "Our drawing of your lights on your photo.", moreLabel: "", moreText: "" },
    light_picker: {
      ...ROUND7_SEED.light_picker,
      words: "A preview drawn on our photo of your house. Most nights, warm white. Tap a look.",
    },
    whites_first: ROUND7_SEED.whites_first,
    // What we'll need carries over from How install day works as it was.
    next_steps: { ...(PAGE_DEFAULTS.next_steps as PageWords), moreLabel: ROUND7_SEED.install_day.moreLabel, moreText: ROUND7_SEED.install_day.moreText },
  },
  warrantyLinesUpFront: 3,
  lines: { ...DECK_LINE_DEFAULTS },
};

export const LOOKS_SEED: Look[] = [
  { key: "warm_white", name: "Warm white", words: "Like a porch light", colours: [{ hex: "#FFB46B", name: "Warm white" }], block: 1, active: true },
  { key: "cool_white", name: "Cool white", words: "Like daylight", colours: [{ hex: "#E4EEFF", name: "Cool white" }], block: 1, active: true },
  {
    key: "christmas",
    name: "Christmas",
    words: "Red, green, white",
    colours: [
      { hex: "#FF2D20", name: "Red" },
      { hex: "#16C83C", name: "Green" },
      { hex: "#FFB46B", name: "Warm white" },
    ],
    block: 3,
    active: true,
  },
  {
    key: "game_night",
    name: "Game night",
    words: "Red and gold",
    colours: [
      { hex: "#FF2A1F", name: "Red" },
      { hex: "#FFB000", name: "Amber" },
    ],
    block: 3,
    active: true,
  },
  {
    key: "halloween",
    name: "Halloween",
    words: "Orange and purple",
    colours: [
      { hex: "#FF6A00", name: "Orange" },
      { hex: "#8F3BFF", name: "Purple" },
    ],
    block: 3,
    active: true,
  },
];

export function isDraftField(page: WordsPageKey, field: WordsField, value: string): boolean {
  const seeded = DECK_SEED.pages[page][field];
  return seeded !== "" && value.trim() === seeded;
}

// A line still as we wrote it.
export function isDraftLine(key: DeckLineKey, value: string): boolean {
  return value.trim() === DECK_SEED.lines[key];
}

export function isDraftLook(look: Pick<Look, "key" | "name" | "words">): boolean {
  const seeded = LOOKS_SEED.find((item) => item.key === look.key);
  return Boolean(seeded) && seeded?.name === look.name.trim() && seeded?.words === look.words.trim();
}

// ---------------------------------------------------------------- help, for Settings only

// What Keenan reads beside each page's words. The suggested lines are ones
// he adds himself once he has confirmed them (copy rules); nothing here
// reaches a customer.
export const PAGE_HELP: Record<WordsPageKey, string> = {
  what_vesper_is:
    "Answers the Christmas-only worry in the first minute. We left out “an investment in your home”. Add it back if you want it. The app is said on Run it from your phone, so it isn’t in What’s in it.",
  hidden_by_day: "Never say the track matches the soffit: white is the only stock track. Colour is said once, on the colour page, so Up close leaves it out.",
  phone_control:
    "Only what the app does today. Once you’ve confirmed them, you can add lines about schedules, more than one phone, after a power cut or any monthly fee. Never the app’s brand name. Setting up the app is said once, on What happens next.",
  gallery: "The gallery’s words are each photo’s caption, set on the photo below: the look only. The button opens the grid of every photo.",
  warranty:
    "The page shows the first lines of the Warranty text in Settings, word for word, then the company and phone. The button opens every line, and the service call fee when it is set.",
  your_house:
    "Their own photo by day, unlit, exactly where the light picker will light it, so the next page is the reveal. {feet} is filled in with the feet on the quote; the line is hidden until something is measured. The button opens our drawing of their roofline, every measured run lit and named with its feet, never a price.",
  mockup:
    "Stands in for Your house when the roofline isn’t traced but there is a mockup: the mockup with this title and line, and they pinch to zoom. The light picker is skipped then.",
  light_picker:
    "The headline and the line under it sit in the tray under their house, smaller than other headlines, and the line has to fit on two lines. Every meeting opens on Warm white, steady. Keep “our photo”: the setter or you took it, not the customer.",
  whites_first:
    "Stands in for the light picker when there is neither a roofline trace nor a mockup, so “most nights, warm white” still lands. Once you’ve confirmed how warm the lights’ own white is, you can add “so warm white looks warm”. Each light has one white of its own, so don’t claim both whites are true whites.",
  next_steps:
    "The last page, at every meeting. The recap of their choice, Where you’re at (the same four steps and words as their link, with step 2 lit once they say yes, and your line under them), the install day with Pick a day, and the closing line are the lines under What happens next below. What we’ll need is behind its button. No durations or “before Christmas”.",
};

// What Keenan reads beside the built pages' lines.
export const LINES_HELP =
  "A name in braces, like {colour} or {name}, is filled in on screen. Keep the ones a line needs; the box says if one can’t go.";
