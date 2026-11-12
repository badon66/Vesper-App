// The meeting's pages as lib/meeting/deck-pages.ts deckPages builds them
// (round 9, the meeting as one story), for the walk-throughs: in the spec's
// order, each labelled by its headline from settings.deck (or the code's
// fallback), skipping a page with nothing to show, with the stand-ins of
// the spec's table: Your house, lit (the mockup) stands in for Your house
// when the roofline isn't traced, and Warm white for the light picker when
// there is neither a trace nor a mockup. Plain JavaScript, so it runs from
// a walk-through without the app's build.

// lib/deck.ts HEADLINE_FALLBACK: a page's name on screen while its headline is empty.
export const HEADLINE_FALLBACK = {
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

// lib/deck.ts PAGE_DEFAULTS: the round 9 pages' words for a deck saved before them.
const PAGE_DEFAULTS = {
  your_house: { headline: "Your house", words: "We measured {feet} ft of roofline." },
  next_steps: { headline: "What happens next", words: "" },
};

// The lines the walk-throughs read (lib/deck.ts DECK_LINE_DEFAULTS).
export const LINE_DEFAULTS = {
  cover_line: "What it is, your house lit up, and your price.",
  cover_prepared: "Prepared for the {family} home",
  cover_prepared_first: "Prepared for {name}",
  cover_what: "Permanent lighting, up once and there all year.",
  cover_point_1: "10-year warranty",
  cover_point_2: "Run it from your phone",
  cover_point_3: "Made for Calgary winters",
  next_prefix: "Next: {page}",
  colour_headline: "Your track colour",
  colour_opener: "By day you see the track, so you choose its colour.",
  colour_one: "One track colour for the whole house.",
  colour_stock: "White is in stock and included.",
  colour_made: "{colour} is made to order.",
  colour_book: "Screens can't show colour exactly, so we choose it from the colour book together.",
  price_headline: "Your price",
  price_sub_many: "{Count} options, all with {colour} track.",
  price_sub_one: "With {colour} track.",
  price_empty: "Your options show here once we've measured.",
  price_held: "Price held until {date}.",
  whats_in: "What's in {name}",
  choose: "Choose {name}",
  your_choice: "Your choice",
  price_lowest: "Already at our lowest price.",
  price_feet: "{feet} ft of lights",
  recap: "Your choice: {name}, {total}",
  step_colour_label: "Your colour",
  step_colour_todo: "We confirm it with you from the colour book.",
  step_day_label: "Your install day",
  step_day_none: "We pick the day together.",
  step_day_button: "Pick a day",
  step_on_day_label: "On the day",
  step_pay_label: "Paying",
  closing: "We'll text you a link to this quote, with every option.",
  link_drawing_caption: "Gold marks the lights in {name}.",
  link_meeting_tag: "Your choice at the meeting",
  link_something_else: "Want something different? Call or text Keenan.",
  link_mockup_caption: "Our mockup shows every run lit.",
  link_colour_done: "{colour}, confirmed with your initials at the meeting.",
  price_includes: "Every option includes the control box, install by our own crew and our 10-year warranty.",
};

const str = (value) => (typeof value === "string" ? value : "");

// settings.deck's words for one page, as parseDeckWords reads them.
export function pageWords(deck, key) {
  const pages = deck && typeof deck === "object" && deck.pages && typeof deck.pages === "object" ? deck.pages : {};
  const page = pages[key];
  if (!page || typeof page !== "object") return { headline: "", words: "", ...(PAGE_DEFAULTS[key] ?? {}) };
  return { headline: str(page.headline), words: str(page.words), moreLabel: str(page.more_label), moreText: str(page.more_text) };
}

// A line as parseDeckLines reads it: stored and not empty, else ours.
export function deckLine(deck, key) {
  const stored = str(deck?.lines?.[key]).trim();
  return stored !== "" ? stored : LINE_DEFAULTS[key];
}

// lib/deck.ts fillLine.
export function fillLine(template, values) {
  return template
    .replace(/\{([^{}]*)\}/g, (_, name) => (Object.hasOwn(values, name) && values[name] !== null && values[name] !== undefined ? String(values[name]) : ""))
    .replace(/\s+([,.:;?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function pageLabel(deck, key) {
  if (key === "cover") return "Vesper";
  if (key === "colour") return deckLine(deck, "colour_headline");
  if (key === "quote") return deckLine(deck, "price_headline");
  return pageWords(deck, key).headline.trim() || HEADLINE_FALLBACK[key];
}


// The looks a meeting offers (lib/deck.ts parseLooks, activeLooks), counted.
export function activeLookCount(lightLooks) {
  if (!Array.isArray(lightLooks)) return 0;
  const seen = new Set();
  let count = 0;
  for (const look of lightLooks) {
    if (!look || typeof look !== "object") continue;
    const key = str(look.key).trim();
    const name = str(look.name).trim();
    const colours = (Array.isArray(look.colours) ? look.colours : []).filter((c) => /^#[0-9A-Fa-f]{6}$/.test(str(c?.hex)));
    if (!key || !name || seen.has(key) || colours.length === 0) continue;
    seen.add(key);
    if (look.active !== false) count += 1;
  }
  return Math.min(count, 6);
}

// The pages a meeting shows for a lead, in order: [{ key, label }]
// (round 10, lib/meeting/deck-pages.ts deckPages: a page missing its mockup
// is skipped).
//   settings     deck and warranty_text (and light_looks for the picker)
//   lead         { traced, main, day, night, scenes }: whether the lead has
//                a Main mockup, a Day one, a Night one, and how many scene
//                mockups. mockup is read as main, for older callers.
export function deckOrder(settings, { lead }) {
  const deck = settings.deck;
  const main = Boolean(lead.main ?? lead.mockup);
  const shows = {
    cover: true,
    what_vesper_is: main,
    hidden_by_day: Boolean(lead.day) && Boolean(lead.night),
    phone_control: Number(lead.scenes ?? 0) > 0,
    warranty: true,
    // Round 10 follow-up (Keenan, 2026-11-11): the picker never shows, traced or not.
    light_picker: false,
    quote: true,
    next_steps: true,
  };
  return Object.keys(shows)
    .filter((key) => shows[key])
    .map((key) => ({ key, label: pageLabel(deck, key) }));
}

// "Next: Hidden by day", as the deck writes it beside the forward chevron.
export function nextLabelText(deck, label) {
  return fillLine(deckLine(deck, "next_prefix"), { page: label });
}
