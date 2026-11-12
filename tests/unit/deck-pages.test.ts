import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DECK_PAGES, DEFAULT_LINES, isRetired, MAX_SHOWN_PAGES, parseDeckWords, parseLooks, STORY_PAGES, type DeckWords } from "@/lib/deck";
import { CUSTOM_CHOICE } from "@/lib/leads/track-colour";
import { WARM_WHITE } from "@/lib/lights/looks";
import {
  bandHeight,
  BAND_HEIGHT_CSS,
  bottomRowRight,
  bottomRowWidth,
  buildDeckPayload,
  CHECK_TOGETHER,
  chooserSave,
  colourIsStock,
  colourTimingView,
  companyLines,
  companyOf,
  coverLine,
  DECK_CLEAR_CSS,
  DECK_CLEAR_PX,
  DECK_ROW,
  DECK_ROW_BOTTOM_CSS,
  DECK_SIZES,
  deckPages,
  deckPhotoPathsToSign,
  entryOf,
  exitHoldMoved,
  EXIT_HOLD_SLOP_PX,
  fluidPx,
  fluidValue,
  fullWarrantyShows,
  GALLERY_HERO_COUNT,
  galleryCounter,
  galleryItems,
  houseLine,
  mockupJobs,
  offerMockup,
  installDayGrid,
  installDays,
  isNear,
  LAYER_SWIPE_PX,
  layerSwipe,
  measuredFeet,
  measuredRuns,
  moreWords,
  nextLabel,
  nextLabelParts,
  pageLabel,
  pairView,
  pickerFrom,
  placeOf,
  recapLine,
  runsMeasured,
  seeAllLabel,
  serviceCallLine,
  shownInstallDay,
  slotView,
  soffitView,
  startIndex,
  stepFor,
  warrantyLines,
  type DeckPhotoRow,
} from "@/lib/meeting/deck-pages";
import type { DeckPayload, DeckPhoto, MeetingMockup } from "@/lib/meeting/state";
import type { QuoteRun } from "@/lib/pricing";
import { DECK_SEED } from "@/lib/settings/deck-schema";

// The deck's rules (round 7, the settled spec; round 9, the meeting as one
// story): which pages show and in what order, the stand-ins, the Next label,
// what an empty slot shows, the words each page reads, and the payload built
// from the database rows.

const migration = readFileSync(
  new URL("../../supabase/migrations/20261108080527_round7_deck_words_and_looks.sql", import.meta.url),
  "utf8",
);
const seeded = (tag: string) => JSON.parse(migration.match(new RegExp(`\\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$`))?.[1] ?? "null");
// The deck as round 9's seed migration leaves it (lib/settings/deck-schema.ts
// DECK_SEED, checked against both migrations in deck-settings-seed.test.ts).
const WORDS: DeckWords = DECK_SEED;
const ROUND7_WORDS: DeckWords = parseDeckWords(seeded("deck"));
const LOOKS = parseLooks(seeded("looks"));
const WARRANTY = `10 years parts: lights, track and hardware, control box.
5 years labour: we come out and fix covered issues at no charge.
Years 6 to 10: parts still free, with a flat service call fee.
5 years workmanship, including any holes we drilled.`;

const photo = (name: string, extra: Partial<DeckPhoto> = {}): DeckPhoto => ({
  url: `https://abcd.supabase.co/storage/v1/object/sign/presentation/deck/${name}.jpg?token=t`,
  thumbUrl: null,
  focus: [0.5, 0.5],
  caption: null,
  ...extra,
});

const deck = (extra: Partial<DeckPayload> = {}): DeckPayload => ({
  words: WORDS,
  photos: {},
  gallery: [],
  looks: LOOKS,
  picker: null,
  company: { name: "Vesper Lighting, Inc.", place: "Calgary", phone: "(403) 895-9915" },
  warranty: { text: WARRANTY, serviceCallFee: null, gstEnabled: false },
  talking: {},
  ...extra,
});

const PICKER = {
  photoUrl: "https://abcd.supabase.co/storage/v1/object/sign/lead-photos/u/p.jpg?token=t",
  trace: {
    lines: [[[0.1, 0.5], [0.9, 0.5]]] as [number, number][][],
    lineFeet: [null],
    scale: { a: [0.4, 0.8] as [number, number], b: [0.6, 0.8] as [number, number], feet: 16, kind: "double" as const },
    duskBrightness: 0.5,
    lightCount: 100,
  },
};
const keys = (pages: { key: string }[]) => pages.map((page) => page.key);

const mock = (id: string, jobs: Partial<MeetingMockup> = {}): MeetingMockup => ({
  id,
  name: id,
  url: `https://abcd.supabase.co/storage/v1/object/sign/lead-photos/u/${id}.jpg?token=t`,
  main: false,
  day: false,
  night: false,
  scene: false,
  offers: [],
  ...jobs,
});
const MAIN = mock("main", { main: true, name: "Warm white" });
const DAY = mock("day", { day: true });
const NIGHT = mock("night", { night: true });
const XMAS = mock("xmas", { scene: true, name: "Christmas" });
const LOWER = mock("lower", { offers: ["front_lower"], name: "Front lower" });
const EVERY = [MAIN, DAY, NIGHT, XMAS, LOWER];

