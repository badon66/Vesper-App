import type { Json } from "@/types/database";

// The deck (round 7, Keenan, 2026-11-08; round 9, the meeting as one story,
// 2026-11-10): meeting mode's pages, the words on them, Keenan's own photos
// in named slots, the light picker's looks and the roofline trace. Settled
// by the five-seat debates (docs/decisions.md, 2026-11-08 and 2026-11-10).
// This module is the one reader of settings.deck and settings.light_looks,
// and the one list of slots, shared by meeting mode, Settings, the
// rehearsal view and prep. Pure, so it is unit tested.
//
// settings.presentation (take 1) is no longer read once this deck is live;
// its column stays.

// ---------------------------------------------------------------- pages

// In the order the customer sees them (round 10, Keenan, 2026-11-10): the
// cover, then their own house lit (Up once, there all year: the Main
// mockup), by day and by night (Hidden by day: the Day and Night mockups),
// their scenes on a phone (Run it from your phone), the warranty, the price
// and What happens next. A page missing its mockup is skipped
// (lib/meeting/deck-pages.ts deckPages).
//
// The round 9 pages that left the order (the gallery, Your house, its
// stand-in, Warm white and the colour page, which folds into the price) keep
// their keys after these, so words saved for them still parse and nothing
// saved breaks; deckPages never shows them. The light picker (Try it on
// your house) left too (Keenan, 2026-11-11: no editor; he uploads a photo
// of the house for each look, and the phone page's scenes are the colour
// picker): its key keeps its place, its words and looks are kept, and it is
// never shown, traced or not.
export const DECK_PAGES = [
  "cover",
  "what_vesper_is",
  "hidden_by_day",
  "phone_control",
  "warranty",
  "light_picker",
  "quote",
  "next_steps",
  "gallery",
  "your_house",
  "mockup",
  "whites_first",
  "colour",
] as const;
export type DeckPageKey = (typeof DECK_PAGES)[number];

// The pages that left the order in round 10 (the light picker on
// 2026-11-11): kept for what is saved, never shown.
export const RETIRED_PAGES = ["gallery", "your_house", "mockup", "whites_first", "colour", "light_picker"] as const satisfies readonly DeckPageKey[];
export const isRetired = (key: DeckPageKey): boolean => (RETIRED_PAGES as readonly string[]).includes(key);

// The round 9 stand-ins, and the page each one stood in for (both retired
// now; kept so Settings still names them).
export const STAND_INS = { mockup: "your_house", whites_first: "light_picker" } as const satisfies Partial<Record<DeckPageKey, DeckPageKey>>;
export type StandInKey = keyof typeof STAND_INS;
export const isStandIn = (key: DeckPageKey): key is StandInKey => Object.hasOwn(STAND_INS, key);

// The pages in the story's order: 7, and the most a meeting ever shows.
export const STORY_PAGES: readonly DeckPageKey[] = DECK_PAGES.filter((key) => !isStandIn(key) && !isRetired(key));
export const MAX_SHOWN_PAGES = STORY_PAGES.length;

// The pages whose words live in Settings, in the deck's order.
export const WORDS_PAGES = [
  "what_vesper_is",
  "hidden_by_day",
  "phone_control",
  "gallery",
  "warranty",
  "your_house",
  "mockup",
  "light_picker",
  "whites_first",
  "next_steps",
] as const;
export type WordsPageKey = (typeof WORDS_PAGES)[number];

// What Settings > Presentation calls each page (round 9: by its current
// headline, and a stand-in says so). Settings only: a customer never reads
// these (HEADLINE_FALLBACK is what a page is called on screen while its
// headline is empty).
export const PAGE_NAMES: Record<WordsPageKey, string> = {
  what_vesper_is: "Up once, there all year",
  hidden_by_day: "Hidden by day",
  phone_control: "Run it from your phone",
  gallery: "Homes we've lit",
  warranty: "Our 10-year warranty",
  your_house: "Your house",
  mockup: "Your house, lit (stand-in)",
  light_picker: "Try it on your house",
  whites_first: "Warm white (stand-in)",
  next_steps: "What happens next",
};

// A page's name on screen (its dot, its region, the Next label) while
// Settings has no headline for it.
export const HEADLINE_FALLBACK: Record<WordsPageKey, string> = {
  what_vesper_is: "Up once, there all year",
  hidden_by_day: "Hidden by day",
  phone_control: "Run it from your phone",
  gallery: "Homes we've lit",
  warranty: "Our 10-year warranty",
  your_house: "Your house",
  mockup: "Your house, lit",
  light_picker: "Try it on your house",
  whites_first: "Warm white, most nights",
  next_steps: "What happens next",
};

// How each page is laid out: the photo above a solid band, the picture on
// the left and the words on the right, or the light picker's tray. Your
// house is a band page whose band is the picker's tray height when the
// picker follows it, so the photo stays put on the turn.
export const PAGE_LAYOUT: Record<WordsPageKey, "band" | "split" | "picker"> = {
  what_vesper_is: "band",
  hidden_by_day: "band",
  phone_control: "band",
  gallery: "band",
  warranty: "split",
  your_house: "band",
  mockup: "band",
  light_picker: "picker",
  whites_first: "band",
  next_steps: "split",
};

