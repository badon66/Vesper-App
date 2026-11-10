import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { firstFamily } from "@/app/(app)/app/(owner)/admin/settings/presentation/measure-labels";
import { TRAY, TRAY_AT_PRO } from "@/components/meeting/picker/layout";
import { DECK_LINE_DEFAULTS, DECK_LINE_KEYS, DEFAULT_LINES, parseDeckWords, parseLooks, WORDS_PAGES, type DeckWords, type Look } from "@/lib/deck";
import { BAND_AT_AIR, BAND_AT_PRO, bottomRowRight, DECK_CLEAR_PX, DECK_ROW, DECK_SIZES, fluidPx } from "@/lib/meeting/deck-pages";
import {
  BAND_FIT,
  bandWordsFit,
  bandWordsFitIssue,
  blankLook,
  captionIssue,
  DECK_SEED,
  deckFitIssues,
  deckWordIssues,
  editableFields,
  GALLERY_MAX_PHOTOS,
  braceIssue,
  headlineIssue,
  isDraftField,
  isDraftLine,
  isDraftLook,
  isWebUrl,
  lineCount,
  lineIssue,
  LINES_UP_FRONT_KEY,
  linesUpFrontIssue,
  LOOK_ROW,
  lookIssues,
  looksIssues,
  looksToJson,
  lookTextWidth,
  lookWrapIssues,
  LOOKS_SEED,
  mergeEditableWords,
  MORE_FIT,
  moreLabelFitIssue,
  moreLabelRoom,
  moreRowRight,
  newLookKey,
  normaliseHex,
  PAGE_HELP,
  pageWordIssues,
  parseDeckWordsInput,
  parseLooksInput,
  parseReferenceInput,
  PICKER_LINE_FIT,
  pickerLineFitIssue,
  pickerLineWidth,
  referenceIssues,
  sameLooks,
  sameWords,
  SPLIT_FIT,
  splitColumn,
  tidyCaption,
  tidyDeckWords,
  tidyText,
  warrantyFitIssue,
  warrantyHeight,
  warrantyLines,
  wordsToAvoid,
  type TextMeasure,
} from "@/lib/settings/deck-schema";

const copy = (): DeckWords => JSON.parse(JSON.stringify(DECK_SEED));
const page = (overrides: Partial<DeckWords["pages"]["what_vesper_is"]> = {}) => ({ ...DECK_SEED.pages.what_vesper_is, ...overrides });
const words = (n: number) => Array.from({ length: n }, (_, at) => `word${at}`).join(" ");
const look = (overrides: Partial<Look> = {}): Look => ({ ...LOOKS_SEED[2], ...overrides });

describe("headlines", () => {
  it("takes up to 32 characters with no full stop, dash or exclamation mark", () => {
    expect(headlineIssue("Up once, there all year")).toBeNull();
    expect(headlineIssue("x".repeat(32))).toBeNull();
    expect(headlineIssue("x".repeat(33))).toMatch(/32 characters/);
    expect(headlineIssue("   ")).toBe("Add a headline.");
    expect(headlineIssue("Hidden by day.")).toMatch(/full stop/);
    expect(headlineIssue("Hidden — by day")).toMatch(/dashes/);
    expect(headlineIssue("Hidden - by day")).toMatch(/dashes/);
    expect(headlineIssue("Hidden by day!")).toMatch(/exclamation/);
  });

  it("keeps hyphens inside words", () => {
    expect(headlineIssue("Our 10-year warranty")).toBeNull();
  });
});