describe("the pages a meeting shows (round 10: mockups per house)", () => {
  it("follows Keenan's order: cover, the Main, day and night, the phone, the warranty, the price, What happens next", () => {
    const pages = deckPages({ deck: deck({ picker: PICKER, gallery: [photo("g1")] }), lead: { mockupUrl: MAIN.url, mockups: EVERY } });
    expect(keys(pages)).toEqual(["cover", "what_vesper_is", "hidden_by_day", "phone_control", "warranty", "quote", "next_steps"]);
    expect(keys(pages)).toEqual([...STORY_PAGES]);
    expect(pages.length).toBe(MAX_SHOWN_PAGES);
    expect(MAX_SHOWN_PAGES).toBe(7);
    // The round 9 pages and the light picker keep their keys and never show.
    for (const key of ["gallery", "your_house", "mockup", "whites_first", "colour", "light_picker"] as const) {
      expect(DECK_PAGES).toContain(key);
      expect(keys(pages)).not.toContain(key);
    }
  });

  it("skips any page missing its mockup, so a meeting never shows an empty page", () => {
    expect(keys(deckPages({ deck: deck(), lead: { mockupUrl: null, mockups: [] } }))).toEqual(["cover", "warranty", "quote", "next_steps"]);
    // Day without Night: no slider.
    expect(keys(deckPages({ deck: deck(), lead: { mockupUrl: MAIN.url, mockups: [MAIN, DAY] } }))).toEqual(["cover", "what_vesper_is", "warranty", "quote", "next_steps"]);
    // A scene alone brings the phone page; the Main is not a scene on its own.
    expect(keys(deckPages({ deck: deck(), lead: { mockupUrl: null, mockups: [XMAS] } }))).toEqual(["cover", "phone_control", "warranty", "quote", "next_steps"]);
    expect(keys(deckPages({ deck: deck(), lead: { mockupUrl: MAIN.url, mockups: [MAIN] } }))).not.toContain("phone_control");
  });

  // Keenan, 2026-11-11: no light picker, even with a roofline traced and
  // looks on, in a meeting and in the rehearsal alike.
  it("never shows the light picker, traced or not", () => {
    expect(isRetired("light_picker")).toBe(true);
    expect(STORY_PAGES).not.toContain("light_picker");
    for (const fillEmpty of [false, true]) {
      expect(keys(deckPages({ deck: deck({ picker: PICKER }), lead: { mockupUrl: null }, fillEmpty }))).not.toContain("light_picker");
      expect(keys(deckPages({ deck: deck({ picker: PICKER }), lead: { mockupUrl: MAIN.url, mockups: EVERY }, fillEmpty }))).not.toContain("light_picker");
      expect(keys(deckPages({ deck: deck({ picker: PICKER, looks: [] }), lead: { mockupUrl: null }, fillEmpty }))).not.toContain("light_picker");
      expect(keys(deckPages({ deck: deck(), lead: { mockupUrl: null }, fillEmpty }))).not.toContain("light_picker");
      expect(keys(deckPages({ deck: deck({ picker: PICKER }), lead: null, fillEmpty }))).not.toContain("light_picker");
    }
  });

  it("with no lead (the rehearsal), shows the cover, the warranty and What happens next", () => {
    expect(keys(deckPages({ deck: deck({ picker: PICKER }), lead: null }))).toEqual(["cover", "warranty", "next_steps"]);
    expect(keys(deckPages({ deck: deck(), lead: null, fillEmpty: true }))).toEqual(["cover", "warranty", "next_steps"]);
  });

  it("gives each mockup its jobs: one picture can do several", () => {
    const both = mock("both", { main: true, scene: true, offers: ["full"] });
    const jobs = mockupJobs([both, DAY, NIGHT, XMAS]);
    expect(jobs.main?.id).toBe("both");
    expect(jobs.day?.id).toBe("day");
    expect(jobs.night?.id).toBe("night");
    // The Main leads the phone's scenes, once.
    expect(jobs.scenes.map((item) => item.id)).toEqual(["both", "xmas"]);
    expect(mockupJobs([MAIN]).scenes).toEqual([]);
    expect(mockupJobs(undefined)).toEqual({ main: null, day: null, night: null, scenes: [] });
  });

  it("shows an offer its own mockup, else the Main, else none", () => {
    expect(offerMockup(EVERY, "front_lower")?.id).toBe("lower");
    expect(offerMockup(EVERY, "full")?.id).toBe("main");
    expect(offerMockup([LOWER], "full")).toBeNull();
    expect(offerMockup([], null)).toBeNull();
  });

  it("names each page by its headline from Settings, the built pages from their lines", () => {
    const pages = deckPages({ deck: deck({ picker: PICKER }), lead: { mockupUrl: MAIN.url, mockups: EVERY } });
    expect(pages.map((page) => page.label)).toEqual([
      "Vesper",
      "Up once, there all year",
      "Hidden by day",
      "Run it from your phone",
      "Our 10-year warranty",
      "Your price",
      "What happens next",
    ]);
    expect(pageLabel("gallery", parseDeckWords({}))).toBe("Homes we've lit");
    const blank = { ...WORDS, pages: { ...WORDS.pages, mockup: { ...WORDS.pages.mockup, headline: " " }, whites_first: { ...WORDS.pages.whites_first, headline: "" } } };
    expect(pageLabel("mockup", blank)).toBe("Your house, lit");
    expect(pageLabel("whites_first", blank)).toBe("Warm white, most nights");
    expect(pageLabel("colour", { ...WORDS, lines: { ...WORDS.lines, colour_headline: "Your colour" } })).toBe("Your colour");
  });

  it("reads a deck saved before round 9 with Your house, What happens next and every line from the code's defaults", () => {
    expect(ROUND7_WORDS.pages.your_house).toEqual(DECK_SEED.pages.your_house);
    expect(ROUND7_WORDS.pages.next_steps.headline).toBe("What happens next");
    expect(ROUND7_WORDS.lines).toEqual(DEFAULT_LINES);
    // A line stored empty reads ours; a page Keenan cleared stays clear.
    const stored = parseDeckWords({ pages: { your_house: { headline: "", words: "" } }, lines: { cover_line: "  ", closing: "Talk soon." } });
    expect(stored.lines.cover_line).toBe(DEFAULT_LINES.cover_line);
    expect(stored.lines.closing).toBe("Talk soon.");
    expect(stored.pages.your_house.headline).toBe("");
  });
});