export type PageWords = { headline: string; words: string; moreLabel: string; moreText: string };
export type DeckWords = { pages: Record<WordsPageKey, PageWords>; warrantyLinesUpFront: number; lines: DeckLines };

const EMPTY_WORDS: PageWords = { headline: "", words: "", moreLabel: "", moreText: "" };

// The round 9 pages' own words, for a deck saved before they existed (the
// seed migration writes the same words into settings.deck). Only a page
// missing from what is stored takes these; a field Keenan cleared stays
// clear.
export const PAGE_DEFAULTS: Partial<Record<WordsPageKey, PageWords>> = {
  your_house: {
    headline: "Your house",
    words: "We measured {feet} ft of roofline.",
    moreLabel: "What we measured",
    moreText: "Upper is the second storey. Lower is the main floor.",
  },
  next_steps: {
    headline: "What happens next",
    words: "",
    moreLabel: "What we'll need",
    moreText: "An outlet near where the control box will go, in the garage or outside.\nYour Wi-Fi name and password, so we can set up the app with you.",
  },
};

// Word for word on What happens next and the price, fixed by CLAUDE.md:
// never in Settings.
export const NO_PAYMENT_LINE = "No payment until your install is complete.";

const str = (value: unknown) => (typeof value === "string" ? value : "");
const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

// settings.deck as stored, made safe: every page present, strings where
// strings belong, every line (stored, or ours). Unknown entries are ignored
// here and kept by deckWordsToJson.
export function parseDeckWords(value: Json | null | undefined): DeckWords {
  const raw = record(value) ?? {};
  const pages = record(raw.pages) ?? {};
  const out = {} as Record<WordsPageKey, PageWords>;
  for (const key of WORDS_PAGES) {
    const page = record(pages[key]);
    out[key] = page
      ? { headline: str(page.headline), words: str(page.words), moreLabel: str(page.more_label), moreText: str(page.more_text) }
      : { ...(PAGE_DEFAULTS[key] ?? EMPTY_WORDS) };
  }
  const lines = Number(raw.warranty_lines_up_front);
  return {
    pages: out,
    warrantyLinesUpFront: Number.isInteger(lines) && lines >= 1 && lines <= 8 ? lines : 3,
    lines: parseDeckLines(raw.lines),
  };
}

// Back to the stored shape, for the Settings save. Whatever the stored deck
// holds that this code doesn't know (round 7's How install day works, which
// the customer's link still reads, or anything added later) is kept as it
// is: a save never loses words it didn't show.
export function deckWordsToJson(words: DeckWords, stored?: Json | null): Json {
  const before = record(stored) ?? {};
  const pages: Record<string, Json> = { ...((record(before.pages) ?? {}) as Record<string, Json>) };
  for (const key of WORDS_PAGES) {
    const page = words.pages[key];
    pages[key] = { headline: page.headline, words: page.words, more_label: page.moreLabel, more_text: page.moreText };
  }
  const lines: Record<string, Json> = { ...((record(before.lines) ?? {}) as Record<string, Json>) };
  for (const key of DECK_LINE_KEYS) lines[key] = words.lines[key];
  return { ...(before as Record<string, Json>), version: 1, pages, warranty_lines_up_front: words.warrantyLinesUpFront, lines };
}

// ---------------------------------------------------------------- the built pages' lines

