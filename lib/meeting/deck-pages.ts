import {
  activeLooks,
  DECK_PAGES,
  deckLine,
  fillLine,
  HEADLINE_FALLBACK,
  parseDeckWords,
  parseLooks,
  parseTrace,
  SLOT_BY_KEY,
  slotsFor,
  traceStillValid,
  WORDS_PAGES,
  type DeckPageKey,
  type DeckLines,
  type DeckSlot,
  type DeckWords,
  type PageWords,
  type SlotFallback,
  type Trace,
  type WordsPageKey,
} from "@/lib/deck";
import { SOFFIT_LABELS, type SoffitColour } from "@/lib/leads/status";
import { CUSTOM_CHOICE, RAL_CODE_PATTERN } from "@/lib/leads/track-colour";
import type { DeckPayload, DeckPhoto, MeetingMockup, MeetingPayload } from "@/lib/meeting/state";
import { galleryPhotos, isGallerySlot, photosInOrder } from "@/lib/photos-deck";
import { parseTalkingPoints } from "@/lib/meeting/talking-points";
import { addDays } from "@/lib/time";
import { cleanFeet, formatMoney, screenTotal, type QuoteRun } from "@/lib/pricing";
import type { Json } from "@/types/database";

// The deck (round 7, the settled spec's page_order, pages and colour_screen;
// round 9, the meeting as one story, 2026-11-10): which pages a meeting
// shows and in what order, what each slot shows while Keenan's photo is
// missing, the words each page reads, and the payload the meeting page
// builds from the database rows. Pure (no React, no network), so the deck's
// rules are unit tested; meeting mode, the rehearsal view and the payload
// loader (lib/meeting/deck-payload.ts) all read it.
//
// CONTRACT
//   deckPages({ deck, lead, fillEmpty? })   the pages to show, in order, with
//                                           the label their dot and region read
//   mockupJobs(mockups), offerMockup(mockups, offerId)
//                                           round 10: which mockup does which job
//   houseView(deck, lead)                   what Your house shows: the traced
//                                           photo by day, the Front photo, our
//                                           drawing, or nothing (skipped)
//   nextLabel(pages, at, lines)             "Next: Hidden by day", null on the last
//   slotView(deck, key, fillEmpty?)         a slot's photos, its example
//                                           (rehearsal) or its fallback
//   pairView(deck, a, b, fillEmpty?)        the day and night or warm and cool pair
//   galleryItems(deck, fillEmpty?)          the gallery's photos (and, in
//                                           rehearsal, its empty slots)
//   moreWords(page), seeAllLabel, galleryCounter,
//   warrantyLines, serviceCallLine, companyLines, placeOf, soffitView,
//   coverLine, CHOOSER_LINES
//   measuredRuns(runs), measuredFeet(runs), houseLine(words, runs)
//                                           Your house's line and drawing
//   colourIsStock(kind, text), colourTimingView(...)
//                                           the colour page's one colour rule
//   installDays(today), installDayGrid(today), recapLine(...)
//                                           What happens next
//   chooserSave({ choice, current, code, ralNames })
//                                           the meeting chooser's Save: waiting
//                                           (outline) or ready (gold)
//   fluidPx, fluidValue, BAND_HEIGHT_CSS    the deck's type and band sizes
//   DECK_ROW, DECK_ROW_BOTTOM_CSS, DECK_CLEAR_CSS
//                                           the bottom row (the More button,
//                                           the dots and the chevrons) and
//                                           where a picture ends above it
//   stepFor, isNear, entryOf, startIndex, exitHoldMoved, layerSwipe
//                                           deck mechanics
//   buildDeckPayload, deckPhotoPathsToSign, pickerFrom   the payload, from rows

// ---------------------------------------------------------------- pages

export type DeckPage = { key: DeckPageKey; label: string };

// The lead's own part of the deck (round 10): their mockups, Main first
// (MeetingPayload.mockups), and the Main's URL. frontPhotoUrl and measured
// were round 9's Your house, which left the order.
export type DeckLead = { mockupUrl: string | null; mockups?: readonly MeetingMockup[]; frontPhotoUrl?: string | null; measured?: boolean };