describe("the Next label (round 9)", () => {
  const pages = deckPages({ deck: deck({ picker: PICKER }), lead: { mockupUrl: MAIN.url, mockups: EVERY } });

  it("names the next page that actually shows, and nothing on the last", () => {
    expect(nextLabel(pages, 0, DEFAULT_LINES)).toBe("Next: Up once, there all year");
    expect(nextLabel(pages, 3, DEFAULT_LINES)).toBe("Next: Our 10-year warranty");
    // Without mockups, the cover points straight at the warranty.
    const bare = deckPages({ deck: deck(), lead: { mockupUrl: null } });
    expect(nextLabel(bare, 0, DEFAULT_LINES)).toBe("Next: Our 10-year warranty");
    expect(nextLabel(pages, pages.findIndex((page) => page.key === "quote"), DEFAULT_LINES)).toBe("Next: What happens next");
    expect(nextLabel(pages, pages.length - 1, DEFAULT_LINES)).toBeNull();
  });

  it("follows Keenan's headlines and his wording, the page's name on a line of its own", () => {
    const lines = { ...DEFAULT_LINES, next_prefix: "Coming up: {page}" };
    expect(nextLabel(pages, 0, lines)).toBe("Coming up: Up once, there all year");
    expect(nextLabelParts(pages, 0, DEFAULT_LINES)).toEqual({ lead: "Next:", page: "Up once, there all year" });
    expect(nextLabelParts(pages, pages.length - 1, DEFAULT_LINES)).toBeNull();
  });
});

describe("Your house's line and drawing", () => {
  const runs: QuoteRun[] = [
    { name: "Front", feet: 64, level: "lower", part: "eave" },
    { name: "Garage", feet: 0, level: "lower", part: "garage" },
    { name: "Upper gable", feet: 40.4, level: "upper", part: "gable" },
  ];

  it("counts only the runs measured so far", () => {
    expect(measuredRuns(runs)).toEqual([0, 2]);
    expect(measuredFeet(runs)).toBe(104);
    expect(runsMeasured(runs)).toBe(true);
    expect(runsMeasured([{ name: "Front", feet: 0 }])).toBe(false);
    expect(runsMeasured("junk")).toBe(false);
  });

  it("reads We measured 104 ft of roofline., hidden while nothing is measured", () => {
    expect(houseLine(WORDS.pages.your_house, runs)).toBe("We measured 104 ft of roofline.");
    expect(houseLine(WORDS.pages.your_house, [{ name: "Front", feet: 0, level: "lower" }])).toBeNull();
    expect(houseLine({ ...WORDS.pages.your_house, words: " " }, runs)).toBeNull();
  });
});

describe("the colour page's one colour rule (round 9)", () => {
  it("White is the only stock colour", () => {
    expect(colourIsStock("list", "White")).toBe(true);
    expect(colourIsStock("list", "white")).toBe(true);
    expect(colourIsStock("list", "Off-white")).toBe(false);
    expect(colourIsStock("list", "Brown")).toBe(false);
    expect(colourIsStock("custom", "White aluminium (RAL 9006)")).toBe(false);
    expect(colourIsStock("none", "")).toBe(false);
  });

  it("says White is in stock and included, with no buttons", () => {
    expect(colourTimingView({ lines: DEFAULT_LINES, kind: "list", text: "White", timing: "stock", rushFee: 400 })).toEqual({
      kind: "stock",
      line: "White is in stock and included.",
    });
    expect(colourTimingView({ lines: DEFAULT_LINES, kind: "none", text: "", timing: null, rushFee: 400 })).toEqual({ kind: "none" });
  });

  it("any other colour is made to order: Install this season, included, and Install in spring, included (round 17)", () => {
    expect(colourTimingView({ lines: DEFAULT_LINES, kind: "list", text: "Brown", timing: "factory_order", rushFee: 400 })).toEqual({
      kind: "made",
      line: "Brown is made to order.",
      season: { label: "Install this season", value: "Included" },
      spring: { label: "Install in spring", value: "Included" },
      chosen: "spring",
    });
    for (const rushFee of [null, 0]) {
      const view = colourTimingView({ lines: DEFAULT_LINES, kind: "list", text: "Black", timing: "rush", rushFee });
      expect(view.kind === "made" && [view.season.value, view.chosen]).toEqual(["Included", "season"]);
    }
  });

  it("names the rush fee only when Keenan charges it on a this-season install (round 17)", () => {
    const charged = colourTimingView({ lines: DEFAULT_LINES, kind: "custom", text: "Anthracite grey", timing: "rush", rushFee: 400 });
    expect(charged.kind === "made" && [charged.season.value, charged.chosen]).toEqual(["$400 rush colour fee", "season"]);
    // A fee stored on a spring quote is never named.
    const spring = colourTimingView({ lines: DEFAULT_LINES, kind: "list", text: "Brown", timing: "factory_order", rushFee: 400 });
    expect(JSON.stringify(spring)).not.toMatch(/rush|fee/i);
  });
});