// Round 9 (the five seats, 2026-11-10): every word the built pages say (the
// cover, the Next label, the colour page, the price, What happens next, and
// the customer's link) lives in settings.deck.lines, a flat map of key to
// line, with these as the code's defaults: a key missing from what is
// stored, or stored empty, reads ours. The seed migration writes the same
// words. A {name} in braces is filled in on screen; LINE_SPECS says which
// each line may use. "No payment until your install is complete." and the
// warranty are fixed by CLAUDE.md and never here.
export const DECK_LINE_DEFAULTS = {
  // Cover
  cover_line: "What it is, your house lit up, and your price.",
  // The cover with their house (2026-11-11): over the house picture, in
  // the column beside it. {family} is their last name; with none, the
  // "first" line takes their first name.
  cover_prepared: "Prepared for the {family} home",
  cover_prepared_first: "Prepared for {name}",
  cover_what: "Permanent lighting, up once and there all year.",
  cover_point_1: "10-year warranty",
  cover_point_2: "Run it from your phone",
  cover_point_3: "Made for Calgary winters",
  // Every page but the last, beside the forward chevron
  next_prefix: "Next: {page}",
  // Your house, behind What we measured
  house_drawing_caption: "Our drawing of your roofline.",
  // Your track colour
  colour_headline: "Your track colour",
  colour_opener: "By day you see the track, so you choose its colour.",
  colour_one: "One track colour for the whole house.",
  colour_stock: "White is in stock and included.",
  colour_made: "{colour} is made to order.",
  colour_spring_label: "Install in spring",
  colour_spring_value: "Included",
  colour_season_label: "Install this season",
  colour_season_value: "{fee} rush colour fee",
  colour_book: "Screens can't show colour exactly, so we choose it from the colour book together.",
  initials_prompt: "Your initials confirm the colour on your quote.",
  initials_done: "Confirmed with your initials.",
  // Your price
  price_headline: "Your price",
  price_sub_many: "{Count} options, all with {colour} track.",
  price_sub_one: "With {colour} track.",
  price_includes: "Every option includes the control box, install by our own crew and our 10-year warranty.",
  price_held: "Price held until {date}.",
  financing: "Financing is available. Just ask.",
  price_empty: "Your options show here once we've measured.",
  whats_in: "What's in {name}",
  choose: "Choose {name}",
  your_choice: "Your choice",
  // Round 13: under an option the Black Friday deal can't lower, because
  // it is already at the minimum job total.
  price_lowest: "Already at our lowest price.",
  price_feet: "{feet} ft of lights",
  // What happens next
  recap: "Your choice: {name}, {total}",
  step_colour_label: "Your colour",
  step_colour_done: "{colour}, confirmed with your initials.",
  step_colour_todo: "We confirm it with you from the colour book.",
  step_day_label: "Your install day",
  step_day_none: "We pick the day together.",
  step_day_button: "Pick a day",
  step_on_day_label: "On the day",
  step_on_day: "A small crew fits the track and plugs in the control box. We clean up and set up the app with you.",
  step_pay_label: "Paying",
  closing: "We'll text you a link to this quote, with every option.",
  thanks: "Thank you for having us tonight.",
  // The customer's quote link
  link_mockup_caption: "Our mockup shows every run lit.",
  link_drawing_caption: "Gold marks the lights in {name}.",
  link_meeting_tag: "Your choice at the meeting",
  link_something_else: "Want something different? Call or text Keenan.",
  link_colour_done: "{colour}, confirmed with your initials at the meeting.",
  // Quote link take 3 (2026-11-11): About your track, Build your own,
  // Documents and the agreement. The three track lines say only what Keenan
  // told us (Hat track is the standard; the others go where it doesn't
  // suit, upper gables most often); he rewrites them in Settings.
  link_track_title: "About your track",
  link_track_hat: "Hat track is our standard track. It sits under the edge of your roof with the lights built in.",
  link_track_double: "Double track is for parts of a roofline where our standard track is not the right fit.",
  link_track_j: "J track is for parts of a roofline where our standard track is not the right fit, most often upper gables.",
  link_build_title: "Build your own",
  link_build_note: "Start from the option on screen and tick the parts you want. The price updates as you go.",
  link_docs_title: "Documents",
  link_agreement_title: "Your agreement",
  link_agreement_note: "Read it, type your name, sign with your finger, then tap Sign.",
  link_agreement_done: "Signed by {name} on {date}.",
} as const;

export type DeckLineKey = keyof typeof DECK_LINE_DEFAULTS;
export type DeckLines = Record<DeckLineKey, string>;
export const DECK_LINE_KEYS = Object.keys(DECK_LINE_DEFAULTS) as DeckLineKey[];

// Where each line shows, for Settings, and what it may say. words: the most
// words it may hold. fill: the names it may use in braces; need: those it
// must keep (the Next label is nothing without its page).
export type LineGroup = "cover" | "every_page" | "your_house" | "colour" | "price" | "next_steps" | "link";

export const LINE_GROUPS: { key: LineGroup; title: string; note: string }[] = [
  { key: "cover", title: "Cover", note: "Under their address on the first page." },
  { key: "every_page", title: "On every page", note: "Beside the forward arrow at the foot of every page but the last, naming the page that comes next." },
  { key: "your_house", title: "Your house", note: "Under our drawing of their roofline, behind What we measured." },
  { key: "colour", title: "Your track colour", note: "The colour page, where the customer chooses the track colour and initials it." },
  { key: "price", title: "Your price", note: "The price page: the options, biggest first, and the one they choose." },
  { key: "next_steps", title: "What happens next", note: "The last page. Its headline and What we'll need are with its page above." },
  { key: "link", title: "The customer's quote link", note: "The private link you text after the meeting." },
];

export type LineSpec = { group: LineGroup; label: string; words: number; fill?: readonly string[]; need?: readonly string[] };

const LABEL = 4;
const SHORT = 8;
const SENTENCE = 25;