// The lead's Front photo, signed, when the meeting's payload carries one
// (lib/meeting/deck-payload.ts): Your house with no trace and no mockup.
export function frontPhotoOf(meeting: MeetingPayload): string | null {
  return "frontPhotoUrl" in meeting && typeof meeting.frontPhotoUrl === "string" && meeting.frontPhotoUrl !== "" ? meeting.frontPhotoUrl : null;
}

// Whether a saved quote's runs (quotes.runs as stored) have any feet.
export function runsMeasured(runs: unknown): boolean {
  return Array.isArray(runs) && runs.some((run) => run !== null && typeof run === "object" && cleanFeet(Number((run as { feet?: unknown }).feet)) > 0);
}

export type DeckPagesInput = {
  deck: DeckPayload;
  // The lead's own part; null with no lead (the rehearsal view only): Your
  // house, the picker, the mockup, the colour and the price are skipped.
  lead: DeckLead | null;
  // The rehearsal view (not its Customer view): every empty slot shows its
  // example, so no page is skipped for want of a photo.
  fillEmpty?: boolean;
};

const isWordsPage = (key: DeckPageKey): key is WordsPageKey => (WORDS_PAGES as readonly string[]).includes(key);

// What a page's dot, region and the Next label call it: its headline, as
// Settings has it; the built pages' from their lines.
export function pageLabel(key: DeckPageKey, words: DeckWords): string {
  if (isWordsPage(key)) return words.pages[key].headline.trim() || HEADLINE_FALLBACK[key];
  if (key === "colour") return words.lines.colour_headline;
  if (key === "quote") return words.lines.price_headline;
  return "Vesper";
}

// What Your house shows (round 9, the five seats' table): with a trace, the
// photo it was traced on by day, in the picker's own crop, so the next page
// is the reveal; with no trace, the mockup stands in (Your house, lit), so
// Your house itself is skipped; else their Front photo by day; else, with
// something measured, our drawing with every measured run lit; else nothing.
export type HouseView = { kind: "trace" } | { kind: "photo"; url: string } | { kind: "drawing" };

export function houseView(deck: Pick<DeckPayload, "picker">, lead: DeckLead | null): HouseView | null {
  if (!lead) return null;
  if (deck.picker) return { kind: "trace" };
  if (lead.mockupUrl) return null;
  if (lead.frontPhotoUrl) return { kind: "photo", url: lead.frontPhotoUrl };
  return lead.measured ? { kind: "drawing" } : null;
}

// The lead's mockups by the job each does (round 10): the Main (lights on),
// the Day and Night pair, the phone page's scenes (the Main first as a
// button too, when there is one) and an offer's own picture.
export type MockupJobs = {
  main: MeetingMockup | null;
  day: MeetingMockup | null;
  night: MeetingMockup | null;
  scenes: MeetingMockup[];
};

export function mockupJobs(mockups: readonly MeetingMockup[] | undefined): MockupJobs {
  const list = mockups ?? [];
  const main = list.find((item) => item.main) ?? null;
  const scenes = list.filter((item) => item.scene && !item.main);
  return {
    main,
    day: list.find((item) => item.day) ?? null,
    night: list.find((item) => item.night) ?? null,
    scenes: scenes.length > 0 && main ? [main, ...scenes] : scenes,
  };
}

// The picture for an offer on Your price: its own (a mockup marked for it),
// else the Main, else none (the offers take the room).
export function offerMockup(mockups: readonly MeetingMockup[] | undefined, offerId: string | null): MeetingMockup | null {
  const list = mockups ?? [];
  const own = offerId ? list.find((item) => item.offers.includes(offerId)) : undefined;
  return own ?? list.find((item) => item.main) ?? null;
}