describe("What happens next (round 9)", () => {
  it("offers three weeks of days from tomorrow", () => {
    const days = installDays("2026-11-10");
    expect(days.length).toBe(21);
    expect(days[0]).toBe("2026-11-11");
    expect(days[20]).toBe("2026-12-01");
  });

  it("lays them out a week to a row, Sunday first, with blanks before tomorrow and after the last", () => {
    // Wednesday, November 11, 2026.
    const grid = installDayGrid("2026-11-10");
    expect(grid.every((row) => row.length === 7)).toBe(true);
    expect(grid[0]).toEqual([null, null, null, "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14"]);
    expect(grid.flat().filter(Boolean).length).toBe(21);
    expect(grid.length).toBe(4);
    // Tomorrow a Sunday: three full rows.
    expect(installDayGrid("2026-11-14").length).toBe(3);
  });

  it("shows a picked day only while it is still ahead", () => {
    expect(shownInstallDay("2026-11-21", "2026-11-10")).toBe("2026-11-21");
    expect(shownInstallDay("2026-11-10", "2026-11-10")).toBeNull();
    expect(shownInstallDay("2026-11-02", "2026-11-10")).toBeNull();
    expect(shownInstallDay(null, "2026-11-10")).toBeNull();
    expect(shownInstallDay("soon", "2026-11-10")).toBeNull();
  });

  it("reads back their choice with its total, + GST only when GST is on", () => {
    expect(recapLine(DEFAULT_LINES, "Main floor", 3380, false)).toBe("Your choice: Main floor, $3,380");
    expect(recapLine(DEFAULT_LINES, " Full wrap ", 4959.5, true)).toBe("Your choice: Full wrap, $4,959.50 + GST");
  });
});

describe("what an empty slot shows", () => {
  it("Keenan's photos when there are any", () => {
    const view = slotView(deck({ photos: { "what_vesper_is.hero": [photo("a")] } }), "what_vesper_is.hero");
    expect(view).toEqual({ kind: "photo", photos: [photo("a")] });
  });

  it("its fallback in a meeting: a drawing, the words alone, or nothing", () => {
    expect(slotView(deck(), "what_vesper_is.hero")).toEqual({ kind: "fallback", fallback: "drawing_house" });
    expect(slotView(deck(), "whites_first.hero")).toEqual({ kind: "fallback", fallback: "drawing_house_entry" });
    expect(slotView(deck(), "what_vesper_is.more")).toEqual({ kind: "fallback", fallback: "drawing_eave" });
    expect(slotView(deck(), "phone_control.hero")).toEqual({ kind: "fallback", fallback: "drawing_phone" });
    expect(slotView(deck(), "install_day.hero")).toEqual({ kind: "fallback", fallback: "words" });
    expect(slotView(deck(), "warranty.hero")).toEqual({ kind: "fallback", fallback: "words" });
    expect(slotView(deck(), "no.such_slot")).toEqual({ kind: "fallback", fallback: "words" });
  });

  it("its example in the rehearsal view", () => {
    const view = slotView(deck(), "warranty.hero", true);
    expect(view.kind).toBe("example");
    expect(view.kind === "example" && view.slot.key).toBe("warranty.hero");
  });

  it("the drawn pair until both photos of a pair are in", () => {
    const one = deck({ photos: { "hidden_by_day.day": [photo("day")] } });
    expect(pairView(one, "hidden_by_day.day", "hidden_by_day.night")).toEqual({ kind: "drawn" });
    const both = deck({ photos: { "hidden_by_day.day": [photo("day")], "hidden_by_day.night": [photo("night")] } });
    expect(pairView(both, "hidden_by_day.day", "hidden_by_day.night").kind).toBe("pair");
    const rehearsal = pairView(one, "hidden_by_day.day", "hidden_by_day.night", true);
    expect(rehearsal.kind === "pair" && rehearsal.sides.map((side) => side.kind)).toEqual(["photo", "example"]);
  });
});

