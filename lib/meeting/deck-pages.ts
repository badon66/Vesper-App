import {
  activeLooks,
  DECK_PAGES,
  PAGE_NAMES,
  parseDeckWords,
  parseLooks,
  parseTrace,
  SLOT_BY_KEY,
  slotsFor,
  traceStillValid,
  WORDS_PAGES,
  type DeckPageKey,
  type DeckSlot,
  type DeckWords,
  type PageWords,
  type SlotFallback,
  type Trace,
  type WordsPageKey,
} from "@/lib/deck";
import { SOFFIT_LABELS, type SoffitColour } from "@/lib/leads/status";
import type { DeckPayload, DeckPhoto, MeetingPayload } from "@/lib/meeting/state";
import { galleryPhotos, isGallerySlot, photosInOrder } from "@/lib/photos-deck";
import { formatMoney } from "@/lib/pricing";
import type { Json } from "@/types/database";

// The deck (round 7, the settled spec's page_order, pages and colour_screen):
// which pages a meeting shows and in what order, what each slot shows while
// Keenan's photo is missing, the words each page reads, and the payload the
// meeting page builds from the database rows. Pure (no React, no network),
// so the deck's rules are unit tested; meeting mode, the rehearsal view and
// the payload loader (lib/meeting/deck-payload.ts) all read it.
//
// CONTRACT
//   deckPages({ deck, lead, fillEmpty? })   the pages to show, in order, with
//                                           the label their dot and region read
//   slotView(deck, key, fillEmpty?)         a slot's photos, its example
//                                           (rehearsal) or its fallback
//   pairView(deck, a, b, fillEmpty?)        the day and night or warm and cool pair
//   galleryItems(deck, fillEmpty?)          the gallery's photos (and, in
//                                           rehearsal, its empty slots)
//   moreWords(page), seeAllLabel, installSteps, warrantyLines,
//   serviceCallLine, companyLines, placeOf, soffitView, coverLine
//   fluidPx, fluidValue, BAND_HEIGHT_CSS    the deck's type and band sizes
//   stepFor, isNear, entryOf, startIndex    deck mechanics
//   buildDeckPayload, deckPhotoPathsToSign, pickerFrom   the payload, from rows

// ---------------------------------------------------------------- pages

export type DeckPage = { key: DeckPageKey; label: string };

export type DeckPagesInput = {
  deck: DeckPayload;
  // The lead's own part; null with no lead (the rehearsal view only): the
  // picker, mockup, colour and price pages are skipped.
  lead: { mockupUrl: string | null } | null;
  // The rehearsal view (not its Customer view): every empty slot shows its
  // example, so no page is skipped for want of a photo.
  fillEmpty?: boolean;
};

const BUILT_LABELS: Partial<Record<DeckPageKey, string>> = {
  cover: "Vesper",
  colour: "Your colours",
  quote: "Your price",
};

const isWordsPage = (key: DeckPageKey): key is WordsPageKey => (WORDS_PAGES as readonly string[]).includes(key);

// What a page's dot and region are called: its headline, as Settings has it.
export function pageLabel(key: DeckPageKey, words: DeckWords): string {
  if (isWordsPage(key)) return words.pages[key].headline.trim() || PAGE_NAMES[key];
  return BUILT_LABELS[key] ?? key;
}

const hasWords = (page: PageWords) => page.headline.trim() !== "" || page.words.trim() !== "";

// A page with nothing to show is skipped, never shown empty.
export function deckPages({ deck, lead, fillEmpty = false }: DeckPagesInput): DeckPage[] {
  const shows: Record<DeckPageKey, () => boolean> = {
    cover: () => true,
    what_vesper_is: () => hasWords(deck.words.pages.what_vesper_is),
    hidden_by_day: () => hasWords(deck.words.pages.hidden_by_day),
    whites_first: () => hasWords(deck.words.pages.whites_first),
    // Their own house only: never a drawing or another house in its place.
    light_picker: () => lead !== null && deck.picker !== null && deck.looks.length > 0,
    phone_control: () => hasWords(deck.words.pages.phone_control),
    // Real installs only: skipped until Keenan has some.
    gallery: () => galleryItems(deck, fillEmpty).length > 0,
    install_day: () => hasWords(deck.words.pages.install_day),
    warranty: () => warrantyLines(deck.warranty.text).length > 0,
    mockup: () => lead !== null && Boolean(lead.mockupUrl),
    colour: () => lead !== null,
    quote: () => lead !== null,
  };
  return DECK_PAGES.filter((key) => shows[key]()).map((key) => ({ key, label: pageLabel(key, deck.words) }));
}

// ---------------------------------------------------------------- slots