export const LINE_SPECS: Record<DeckLineKey, LineSpec> = {
  cover_line: { group: "cover", label: "The line under their address", words: 12 },
  cover_prepared: { group: "cover", label: "With their house: who it's for", words: 8, fill: ["family"], need: ["family"] },
  cover_prepared_first: { group: "cover", label: "The same, when there's no last name", words: 6, fill: ["name"], need: ["name"] },
  cover_what: { group: "cover", label: "With their house: what Vesper is", words: 12 },
  cover_point_1: { group: "cover", label: "With their house: first point", words: 6 },
  cover_point_2: { group: "cover", label: "With their house: second point", words: 6 },
  cover_point_3: { group: "cover", label: "With their house: third point", words: 6 },
  next_prefix: { group: "every_page", label: "The Next label", words: 4, fill: ["page"], need: ["page"] },
  house_drawing_caption: { group: "your_house", label: "Under the drawing", words: SHORT },
  colour_headline: { group: "colour", label: "Headline", words: LABEL },
  colour_opener: { group: "colour", label: "The opening line", words: 15 },
  colour_one: { group: "colour", label: "Under the track colour", words: 10 },
  colour_stock: { group: "colour", label: "For White track", words: 10 },
  colour_made: { group: "colour", label: "For any other colour", words: 10, fill: ["colour"] },
  colour_spring_label: { group: "colour", label: "First button", words: LABEL },
  colour_spring_value: { group: "colour", label: "First button, under it", words: LABEL },
  colour_season_label: { group: "colour", label: "Second button", words: LABEL },
  colour_season_value: { group: "colour", label: "Second button, under it", words: 5, fill: ["fee"] },
  colour_book: { group: "colour", label: "The colour book line", words: 18 },
  initials_prompt: { group: "colour", label: "Beside the initials", words: 12 },
  initials_done: { group: "colour", label: "Once initialled", words: 8 },
  price_headline: { group: "price", label: "Headline", words: LABEL },
  price_sub_many: { group: "price", label: "Under it, with two or more options", words: 10, fill: ["Count", "count", "colour"] },
  price_sub_one: { group: "price", label: "Under it, with one option", words: 8, fill: ["colour"] },
  price_includes: { group: "price", label: "What every option includes", words: 20 },
  price_held: { group: "price", label: "How long the price holds", words: 8, fill: ["date"], need: ["date"] },
  financing: { group: "price", label: "Financing, when offered", words: 10 },
  price_empty: { group: "price", label: "Before anything is measured", words: 12 },
  whats_in: { group: "price", label: "Over the breakdown", words: LABEL + 2, fill: ["name"] },
  choose: { group: "price", label: "The choose button", words: LABEL + 2, fill: ["name"] },
  your_choice: { group: "price", label: "Once chosen", words: LABEL },
  price_lowest: { group: "price", label: "With a deal on, under an option already at the minimum", words: 8 },
  price_feet: { group: "price", label: "Under each option's name (the meeting and the link)", words: 6, fill: ["feet"], need: ["feet"] },
  recap: { group: "next_steps", label: "Their choice, once chosen", words: 10, fill: ["name", "total"] },
  step_colour_label: { group: "next_steps", label: "Step 1", words: LABEL },
  step_colour_done: { group: "next_steps", label: "Step 1, once initialled", words: 10, fill: ["colour"] },
  step_colour_todo: { group: "next_steps", label: "Step 1, not initialled yet", words: 12 },
  step_day_label: { group: "next_steps", label: "Step 2", words: LABEL },
  step_day_none: { group: "next_steps", label: "Step 2, no day yet", words: 10 },
  step_day_button: { group: "next_steps", label: "Step 2, the button", words: 3 },
  step_on_day_label: { group: "next_steps", label: "Step 3", words: LABEL },
  step_on_day: { group: "next_steps", label: "Step 3, the line", words: SENTENCE },
  step_pay_label: { group: "next_steps", label: "Step 4 (its line is No payment until your install is complete.)", words: LABEL },
  closing: { group: "next_steps", label: "The closing line", words: 15 },
  thanks: { group: "next_steps", label: "The thank you, last", words: 12 },
  link_mockup_caption: { group: "link", label: "Under the mockup, when an option leaves runs out", words: 10 },
  link_drawing_caption: { group: "link", label: "Under the drawing", words: 10, fill: ["name"] },
  link_meeting_tag: { group: "link", label: "The tag on the option chosen at the meeting", words: 6 },
  link_something_else: { group: "link", label: "Under the options", words: 12 },
  link_colour_done: { group: "link", label: "What happens next, step 1, once initialled", words: 12, fill: ["colour"] },
  link_track_title: { group: "link", label: "About your track: the heading", words: LABEL },
  link_track_hat: { group: "link", label: "About your track: Hat track (the standard)", words: SENTENCE },
  link_track_double: { group: "link", label: "About your track: Double track", words: SENTENCE },
  link_track_j: { group: "link", label: "About your track: J track", words: SENTENCE },
  link_build_title: { group: "link", label: "Build your own: the option's name", words: LABEL },
  link_build_note: { group: "link", label: "Build your own: how it works", words: SENTENCE },
  link_docs_title: { group: "link", label: "Documents: the heading", words: LABEL },
  link_agreement_title: { group: "link", label: "The agreement: the heading", words: LABEL },
  link_agreement_note: { group: "link", label: "The agreement: how to sign", words: SENTENCE },
  link_agreement_done: { group: "link", label: "The agreement, once signed", words: SHORT, fill: ["name", "date"] },
};

export function linesIn(group: LineGroup): DeckLineKey[] {
  return DECK_LINE_KEYS.filter((key) => LINE_SPECS[key].group === group);
}

// settings.deck.lines as stored, every line present: a stored line that
// isn't empty, else ours.
export function parseDeckLines(value: unknown): DeckLines {
  const raw = record(value) ?? {};
  const out = {} as DeckLines;
  for (const key of DECK_LINE_KEYS) {
    const stored = str(raw[key]).trim();
    out[key] = stored !== "" ? stored : DECK_LINE_DEFAULTS[key];
  }
  return out;
}

