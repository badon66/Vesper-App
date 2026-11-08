import type { Json } from "@/types/database";

// The deck (round 7, Keenan, 2026-11-08): meeting mode's pages, the words on
// them, Keenan's own photos in named slots, the light picker's looks and the
// roofline trace. Settled by the five-seat debate (docs/decisions.md,
// 2026-11-08). This module is the one reader of settings.deck and
// settings.light_looks, and the one list of slots, shared by meeting mode,
// Settings, the rehearsal view and prep. Pure, so it is unit tested.
//
// settings.presentation (take 1) is no longer read once this deck is live;
// its column stays.

// ---------------------------------------------------------------- pages

// In the order the customer sees them.
export const DECK_PAGES = [
  "cover",
  "what_vesper_is",
  "hidden_by_day",
  "whites_first",
  "light_picker",
  "phone_control",
  "gallery",
  "install_day",
  "warranty",
  "mockup",
  "colour",
  "quote",
] as const;
export type DeckPageKey = (typeof DECK_PAGES)[number];

// The pages whose words live in Settings.
export const WORDS_PAGES = [
  "what_vesper_is",
  "hidden_by_day",
  "whites_first",
  "light_picker",
  "phone_control",
  "gallery",
  "install_day",
  "warranty",
  "mockup",
] as const;
export type WordsPageKey = (typeof WORDS_PAGES)[number];

export const PAGE_NAMES: Record<WordsPageKey, string> = {
  what_vesper_is: "What Vesper is",
  hidden_by_day: "Hidden by day",
  whites_first: "Warm white",
  light_picker: "Try it on your house",
  phone_control: "Run it from your phone",
  gallery: "Homes we've lit",
  install_day: "How install day works",
  warranty: "The warranty",
  mockup: "Where your lights would go",
};

// How each page is laid out: the photo above a solid band, or the picture
// on the left 56% and the words on the right 44%.
export const PAGE_LAYOUT: Record<WordsPageKey, "band" | "split" | "picker"> = {
  what_vesper_is: "band",
  hidden_by_day: "band",
  whites_first: "band",
  light_picker: "picker",
  phone_control: "band",
  gallery: "band",
  install_day: "split",
  warranty: "split",
  mockup: "band",
};

export type PageWords = { headline: string; words: string; moreLabel: string; moreText: string };
export type DeckWords = { pages: Record<WordsPageKey, PageWords>; warrantyLinesUpFront: number };

const EMPTY_WORDS: PageWords = { headline: "", words: "", moreLabel: "", moreText: "" };

// Word for word on How install day works, as on the price (CLAUDE.md).
export const NO_PAYMENT_LINE = "No payment until your install is complete.";

const str = (value: unknown) => (typeof value === "string" ? value : "");

// settings.deck as stored, made safe: every page present, strings where
// strings belong. Unknown entries are ignored.
export function parseDeckWords(value: Json | null | undefined): DeckWords {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const pages = raw.pages && typeof raw.pages === "object" && !Array.isArray(raw.pages) ? (raw.pages as Record<string, unknown>) : {};
  const out = {} as Record<WordsPageKey, PageWords>;
  for (const key of WORDS_PAGES) {
    const page = pages[key] && typeof pages[key] === "object" ? (pages[key] as Record<string, unknown>) : {};
    out[key] = page
      ? { headline: str(page.headline), words: str(page.words), moreLabel: str(page.more_label), moreText: str(page.more_text) }
      : { ...EMPTY_WORDS };
  }
  const lines = Number(raw.warranty_lines_up_front);
  return { pages: out, warrantyLinesUpFront: Number.isInteger(lines) && lines >= 1 && lines <= 8 ? lines : 3 };
}