// What a slot shows: Keenan's photos; in the rehearsal view, its example
// (the rehearsal draws it); otherwise its fallback (a drawing, the words
// alone, or the page skipped). Never the customer's photo or a reference.
export type SlotView =
  | { kind: "photo"; photos: DeckPhoto[] }
  | { kind: "example"; slot: DeckSlot }
  | { kind: "fallback"; fallback: SlotFallback };

export function slotView(deck: DeckPayload, key: string, fillEmpty = false): SlotView {
  const photos = deck.photos[key] ?? [];
  if (photos.length > 0) return { kind: "photo", photos };
  const slot = SLOT_BY_KEY.get(key);
  if (!slot) return { kind: "fallback", fallback: "words" };
  return fillEmpty ? { kind: "example", slot } : { kind: "fallback", fallback: slot.fallback };
}

// A pair that only works together (the day and night slider, the warm and
// cool pair): both photos, or the drawn pair. In rehearsal each side shows
// its photo or its example.
export type PairView = { kind: "pair"; sides: [SlotView, SlotView] } | { kind: "drawn" };

export function pairView(deck: DeckPayload, a: string, b: string, fillEmpty = false): PairView {
  const first = slotView(deck, a, fillEmpty);
  const second = slotView(deck, b, fillEmpty);
  if (first.kind === "photo" && second.kind === "photo") return { kind: "pair", sides: [first, second] };
  if (fillEmpty) return { kind: "pair", sides: [first, second] };
  return { kind: "drawn" };
}

// ---------------------------------------------------------------- the gallery

// One photo at a time above the band: the first six in Keenan's order.
export const GALLERY_HERO_COUNT = 6;

export type GalleryItem = { kind: "photo"; photo: DeckPhoto } | { kind: "example"; slot: DeckSlot };

export function galleryItems(deck: DeckPayload, fillEmpty = false): GalleryItem[] {
  const items: GalleryItem[] = deck.gallery.map((photo) => ({ kind: "photo", photo }));
  if (fillEmpty) {
    for (const slot of slotsFor("gallery")) {
      if ((deck.photos[slot.key] ?? []).length === 0) items.push({ kind: "example", slot });
    }
  }
  return items;
}

// "See all 12", with the real count.
export function seeAllLabel(label: string, count: number): string {
  return `${label.trim()} ${count}`;
}

// ---------------------------------------------------------------- words

export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

// A page's More: its button label and its words, line by line; null when
// Settings has nothing for it, so the button is hidden.
export type MoreWords = { label: string; lines: string[] };

export function moreWords(page: PageWords): MoreWords | null {
  const label = page.moreLabel.trim();
  const lines = splitLines(page.moreText);
  return label && lines.length > 0 ? { label, lines } : null;
}

// How install day works: one step per line, numbered on screen (a number
// Keenan typed at the start of a line is not doubled).
export function installSteps(words: string): string[] {
  return splitLines(words).map((line) => line.replace(/^\d+[.)]?\s+/, "")).filter(Boolean);
}

// settings.warranty_text, line by line, word for word.
export function warrantyLines(text: string): string[] {
  return splitLines(text);
}

// The service call fee's line in The full warranty, only when it is set.
export function serviceCallLine(fee: number | null): string | null {
  return fee === null || !Number.isFinite(fee) ? null : `The service call fee in years 6 to 10 is ${formatMoney(fee)}.`;
}

// Whether The full warranty adds anything past the lines up front.
export function fullWarrantyShows(text: string, upFront: number, fee: number | null): boolean {
  return warrantyLines(text).length > upFront || serviceCallLine(fee) !== null;
}

// The town in an address: the part before the province ("448 Strathcona
// Drive SW, Calgary, AB T3H 1M3" is Calgary); null when it can't be told.
export function placeOf(address: string): string | null {
  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  for (let at = 1; at < parts.length - 1; at += 1) {
    if (/^[A-Z]{2}(\s|$)/.test(parts[at + 1])) return parts[at];
  }
  return null;
}

// "Vesper Lighting, Inc., Calgary", then the phone number.
export function companyLines(company: DeckPayload["company"]): string[] {
  const name = company.name.trim();
  const first = name && company.place ? `${name}, ${company.place}` : name;
  return [first, company.phone.trim()].filter(Boolean);
}

// The cover's one line: the address and neighbourhood, as built.
export function coverLine(lead: Pick<MeetingPayload["lead"], "addressLine" | "neighbourhood">): string {
  const neighbourhood = lead.neighbourhood?.trim();
  return neighbourhood ? `${lead.addressLine}, ${neighbourhood}` : lead.addressLine;
}

// ---------------------------------------------------------------- the colour page

export const CHECK_TOGETHER = "We'll check it together.";