export const DEFAULT_LINES: DeckLines = parseDeckLines({});

// The names a line uses in braces, in order.
export function linePlaceholders(text: string): string[] {
  return [...text.matchAll(/\{([^{}]*)\}/g)].map((match) => match[1]);
}

// A line with its names filled in. A name with nothing to fill it, or one the
// line may not use, reads as nothing, and the spaces close up around it.
export function fillLine(template: string, values: Record<string, string | number | null | undefined>): string {
  return template
    .replace(/\{([^{}]*)\}/g, (_, name: string) => {
      const value = Object.hasOwn(values, name) ? values[name] : undefined;
      return value === null || value === undefined ? "" : String(value);
    })
    .replace(/\s+([,.:;?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function deckLine(lines: DeckLines, key: DeckLineKey, values: Record<string, string | number | null | undefined> = {}): string {
  return fillLine(lines[key], values);
}

// "Three", for "{Count} options"; a number past twelve stays a number.
const COUNT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
export function countWord(n: number, capital = false): string {
  const word = Number.isInteger(n) && n >= 0 && n < COUNT_WORDS.length ? COUNT_WORDS[n] : String(n);
  return capital ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

// A line without the clause that names {colour}: the words before the
// comma or full stop ahead of it, as a sentence ("{Count} options, all with
// {colour} track." reads "{Count} options."). Nothing when the line starts
// with the colour's clause.
function withoutColour(template: string): string {
  const at = template.indexOf("{colour}");
  if (at < 0) return template;
  const before = template.slice(0, at);
  const cut = Math.max(before.lastIndexOf(","), before.lastIndexOf("."));
  const kept = (cut >= 0 ? before.slice(0, cut) : "").trim();
  return kept === "" ? "" : `${kept}.`;
}

// The price page's sub-line: "Three options, all with White track." or
// "With White track." With no track colour set, the colour part goes: the
// count alone ("Three options."), or nothing with one option.
export function priceSubLine(lines: DeckLines, count: number, colour: string | null): string {
  const named = colour?.trim() || null;
  const key: DeckLineKey = count >= 2 ? "price_sub_many" : "price_sub_one";
  const template = named ? lines[key] : withoutColour(lines[key]);
  return fillLine(template, { Count: countWord(count, true), count: countWord(count), colour: named });
}

// ---------------------------------------------------------------- the words' rules

// Lengths (copy rules): live counts in Settings, refused past the limit.
export const WORD_LIMITS = {
  headlineChars: 32,
  bandWords: 25,
  splitWords: 40,
  moreWords: 60,
  moreLabelWords: 4,
  lookNameChars: 14,
  lookWordsChars: 18,
  captionWords: 4,
} as const;

export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

// No em or en dashes, and no hyphen used as a dash (" - "), in any customer
// string. Hyphens inside words stay: Wi-Fi, 10-year, Off-white.
export function hasDash(text: string): boolean {
  return /[\u2012\u2013\u2014\u2015\u2212]/.test(text) || /\s-+\s/.test(text) || /^\s*-\s/m.test(text);
}

export function hasExclamation(text: string): boolean {
  return text.includes("!");
}

// ---------------------------------------------------------------- Keenan's photos, in named slots

// What a customer sees while a slot is empty: one of the original drawings,
// the words alone, or the page skipped. Never the customer's own photo or
// mockup, and never a reference.
export type SlotFallback =
  | "drawing_house"
  | "drawing_house_entry"
  | "drawing_eave"
  | "drawing_day_night"
  | "drawing_corners"
  | "drawing_phone"
  | "words"
  | "skip";

export type SlotRole = "hero" | "more" | "day" | "night" | "warm" | "cool" | "gallery";

// When a slot's photo is taken (round 7 review, Keenan): a shoot follows the
// light, not the deck's order, so the shot list can be read by when to
// shoot as well as by page.
//
// Clock times are Alberta Time (UTC-6 all year since November 1, 2026,
// lib/time.ts): Calgary's November sunsets run from about 6:10 pm on the 1st
// to 5:35 pm on the 30th, so "about 5:45 pm", and blue hour about 6:00 to
// 6:15. The shot list also shows today's sunset, worked out on the device
// (calgarySunset in lib/photos-deck.ts).
export type ShotTime = "daylight" | "blue_hour" | "snowfall" | "install_day";

export const SHOT_TIMES: { key: ShotTime; label: string; note: string }[] = [
  { key: "daylight", label: "Daylight", note: "Bright overcast or open shade, the sun behind you." },
  { key: "blue_hour", label: "Blue hour", note: "Sunset is about 5:45 pm in November, so shoot from about 6:00 to 6:15 while the sky is deep blue." },
  { key: "snowfall", label: "After a snowfall", note: "The first clear evening after fresh snow, at blue hour." },
  { key: "install_day", label: "Install day", note: "While a crew is at a house, by daylight." },
];

export type DeckSlot = {
  key: string;
  page: WordsPageKey;
  name: string;
  // The exact shot to take, for the shot list in Settings.
  scenario: string;
  // The shot in one line, for the shot list grouped by when to shoot.
  line: string;
  when: ShotTime;
  // How many photos it holds.
  max: number;
  fallback: SlotFallback;
  role: SlotRole;
};

// The install day slots keep their keys (Keenan's photos are stored under
// them) and now belong to What happens next (round 9), which took in How
// install day works: the crew fitting the track beside the steps, the
// control box behind What we'll need.
export const DECK_SLOTS: DeckSlot[] = [
  { key: "what_vesper_is.hero", page: "what_vesper_is", name: "Whole house at dusk, warm white", scenario: "Warm white, steady, 15 to 30 minutes after that day's sunset while the sky is still deep blue. An ordinary Calgary two-storey with a front gable and an attached front garage, not a showhome. Tripod on the far sidewalk across the street at chest height, level, main 1x lens, straight on. Every run lit: eaves, gable and garage line. The house across the middle 70% of the width, the whole roofline inside the middle 60% of the height, a strip of sky above the peak, the empty driveway at the bottom. Porch light off, at most a lamp or two on inside, garage closed, no house number or plates. Exposure pulled down until every light is its own point, not a line. Landscape (phone held sideways). Any iPhone photo is big enough.", line: "The whole house straight on from across the street, every run lit.", when: "blue_hour", max: 1, fallback: "drawing_house", role: "hero" },
  { key: "what_vesper_is.more", page: "what_vesper_is", name: "Track up close, lit", scenario: "Same evening, warm white, steady. From the driveway about 2 m out and below one front eave corner, 1x or 2x, looking up about 45 degrees along the run: soffit, fascia edge and the track with 6 to 8 lights sharp as separate points and a soft wash on the soffit. Nothing else in frame. Expose on the nearest lights.", line: "Up close under one eave corner, looking along the lit track.", when: "blue_hour", max: 1, fallback: "drawing_eave", role: "more" },
  { key: "hidden_by_day.day", page: "hidden_by_day", name: "Day, from across the street", scenario: "Bright overcast, or the front in open shade with the sun behind the camera. Lights off, garage closed, driveway empty. Tripod on the far sidewalk, chest height, level, 1x, straight on, the whole roofline inside the middle 60% of the height. Shoot this first, mark the tripod spot, leave the zoom alone and wait for dusk.", line: "The whole house from across the street, lights off. Mark the tripod spot.", when: "daylight", max: 1, fallback: "drawing_day_night", role: "day" },
  { key: "hidden_by_day.night", page: "hidden_by_day", name: "Night, same spot", scenario: "Same tripod spot, framing and zoom, untouched, 15 to 30 minutes after sunset, warm white steady, exposure locked on the lights so each is a point, porch light off. Only the light changes, so the slider lines up to the pixel.", line: "From the same tripod spot, untouched, with the lights on.", when: "blue_hour", max: 1, fallback: "drawing_day_night", role: "night" },
  { key: "hidden_by_day.more", page: "hidden_by_day", name: "Track by day, up close", scenario: "Daylight in open shade, lights off. Standing on the front walk 6 to 8 m out at eye height, where a visitor stands, looking up at the eave over the front door or garage: the track as a thin line under the soffit, with the soffit and fascia in frame so its size reads against them. No ladder, tools, cables or house number.", line: "The track under the soffit from the front walk, lights off.", when: "daylight", max: 1, fallback: "drawing_eave", role: "more" },
  { key: "phone_control.hero", page: "phone_control", name: "Phone in hand, house lit", scenario: "15 to 30 minutes after sunset, on the front walk about 8 m back, 2x. One hand holds the phone in the lower right third, screen to camera, the app's looks screen readable, screen brightness about half so it doesn't glare. Focus on the screen. The house behind in warm white, softly out of focus, the roofline crossing the upper third. No notifications, names, rings or watch; crop out the app's own name if it shows; no house number.", line: "A hand holding the phone, screen to the camera, the lit house soft behind.", when: "blue_hour", max: 1, fallback: "drawing_phone", role: "hero" },
  { key: "phone_control.screens", page: "phone_control", name: "App screens", scenario: "Two or three straight screenshots from your phone: the looks list, and on and off. Do Not Disturb on, nothing personal or from other apps visible, no device frame.", line: "Screenshots of the app's looks and of on and off. Any time.", when: "daylight", max: 3, fallback: "words", role: "more" },
  { key: "gallery.two_storey", page: "gallery", name: "Two-storey with a front garage, warm white", scenario: "Blue hour (15 to 30 minutes after sunset), warm white steady, straight on from across the street, 1x, level, the whole house and garage line lit, house across the middle 70% of the width, roofline inside the middle 60% of the height, porch light off, driveway empty, no house number.", line: "A two-storey with a front garage, straight on from across the street.", when: "blue_hour", max: 1, fallback: "skip", role: "gallery" },
  { key: "gallery.bungalow", page: "gallery", name: "Bungalow, warm white", scenario: "Blue hour, warm white steady, a bungalow with a low hip roof, from across the street about 20 degrees off straight on so the front eave and one side return both show, 1x, whole front eave and garage line lit.", line: "A bungalow from across the street, a little off straight on.", when: "blue_hour", max: 1, fallback: "skip", role: "gallery" },
  { key: "gallery.bi_level", page: "gallery", name: "Bi-level, warm white", scenario: "Blue hour, warm white steady, from the sidewalk at a slight angle so the split entry shows, 1x, whole front lit.", line: "A bi-level from the sidewalk, at a slight angle to show the entry.", when: "blue_hour", max: 1, fallback: "skip", role: "gallery" },
  { key: "gallery.snow", page: "gallery", name: "After a snowfall", scenario: "The evening after fresh snow, warm white steady, 15 to 30 minutes after sunset so the snow reads blue and the light warm, from across the street: snow on the roof and lawn, the lights clear under the soffit.", line: "A lit house the evening after fresh snow, from across the street.", when: "snowfall", max: 1, fallback: "skip", role: "gallery" },
  { key: "gallery.garage", page: "gallery", name: "Close at the garage", scenario: "Warm white at blue hour from the end of the driveway, the garage eave and front door in frame, close enough to see each light and the wash falling on the garage door.", line: "The garage eave and front door from the end of the driveway, close.", when: "blue_hour", max: 1, fallback: "skip", role: "gallery" },
  { key: "gallery.holiday", page: "gallery", name: "A holiday look", scenario: "Christmas (red, green and warm white in blocks) or Game night (red and gold), set to steady for the photo, blue hour, from across the street, the whole front, exposed on the brightest colour so each stays a clean point. Always last in the order.", line: "Christmas or Game night, set to steady, the whole front.", when: "blue_hour", max: 1, fallback: "skip", role: "gallery" },
  { key: "gallery.more", page: "gallery", name: "More installs", scenario: "Any other real Vesper install, shot to the standard above. Warm whites first, colour looks last. Caption each with the look only.", line: "Any other install, to the standard. Warm whites first.", when: "blue_hour", max: 24, fallback: "skip", role: "gallery" },
  { key: "warranty.hero", page: "warranty", name: "Winter night, snow on the roof", scenario: "A clear evening after fresh snow, warm white steady, 15 to 30 minutes after sunset so the snow reads blue and the light warm. From the driveway 3 to 4 m back, 1x or 2x, an outside corner of the eave crossing the frame on a slight diagonal: snow along the roof edge above, the lights clean and even under the soffit. Keep the corner inside the middle 50% of the width for the tall crop. Porch light off, no house number.", line: "An eave corner on a diagonal, snow on the roof edge above the lights.", when: "snowfall", max: 1, fallback: "words", role: "hero" },
  { key: "whites_first.hero", page: "whites_first", name: "Warm white, at an angle", scenario: "Warm white, steady, 15 to 30 minutes after sunset. A bungalow or bi-level from the end of the driveway at a three-quarter angle, 2x, the garage eave and front entry filling the frame so the eave runs away from the camera and the light washes down the siding or stone. No colour anywhere, porch light off, front door closed. Expose for the lit wall.", line: "The garage eave and front entry from the end of the driveway, at an angle.", when: "blue_hour", max: 1, fallback: "drawing_house_entry", role: "hero" },
  { key: "whites_first.warm", page: "whites_first", name: "Warm white, for the pair", scenario: "Tripod straight on to one front corner and a window at about 6 m, 1x, 15 to 30 minutes after sunset, warm white steady. Before shooting, set white balance to daylight in a camera app that can lock it (for example Lightroom or Halide; the iPhone's own Camera app can't), then press and hold on the lights for AE/AF Lock.", line: "One front corner and a window, straight on, in warm white.", when: "blue_hour", max: 1, fallback: "drawing_corners", role: "warm" },
  { key: "whites_first.cool", page: "whites_first", name: "Cool white, for the pair", scenario: "Without moving the tripod or unlocking anything, switch to cool white and shoot within 30 seconds of the warm shot, so the light is the only difference.", line: "The same frame in cool white, within 30 seconds of the warm one.", when: "blue_hour", max: 1, fallback: "drawing_corners", role: "cool" },
  { key: "install_day.hero", page: "next_steps", name: "Fitting the track", scenario: "Daylight, bright overcast. A crew member in a Vesper jacket on a ladder fitting track under a front eave, a second person footing the ladder, faces turned to the work (faces only with their OK). From the lawn at about 45 degrees, 2x, ladder feet on mats, a tidy driveway, the work vehicle at the curb. Keep the ladder and eave inside the middle 50% of the width so the tall crop holds them.", line: "A crew member on a ladder fitting track, from the lawn.", when: "install_day", max: 1, fallback: "words", role: "hero" },
  { key: "install_day.more", page: "next_steps", name: "Control box at the outlet", scenario: "Daylight, straight on from about 1 m: the control box beside the outlet it plugs into, cord run tidy along the wall, nothing else on the wall in frame.", line: "The control box beside its outlet, straight on, cord tidy.", when: "install_day", max: 1, fallback: "words", role: "more" },
];

export const SLOT_BY_KEY = new Map(DECK_SLOTS.map((slot) => [slot.key, slot]));

export function slotsFor(page: WordsPageKey): DeckSlot[] {
  return DECK_SLOTS.filter((slot) => slot.page === page);
}

// The shooting standard, at the top of the shot list in Settings.
export const SHOOTING_STANDARD = "Every night shot: 15 to 30 minutes after that day's sunset (in Calgary in November, sunset is about 5:45 pm), sky deep blue, not black; tripod at chest height, level, main 1x lens (never 0.5x); exposure down until every light is its own point; porch light off and at most a lamp or two on inside, so no other light is credited to Vesper; garage closed and driveway empty; no house numbers, plates or faces (crew faces only with their OK); landscape (phone held sideways). Any iPhone photo is big enough; the roofline inside the middle 60% of the height, because the band crop keeps about 65% of a 4:3 photo's height. Day shots: bright overcast or open shade, sun behind the camera.";

// ---------------------------------------------------------------- the light picker's looks

export type LightColour = { hex: string; name: string };
export type Look = { key: string; name: string; words: string; colours: LightColour[]; block: number; active: boolean };

export const MAX_ACTIVE_LOOKS = 6;
export const MAX_LOOK_COLOURS = 4;

export type Effect = "steady" | "twinkle" | "chase" | "off";
export const EFFECTS: { key: Effect; label: string }[] = [
  { key: "steady", label: "Steady" },
  { key: "twinkle", label: "Twinkle" },
  { key: "chase", label: "Chase" },
  { key: "off", label: "Off" },
];

const HEX = /^#[0-9A-Fa-f]{6}$/;

// settings.light_looks as stored, keeping only looks that can be drawn.
export function parseLooks(value: Json | null | undefined): Look[] {
  if (!Array.isArray(value)) return [];
  const out: Look[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const look = entry as Record<string, unknown>;
    const key = str(look.key).trim();
    const name = str(look.name).trim();
    if (!key || !name || seen.has(key)) continue;
    const colours = (Array.isArray(look.colours) ? look.colours : [])
      .map((colour) => (colour && typeof colour === "object" && !Array.isArray(colour) ? (colour as Record<string, unknown>) : {}))
      .filter((colour) => HEX.test(str(colour.hex)))
      .slice(0, MAX_LOOK_COLOURS)
      .map((colour) => ({ hex: str(colour.hex).toUpperCase(), name: str(colour.name).trim() }));
    if (colours.length === 0) continue;
    const block = Number(look.block);
    seen.add(key);
    out.push({
      key,
      name,
      words: str(look.words).trim(),
      colours,
      block: colours.length === 1 ? 1 : Number.isInteger(block) && block >= 2 && block <= 6 ? block : 3,
      active: look.active !== false,
    });
  }
  return out;
}

// The looks a meeting offers: on, in order, at most six.
export function activeLooks(looks: Look[]): Look[] {
  return looks.filter((look) => look.active).slice(0, MAX_ACTIVE_LOOKS);
}

// ---------------------------------------------------------------- the roofline trace

// A point on the photo, from 0 to 1 across and down.
export type Pt = [number, number];

// The garage door (or front door) the scale was set from.
export type ScaleKind = "double" | "single" | "door" | "other";
export const SCALE_FEET: Record<Exclude<ScaleKind, "other">, number> = { double: 16, single: 9, door: 3 };
export type TraceScale = { a: Pt; b: Pt; feet: number; kind: ScaleKind };

export type Trace = {
  lines: Pt[][];
  // Feet measured for a line, when Keenan typed one; null otherwise.
  lineFeet: (number | null)[];
  scale: TraceScale;
  // The flat dusk grade measured from the photo in prep, from 0 to 1.
  duskBrightness: number;
  lightCount: number;
};

const isPt = (value: unknown): value is Pt =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1);

// A stored trace, or null when it can't be drawn.
export function parseTrace(row: {
  lines: Json;
  line_feet: Json;
  scale: Json;
  dusk_brightness: number;
  light_count: number;
}): Trace | null {
  const lines = (Array.isArray(row.lines) ? row.lines : [])
    .map((line) => (Array.isArray(line) ? line.filter(isPt) : []))
    .filter((line) => line.length >= 2) as Pt[][];
  const scale = row.scale && typeof row.scale === "object" && !Array.isArray(row.scale) ? (row.scale as Record<string, unknown>) : null;
  if (lines.length === 0 || !scale || !isPt(scale.a) || !isPt(scale.b)) return null;
  const feet = Number(scale.feet);
  if (!(feet > 0)) return null;
  const kind = (["double", "single", "door", "other"] as const).find((k) => k === scale.kind) ?? "other";
  const rawFeet = Array.isArray(row.line_feet) ? row.line_feet : [];
  return {
    lines,
    lineFeet: lines.map((_, at) => {
      const value = Number(rawFeet[at]);
      return Number.isFinite(value) && value > 0 ? value : null;
    }),
    scale: { a: scale.a, b: scale.b, feet, kind },
    duskBrightness: row.dusk_brightness,
    lightCount: row.light_count,
  };
}

// A trace counts only while its photo is still the lead's and still in the
// slot it had when traced (a replaced Front photo means trace it again).
export function traceStillValid(
  trace: { photo_id: string; photo_slot: string | null },
  photos: { id: string; slot: string | null }[],
): boolean {
  const photo = photos.find((item) => item.id === trace.photo_id);
  return Boolean(photo) && (photo?.slot ?? null) === (trace.photo_slot ?? null);
}