describe("the gallery", () => {
  const gallery = Array.from({ length: 12 }, (_, at) => photo(`g${at}`));

  it("is Keenan's photos in his order; the rehearsal adds the empty slots' examples after them", () => {
    expect(galleryItems(deck({ gallery })).length).toBe(12);
    const rehearsal = galleryItems(deck({ gallery: [photo("g0")], photos: { "gallery.snow": [photo("g0")] } }), true);
    expect(rehearsal[0]).toEqual({ kind: "photo", photo: photo("g0") });
    expect(rehearsal.slice(1).map((item) => (item.kind === "example" ? item.slot.key : ""))).not.toContain("gallery.snow");
    expect(rehearsal.length).toBe(7);
  });

  it("says See all with the real count", () => {
    expect(GALLERY_HERO_COUNT).toBe(6);
    expect(seeAllLabel(WORDS.pages.gallery.moreLabel, 12)).toBe("See all 12");
  });

  it("counts the band's photos only while they are the whole gallery, so See all N is the only total", () => {
    expect(galleryCounter(0, 6, 6)).toBe("1 of 6");
    expect(galleryCounter(1, 3, 3)).toBe("2 of 3");
    expect(galleryCounter(9, 6, 6)).toBe("6 of 6");
    // Six on the band out of twelve: no "1 of 6" beside "See all 12".
    expect(galleryCounter(0, 6, 12)).toBeNull();
    // In rehearsal the examples count toward the gallery too.
    expect(galleryCounter(0, 6, 7)).toBeNull();
    expect(galleryCounter(0, 1, 1)).toBeNull();
    expect(galleryCounter(0, 0, 0)).toBeNull();
  });

  it("steps through its first six photos with the chevrons before turning the page", () => {
    expect(stepFor("gallery", 0, 6, 1)).toEqual({ photo: 1 });
    expect(stepFor("gallery", 5, 6, 1)).toEqual({ page: 1 });
    expect(stepFor("gallery", 0, 6, -1)).toEqual({ page: -1 });
    expect(stepFor("gallery", 3, 6, -1)).toEqual({ photo: 2 });
    expect(stepFor("warranty", 3, 6, 1)).toEqual({ page: 1 });
  });
});

describe("the words", () => {
  it("a More needs both its label and its words, line by line", () => {
    expect(moreWords(WORDS.pages.what_vesper_is)).toEqual({
      label: "What's in it",
      lines: [
        "The lights sit in a slim aluminum track, about 8 inches apart, tucked under the soffit, the underside of your roof's edge.",
        "Each light has red, green and blue, plus its own white.",
        "A control box plugs into a standard outlet.",
      ],
    });
    expect(moreWords(WORDS.pages.light_picker)).toBeNull();
    expect(moreWords({ ...WORDS.pages.hidden_by_day, moreLabel: "  " })).toBeNull();
  });

  it("the warranty word for word, the fee only when set, and The full warranty only when it adds something", () => {
    expect(warrantyLines(WARRANTY).slice(0, WORDS.warrantyLinesUpFront)).toEqual([
      "10 years parts: lights, track and hardware, control box.",
      "5 years labour: we come out and fix covered issues at no charge.",
      "Years 6 to 10: parts still free, with a flat service call fee.",
    ]);
    expect(serviceCallLine(null)).toBeNull();
    expect(serviceCallLine(125)).toBe("The service call fee in years 6 to 10 is $125.");
    expect(serviceCallLine(125, true)).toBe("The service call fee in years 6 to 10 is $125 + GST.");
    expect(fullWarrantyShows(WARRANTY, 3, null)).toBe(true);
    expect(fullWarrantyShows("One line.\nTwo lines.", 3, null)).toBe(false);
    expect(fullWarrantyShows("One line.", 3, 99)).toBe(true);
  });

  it("the company line: Vesper Lighting, Inc., Calgary, then the phone", () => {
    expect(placeOf("448 Strathcona Drive SW, Calgary, AB T3H 1M3")).toBe("Calgary");
    expect(placeOf("Calgary")).toBeNull();
    expect(placeOf("")).toBeNull();
    const company = companyOf({ name: "Vesper Lighting, Inc.", phone: "(403) 895-9915", address: "448 Strathcona Drive SW, Calgary, AB T3H 1M3", email: "x" });
    expect(companyLines(company)).toEqual(["Vesper Lighting, Inc., Calgary", "(403) 895-9915"]);
    expect(companyLines({ name: "Vesper Lighting, Inc.", place: null, phone: "" })).toEqual(["Vesper Lighting, Inc."]);
    expect(companyOf(null)).toEqual({ name: "", place: null, phone: "" });
  });

  it("the cover: the address and neighbourhood as built", () => {
    expect(coverLine({ addressLine: "123 Aspen Crescent SW", neighbourhood: "Aspen Woods" })).toBe("123 Aspen Crescent SW, Aspen Woods");
    expect(coverLine({ addressLine: "123 Aspen Crescent SW", neighbourhood: " " })).toBe("123 Aspen Crescent SW");
  });
});

describe("the soffit on the colour page", () => {
  it("one colour by name; Other reads Another colour", () => {
    expect(soffitView({ soffitColour: "off_white", soffitColour2: null })).toEqual({ label: "Your soffit", names: ["Off-white or cream"], split: false });
    expect(soffitView({ soffitColour: "other", soffitColour2: null }).names).toEqual(["Another colour"]);
  });

  it("Not sure or unanswered reads We'll check it together", () => {
    expect(soffitView({ soffitColour: "not_sure", soffitColour2: null }).names).toEqual([CHECK_TOGETHER]);
    expect(soffitView({ soffitColour: null, soffitColour2: null }).names).toEqual([CHECK_TOGETHER]);
    expect(soffitView({ soffitColour: "not_sure", soffitColour2: "not_sure" })).toEqual({ label: "Your soffit", names: [CHECK_TOGETHER], split: false });
  });

  it("a split soffit: two names on their own lines, never joined", () => {
    expect(soffitView({ soffitColour: "white", soffitColour2: "off_white" })).toEqual({
      label: "Your soffit, two colours",
      names: ["White", "Off-white or cream"],
      split: true,
    });
    expect(soffitView({ soffitColour: "white", soffitColour2: "white" }).split).toBe(false);
    expect(soffitView({ soffitColour: "white", soffitColour2: "not_sure" }).names).toEqual(["White", CHECK_TOGETHER]);
  });
});