// The colour page's built lines, word for word from the spec.
export const COLOUR_LINES = {
  splitTrack: "One track colour for the whole house.",
  screens: "Screens can't show colour exactly, so we choose it from the colour book together.",
  initials: "Your initials confirm the track colour we'll order.",
  // The chooser's line, as built, with "the RAL book" now "the colour book".
  chooser: "Screens can't show colour accurately, so choose it from the colour book together.",
} as const;

// The soffit by name: one colour, or two on their own lines for a split
// soffit (never joined with "and"; "Off-white or cream" already holds an
// "or"). Not sure or unanswered reads "We'll check it together.", Other
// reads "Another colour". The setter's which-is-where note is never here.
export type SoffitView = { label: string; names: string[]; split: boolean };

function soffitName(colour: SoffitColour | null | undefined): string | null {
  if (!colour || colour === "not_sure") return null;
  if (colour === "other") return "Another colour";
  return SOFFIT_LABELS[colour] ?? null;
}

export function soffitView(lead: Pick<MeetingPayload["lead"], "soffitColour" | "soffitColour2">): SoffitView {
  const colours = [lead.soffitColour, lead.soffitColour2].filter((colour): colour is SoffitColour => Boolean(colour));
  const distinct = colours.filter((colour, at) => colours.indexOf(colour) === at);
  const names = distinct.map(soffitName);
  if (distinct.length < 2 || names.every((name) => name === null)) {
    return { label: "Your soffit", names: [names[0] ?? CHECK_TOGETHER], split: false };
  }
  return {
    label: "Your soffit, two colours",
    names: names.map((name) => name ?? CHECK_TOGETHER),
    split: true,
  };
}

// ---------------------------------------------------------------- sizes

// The deck's type grows with the screen: the first size at 1180 wide (iPad
// Air), the second at 1366 (iPad Pro 12.9), in a straight line between,
// held to that range. Written with container units, so the rehearsal view's
// smaller frame scales the same way. 52/60 headlines, 27/30 words, 20/22
// secondary lines, 64/72 the cover's wordmark, 28/30 its address.
const AIR = 1180;
const PRO = 1366;
const round = (value: number, places: number) => Number(value.toFixed(places));

export function fluidValue(atAir: number, atPro: number, width: number): number {
  const slope = (atPro - atAir) / (PRO - AIR);
  const value = atAir + (width - AIR) * slope;
  return Math.min(Math.max(value, Math.min(atAir, atPro) * 0.85), Math.max(atAir, atPro));
}

export function fluidPx(atAir: number, atPro: number): string {
  const slope = (atPro - atAir) / (PRO - AIR);
  const intercept = atAir - slope * AIR;
  const lo = round(Math.min(atAir, atPro) * 0.85, 2);
  const hi = Math.max(atAir, atPro);
  return `clamp(${lo}px, calc(${round(slope * 100, 4)}cqw + ${round(intercept, 3)}px), ${hi}px)`;
}

// The band under every page's photo (and the picker's tray): about 30% of
// the height at 1180 x 820 (246 px) and 28% at 1366 x 1024 (287 px).
export const BAND_AT_AIR = 0.3 * 820;
export const BAND_AT_PRO = 0.28 * 1024;

export function bandHeight(height: number): number {
  return BAND_AT_AIR + ((height - 820) * (BAND_AT_PRO - BAND_AT_AIR)) / (1024 - 820);
}

const bandSlope = (BAND_AT_PRO - BAND_AT_AIR) / (1024 - 820);
export const BAND_HEIGHT_CSS = `clamp(180px, calc(${round(bandSlope * 100, 4)}cqh + ${round(BAND_AT_AIR - bandSlope * 820, 3)}px), 40cqh)`;

export const DECK_SIZES = {
  headline: fluidPx(52, 60),
  body: fluidPx(27, 30),
  small: fluidPx(20, 22),
  wordmark: fluidPx(64, 72),
  address: fluidPx(28, 30),
  band: BAND_HEIGHT_CSS,
} as const;

// ---------------------------------------------------------------- mechanics

// The chevrons and arrow keys: on the gallery they step through its photos
// before turning the page; everywhere else they turn the page.
export function stepFor(
  page: DeckPageKey | undefined,
  galleryAt: number,
  galleryCount: number,
  delta: 1 | -1,
): { photo: number } | { page: 1 | -1 } {
  if (page === "gallery") {
    const next = galleryAt + delta;
    if (next >= 0 && next < galleryCount) return { photo: next };
  }
  return { page: delta };
}

// Only the page on screen and its neighbours mount full-size pictures.
export function isNear(at: number, current: number): boolean {
  return Math.abs(at - current) <= 1;
}

// How the deck was opened: #start from Tonight, the Meetings page or the
// lead page (a fresh meeting, at the cover); #quote from prep's Draft the
// quote (on the price page); anything else is a reload (where it left off).
export type DeckEntry = "start" | "quote" | "resume";