describe("a page's words", () => {
  it("lets a band page aim for 20 words and stop at 25", () => {
    expect(pageWordIssues("what_vesper_is", page({ words: words(25) })).words).toBeUndefined();
    expect(pageWordIssues("what_vesper_is", page({ words: words(26) })).words).toBe("25 words at most. Aim for 20.");
  });

  it("lets Your house's line say {feet}, and nothing else in braces anywhere", () => {
    const house = DECK_SEED.pages.your_house;
    expect(pageWordIssues("your_house", house)).toEqual({});
    expect(pageWordIssues("your_house", { ...house, words: "We measured {feet} ft, about {metres} m." }).words).toBe("Only {feet} can go in braces here.");
    expect(pageWordIssues("what_vesper_is", page({ words: "A slim track, {feet} ft of it." })).words).toMatch(/No braces here/);
    expect(braceIssue("Half open { brace", ["feet"])).toMatch(/Only \{feet\}/);
    expect(braceIssue("{feet} ft", ["feet"])).toBeNull();
  });

  it("keeps the picker's line short", () => {
    const picker = DECK_SEED.pages.light_picker;
    expect(pageWordIssues("light_picker", { ...picker, words: words(16) }).words).toBeUndefined();
    expect(pageWordIssues("light_picker", { ...picker, words: words(17) }).words).toMatch(/16 words/);
  });

  it("refuses dashes and exclamation marks in the words and behind the button", () => {
    expect(pageWordIssues("what_vesper_is", page({ words: "Bright – and calm" })).words).toMatch(/dashes/);
    expect(pageWordIssues("what_vesper_is", page({ moreText: "So clean!" })).moreText).toMatch(/exclamation/);
    expect(pageWordIssues("what_vesper_is", page({ moreLabel: "Up — close" })).moreLabel).toMatch(/dashes/);
  });

  it("keeps a More to 60 words with a label of 4 words that says what's behind it", () => {
    expect(pageWordIssues("what_vesper_is", page({ moreText: words(60) })).moreText).toBeUndefined();
    expect(pageWordIssues("what_vesper_is", page({ moreText: words(61) })).moreText).toMatch(/60 words/);
    expect(pageWordIssues("what_vesper_is", page({ moreLabel: "What is in the box" })).moreLabel).toBe("4 words at most.");
    for (const vague of ["More", "Learn more", "The details", "i", "+", "Read more."]) {
      expect(pageWordIssues("what_vesper_is", page({ moreLabel: vague })).moreLabel).toMatch(/Say what's behind it/);
    }
  });

  it("pairs the label with the words behind it", () => {
    expect(pageWordIssues("what_vesper_is", page({ moreLabel: "", moreText: "" }))).toEqual({});
    expect(pageWordIssues("what_vesper_is", page({ moreLabel: "", moreText: "Some words." })).moreLabel).toMatch(/Add the button's label/);
    expect(pageWordIssues("what_vesper_is", page({ moreLabel: "Up close", moreText: "  " })).moreText).toMatch(/Add the words behind/);
  });

  it("needs the gallery's and the warranty's labels, and leaves room for the gallery's count", () => {
    expect(pageWordIssues("gallery", { ...DECK_SEED.pages.gallery, moreLabel: "" }).moreLabel).toBe("Add the button's label.");
    expect(pageWordIssues("gallery", { ...DECK_SEED.pages.gallery, moreLabel: "See them all" }).moreLabel).toBeUndefined();
    expect(pageWordIssues("gallery", { ...DECK_SEED.pages.gallery, moreLabel: "See every one here" }).moreLabel).toMatch(/adds the count/);
    expect(pageWordIssues("warranty", { ...DECK_SEED.pages.warranty, moreLabel: " " }).moreLabel).toBe("Add the button's label.");
  });

  it("checks only the fields a page has", () => {
    expect(editableFields("mockup")).toEqual(["headline", "words"]);
    expect(editableFields("light_picker")).toEqual(["headline", "words"]);
    expect(editableFields("gallery")).toEqual(["headline", "moreLabel"]);
    expect(editableFields("warranty")).toEqual(["headline", "moreLabel"]);
    expect(editableFields("your_house")).toEqual(["headline", "words", "moreLabel", "moreText"]);
    expect(editableFields("next_steps")).toEqual(["headline", "moreLabel", "moreText"]);
    // What happens next's steps are lines, so stray words there are never checked.
    expect(pageWordIssues("next_steps", { ...DECK_SEED.pages.next_steps, words: "Wow! —" })).toEqual({});
    expect(WORDS_PAGES).not.toContain("install_day" as never);
  });
});

describe("the warranty's lines up front", () => {
  const warranty = "Line one.\nLine two.\n\nLine three.\nLine four.";

  it("splits the warranty into its lines, blanks dropped", () => {
    expect(warrantyLines(warranty)).toEqual(["Line one.", "Line two.", "Line three.", "Line four."]);
    expect(warrantyLines("")).toEqual([]);
  });

  it("shows at least one and never every line", () => {
    expect(linesUpFrontIssue(3, warranty)).toBeNull();
    expect(linesUpFrontIssue(4, warranty)).toMatch(/Fewer than all 4 lines/);
    expect(linesUpFrontIssue(0, warranty)).toMatch(/1 to 8/);
    expect(linesUpFrontIssue(9)).toMatch(/1 to 8/);
    expect(linesUpFrontIssue(2.5)).toMatch(/1 to 8/);
    expect(linesUpFrontIssue(1, "Only one line.")).toBeNull();
  });
});

describe("the deck's words as a whole", () => {
  it("passes the seeded words", () => {
    expect(deckWordIssues(DECK_SEED)).toEqual({});
  });

  it("names each problem by page and field, and each line by its key", () => {
    const edited = copy();
    edited.pages.hidden_by_day.headline = "Hidden by day!";
    edited.pages.phone_control.moreText = words(70);
    edited.warrantyLinesUpFront = 8;
    edited.lines.closing = "Talk soon!";
    edited.lines.next_prefix = "Next up";
    expect(deckWordIssues(edited, "a\nb\nc")).toEqual({
      "hidden_by_day.headline": "No exclamation marks.",
      "phone_control.moreText": "60 words at most, so it fits one screen.",
      "warranty.linesUpFront": "Fewer than all 3 lines: the full warranty is one tap away.",
      "lines.closing": "No exclamation marks.",
      "lines.next_prefix": "Keep {page}: it is filled in on screen.",
    });
  });

  it("tidies what it stores: lines trimmed, blank lines and double spaces gone, headlines on one line", () => {
    expect(tidyText("  One  step.\r\n\r\n Two\tsteps. \n")).toBe("One step.\nTwo steps.");
    const edited = copy();
    edited.pages.what_vesper_is.headline = "  Up once,\nthere   all year ";
    expect(tidyDeckWords(edited).pages.what_vesper_is.headline).toBe("Up once, there all year");
  });

  it("refuses a shape it can't read and every rule the screen checks", () => {
    expect(parseDeckWordsInput({ pages: {} })).toEqual({ ok: false, errors: { form: expect.any(String) } });
    expect(parseDeckWordsInput("nonsense").ok).toBe(false);
    const edited = copy();
    edited.pages.whites_first.words = "Clean — and warm";
    edited.lines.colour_made = "{colour} — made to order.";
    const parsed = parseDeckWordsInput(edited);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(Object.keys(parsed.errors)).toEqual(["whites_first.words", "lines.colour_made"]);
    const fine = parseDeckWordsInput({ ...copy(), pages: { ...copy().pages, mockup: { ...copy().pages.mockup, headline: " Your plan " } } });
    expect(fine.ok && fine.words.pages.mockup.headline).toBe("Your plan");
    // A save that leaves a line out keeps ours; lines are tidied to one line.
    const { lines, ...withoutLines } = copy();
    const partial = parseDeckWordsInput({ ...withoutLines, lines: { closing: "  We'll text you\nthe link. " } });
    expect(partial.ok && partial.words.lines.closing).toBe("We'll text you the link.");
    expect(partial.ok && partial.words.lines.cover_line).toBe(lines.cover_line);
  });

  it("changes only the fields Settings shows", () => {
    const stored = copy();
    stored.pages.mockup.words = "kept as stored";
    const edited = copy();
    edited.pages.mockup.words = "never saved";
    edited.pages.mockup.headline = "Your plan";
    edited.pages.light_picker.moreLabel = "never saved";
    edited.pages.next_steps.words = "never saved";
    edited.warrantyLinesUpFront = 2;
    edited.lines.closing = "Talk soon.";
    const merged = mergeEditableWords(stored, edited);
    expect(merged.pages.mockup).toEqual({ ...stored.pages.mockup, words: "never saved", headline: "Your plan" });
    expect(merged.pages.light_picker.moreLabel).toBe("");
    expect(merged.pages.next_steps.words).toBe("");
    expect(merged.warrantyLinesUpFront).toBe(2);
    expect(merged.lines.closing).toBe("Talk soon.");
    for (const key of WORDS_PAGES) expect(Object.keys(merged.pages[key])).toEqual(["headline", "words", "moreLabel", "moreText"]);
  });

  it("knows when nothing has changed", () => {
    const edited = copy();
    expect(sameWords(edited, DECK_SEED)).toBe(true);
    edited.pages.gallery.headline = "Homes we've lit ";
    expect(sameWords(edited, DECK_SEED)).toBe(true);
    edited.pages.gallery.headline = "Homes we lit";
    expect(sameWords(edited, DECK_SEED)).toBe(false);
    const line = copy();
    line.lines.closing = "Talk soon.";
    expect(sameWords(line, DECK_SEED)).toBe(false);
  });
});

describe("the built pages' lines (round 9, settings.deck.lines)", () => {
  it("passes every line we wrote", () => {
    for (const key of DECK_LINE_KEYS) expect(lineIssue(key, DECK_LINE_DEFAULTS[key]), key).toBeNull();
  });

  it("refuses an empty line, too many words, dashes, exclamation marks and names it can't fill", () => {
    expect(lineIssue("cover_line", " ")).toBe("Add the words, or use ours.");
    expect(lineIssue("colour_spring_label", "Install it in the spring")).toBe("4 words at most.");
    expect(lineIssue("closing", "We'll text you – the link")).toMatch(/dashes/);
    expect(lineIssue("financing", "Financing is available!")).toMatch(/exclamation/);
    expect(lineIssue("colour_made", "{colour} is made to order, {fee}.")).toBe("Only {colour} can go in braces here.");
    expect(lineIssue("closing", "We'll text you {name}.")).toMatch(/No braces here/);
  });

  it("keeps the names a line can't do without", () => {
    expect(lineIssue("next_prefix", "Up next: {page}")).toBeNull();
    expect(lineIssue("next_prefix", "Up next")).toBe("Keep {page}: it is filled in on screen.");
    expect(lineIssue("price_held", "Price held for a while.")).toBe("Keep {date}: it is filled in on screen.");
    // A name a line may use but needn't: fine without it.
    expect(lineIssue("colour_made", "Made to order.")).toBeNull();
  });

  it("marks a line still as we wrote it", () => {
    expect(isDraftLine("closing", DECK_LINE_DEFAULTS.closing)).toBe(true);
    expect(isDraftLine("closing", "Talk soon.")).toBe(false);
  });

  it("are read from settings.deck with ours for any line missing or empty, and saved back with the rest of the deck kept", async () => {
    const { deckWordsToJson } = await import("@/lib/deck");
    const stored = { version: 1, pages: { install_day: { headline: "How install day works" } }, lines: { closing: "Talk soon.", old_line: "kept" }, other: 1 };
    const read = parseDeckWords(stored);
    expect(read.lines).toEqual({ ...DEFAULT_LINES, closing: "Talk soon." });
    const json = deckWordsToJson(read, stored) as Record<string, Record<string, unknown>>;
    // Round 7's How install day works (the customer's link reads it) and
    // anything else this code doesn't know stay as they were.
    expect(json.pages.install_day).toEqual({ headline: "How install day works" });
    expect(json.lines.old_line).toBe("kept");
    expect(json.lines.closing).toBe("Talk soon.");
    expect(json.other).toBe(1);
    expect(parseDeckWords(json as never)).toEqual(read);
  });
});

describe("Draft", () => {
  it("marks a field that still holds the seeded words, and only that", () => {
    expect(isDraftField("what_vesper_is", "headline", "Up once, there all year")).toBe(true);
    expect(isDraftField("what_vesper_is", "headline", "Up once, there all year ")).toBe(true);
    expect(isDraftField("what_vesper_is", "headline", "Up once, lit all year")).toBe(false);
    // An empty seed is never a draft.
    expect(isDraftField("light_picker", "moreLabel", "")).toBe(false);
  });

  it("marks a seeded look whose name and colour words are unchanged", () => {
    expect(isDraftLook(LOOKS_SEED[3])).toBe(true);
    expect(isDraftLook({ ...LOOKS_SEED[3], words: "Red and amber" })).toBe(false);
    expect(isDraftLook({ key: "look_abc123", name: "Warm white", words: "Like a porch light" })).toBe(false);
  });
});

describe("a look", () => {
  it("passes every seeded look", () => {
    for (const seeded of LOOKS_SEED) expect(lookIssues(seeded)).toEqual({});
  });

  it("keeps the name to 14 characters and the colour words to 18, with no dashes", () => {
    expect(lookIssues(look({ name: "x".repeat(14) })).name).toBeUndefined();
    expect(lookIssues(look({ name: "x".repeat(15) })).name).toBe("14 characters at most.");
    expect(lookIssues(look({ name: "" })).name).toBe("Add a name.");
    expect(lookIssues(look({ name: "Game – night" })).name).toMatch(/dashes/);
    expect(lookIssues(look({ words: "x".repeat(18) })).words).toBeUndefined();
    expect(lookIssues(look({ words: "x".repeat(19) })).words).toBe("18 characters at most.");
    expect(lookIssues(look({ words: "" })).words).toMatch(/colour words/);
    expect(lookIssues(look({ words: "Red and gold!" })).words).toMatch(/exclamation/);
  });

  it("takes 1 to 4 light colours, each a hex and a plain name", () => {
    expect(lookIssues(look({ colours: [] })).colours).toMatch(/at least one/);
    const five = Array.from({ length: 5 }, () => ({ hex: "#FF0000", name: "Red" }));
    expect(lookIssues(look({ colours: five })).colours).toMatch(/4 light colours/);
    const issues = lookIssues(look({ colours: [{ hex: "#FF00", name: "Red" }, { hex: "ff8800", name: "" }] }));
    expect(issues["colour.0.hex"]).toMatch(/hex colour/);
    expect(issues["colour.1.hex"]).toBeUndefined();
    expect(issues["colour.1.name"]).toMatch(/Name it/);
    expect(lookIssues(look({ colours: [{ hex: "#FF0000", name: "x".repeat(21) }] }))["colour.0.name"]).toMatch(/20 characters/);
  });

  it("puts 2 to 6 lights of each colour in a block, and whites need none", () => {
    for (const block of [2, 3, 6]) expect(lookIssues(look({ block })).block).toBeUndefined();
    for (const block of [0, 1, 7, 2.5]) expect(lookIssues(look({ block })).block).toMatch(/2 to 6/);
    expect(lookIssues({ ...LOOKS_SEED[0], block: 9 }).block).toBeUndefined();
  });

  it("keeps Warm white on, because every meeting opens on it", () => {
    expect(lookIssues({ ...LOOKS_SEED[0], active: false }).active).toMatch(/opens on this look/);
    expect(lookIssues({ ...LOOKS_SEED[1], active: false }).active).toBeUndefined();
  });

  it("reads hex colours however they're typed", () => {
    expect(normaliseHex(" #ffb46b ")).toBe("#FFB46B");
    expect(normaliseHex("ffb46b")).toBe("#FFB46B");
    expect(normaliseHex("#FFB4")).toBe("#FFB4");
    expect(normaliseHex("orange")).toBe("orange");
  });
});

describe("the looks together", () => {
  const extra = (n: number): Look[] =>
    Array.from({ length: n }, (_, at) => ({ ...LOOKS_SEED[1], key: `look_extra${at}`, name: `Extra ${at}`, active: true }));

  it("allows at most 6 on and at least 1", () => {
    expect(looksIssues(LOOKS_SEED)).toEqual({ looks: {} });
    expect(looksIssues([...LOOKS_SEED, ...extra(1)]).list).toBeUndefined();
    expect(looksIssues([...LOOKS_SEED, ...extra(2)]).list).toMatch(/At most 6 looks on/);
    const allOff = LOOKS_SEED.slice(1).map((item) => ({ ...item, active: false }));
    expect(looksIssues(allOff).list).toBe("Turn at least one look on.");
  });

  it("allows 12 looks at most, on or off", () => {
    const off = Array.from({ length: 8 }, (_, at) => ({ ...LOOKS_SEED[1], key: `look_off${at}`, name: `Off ${at}`, active: false }));
    expect(looksIssues([...LOOKS_SEED, ...off]).list).toMatch(/12 looks at most/);
  });

  it("refuses two looks with the same name", () => {
    const twin = { ...LOOKS_SEED[2], key: "look_twin00", name: "christmas " };
    const issues = looksIssues([...LOOKS_SEED, twin]);
    expect(issues.looks.christmas?.name).toBe("Another look has this name.");
    expect(issues.looks.look_twin00?.name).toBe("Another look has this name.");
  });

  it("stores looks in the shape the meeting reads back, whites always one light per block", () => {
    const parsed = parseLooksInput([...LOOKS_SEED.map((item) => ({ ...item, colours: item.colours.map((colour) => ({ ...colour, hex: colour.hex.toLowerCase() })) }))]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.looks).toEqual(LOOKS_SEED);
    expect(parseLooks(looksToJson(parsed.looks))).toEqual(LOOKS_SEED);
    const white = parseLooksInput([{ ...LOOKS_SEED[0], block: 4 }]);
    expect(white.ok && white.looks[0].block).toBe(1);
  });

  it("refuses looks it can't read, shared keys and broken rules", () => {
    expect(parseLooksInput("nope").ok).toBe(false);
    expect(parseLooksInput([{ ...LOOKS_SEED[0], key: "Bad Key" }]).ok).toBe(false);
    expect(parseLooksInput([LOOKS_SEED[0], { ...LOOKS_SEED[1], key: "warm_white", name: "Other" }])).toEqual({ ok: false, error: expect.stringMatching(/share a key/) });
    expect(parseLooksInput([...LOOKS_SEED, ...extra(2)])).toEqual({ ok: false, error: expect.stringMatching(/At most 6/) });
    expect(parseLooksInput([{ ...LOOKS_SEED[2], block: 9 }]).ok).toBe(false);
  });

  it("knows when the looks are unchanged", () => {
    expect(sameLooks(LOOKS_SEED, LOOKS_SEED.map((item) => ({ ...item, name: ` ${item.name}` })))).toBe(true);
    expect(sameLooks(LOOKS_SEED, [...LOOKS_SEED].reverse())).toBe(false);
  });

  it("gives a new look a fresh key, off, with one empty colour", () => {
    let n = 0;
    const sequence = [0.5, 0.5, 0.25];
    const random = () => sequence[n++ % sequence.length];
    const first = newLookKey([], random);
    expect(first).toMatch(/^look_[0-9a-z]{6}$/);
    expect(newLookKey([first], () => 0.5)).not.toBe(first);
    const fresh = blankLook(["warm_white"]);
    expect(fresh).toMatchObject({ name: "", words: "", colours: [{ hex: "", name: "" }], active: false });
    expect(fresh.key).toMatch(/^look_/);
  });
});

describe("will a look's label wrap at the meeting?", () => {
  // A stand-in for canvas measureText: every character 10 px wide.
  const measure = (text: string) => text.length * 10;

  it("splits the tray's width into equal buttons, 12 px apart", () => {
    const row = LOOK_ROW.viewportWidth - 2 * LOOK_ROW.sidePadding;
    expect(lookTextWidth(1)).toBeCloseTo(row - 2 * LOOK_ROW.buttonPadding);
    expect(lookTextWidth(5)).toBeCloseTo((row - 4 * LOOK_ROW.gap) / 5 - 2 * LOOK_ROW.buttonPadding);
    expect(lookTextWidth(6)).toBeLessThan(lookTextWidth(5));
    // Never more than 6 buttons in the row, never fewer than 1.
    expect(lookTextWidth(9)).toBe(lookTextWidth(6));
    expect(lookTextWidth(0)).toBe(lookTextWidth(1));
  });

  it("refuses only the labels of looks that are on and too wide", () => {
    const width = lookTextWidth(2);
    const fits = Math.floor(width / 10);
    const wide = { ...LOOKS_SEED[2], words: "x".repeat(fits + 1) };
    const off = { ...LOOKS_SEED[3], words: "x".repeat(fits + 5), active: false };
    const issues = lookWrapIssues([LOOKS_SEED[0], wide, off], measure);
    expect(Object.keys(issues)).toEqual(["christmas"]);
    expect(issues.christmas.words).toMatch(/Too long for one line with 2 looks on/);
    expect(lookWrapIssues([LOOKS_SEED[0], { ...wide, words: "x".repeat(fits) }], measure)).toEqual({});
  });

  it("leaves room for the tick beside a chosen name", () => {
    const width = lookTextWidth(1);
    const name = "x".repeat(Math.floor((width - LOOK_ROW.tick) / 10) + 1);
    expect(lookWrapIssues([{ ...LOOKS_SEED[0], name }], measure).warm_white?.name).toMatch(/1 look on/);
  });

  it("tightens as more looks go on", () => {
    const words = "x".repeat(Math.floor(lookTextWidth(5) / 10));
    const five = LOOKS_SEED.map((item) => ({ ...item, words }));
    expect(lookWrapIssues(five, measure)).toEqual({});
    expect(Object.keys(lookWrapIssues([...five, { ...LOOKS_SEED[1], key: "look_sixth0", name: "Sixth", words }], measure))).toHaveLength(6);
  });
});

describe("gallery captions", () => {
  it("names the look only, in 4 words or fewer", () => {
    expect(captionIssue("")).toBeNull();
    expect(captionIssue("After a snowfall")).toBeNull();
    expect(captionIssue("Warm white on a winter night")).toMatch(/4 words/);
    expect(captionIssue("123 Aspen Crescent")).toMatch(/No numbers/);
    expect(captionIssue("Warm — white")).toMatch(/dashes/);
    expect(captionIssue("Wow!")).toMatch(/exclamation/);
    expect(captionIssue("Supercalifragilisticexpialidocious and extraordinarily")).toMatch(/40 characters/);
  });

  it("stores an empty caption as none", () => {
    expect(tidyCaption("  ")).toBeNull();
    expect(tidyCaption(" Warm   white ")).toBe("Warm white");
  });
});

describe("example links", () => {
  const good = { pageUrl: "https://example.com/gallery", imageUrl: "https://example.com/a.jpg", site: "Example", why: "Blue hour.", shot: "Across the street." };

  it("needs a web page, an optional https image, the site, why and the shot", () => {
    expect(referenceIssues(good)).toEqual({});
    expect(referenceIssues({ ...good, imageUrl: "" })).toEqual({});
    expect(referenceIssues({ ...good, pageUrl: "example.com" }).pageUrl).toMatch(/https/);
    expect(referenceIssues({ ...good, imageUrl: "http://example.com/a.jpg" }).imageUrl).toMatch(/https/);
    expect(referenceIssues({ ...good, pageUrl: "javascript:alert(1)" }).pageUrl).toBeDefined();
    expect(referenceIssues({ ...good, site: " ", why: "", shot: "" })).toEqual({ site: "Name the site.", why: "Say why it works.", shot: "Say the shot to take." });
  });

  it("stores the link tidied, an empty image as none", () => {
    expect(parseReferenceInput({ ...good, imageUrl: " ", site: "  Example   site " })).toEqual({
      ok: true,
      value: { page_url: good.pageUrl, image_url: null, site: "Example site", why: good.why, shot: good.shot },
    });
    expect(parseReferenceInput({ pageUrl: 1 }).ok).toBe(false);
    expect(parseReferenceInput({ ...good, pageUrl: "ftp://example.com" }).ok).toBe(false);
  });

  it("tells a web address from anything else", () => {
    expect(isWebUrl("http://example.com")).toBe(true);
    expect(isWebUrl("http://example.com", true)).toBe(false);
    expect(isWebUrl("not a url")).toBe(false);
  });
});

describe("copy-rule reminders", () => {
  it("flag jargon, matching claims, prices, promises and names, without blocking", () => {
    expect(wordsToAvoid("Each node has RGBW at 24V and 3000K")).toEqual([
      "Say lights, not nodes, pixels or bulbs.",
      "Say red, green and blue, plus its own white.",
      "No voltages.",
      "Warm or cool, not Kelvin.",
    ]);
    expect(wordsToAvoid("Colour matched to your soffit")[0]).toMatch(/only stock track/);
    expect(wordsToAvoid("Only $23 per foot")).toHaveLength(2);
    expect(wordsToAvoid("A lifetime of light, maintenance-free")).toEqual(["A promise to keep only once you've confirmed it."]);
    expect(wordsToAvoid("Keenan sets it up")).toEqual(["We, never a name."]);
    expect(wordsToAvoid("The color of the center")).toEqual([expect.stringMatching(/Canadian spelling/)]);
  });

  it("finds nothing in the seeded words", () => {
    for (const key of WORDS_PAGES) {
      const value = DECK_SEED.pages[key];
      expect(wordsToAvoid([value.headline, value.words, value.moreLabel, value.moreText].join("\n"))).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------- will the words fit at the meeting?

// A stand-in for Manrope: 0.46 em a character. Measured in Chromium with
// the app's own Manrope, the seeded band words run 0.42 to 0.44 em a
// character (3 lines at both iPads) and the picker's line 0.46 em, so this
// errs on the long side.
const approx: TextMeasure = (text, font) => text.length * font.size * 0.46;

describe("will the words fit at the meeting?", () => {
  it("wraps a paragraph between words, as the browser does", () => {
    const tenPx = (line: string) => line.length * 10;
    expect(lineCount("", 100, tenPx)).toBe(0);
    expect(lineCount("aaaa bbbb", 100, tenPx)).toBe(1);
    expect(lineCount("aaaa bbbb cccc", 100, tenPx)).toBe(2);
    expect(lineCount("aaaa   bbbb\ncccc dddd eeee", 100, tenPx)).toBe(3);
    // A word wider than the column is a line of its own.
    expect(lineCount("a averyveryverylongword b", 100, tenPx)).toBe(3);
  });

  it("knows the band's words column and how many lines stay above the bottom row", () => {
    const [air, pro] = BAND_FIT.screens.map(bandWordsFit);
    expect(air.width).toBeCloseTo(431.2, 1);
    expect(air.maxLines).toBe(4);
    expect(pro.width).toBeCloseTo(513.04, 1);
    expect(pro.maxLines).toBe(4);
  });

  it("refuses band words that would reach the bottom row, with the line count", () => {
    expect(bandWordsFitIssue(DECK_SEED.pages.what_vesper_is.words, approx)).toBeNull();
    expect(bandWordsFitIssue("", approx)).toBeNull();
    const long = "Permanent lights that stay up all year and change with the seasons, the holidays and your team, with no ladders or tangled strings every single fall.";
    expect(bandWordsFitIssue(long, approx)).toMatch(/runs to \d lines and reaches the page dots\. Keep it to 4\./);
    // Your house's {feet} is measured as a three-figure number.
    const seen: string[] = [];
    bandWordsFitIssue(DECK_SEED.pages.your_house.words, (text, font) => {
      seen.push(text);
      return approx(text, font);
    });
    expect(seen.at(-1)).toBe("We measured 888 ft of roofline.");
    expect(seen.some((text) => text.includes("{"))).toBe(false);
  });

  it("keeps the picker's line to two lines at both iPads", () => {
    expect(pickerLineWidth(PICKER_LINE_FIT.screens[0])).toBe(535);
    expect(pickerLineWidth(PICKER_LINE_FIT.screens[1])).toBe(673);
    expect(PICKER_LINE_FIT.maxLines).toBe(2);
    expect(pickerLineFitIssue(DECK_SEED.pages.light_picker.words, approx)).toBeNull();
    const three = "A preview drawn on our own photo of your house tonight, lit the way it would be on any evening you like. Tap a look to see it on the house.";
    expect(pickerLineFitIssue(three, approx)).toMatch(/two lines/);
  });

  it("checks the band pages' words and the picker's line, and passes the seeded words", () => {
    expect(deckFitIssues(DECK_SEED, approx)).toEqual({});
    expect(deckFitIssues(DECK_SEED, approx, { warrantyText: WARRANTY, company: COMPANY })).toEqual({});
    const words = copy();
    const long = Array.from({ length: 25 }, () => "neighbourhood").join(" ");
    for (const page of WORDS_PAGES) words.pages[page].words = long;
    expect(Object.keys(deckFitIssues(words, approx)).sort()).toEqual([
      "hidden_by_day.words",
      "light_picker.words",
      "mockup.words",
      "phone_control.words",
      "what_vesper_is.words",
      "whites_first.words",
      "your_house.words",
    ]);
  });

  it("measures the words as the meeting draws them, typographic apostrophes and all", () => {
    const seen: string[] = [];
    bandWordsFitIssue("We'll   set it\nup", (text, font) => {
      seen.push(text);
      return approx(text, font);
    });
    expect(seen.every((text) => !text.includes("'") && !text.includes("\n") && !text.includes("  "))).toBe(true);
    expect(seen.some((text) => text.includes("We\u2019ll"))).toBe(true);
  });

  it("stays in step with the deck's band and the picker's tray", () => {
    expect(BAND_FIT.screens[0].band).toBe(BAND_AT_AIR);
    expect(BAND_FIT.screens[1].band).toBe(BAND_AT_PRO);
    expect(BAND_FIT.buttonBottom).toBe(DECK_ROW.bottom);
    expect(BAND_FIT.buttonHeight).toBe(DECK_ROW.height);
    expect(DECK_SIZES.body).toBe(fluidPx(BAND_FIT.screens[0].size, BAND_FIT.screens[1].size));
    // The band's right column: the line at 56%, then 40 px in and 48 px from the edge, 24 px down.
    const parts = readFileSync("components/meeting/deck-parts.tsx", "utf8");
    const band = parts.slice(parts.indexOf("export function BandPage("), parts.indexOf("export function SplitPage("));
    const share = Math.round(BAND_FIT.split * 100);
    expect(band).toContain(`grid-cols-[${share}%_${100 - share}%]`);
    expect(band).toMatch(/pt-6 pr-12 pl-10/);
    expect(PICKER_LINE_FIT.sidePadding).toBe(TRAY.sidePadding);
    expect(PICKER_LINE_FIT.columnGap).toBe(TRAY.columnGap);
    expect(PICKER_LINE_FIT.screens[0].effectSegment).toBe(TRAY.effectSegment);
    expect(PICKER_LINE_FIT.screens[1].effectSegment).toBe(TRAY_AT_PRO.effectSegment);
    expect(PICKER_LINE_FIT.screens[0].size).toBe(TRAY.wordsSize);
    expect(PICKER_LINE_FIT.screens[1].size).toBe(TRAY_AT_PRO.wordsSize);
  });

  it("stays in step with the deck's bottom row and More button", () => {
    for (const width of MORE_FIT.widths) expect(moreRowRight(width)).toBe(bottomRowRight(width, MORE_FIT.pages));
    // The most pages a meeting shows at once.
    expect(MORE_FIT.pages).toBe(11);
    expect(MORE_FIT.row).toEqual({ dot: DECK_ROW.dot, pillEnds: DECK_ROW.pillEnds, chevron: DECK_ROW.chevron, gap: DECK_ROW.gap });
    // DeckButton: 20 px semibold, 24 px padding and a 1 px border each side;
    // BottomCorner: 48 px from the left edge (round 9), the row centred, so
    // the room is the same as measured from the right.
    const parts = readFileSync("components/meeting/deck-parts.tsx", "utf8");
    const button = parts.slice(parts.indexOf("export function DeckButton("), parts.indexOf("export function BottomCorner("));
    expect(button).toMatch(/\bborder\b/);
    expect(button).toContain("px-6");
    expect(button).toContain("text-[20px]");
    expect(button).toContain("font-semibold");
    const corner = parts.slice(parts.indexOf("export function BottomCorner("));
    expect(corner.slice(0, corner.indexOf("\n}\n"))).toContain("left-12");
  });

  it("stays in step with the deck's split pages", () => {
    const parts = readFileSync("components/meeting/deck-parts.tsx", "utf8");
    const split = parts.slice(parts.indexOf("export function SplitPage("), parts.indexOf("export function Lines("));
    const share = Math.round(SPLIT_FIT.split * 100);
    expect(split).toContain(`grid-cols-[${share}%_${100 - share}%]`);
    // The words column beside the picture: 28 px apart, 64 px down, 48 px from the edge, 112 px clear at its foot, 40 px from the line.
    expect(split).toMatch(/gap-7 overflow-hidden pt-16 pr-12 pb-28 pl-10/);
    expect(SPLIT_FIT.padBottom).toBeGreaterThanOrEqual(DECK_CLEAR_PX);
    const lines = parts.slice(parts.indexOf("export function Lines("));
    expect(lines.slice(0, lines.indexOf("\n}\n"))).toContain("gap-3");
    expect(DECK_SIZES.headline).toBe(fluidPx(SPLIT_FIT.screens[0].headline, SPLIT_FIT.screens[1].headline));
    expect(DECK_SIZES.body).toBe(fluidPx(SPLIT_FIT.screens[0].body, SPLIT_FIT.screens[1].body));
    expect(DECK_SIZES.small).toBe(fluidPx(SPLIT_FIT.screens[0].small, SPLIT_FIT.screens[1].small));
  });

  it("measures with Manrope alone, never the whole font stack", () => {
    expect(firstFamily('"__Manrope_a1b2c3", "__Manrope_Fallback_a1b2c3", ui-sans-serif, system-ui, sans-serif')).toBe('"__Manrope_a1b2c3"');
    expect(firstFamily("__Manrope_a1b2c3, sans-serif")).toBe("__Manrope_a1b2c3");
    expect(firstFamily("")).toBeNull();
  });
});

// The app's own Manrope, measured once with a canvas measureText in
// Chromium at the More button's 20 px semibold; anything else at the stand-in.
const MANROPE_LABELS: Record<string, number> = {
  "What the app does": 178.8,
  "What\u2019s in it": 105.1,
  "Up close": 81.4,
  "Warm or cool": 123.8,
  "See all 30": 91,
  "The full warranty": 159.2,
  "What we\u2019ll need": 151.4,
  "What the app can do": 195.1,
  "Homeowners association guidelines": 343.8,
};
const labelMeasure: TextMeasure = (text, font) => (font.size === 20 && font.weight === 600 && text in MANROPE_LABELS ? MANROPE_LABELS[text] : approx(text, font));

describe("will a More button's label fit the bottom row?", () => {
  it("leaves 16 px between the button and the dots and chevrons, with the 11 pages a meeting can show", () => {
    // 548 px of dots and chevrons, centred: they span 316 to 864 at 1180 and
    // 409 to 957 at 1366.
    expect(moreRowRight(1180)).toBe(864);
    expect(moreRowRight(1366)).toBe(957);
    // The button sits 48 px from the edge, with 24 px padding and a 1 px border each side.
    expect(moreLabelRoom(1180)).toBe(1180 - 48 - (864 + 16) - 50);
    expect(moreLabelRoom(1180)).toBe(1180 - 864 - 16 - 48 - 50);
    expect(moreLabelRoom(1366)).toBe(1366 - 48 - (957 + 16) - 50);
  });

  it("passes every seeded label at Manrope's own widths, and refuses one that would reach the dots", () => {
    for (const page of WORDS_PAGES) {
      expect(deckFitIssues(DECK_SEED, labelMeasure)[`${page}.moreLabel`], page).toBeUndefined();
    }
    // "What the app does" leaves 23 px at 1180 (its button ends at 277, the dots start at 316).
    expect(moreLabelFitIssue("What the app does", labelMeasure)).toBeNull();
    expect(moreLabelFitIssue("What the app can do", labelMeasure)).toBeNull();
    // About 212 px: its button would end at 310, 6 px from the dots.
    expect(moreLabelFitIssue("What the app can do now", labelMeasure)).toMatch(/run into the page dots/);
    // Within the 4 words Settings allows, but far too wide.
    const words = copy();
    words.pages.hidden_by_day.moreLabel = "Homeowners association guidelines";
    expect(pageWordIssues("hidden_by_day", words.pages.hidden_by_day).moreLabel).toBeUndefined();
    expect(deckFitIssues(words, labelMeasure)["hidden_by_day.moreLabel"]).toMatch(/Too long for the bottom row/);
    expect(moreLabelFitIssue("", labelMeasure)).toBeNull();
  });

  it("measures the gallery's label with the most photos it can count", () => {
    expect(GALLERY_MAX_PHOTOS).toBe(30);
    const seen: string[] = [];
    moreLabelFitIssue("See all", (text, font) => {
      seen.push(text);
      return labelMeasure(text, font);
    }, { countAdded: true });
    expect(seen).toContain("See all 30");
    // Just short enough alone, too long once the count is added.
    const fits = "Every home we\u2019ve lit";
    const room = moreLabelRoom(1180);
    const exact: TextMeasure = (text) => (text === fits ? room : room + 30);
    expect(moreLabelFitIssue(fits, exact)).toBeNull();
    expect(moreLabelFitIssue(fits, exact, { countAdded: true })).toMatch(/with the count added/);
  });

  it("measures the label as the meeting draws it, typographic apostrophes and all", () => {
    const seen: string[] = [];
    moreLabelFitIssue("What we'll  need", (text, font) => {
      seen.push(text);
      return approx(text, font);
    });
    expect(seen).toEqual(["What we\u2019ll need", "What we\u2019ll need"]);
  });
});

const WARRANTY = `10 years parts: lights, track and hardware, control box.
5 years labour: we come out and fix covered issues at no charge.
Years 6 to 10: parts still free, with a flat service call fee.
5 years workmanship, including any holes we drilled.`;
const COMPANY = ["Vesper Lighting, Inc., Calgary", "(403) 895-9915"];

describe("will a split page's words fit beside its photo?", () => {
  it("knows the words column at both iPads, at the installed app's real deck heights", () => {
    const [air, pro] = SPLIT_FIT.screens.map(splitColumn);
    expect(air.width).toBeCloseTo(431.2, 1);
    expect(pro.width).toBeCloseTo(513.04, 1);
    expect(SPLIT_FIT.screens.map((screen) => [screen.width, screen.height])).toEqual([
      [1180, 796],
      [1366, 1000],
    ]);
    // 64 px down to 112 px clear of the foot.
    expect(air.room).toBe(796 - 64 - 112);
    expect(pro.room).toBe(1000 - 64 - 112);
  });

  it("counts the warranty's lines up front, the headline and the company lines, only when the warranty is given", () => {
    expect(warrantyFitIssue("Our 10-year warranty", 3, { warrantyText: WARRANTY, company: COMPANY }, approx)).toBeNull();
    const longer = Array.from({ length: 8 }, (_, at) => `${at + 1} years of something covered in full, with every part and the labour to fit it at no charge to you.`).join("\n");
    expect(warrantyFitIssue("Our 10-year warranty", 8, { warrantyText: longer, company: COMPANY }, approx)).toMatch(/with 8 lines up front/);
    expect(warrantyFitIssue("Our 10-year warranty", 1, { warrantyText: longer, company: COMPANY }, approx)).toBeNull();
    const words = copy();
    words.warrantyLinesUpFront = 8;
    expect(deckFitIssues(words, approx, { warrantyText: longer, company: COMPANY })[LINES_UP_FRONT_KEY]).toMatch(/Show fewer lines up front/);
    expect(deckFitIssues(words, approx)[LINES_UP_FRONT_KEY]).toBeUndefined();
  });

  it("never breaks a headline inside a hyphenated word, and draws it 0.015 em tighter", () => {
    const air = SPLIT_FIT.screens[0];
    const seen: string[] = [];
    warrantyHeight({ headline: "Our 10-year plan", linesUpFront: 1, warrantyText: "One line.", company: [] }, air, (text, font) => {
      if (font.size === air.headline) seen.push(text);
      return approx(text, font);
    });
    expect(seen.some((text) => text.includes("10-year"))).toBe(true);
    expect(seen.every((text) => !text.endsWith("10-"))).toBe(true);
  });
});

describe("Settings' help for Keenan", () => {
  it("talks to Keenan plainly, never about how the deck was decided", () => {
    for (const page of WORDS_PAGES) {
      expect(PAGE_HELP[page], page).not.toMatch(/debate|seat|agent|\bpx\b/i);
    }
    expect(PAGE_HELP.what_vesper_is).toContain("We left out");
    expect(PAGE_HELP.whites_first).not.toMatch(/pure/);
  });

  it("uses typographic quotes and apostrophes in the page notes", () => {
    for (const page of WORDS_PAGES) {
      expect(PAGE_HELP[page], page).not.toMatch(/["']/);
    }
    expect(PAGE_HELP.whites_first).toContain("\u201cso warm white looks warm\u201d");
    expect(PAGE_HELP.next_steps).toContain("\u201cNo payment until your install is complete.\u201d");
  });

  it("says what to say about the track's colour, plainly", () => {
    expect(wordsToAvoid("Colour matched to your soffit")).toContain(
      "White is the only stock track. Say: White track is in stock. Other colours are made to order.",
    );
  });
});