describe("the deck's sizes", () => {
  it("grow from the iPad Air to the iPad Pro as the spec gives them", () => {
    expect(fluidValue(52, 60, 1180)).toBe(52);
    expect(fluidValue(52, 60, 1366)).toBeCloseTo(60, 6);
    expect(fluidValue(27, 30, 1366)).toBeCloseTo(30, 6);
    expect(fluidValue(52, 60, 2000)).toBe(60);
    expect(fluidValue(52, 60, 400)).toBeCloseTo(52 * 0.85, 6);
  });

  it("write the same line in container units", () => {
    const css = fluidPx(52, 60);
    const [, slope, intercept] = css.match(/calc\(([\d.]+)cqw \+ ([\d.]+)px\)/) ?? [];
    expect(Number(slope) * 11.8 + Number(intercept)).toBeCloseTo(52, 2);
    expect(Number(slope) * 13.66 + Number(intercept)).toBeCloseTo(60, 2);
  });

  it("grow the colour page's names, the full warranty and a More's words at 1366 too (round 7 review)", () => {
    const at = (css: string, width: number) => {
      const [, slope, intercept] = css.match(/calc\(([\d.]+)cqw \+ (-?[\d.]+)px\)/) ?? [];
      return Number(slope) * (width / 100) + Number(intercept);
    };
    for (const [css, air, pro] of [
      [DECK_SIZES.small, 20, 22],
      [DECK_SIZES.name, 32, 36],
      [DECK_SIZES.warranty, 24, 27],
      [DECK_SIZES.moreLabel, 44, 50],
      [DECK_SIZES.moreBody, 30, 32],
    ] as const) {
      expect(at(css, 1180)).toBeCloseTo(air, 2);
      expect(at(css, 1366)).toBeCloseTo(pro, 2);
    }
    // A More's label is in the headline's family, between the words and the headline.
    expect(fluidValue(44, 50, 1180)).toBeGreaterThan(fluidValue(27, 30, 1180));
    expect(fluidValue(44, 50, 1180)).toBeLessThanOrEqual(fluidValue(52, 60, 1180));
  });

  it("keep the band about 30% of 820 and 28% of 1024", () => {
    expect(bandHeight(820)).toBeCloseTo(246, 6);
    expect(bandHeight(1024)).toBeCloseTo(286.72, 6);
    const [, slope, intercept] = BAND_HEIGHT_CSS.match(/calc\(([\d.]+)cqh \+ ([\d.]+)px\)/) ?? [];
    expect(Number(slope) * 8.2 + Number(intercept)).toBeCloseTo(246, 1);
    expect(Number(slope) * 10.24 + Number(intercept)).toBeCloseTo(286.72, 1);
  });
});

describe("the bottom row", () => {
  it("puts the dots and chevrons on the More button's centre line: 56 px tall, 20 px up or above the home indicator", () => {
    expect(DECK_ROW.height).toBe(56);
    expect(DECK_ROW_BOTTOM_CSS).toBe("max(20px, env(safe-area-inset-bottom, 0px))");
    // Chevrons 44 px or larger; dot targets 44 px tall.
    expect(DECK_ROW.chevron).toBeGreaterThanOrEqual(44);
    expect(DECK_ROW.dotHeight).toBeGreaterThanOrEqual(44);
  });

  it("ends a picture 8 px above the row's tallest part: 78 px up without a home indicator", () => {
    expect(DECK_CLEAR_PX).toBe(20 + (56 + 44) / 2 + 8);
    expect(DECK_CLEAR_CSS).toBe("calc(var(--deck-row-bottom, 20px) + 58px)");
  });

  it("with the most pages a meeting shows (11), stays clear of the widest seeded More button at 1180", () => {
    expect(bottomRowWidth(11)).toBe(11 * 40 + 8 + 2 * (44 + 6));
    // "What the app does" at 20 px semibold with 24 px padding is 229 px wide
    // (measured in the browser); round 9 put it bottom left, 48 px in, so it
    // ends at x 277, and the row starts at least 16 px after it.
    expect(1180 - bottomRowRight(1180, 11)).toBeGreaterThanOrEqual(48 + 229 + 16);
    expect(bottomRowRight(1180, 10)).toBeLessThan(bottomRowRight(1180, 11));
  });
});

describe("the exit", () => {
  it("is a hold only while the finger stays within 10 px of where it went down", () => {
    expect(EXIT_HOLD_SLOP_PX).toBe(10);
    expect(exitHoldMoved({ x: 44, y: 44 }, { x: 44, y: 44 })).toBe(false);
    expect(exitHoldMoved({ x: 44, y: 44 }, { x: 50, y: 52 })).toBe(false);
    expect(exitHoldMoved({ x: 44, y: 44 }, { x: 54, y: 44 })).toBe(false);
    expect(exitHoldMoved({ x: 44, y: 44 }, { x: 52, y: 52 })).toBe(true);
    expect(exitHoldMoved({ x: 44, y: 44 }, { x: 44, y: 70 })).toBe(true);
  });
});

