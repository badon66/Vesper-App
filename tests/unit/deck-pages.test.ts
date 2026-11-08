import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DECK_PAGES, parseDeckWords, parseLooks, type DeckWords } from "@/lib/deck";
import { WARM_WHITE } from "@/lib/lights/looks";
import {
  bandHeight,
  BAND_HEIGHT_CSS,
  buildDeckPayload,
  CHECK_TOGETHER,
  companyLines,
  companyOf,
  coverLine,
  deckPages,
  deckPhotoPathsToSign,
  entryOf,
  fluidPx,
  fluidValue,
  fullWarrantyShows,
  GALLERY_HERO_COUNT,
  galleryItems,
  installSteps,
  isNear,
  moreWords,
  pageLabel,
  pairView,
  pickerFrom,
  placeOf,
  seeAllLabel,
  serviceCallLine,
  slotView,
  soffitView,
  startIndex,
  stepFor,
  warrantyLines,
  type DeckPhotoRow,
} from "@/lib/meeting/deck-pages";
import type { DeckPayload, DeckPhoto } from "@/lib/meeting/state";

// The deck's rules (round 7, the settled spec): which pages show and in what
// order, what an empty slot shows, the words each page reads, and the
// payload built from the database rows.

const migration = readFileSync(
  new URL("../../supabase/migrations/20261108080527_round7_deck_words_and_looks.sql", import.meta.url),
  "utf8",
);
const seeded = (tag: string) => JSON.parse(migration.match(new RegExp(`\\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$`))?.[1] ?? "null");
const WORDS: DeckWords = parseDeckWords(seeded("deck"));
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
  warranty: { text: WARRANTY, serviceCallFee: null },
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

describe("the pages a meeting shows", () => {
  it("follows the spec's order, with every page when everything is there", () => {
    const pages = deckPages({
      deck: deck({ picker: PICKER, gallery: [photo("g1")] }),
      lead: { mockupUrl: "https://abcd.supabase.co/storage/v1/object/sign/lead-photos/u/m.jpg?token=t" },
    });
    expect(keys(pages)).toEqual([...DECK_PAGES]);
  });

  it("skips the picker until the roofline is traced, the gallery until real installs exist, and the mockup without one", () => {
    expect(keys(deckPages({ deck: deck(), lead: { mockupUrl: null } }))).toEqual([
      "cover",
      "what_vesper_is",
      "hidden_by_day",
      "whites_first",
      "phone_control",
      "install_day",
      "warranty",
      "colour",
      "quote",
    ]);
  });

  it("skips the picker when no look is on, rather than show a house with nothing to pick", () => {
    expect(keys(deckPages({ deck: deck({ picker: PICKER, looks: [] }), lead: { mockupUrl: null } }))).not.toContain("light_picker");
  });

  it("with no lead (the rehearsal), skips the picker, mockup, colour and price", () => {
    const pages = keys(deckPages({ deck: deck({ picker: PICKER }), lead: null }));
    expect(pages).not.toContain("light_picker");
    expect(pages).not.toContain("mockup");
    expect(pages).not.toContain("colour");
    expect(pages).not.toContain("quote");
    expect(pages[0]).toBe("cover");
  });

  it("in the rehearsal, shows the gallery from its examples while it has no photos", () => {
    expect(keys(deckPages({ deck: deck(), lead: null, fillEmpty: true }))).toContain("gallery");
  });

  it("skips a words page Settings has emptied, and the warranty without its text", () => {
    const empty = parseDeckWords({});
    const pages = keys(deckPages({ deck: deck({ words: empty, warranty: { text: "  ", serviceCallFee: null } }), lead: null }));
    expect(pages).toEqual(["cover"]);
  });

  it("names each page by its headline from Settings, or its built label", () => {
    const pages = deckPages({ deck: deck(), lead: { mockupUrl: null } });
    expect(pages.map((page) => page.label)).toEqual([
      "Vesper",
      "Up once, there all year",
      "Hidden by day",
      "Warm white, most nights",
      "Run it from your phone",
      "How install day works",
      "Our 10-year warranty",
      "Your colours",
      "Your price",
    ]);
    expect(pageLabel("gallery", parseDeckWords({}))).toBe("Homes we've lit");
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
        "You run it from an app on your phone, over your home Wi-Fi.",
      ],
    });
    expect(moreWords(WORDS.pages.light_picker)).toBeNull();
    expect(moreWords({ ...WORDS.pages.hidden_by_day, moreLabel: "  " })).toBeNull();
  });

  it("install day's steps, numbered on screen and never twice", () => {
    expect(installSteps(WORDS.pages.install_day.words)).toEqual([
      "We confirm the plan and the colours with you.",
      "A small crew fits the track and plugs in the control box.",
      "We clean up and set up the app with you.",
    ]);
    expect(installSteps("1 We come.\n2. We go.\n\n3) Done.")).toEqual(["We come.", "We go.", "Done."]);
  });

  it("the warranty word for word, the fee only when set, and The full warranty only when it adds something", () => {
    expect(warrantyLines(WARRANTY).slice(0, WORDS.warrantyLinesUpFront)).toEqual([
      "10 years parts: lights, track and hardware, control box.",
      "5 years labour: we come out and fix covered issues at no charge.",
      "Years 6 to 10: parts still free, with a flat service call fee.",
    ]);
    expect(serviceCallLine(null)).toBeNull();
    expect(serviceCallLine(125)).toBe("The service call fee in years 6 to 10 is $125.");
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

  it("keep the band about 30% of 820 and 28% of 1024", () => {
    expect(bandHeight(820)).toBeCloseTo(246, 6);
    expect(bandHeight(1024)).toBeCloseTo(286.72, 6);
    const [, slope, intercept] = BAND_HEIGHT_CSS.match(/calc\(([\d.]+)cqh \+ ([\d.]+)px\)/) ?? [];
    expect(Number(slope) * 8.2 + Number(intercept)).toBeCloseTo(246, 1);
    expect(Number(slope) * 10.24 + Number(intercept)).toBeCloseTo(286.72, 1);
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
    expect(pages[startIndex(pages, "quote", { index: 2, screenKey: "colour" })].key).toBe("quote");
    expect(startIndex(pages, "start", { index: 2, screenKey: "colour" })).toBe(0);
    expect(pages[startIndex(pages, "resume", { index: 2, screenKey: "colour" })].key).toBe("colour");
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
    expect(built.words).toEqual(WORDS);
    expect(built.looks.map((look) => look.key)).toEqual(["warm_white", "cool_white", "christmas", "game_night", "halloween"]);
    expect(built.company).toEqual({ name: "Vesper Lighting, Inc.", place: "Calgary", phone: "(403) 895-9915" });
    expect(built.warranty).toEqual({ text: WARRANTY, serviceCallFee: 125 });
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