// Back to the stored shape, for the Settings save.
export function deckWordsToJson(words: DeckWords): Json {
  const pages: Record<string, Json> = {};
  for (const key of WORDS_PAGES) {
    const page = words.pages[key];
    pages[key] = { headline: page.headline, words: page.words, more_label: page.moreLabel, more_text: page.moreText };
  }
  return { version: 1, pages, warranty_lines_up_front: words.warrantyLinesUpFront };
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
export type ShotTime = "daylight" | "blue_hour" | "snowfall" | "install_day";

export const SHOT_TIMES: { key: ShotTime; label: string; note: string }[] = [
  { key: "daylight", label: "Daylight", note: "Bright overcast or open shade, the sun behind you." },
  { key: "blue_hour", label: "Blue hour", note: "15 to 30 minutes after sunset (about 4:45 pm in November), sky deep blue." },
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

export const DECK_SLOTS: DeckSlot[] = [
  { key: "what_vesper_is.hero", page: "what_vesper_is", name: "Whole house at dusk, warm white", scenario: "Warm white, steady, 15 to 30 minutes after that day's sunset while the sky is still deep blue. An ordinary Calgary two-storey with a front gable and an attached front garage, not a showhome. Tripod on the far sidewalk across the street at chest height, level, main 1x lens, straight on. Every run lit: eaves, gable and garage line. The house across the middle 70% of the width, the whole roofline inside the middle 60% of the height, a strip of sky above the peak, the empty driveway at the bottom. Porch light off, at most a lamp or two on inside, garage closed, no house number or plates. Exposure pulled down until every light is its own point, not a line. Landscape, at least 2732 px wide.", line: "The whole house straight on from across the street, every run lit.", when: "blue_hour", max: 1, fallback: "drawing_house", role: "hero" },
  { key: "what_vesper_is.more", page: "what_vesper_is", name: "Track up close, lit", scenario: "Same evening, warm white, steady. From the driveway about 2 m out and below one front eave corner, 1x or 2x, looking up about 45 degrees along the run: soffit, fascia edge and the track with 6 to 8 lights sharp as separate points and a soft wash on the soffit. Nothing else in frame. Expose on the nearest lights.", line: "Up close under one eave corner, looking along the lit track.", when: "blue_hour", max: 1, fallback: "drawing_eave", role: "more" },
  { key: "hidden_by_day.day", page: "hidden_by_day", name: "Day, from across the street", scenario: "Bright overcast, or the front in open shade with the sun behind the camera. Lights off, garage closed, driveway empty. Tripod on the far sidewalk, chest height, level, 1x, straight on, the whole roofline inside the middle 60% of the height. Shoot this first, mark the tripod spot, leave the zoom alone and wait for dusk.", line: "The whole house from across the street, lights off. Mark the tripod spot.", when: "daylight", max: 1, fallback: "drawing_day_night", role: "day" },
  { key: "hidden_by_day.night", page: "hidden_by_day", name: "Night, same spot", scenario: "Same tripod spot, framing and zoom, untouched, 15 to 30 minutes after sunset, warm white steady, exposure locked on the lights so each is a point, porch light off. Only the light changes, so the slider lines up to the pixel.", line: "From the same tripod spot, untouched, with the lights on.", when: "blue_hour", max: 1, fallback: "drawing_day_night", role: "night" },
  { key: "hidden_by_day.more", page: "hidden_by_day", name: "Track by day, up close", scenario: "Daylight in open shade, lights off. Standing on the front walk 6 to 8 m out at eye height, where a visitor stands, looking up at the eave over the front door or garage: the track as a thin line under the soffit, with the soffit and fascia in frame so its size reads against them. No ladder, tools, cables or house number.", line: "The track under the soffit from the front walk, lights off.", when: "daylight", max: 1, fallback: "drawing_eave", role: "more" },
  { key: "whites_first.hero", page: "whites_first", name: "Warm white, at an angle", scenario: "Warm white, steady, 15 to 30 minutes after sunset. A bungalow or bi-level from the end of the driveway at a three-quarter angle, 2x, the garage eave and front entry filling the frame so the eave runs away from the camera and the light washes down the siding or stone. No colour anywhere, porch light off, front door closed. Expose for the lit wall.", line: "The garage eave and front entry from the end of the driveway, at an angle.", when: "blue_hour", max: 1, fallback: "drawing_house_entry", role: "hero" },
  { key: "whites_first.warm", page: "whites_first", name: "Warm white, for the pair", scenario: "Tripod straight on to one front corner and a window at about 6 m, 1x, 15 to 30 minutes after sunset, warm white steady. Before shooting, set white balance to daylight in a camera app that can lock it (for example Lightroom or Halide; the iPhone's own Camera app can't), then press and hold on the lights for AE/AF Lock.", line: "One front corner and a window, straight on, in warm white.", when: "blue_hour", max: 1, fallback: "drawing_corners", role: "warm" },
  { key: "whites_first.cool", page: "whites_first", name: "Cool white, for the pair", scenario: "Without moving the tripod or unlocking anything, switch to cool white and shoot within 30 seconds of the warm shot, so the light is the only difference.", line: "The same frame in cool white, within 30 seconds of the warm one.", when: "blue_hour", max: 1, fallback: "drawing_corners", role: "cool" },
  { key: "phone_control.hero", page: "phone_control", name: "Phone in hand, house lit", scenario: "15 to 30 minutes after sunset, on the front walk about 8 m back, 2x. One hand holds the phone in the lower right third, screen to camera, the app's looks screen readable, screen brightness about half so it doesn't glare. Focus on the screen. The house behind in warm white, softly out of focus, the roofline crossing the upper third. No notifications, names, rings or watch; crop out the app's own name if it shows; no house number.", line: "A hand holding the phone, screen to the camera, the lit house soft behind.", when: "blue_hour", max: 1, fallback: "drawing_phone", role: "hero" },
  { key: "phone_control.screens", page: "phone_control", name: "App screens", scenario: "Two or three straight screenshots from your phone: the looks list, and on and off. Do Not Disturb on, nothing personal or from other apps visible, no device frame.", line: "Screenshots of the app's looks and of on and off. Any time.", when: "daylight", max: 3, fallback: "words", role: "more" },
  { key: "gallery.two_storey", page: "gallery", name: "Two-storey with a front garage, warm white", scenario: "Blue hour (15 to 30 minutes after sunset), warm white steady, straight on from across the street, 1x, level, the whole house and garage line lit, house across the middle 70% of the width, roofline inside the middle 60% of the height, porch light off, driveway empty, no house number.", line: "A two-storey with a front garage, straight on from across the street.", when: "blue_hour", max: 1, fallback: "skip", role: "gallery" },
  { key: "gallery.bungalow", page: "gallery", name: "Bungalow, warm white", scenario: "Blue hour, warm white steady, a bungalow with a low hip roof, from across the street about 20 degrees off straight on so the front eave and one side return both show, 1x, whole front eave and garage line lit.", line: "A bungalow from across the street, a little off straight on.", when: "blue_hour", max: 1, fallback: "skip", role: "gallery" },
  { key: "gallery.bi_level", page: "gallery", name: "Bi-level, warm white", scenario: "Blue hour, warm white steady, from the sidewalk at a slight angle so the split entry shows, 1x, whole front lit.", line: "A bi-level from the sidewalk, at a slight angle to show the entry.", when: "blue_hour", max: 1, fallback: "skip", role: "gallery" },
  { key: "gallery.snow", page: "gallery", name: "After a snowfall", scenario: "The evening after fresh snow, warm white steady, 15 to 30 minutes after sunset so the snow reads blue and the light warm, from across the street: snow on the roof and lawn, the lights clear under the soffit.", line: "A lit house the evening after fresh snow, from across the street.", when: "snowfall", max: 1, fallback: "skip", role: "gallery" },
  { key: "gallery.garage", page: "gallery", name: "Close at the garage", scenario: "Warm white at blue hour from the end of the driveway, the garage eave and front door in frame, close enough to see each light and the wash falling on the garage door.", line: "The garage eave and front door from the end of the driveway, close.", when: "blue_hour", max: 1, fallback: "skip", role: "gallery" },
  { key: "gallery.holiday", page: "gallery", name: "A holiday look", scenario: "Christmas (red, green and warm white in blocks) or Game night (red and amber), set to steady for the photo, blue hour, from across the street, the whole front, exposed on the brightest colour so each stays a clean point. Always last in the order.", line: "Christmas or Game night, set to steady, the whole front.", when: "blue_hour", max: 1, fallback: "skip", role: "gallery" },
  { key: "gallery.more", page: "gallery", name: "More installs", scenario: "Any other real Vesper install, shot to the standard above. Warm whites first, colour looks last. Caption each with the look only.", line: "Any other install, to the standard. Warm whites first.", when: "blue_hour", max: 24, fallback: "skip", role: "gallery" },
  { key: "install_day.hero", page: "install_day", name: "Fitting the track", scenario: "Daylight, bright overcast. A crew member in a Vesper jacket on a ladder fitting track under a front eave, a second person footing the ladder, faces turned to the work (faces only with their OK). From the lawn at about 45 degrees, 2x, ladder feet on mats, a tidy driveway, the work vehicle at the curb. Keep the ladder and eave inside the middle 50% of the width so the tall crop holds them.", line: "A crew member on a ladder fitting track, from the lawn.", when: "install_day", max: 1, fallback: "words", role: "hero" },
  { key: "install_day.more", page: "install_day", name: "Control box at the outlet", scenario: "Daylight, straight on from about 1 m: the control box beside the outlet it plugs into, cord run tidy along the wall, nothing else on the wall in frame.", line: "The control box beside its outlet, straight on, cord tidy.", when: "install_day", max: 1, fallback: "words", role: "more" },
  { key: "warranty.hero", page: "warranty", name: "Winter night, snow on the roof", scenario: "A clear evening after fresh snow, warm white steady, 15 to 30 minutes after sunset so the snow reads blue and the light warm. From the driveway 3 to 4 m back, 1x or 2x, an outside corner of the eave crossing the frame on a slight diagonal: snow along the roof edge above, the lights clean and even under the soffit. Keep the corner inside the middle 50% of the width for the tall crop. Porch light off, no house number.", line: "An eave corner on a diagonal, snow on the roof edge above the lights.", when: "snowfall", max: 1, fallback: "words", role: "hero" },
];

export const SLOT_BY_KEY = new Map(DECK_SLOTS.map((slot) => [slot.key, slot]));

export function slotsFor(page: WordsPageKey): DeckSlot[] {
  return DECK_SLOTS.filter((slot) => slot.page === page);
}

// The shooting standard, at the top of the shot list in Settings.
export const SHOOTING_STANDARD = "Every night shot: 15 to 30 minutes after that day's sunset (in Calgary in November, sunset is about 4:45 pm), sky deep blue, not black; tripod at chest height, level, main 1x lens (never 0.5x); exposure down until every light is its own point; porch light off and at most a lamp or two on inside, so no other light is credited to Vesper; garage closed and driveway empty; no house numbers, plates or faces (crew faces only with their OK); landscape, at least 2732 px wide; the roofline inside the middle 60% of the height, because the band crop keeps about 65% of a 4:3 photo's height. Day shots: bright overcast or open shade, sun behind the camera.";

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