describe("a layer's sideways swipe (round 7 after-review)", () => {
  it("closes it from the layer's empty space: over 60 px across and well over the move down", () => {
    expect(LAYER_SWIPE_PX).toBe(60);
    expect(layerSwipe({ dx: -120, dy: 10, onControl: false })).toBe(1);
    expect(layerSwipe({ dx: 120, dy: -10, onControl: false })).toBe(-1);
    expect(layerSwipe({ dx: -60, dy: 0, onControl: false })).toBeNull();
    expect(layerSwipe({ dx: -120, dy: 90, onControl: false })).toBeNull();
  });

  it("never from a control: a colour slid across to the next one, or a drag in the number field", () => {
    expect(layerSwipe({ dx: -300, dy: 0, onControl: true })).toBeNull();
    expect(layerSwipe({ dx: 300, dy: 4, onControl: true })).toBeNull();
  });
});

describe("the meeting's colour chooser: Save waits until there is a new colour (round 7 after-review)", () => {
  const ralNames = { "7016": "Anthracite grey", "9010": "Pure white" };
  const onList = { choice: "white", ralCode: null };
  const onCustom = { choice: CUSTOM_CHOICE, ralCode: "7016" };

  it("opens outlined and off on the colour already chosen, so Back is the next thing", () => {
    expect(chooserSave({ choice: "white", current: onList, code: "", ralNames })).toEqual({ unchanged: true, ready: false });
    expect(chooserSave({ choice: CUSTOM_CHOICE, current: onCustom, code: "7016", ralNames })).toEqual({ unchanged: true, ready: false });
    expect(chooserSave({ choice: CUSTOM_CHOICE, current: onCustom, code: " 7016 ", ralNames })).toEqual({ unchanged: true, ready: false });
  });

  it("turns gold for another colour on the list", () => {
    expect(chooserSave({ choice: "brown", current: onList, code: "", ralNames })).toEqual({ unchanged: false, ready: true });
    expect(chooserSave({ choice: "white", current: onCustom, code: "7016", ralNames })).toEqual({ unchanged: false, ready: true });
  });

  it("turns gold for Custom only once the number is in the colour book; until then a tap still explains", () => {
    expect(chooserSave({ choice: CUSTOM_CHOICE, current: onList, code: "", ralNames })).toEqual({ unchanged: false, ready: false });
    expect(chooserSave({ choice: CUSTOM_CHOICE, current: onList, code: "12", ralNames })).toEqual({ unchanged: false, ready: false });
    expect(chooserSave({ choice: CUSTOM_CHOICE, current: onList, code: "1234", ralNames })).toEqual({ unchanged: false, ready: false });
    expect(chooserSave({ choice: CUSTOM_CHOICE, current: onList, code: "9010", ralNames })).toEqual({ unchanged: false, ready: true });
    expect(chooserSave({ choice: CUSTOM_CHOICE, current: onCustom, code: "9010", ralNames })).toEqual({ unchanged: false, ready: true });
  });

  it("is never ready with no colour chosen", () => {
    expect(chooserSave({ choice: null, current: onList, code: "", ralNames }).ready).toBe(false);
    expect(chooserSave({ choice: null, current: { choice: null, ralCode: null }, code: "", ralNames })).toEqual({ unchanged: true, ready: false });
  });
});

describe("deck mechanics", () => {
  const pages = deckPages({ deck: deck({ picker: PICKER }), lead: { mockupUrl: null } });

  it("only the page on screen and its neighbours mount pictures", () => {
    expect([0, 1, 2, 3].map((at) => isNear(at, 1))).toEqual([true, true, true, false]);
  });

  it("reads how it was opened", () => {
    expect(entryOf("#start")).toBe("start");
    expect(entryOf("#quote")).toBe("quote");
    expect(entryOf("")).toBe("resume");
    expect(entryOf("#other")).toBe("resume");
  });

  it("opens #quote on the price page, #start at the cover, and a reload where it was", () => {
    expect(pages[startIndex(pages, "quote", { index: 2, screenKey: "warranty" })].key).toBe("quote");
    expect(startIndex(pages, "start", { index: 2, screenKey: "warranty" })).toBe(0);
    expect(pages[startIndex(pages, "resume", { index: 2, screenKey: "quote" })].key).toBe("quote");
    // A reload saved on the light picker, which never shows now, opens where
    // it was by index.
    expect(pages[startIndex(pages, "resume", { index: 2, screenKey: "light_picker" })].key).toBe("quote");
    expect(startIndex(pages, "resume", { index: 2, screenKey: "gallery" })).toBe(2);
    expect(startIndex(pages, "resume", { index: 99, screenKey: null })).toBe(pages.length - 1);
    expect(startIndex([{ key: "cover" }], "quote", { index: 0, screenKey: null })).toBe(0);
  });
});

