import { describe, expect, it } from "vitest";
import { parseLooks, WORDS_PAGES, type DeckWords, type Look } from "@/lib/deck";
import {
  blankLook,
  captionIssue,
  DECK_SEED,
  deckWordIssues,
  editableFields,
  headlineIssue,
  isDraftField,
  isDraftLook,
  isWebUrl,
  linesUpFrontIssue,
  LOOK_ROW,
  lookIssues,
  looksIssues,
  looksToJson,
  lookTextWidth,
  lookWrapIssues,
  LOOKS_SEED,
  mergeEditableWords,
  newLookKey,
  normaliseHex,
  pageWordIssues,
  parseDeckWordsInput,
  parseLooksInput,
  parseReferenceInput,
  referenceIssues,
  sameLooks,
  sameWords,
  tidyCaption,
  tidyDeckWords,
  tidyText,
  warrantyLines,
  wordsToAvoid,
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

  it("lets a split page run to 40 words, one step per line", () => {
    const steps = { ...DECK_SEED.pages.install_day };
    expect(pageWordIssues("install_day", { ...steps, words: `${words(20)}\n${words(20)}` }).words).toBeUndefined();
    expect(pageWordIssues("install_day", { ...steps, words: `${words(20)}\n${words(21)}` }).words).toBe("40 words at most.");
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
    expect(editableFields("mockup")).toEqual(["headline"]);
    expect(editableFields("light_picker")).toEqual(["headline", "words"]);
    expect(editableFields("gallery")).toEqual(["headline", "moreLabel"]);
    expect(editableFields("warranty")).toEqual(["headline", "moreLabel"]);
    expect(editableFields("install_day")).toEqual(["headline", "words", "moreLabel", "moreText"]);
    // The mockup has no words in Settings, so stray text there is never checked.
    expect(pageWordIssues("mockup", { ...DECK_SEED.pages.mockup, words: "Wow! —" })).toEqual({});
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

  it("names each problem by page and field", () => {
    const edited = copy();
    edited.pages.hidden_by_day.headline = "Hidden by day!";
    edited.pages.phone_control.moreText = words(70);
    edited.warrantyLinesUpFront = 8;
    expect(deckWordIssues(edited, "a\nb\nc")).toEqual({
      "hidden_by_day.headline": "No exclamation marks.",
      "phone_control.moreText": "60 words at most, so it fits one screen.",
      "warranty.linesUpFront": "Fewer than all 3 lines: the full warranty is one tap away.",
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
    const parsed = parseDeckWordsInput(edited);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(Object.keys(parsed.errors)).toEqual(["whites_first.words"]);
    const fine = parseDeckWordsInput({ ...copy(), pages: { ...copy().pages, mockup: { ...copy().pages.mockup, headline: " Your plan " } } });
    expect(fine.ok && fine.words.pages.mockup.headline).toBe("Your plan");
  });

  it("changes only the fields Settings shows", () => {
    const stored = copy();
    stored.pages.mockup.words = "kept as stored";
    const edited = copy();
    edited.pages.mockup.words = "never saved";
    edited.pages.mockup.headline = "Your plan";
    edited.pages.light_picker.moreLabel = "never saved";
    edited.warrantyLinesUpFront = 2;
    const merged = mergeEditableWords(stored, edited);
    expect(merged.pages.mockup).toEqual({ ...stored.pages.mockup, headline: "Your plan" });
    expect(merged.pages.light_picker.moreLabel).toBe("");
    expect(merged.warrantyLinesUpFront).toBe(2);
    for (const key of WORDS_PAGES) expect(Object.keys(merged.pages[key])).toEqual(["headline", "words", "moreLabel", "moreText"]);
  });

  it("knows when nothing has changed", () => {
    const edited = copy();
    expect(sameWords(edited, DECK_SEED)).toBe(true);
    edited.pages.gallery.headline = "Homes we've lit ";
    expect(sameWords(edited, DECK_SEED)).toBe(true);
    edited.pages.gallery.headline = "Homes we lit";
    expect(sameWords(edited, DECK_SEED)).toBe(false);
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