// A page with nothing to show is skipped, never shown empty (round 10): a
// page missing its mockup is skipped, so a meeting never shows an empty
// page. What happens next is never skipped. The light picker is never shown
// (Keenan, 2026-11-11), even with a roofline traced: the payload may still
// carry a trace (deck.picker), and it is ignored here.
export function deckPages({ deck, lead, fillEmpty = false }: DeckPagesInput): DeckPage[] {
  void fillEmpty;
  const jobs = mockupJobs(lead?.mockups ?? []);
  const main = lead !== null && (jobs.main !== null || Boolean(lead.mockupUrl));
  const shows: Record<DeckPageKey, () => boolean> = {
    cover: () => true,
    what_vesper_is: () => main,
    hidden_by_day: () => jobs.day !== null && jobs.night !== null,
    phone_control: () => jobs.scenes.length > 0,
    warranty: () => true,
    quote: () => lead !== null,
    next_steps: () => true,
    // Left the meeting on 2026-11-11 (lib/deck.ts RETIRED_PAGES): no
    // editor, so no light picker, traced or not.
    light_picker: () => false,
    // Left the order in round 10 (lib/deck.ts RETIRED_PAGES).
    gallery: () => false,
    your_house: () => false,
    mockup: () => false,
    whites_first: () => false,
    colour: () => false,
  };
  return DECK_PAGES.filter((key) => shows[key]()).map((key) => ({ key, label: pageLabel(key, deck.words) }));
}

// The quiet label beside the forward chevron (round 9): the next shown
// page's headline, so it always names the page that actually comes next.
// Null on the last page.
export function nextLabel(pages: Pick<DeckPage, "label">[], at: number, lines: DeckLines): string | null {
  const next = pages[at + 1];
  return next ? deckLine(lines, "next_prefix", { page: next.label }) : null;
}