describe("the payload, from the database rows", () => {
  const SIGN = (path: string) => `https://abcd.supabase.co/storage/v1/object/sign/presentation/${path}?token=t`;
  const row = (id: string, slot: string, extra: Partial<DeckPhotoRow> = {}): DeckPhotoRow => ({
    id,
    slot,
    path: `deck/${id}.jpg`,
    thumb_path: `deck/${id}-640.jpg`,
    focus_x: 0.3,
    focus_y: 0.7,
    caption: "Warm white",
    sort: 0,
    created_at: "2026-11-08T00:00:00Z",
    ...extra,
  });
  const rows = [
    row("hero", "what_vesper_is.hero"),
    row("g2", "gallery.holiday", { sort: 1, caption: "A holiday look" }),
    row("g1", "gallery.two_storey", { sort: 0 }),
    row("stray", "old.slot"),
    row("s1", "phone_control.screens", { sort: 0 }),
    row("s2", "phone_control.screens", { sort: 1 }),
    row("s3", "phone_control.screens", { sort: 2 }),
    row("s4", "phone_control.screens", { sort: 3 }),
    row("unsigned", "warranty.hero"),
  ];
  const signed = new Map(deckPhotoPathsToSign(rows).filter((path) => !path.includes("unsigned")).map((path) => [path, SIGN(path)]));
  const settings = {
    deck: seeded("deck"),
    light_looks: seeded("looks"),
    company: { name: "Vesper Lighting, Inc.", phone: "(403) 895-9915", address: "448 Strathcona Drive SW, Calgary, AB T3H 1M3" },
    warranty_text: WARRANTY,
    service_call_fee: 125,
  };
  const built = buildDeckPayload({ settings, photos: rows, signed, picker: null });

  it("signs each photo in a known slot, and only the gallery's thumbnails", () => {
    const paths = deckPhotoPathsToSign(rows);
    expect(paths).toContain("deck/hero.jpg");
    expect(paths).toContain("deck/g1-640.jpg");
    expect(paths).not.toContain("deck/hero-640.jpg");
    expect(paths).not.toContain("deck/stray.jpg");
  });

  it("puts photos in their slots, in order, up to each slot's limit, with focus points", () => {
    expect(built.photos["what_vesper_is.hero"]).toEqual([
      { url: SIGN("deck/hero.jpg"), thumbUrl: null, focus: [0.3, 0.7], caption: null },
    ]);
    expect(built.photos["phone_control.screens"].map((item) => item.url)).toEqual(["s1", "s2", "s3"].map((id) => SIGN(`deck/${id}.jpg`)));
    expect(built.photos["old.slot"]).toBeUndefined();
    expect(built.photos["warranty.hero"]).toBeUndefined();
  });

  it("orders the gallery across its slots, with captions and thumbnails", () => {
    expect(built.gallery).toEqual([
      { url: SIGN("deck/g1.jpg"), thumbUrl: SIGN("deck/g1-640.jpg"), focus: [0.3, 0.7], caption: "Warm white" },
      { url: SIGN("deck/g2.jpg"), thumbUrl: SIGN("deck/g2-640.jpg"), focus: [0.3, 0.7], caption: "A holiday look" },
    ]);
  });

  it("carries the words, the looks on offer, the company line and the warranty", () => {
    expect(built.words).toEqual(ROUND7_WORDS);
    expect(built.looks.map((look) => look.key)).toEqual(["warm_white", "cool_white", "christmas", "game_night", "halloween"]);
    expect(built.company).toEqual({ name: "Vesper Lighting, Inc.", place: "Calgary", phone: "(403) 895-9915" });
    expect(built.warranty).toEqual({ text: WARRANTY, serviceCallFee: 125, gstEnabled: false });
  });

  it("offers the picker only while the trace's photo is still the lead's, in the same slot", () => {
    const trace = {
      photo_id: "p1",
      photo_slot: "front",
      lines: [[[0.1, 0.5], [0.9, 0.5]]],
      line_feet: [],
      scale: { a: [0.4, 0.8], b: [0.6, 0.8], feet: 16, kind: "double" },
      dusk_brightness: 0.5,
      light_count: 120,
    };
    const leadPhotos = [{ id: "p1", slot: "front" as const, storage_path: "u/p1.jpg" }];
    const signedLead = new Map([["u/p1.jpg", "https://abcd.supabase.co/storage/v1/object/sign/lead-photos/u/p1.jpg?token=t"]]);
    const picker = pickerFrom(trace, leadPhotos, signedLead);
    expect(picker?.photoUrl).toBe(signedLead.get("u/p1.jpg"));
    expect(picker?.trace.lightCount).toBe(120);
    expect(pickerFrom(trace, [{ ...leadPhotos[0], slot: "left_corner" }], signedLead)).toBeNull();
    expect(pickerFrom(trace, [], signedLead)).toBeNull();
    expect(pickerFrom(trace, leadPhotos, new Map())).toBeNull();
    expect(pickerFrom({ ...trace, lines: [] }, leadPhotos, signedLead)).toBeNull();
    expect(pickerFrom(null, leadPhotos, signedLead)).toBeNull();
  });

  it("keeps a look list the drawings can fall back from", () => {
    expect(buildDeckPayload({ settings: { ...settings, light_looks: [] }, photos: [], signed: new Map(), picker: null }).looks).toEqual([]);
    expect(WARM_WHITE.key).toBe("warm_white");
  });
});