export function entryOf(hash: string): DeckEntry {
  if (hash === "#start") return "start";
  if (hash === "#quote") return "quote";
  return "resume";
}

export function startIndex(
  pages: Pick<DeckPage, "key">[],
  entry: DeckEntry,
  stored: { index: number; screenKey: string | null },
): number {
  if (pages.length === 0) return 0;
  if (entry === "quote") {
    const quote = pages.findIndex((page) => page.key === "quote");
    return quote >= 0 ? quote : 0;
  }
  if (entry === "start") return 0;
  if (stored.screenKey) {
    const at = pages.findIndex((page) => page.key === stored.screenKey);
    if (at >= 0) return at;
  }
  return Math.min(Math.max(0, Math.floor(stored.index) || 0), pages.length - 1);
}

// ---------------------------------------------------------------- the payload, from rows

export type DeckPhotoRow = {
  id: string;
  slot: string;
  path: string;
  thumb_path: string | null;
  focus_x: number;
  focus_y: number;
  caption: string | null;
  sort: number;
  created_at: string;
};

export type DeckSettingsRow = {
  deck: Json;
  light_looks: Json;
  company: Json;
  warranty_text: string;
  service_call_fee: number | null;
};

const known = (row: { slot: string }) => SLOT_BY_KEY.has(row.slot);

// Every storage path the meeting needs signed: each photo in a known slot,
// and the gallery's 640 px copies for its contact sheet.
export function deckPhotoPathsToSign(rows: DeckPhotoRow[]): string[] {
  const paths = new Set<string>();
  for (const row of rows.filter(known)) {
    paths.add(row.path);
    if (isGallerySlot(row.slot) && row.thumb_path) paths.add(row.thumb_path);
  }
  return [...paths];
}

const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0.5);

function toPhoto(row: DeckPhotoRow, signed: Map<string, string>): DeckPhoto | null {
  const url = signed.get(row.path);
  if (!url) return null;
  const gallery = isGallerySlot(row.slot);
  return {
    url,
    thumbUrl: gallery && row.thumb_path ? (signed.get(row.thumb_path) ?? null) : null,
    focus: [clamp01(row.focus_x), clamp01(row.focus_y)],
    caption: gallery ? row.caption?.trim() || null : null,
  };
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export function companyOf(value: Json): DeckPayload["company"] {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return { name: text(raw.name), place: placeOf(text(raw.address)), phone: text(raw.phone) };
}

// The light picker: the photo the trace was drawn on and the trace, only
// while that photo is still the lead's and still in the slot it had.
export function pickerFrom(
  trace: { photo_id: string; photo_slot: string | null; lines: Json; line_feet: Json; scale: Json; dusk_brightness: number; light_count: number } | null,
  leadPhotos: { id: string; slot: string | null; storage_path: string }[],
  signed: Map<string, string>,
): { photoUrl: string; trace: Trace } | null {
  if (!trace || !traceStillValid(trace, leadPhotos)) return null;
  const parsed = parseTrace(trace);
  const photo = leadPhotos.find((item) => item.id === trace.photo_id);
  const photoUrl = photo ? signed.get(photo.storage_path) : undefined;
  return parsed && photoUrl ? { photoUrl, trace: parsed } : null;
}

// The deck's part of the meeting payload: the words, Keenan's photos by
// slot (signed), the gallery in his order, the looks on offer, the picker,
// the company line and the warranty. No reference shot can reach it: it is
// built only from settings, deck_photos and the lead's own trace.
export function buildDeckPayload({
  settings,
  photos,
  signed,
  picker,
}: {
  settings: DeckSettingsRow;
  photos: DeckPhotoRow[];
  signed: Map<string, string>;
  picker: DeckPayload["picker"];
}): DeckPayload {
  const bySlot: Record<string, DeckPhoto[]> = {};
  for (const row of photosInOrder(photos.filter(known))) {
    const slot = SLOT_BY_KEY.get(row.slot);
    const photo = toPhoto(row, signed);
    if (!slot || !photo) continue;
    const list = (bySlot[row.slot] ??= []);
    if (list.length < slot.max) list.push(photo);
  }
  const kept = new Set(Object.values(bySlot).flatMap((list) => list.map((photo) => photo.url)));
  const gallery = galleryPhotos(photos.filter(known))
    .map((row) => toPhoto(row, signed))
    .filter((photo): photo is DeckPhoto => photo !== null && kept.has(photo.url));
  return {
    words: parseDeckWords(settings.deck),
    photos: bySlot,
    gallery,
    looks: activeLooks(parseLooks(settings.light_looks)),
    picker,
    company: companyOf(settings.company),
    warranty: { text: settings.warranty_text, serviceCallFee: settings.service_call_fee },
  };
}