// The Next label in two parts, so the page's name can take its own line:
// the words before {page}, and {page} with whatever follows it.
export function nextLabelParts(pages: Pick<DeckPage, "label">[], at: number, lines: DeckLines): { lead: string; page: string } | null {
  const next = pages[at + 1];
  if (!next) return null;
  const template = lines.next_prefix;
  const split = template.indexOf("{page}");
  if (split < 0) return { lead: "", page: deckLine(lines, "next_prefix") };
  return { lead: fillLine(template.slice(0, split), {}), page: fillLine(template.slice(split), { page: next.label }) };
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

// The band's counter, "2 of 6", only while the photos stepped through on
// the band are the whole gallery. With more than that, See all N is the
// only total a customer sees (round 7 review): no counter, rather than "1
// of 6" beside "See all 12".
export function galleryCounter(at: number, shown: number, total: number): string | null {
  if (shown < 2 || shown !== total) return null;
  return `${Math.min(Math.max(0, at), shown - 1) + 1} of ${shown}`;
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

// settings.warranty_text, line by line, word for word.
export function warrantyLines(text: string): string[] {
  return splitLines(text);
}

// The service call fee's line in The full warranty, only when it is set.
// On screen a fee reads "$200 + GST" while GST is enabled, like every price.
export function serviceCallLine(fee: number | null, gstEnabled = false): string | null {
  return fee === null || !Number.isFinite(fee) ? null : `The service call fee in years 6 to 10 is ${screenTotal(fee, gstEnabled)}.`;
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

// The cover's address line: the address and neighbourhood, as built.
export function coverLine(lead: Pick<MeetingPayload["lead"], "addressLine" | "neighbourhood">): string {
  const neighbourhood = lead.neighbourhood?.trim();
  return neighbourhood ? `${lead.addressLine}, ${neighbourhood}` : lead.addressLine;
}

// ---------------------------------------------------------------- Your house

// The runs measured so far: those with feet, by their place on the quote.
export function measuredRuns(runs: QuoteRun[]): number[] {
  return runs.flatMap((run, at) => (cleanFeet(run.feet) > 0 ? [at] : []));
}

export function measuredFeet(runs: QuoteRun[]): number {
  return runs.reduce((sum, run) => sum + cleanFeet(run.feet), 0);
}

// "We measured 166 ft of roofline.", from the quote's runs; null (the line
// is hidden) while nothing is measured.
export function houseLine(words: PageWords, runs: QuoteRun[]): string | null {
  const feet = measuredFeet(runs);
  const template = words.words.trim();
  if (feet <= 0 || template === "") return null;
  return fillLine(template, { feet });
}

// ---------------------------------------------------------------- the colour page

export const CHECK_TOGETHER = "We'll check it together.";

// One colour rule (round 9, CLAUDE.md): White is the only stock colour. Any
// other list colour, and Custom, is made to order: included for a spring
// install, or the rush colour fee to have it this season.
export function colourIsStock(kind: "none" | "list" | "custom", text: string): boolean {
  return kind === "list" && /^white\b/i.test(text.trim());
}

// What the colour page says about timing: nothing until a colour is chosen;
// the stock line for White; for any other colour the made-to-order line and
// its two buttons, "Install this season" only while the quote has a rush
// fee. chosen follows the quote's colour timing (spring unless rush).
export type ColourTimingView =
  | { kind: "none" }
  | { kind: "stock"; line: string }
  | {
      kind: "made";
      line: string;
      spring: { label: string; value: string };
      season: { label: string; value: string } | null;
      chosen: "spring" | "season";
    };

export function colourTimingView({
  lines,
  kind,
  text,
  timing,
  rushFee,
}: {
  lines: DeckLines;
  kind: "none" | "list" | "custom";
  text: string;
  timing: "stock" | "factory_order" | "rush" | null;
  rushFee: number | null;
}): ColourTimingView {
  if (kind === "none") return { kind: "none" };
  if (colourIsStock(kind, text)) return { kind: "stock", line: deckLine(lines, "colour_stock") };
  const fee = rushFee !== null && Number.isFinite(rushFee) && rushFee > 0 ? rushFee : null;
  return {
    kind: "made",
    line: deckLine(lines, "colour_made", { colour: text.trim() }),
    spring: { label: deckLine(lines, "colour_spring_label"), value: deckLine(lines, "colour_spring_value") },
    season: fee === null ? null : { label: deckLine(lines, "colour_season_label"), value: deckLine(lines, "colour_season_value", { fee: formatMoney(fee) }) },
    chosen: timing === "rush" && fee !== null ? "season" : "spring",
  };
}

// ---------------------------------------------------------------- What happens next

// The install days the table can pick (round 9): three weeks of days,
// starting tomorrow, as YYYY-MM-DD.
export const INSTALL_DAY_SPAN = 21;

export function installDays(today: string, span = INSTALL_DAY_SPAN): string[] {
  return Array.from({ length: span }, (_, at) => addDays(today, at + 1));
}

// The same days as a calendar, a week to a row, Sunday first: null fills the
// days before tomorrow in its week and after the last in its week.
export function installDayGrid(today: string, span = INSTALL_DAY_SPAN): (string | null)[][] {
  const days = installDays(today, span);
  if (days.length === 0) return [];
  const lead = new Date(`${days[0]}T12:00:00Z`).getUTCDay();
  const cells: (string | null)[] = [...Array.from({ length: lead }, () => null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (string | null)[][] = [];
  for (let at = 0; at < cells.length; at += 7) rows.push(cells.slice(at, at + 7));
  return rows;
}

// A picked day the table still offers is kept; one that has passed (a draft
// from another evening) isn't shown as a date.
export function shownInstallDay(installOn: string | null | undefined, today: string): string | null {
  return installOn && /^\d{4}-\d{2}-\d{2}$/.test(installOn) && installOn > today ? installOn : null;
}

// "Your choice: Main floor, $3,380 + GST", once an option is chosen.
export function recapLine(lines: DeckLines, name: string, subtotal: number, gstEnabled: boolean): string {
  return deckLine(lines, "recap", { name: name.trim(), total: screenTotal(subtotal, gstEnabled) });
}

// The colour chooser in front of the customer (round 7 review): the colour
// book, never "RAL Classic" or "powder coating". The read-back of a typed
// number (its RAL name) stays. The lead page and prep keep their own words.
export const CHOOSER_LINES = {
  heading: "Your track colour",
  legend: "Choose the colour",
  codeLabel: "Colour number",
  codeHint: "From the colour book.",
  codeShort: "Four digits, from the colour book.",
  codeUnknown: "That number isn't in the colour book.",
} as const;

// The chooser's Save in the meeting (round 7 after-review, the Porch Light
// Rule): "unchanged" while the choice is the colour it opened on (and, for
// Custom, the same number), when there is nothing to save and Back is the
// way out; "ready" (gold) once there is a new colour to save: another
// colour on the list, or Custom with a number that is in the colour book.
// Custom with a number that isn't (yet) is neither: Save stays outlined
// but a tap still says what is wrong, in the book's words.
export function chooserSave({
  choice,
  current,
  code,
  ralNames,
}: {
  choice: string | null;
  current: { choice: string | null; ralCode: string | null };
  code: string;
  ralNames: Record<string, string>;
}): { unchanged: boolean; ready: boolean } {
  const custom = choice === CUSTOM_CHOICE;
  const typed = code.trim();
  const unchanged = choice === current.choice && (!custom || typed === (current.ralCode ?? ""));
  const known = RAL_CODE_PATTERN.test(typed) && Boolean(ralNames[typed]);
  return { unchanged, ready: choice !== null && !unchanged && (!custom || known) };
}

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
// secondary lines, 64/72 the cover's wordmark, 28/30 its address; the
// colour page's names 32/36, the full warranty 24/27, a More's label 44/50
// and a words-only More's words 30/32 (round 7 review).
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
  name: fluidPx(32, 36),
  warranty: fluidPx(24, 27),
  moreLabel: fluidPx(44, 50),
  moreBody: fluidPx(30, 32),
  band: BAND_HEIGHT_CSS,
} as const;

// The bottom row (round 7 review): every page's More button (and Back on
// its layer) sits bottom left (round 9; bottom right before), 56 px tall, 20 px up (or above the home
// indicator); the dots and the Previous and Next chevrons share its centre
// line in the middle, so the bottom edge reads as one row. Dot targets 40 px
// wide and 44 px tall in a pill with 4 px ends, 44 px chevron discs, 6 px
// between them and the pill: with the most a meeting shows (11 pages) that
// is 548 px, which clears the widest seeded More button ("What the app
// does") at 1180. Round 9: the More button moved to the row's left, so the
// Next label ("Next: Hidden by day") sits right of the forward chevron.
// Whatever sits in the bottom row's band (the tray's controls, a picture on
// a split page or a More) ends 8 px above the row's tallest part:
// --deck-clear.
export const DECK_ROW = { height: 56, bottom: 20, dot: 40, dotHeight: 44, pillEnds: 4, chevron: 44, gap: 6, clearance: 8 } as const;
export const DECK_ROW_BOTTOM_CSS = `max(${DECK_ROW.bottom}px, env(safe-area-inset-bottom, 0px))`;
const rowTopOverBottom = (DECK_ROW.height + Math.max(DECK_ROW.chevron, DECK_ROW.dotHeight)) / 2;
// 78 px above the deck's foot without a home indicator.
export const DECK_CLEAR_PX = DECK_ROW.bottom + rowTopOverBottom + DECK_ROW.clearance;
export const DECK_CLEAR_CSS = `calc(var(--deck-row-bottom, ${DECK_ROW.bottom}px) + ${rowTopOverBottom + DECK_ROW.clearance}px)`;

// The middle of the bottom row, in px: the dots for every page, the two
// chevrons and their gaps, centred on the deck. A More button's left edge
// has to stay clear of it (Settings can check a label against it).
export function bottomRowWidth(pages: number): number {
  return pages * DECK_ROW.dot + 2 * DECK_ROW.pillEnds + 2 * (DECK_ROW.chevron + DECK_ROW.gap);
}

// The x where the middle of the bottom row ends, on a deck that wide.
export function bottomRowRight(deckWidth: number, pages: number): number {
  return (deckWidth + bottomRowWidth(pages)) / 2;
}

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

// The exit (round 7 review): a hold on the X is a hold only while the finger
// stays within 10 px of where it went down; further is a hand gripping the
// iPad's corner, and cancels it.
export const EXIT_HOLD_SLOP_PX = 10;

export function exitHoldMoved(from: { x: number; y: number }, to: { x: number; y: number }): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) > EXIT_HOLD_SLOP_PX;
}

// A layer closes on a one-finger sideways swipe: over 60 px across and well
// over the move down. Only from the layer's empty space (round 7
// after-review): a finger that went down on a control (a colour sliding to
// the next one, a press and drag in the number field) never closes it,
// however far it moves, so a choice or a typed number is never lost.
export const LAYER_SWIPE_PX = 60;

export function layerSwipe({ dx, dy, onControl }: { dx: number; dy: number; onControl: boolean }): 1 | -1 | null {
  if (onControl || !(Math.abs(dx) > LAYER_SWIPE_PX) || !(Math.abs(dx) > Math.abs(dy) * 1.5)) return null;
  return dx < 0 ? 1 : -1;
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
  gst_enabled?: boolean;
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
    warranty: { text: settings.warranty_text, serviceCallFee: settings.service_call_fee, gstEnabled: settings.gst_enabled === true },
    talking: parseTalkingPoints(settings.deck),
  };
}
