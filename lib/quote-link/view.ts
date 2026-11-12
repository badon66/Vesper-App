// The customer quote link (2026-11-02), kept pure: what the database's
// quote_for_customer answer means, each option's price (round 9, the
// options Keenan made in place of Start smaller), which option the page
// opens on, the next steps in the meeting's words, the link itself and the
// text Keenan sends. No React and no network, so it is unit tested like the
// pricing it feeds, and the page and the server share it.

import { AREA_KINDS } from "@/lib/quotes/areas";
import { z } from "zod";
import {
  cleanFeet,
  formatMoney,
  priceQuote,
  RUN_PARTS,
  runPart,
  runTrack,
  screenTotal,
  selectRuns,
  trackFields,
  TRACK_TYPES,
  usablePercent,
  type TrackType,
  type ColourTiming,
  type QuoteInputs,
  type QuoteLineItem,
  type QuoteRun,
  type QuoteTotals,
} from "@/lib/pricing";
import { deckLine, fillLine, NO_PAYMENT_LINE, parseDeckLines, type DeckLines } from "@/lib/deck";
import {
  CUSTOMER_OFFER_ID,
  CUSTOMER_OFFER_NAME,
  OWN_OPTION,
  isCustomerOffer,
  parseOffers,
  priceOffer,
  shownOffers,
  type PricedOffer,
  type QuoteOffer,
} from "@/lib/quotes/offers";
import { formatLongDay } from "@/lib/time";
import { CHRISTMAS_WORD_DEFAULTS, isWhiteTrack, type ChristmasSettings } from "@/lib/quote-link/christmas";

// The token's shape, as the database makes it: 24 base64url characters.
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{24}$/;

export type Company = { name: string; phone: string; email: string; address: string };

// The line icons a product point can have (Settings offers these; anything
// else shows as a tick).
export const POINT_ICONS = [
  "lightbulb",
  "house",
  "zap",
  "smartphone",
  "plug",
  "shield-check",
  "paintbrush",
  "sun",
  "snowflake",
  "wrench",
  "clock",
  "check",
] as const;
export type PointIcon = (typeof POINT_ICONS)[number];
export type ProductPoint = { icon: PointIcon; text: string };

export type CustomerQuote = {
  state: "live";
  firstName: string;
  lastName: string | null;
  address: string;
  city: string | null;
  // The day the quote's prices are held until, and Calgary's date today
  // from the database, so the page never trusts the phone's clock for it.
  validUntil: string | null;
  today: string | null;
  quote: {
    runs: QuoteRun[];
    runsFingerprint: string;
    pricePerFt: number;
    boxPrice: number;
    boxCount: number;
    adders: { label: string; amount: number; upperOnly: boolean }[];
    // percent: a line worked out on the option being priced (Black Friday
    // as a percent, 2026-11-11), so switching options switches its amount.
    discounts: QuoteLineItem[];
    colourTiming: ColourTiming | null;
    // The quote's flat rush colour fee and upper access amounts
    // (2026-11-04); null on a quote made before then, so no line.
    rushFee: number | null;
    upperAccessFee: number | null;
    upperGableAccessFee: number | null;
    minJobTotal: number | null;
    gstEnabled: boolean;
    gstRate: number;
    // The track colour the quote was made with, by name; null until set.
    trackColourName: string | null;
    trackCustom: boolean;
    // The options (round 9), cleaned the way the database cleans them; a
    // quote made before them reads as one Full wrap covering every run.
    offers: QuoteOffer[];
    // "Financing is available. Just ask." shows only while this is on.
    financingOffered: boolean;
    // The option chosen at the table (an offer id), if any.
    meetingOffer: string | null;
    // Once Keenan marks the quote accepted: the page shows only what was
    // agreed, and acceptedOffer names the option (null on a quote accepted
    // before options).
    accepted: boolean;
    acceptedOffer: string | null;
  };
  warranty: string;
  // Warranty years 6 to 10 (Settings); null hides its line.
  serviceCallFee: number | null;
  // Round 17: the Christmas banner's dates and words while Keenan has it on
  // and the season hasn't ended (the database decides, by Calgary's date);
  // lib/quote-link/christmas.ts picks the date for their track colour.
  christmas: ChristmasSettings | null;
  productPoints: ProductPoint[];
  // What happens next: whether the colour was initialled at the meeting,
  // the planned install day (the lead's, else the one picked at the table),
  // and What we'll need, in the meeting's own words.
  nextSteps: NextStepsData;
  // The presentation gallery's photo paths: Vesper's own installs.
  gallery: string[];
  company: Company;
  mockupPath: string | null;
  // Positions of the runs they last looked at; null = every run. Kept for
  // Keenan's card on links from before options.
  selection: number[] | null;
  // The option they last looked at, and the one they booked (offer ids).
  selectionOffer: string | null;
  bookedOffer: string | null;
  bookedAt: string | null;
  // The booked option's name as it was when they booked.
  bookedOption: string | null;
  // The page's words, the meeting's own where they are shared.
  words: LinkWords;
};

export type NextStepsData = { colourConfirmed: boolean; installOn: string | null; whatWeNeed: string | null };

// A link Keenan turned off, or one that never existed. Links don't expire
// (2026-11-04): prices are held until a date, and the page still works after.
export type ClosedQuote = { state: "closed"; company: Company };

// Vesper's contact when Settings has none (only for a blank field).
export const FALLBACK_COMPANY: Company = {
  name: "Vesper Lighting",
  phone: "(403) 895-9915",
  email: "info@vesperlighting.ca",
  address: "448 Strathcona Drive SW, Calgary, AB T3H 1M3",
};

const text = z.string().nullable().optional().catch(null);
const number = z.coerce.number().catch(0);

const companySchema = z
  .object({ name: text, phone: text, email: text, address: text })
  .catch({ name: null, phone: null, email: null, address: null })
  .transform(
    (c): Company => ({
      name: c.name?.trim() || FALLBACK_COMPANY.name,
      phone: c.phone?.trim() || FALLBACK_COMPANY.phone,
      email: c.email?.trim() || FALLBACK_COMPANY.email,
      address: c.address?.trim() || FALLBACK_COMPANY.address,
    }),
  );

const runSchema = z.object({
  name: z.string().catch(""),
  feet: number,
  level: z.enum(["lower", "upper"]).catch("lower"),
  // The part of the house (2026-11-04); a run saved before then has none,
  // and its name gives the guess.
  part: z.enum(RUN_PARTS).nullable().optional().catch(null),
  // Round 11, quoting by area: kept so each area prices as Keenan set it.
  area: z.enum(AREA_KINDS).nullable().optional().catch(null),
  gable: z.boolean().nullable().optional().catch(null),
  rate: z.coerce.number().nullable().optional().catch(null),
  flat: z.coerce.number().nullable().optional().catch(null),
  // Take 3: Double or J track, and that track's price a foot on the quote.
  track: z.enum(TRACK_TYPES).nullable().optional().catch(null),
  trackRate: z.coerce.number().nullable().optional().catch(null),
});

const quoteSchema = z.object({
  runs: z.array(runSchema).catch([]),
  runs_fingerprint: z.string().catch(""),
  price_per_ft: number,
  box_price: number,
  box_count: number,
  adders: z
    .array(z.object({ label: z.string().catch(""), amount: number, upper_only: z.boolean().optional().catch(false) }))
    .catch([]),
  discounts: z
    .array(
      z.object({
        label: z.string().catch(""),
        amount: number,
        percent: z.coerce.number().nullable().optional().catch(null),
      }),
    )
    .catch([]),
  colour_timing: z.enum(["stock", "factory_order", "rush"]).nullable().catch(null),
  rush_fee: z.coerce.number().nullable().optional().catch(null),
  upper_access_fee: z.coerce.number().nullable().optional().catch(null),
  upper_gable_access_fee: z.coerce.number().nullable().optional().catch(null),
  min_job_total: z.coerce.number().nullable().catch(null),
  gst_enabled: z.boolean().catch(false),
  gst_rate: number,
  track_colour_name: z.string().nullable().optional().catch(null),
  track_custom: z.boolean().optional().catch(false),
  offers: z.unknown().optional(),
  financing_offered: z.boolean().optional().catch(false),
  meeting_offer: z.string().nullable().optional().catch(null),
  accepted: z.boolean().optional().catch(false),
  accepted_offer: z.string().nullable().optional().catch(null),
});

function toQuote(q: z.infer<typeof quoteSchema>): CustomerQuote["quote"] {
  return {
    offers: parseOffers(q.offers, q.runs.length),
    financingOffered: q.financing_offered === true,
    meetingOffer: q.meeting_offer?.trim() || null,
    accepted: q.accepted === true,
    acceptedOffer: q.accepted === true ? q.accepted_offer?.trim() || null : null,
    runs: q.runs.map((run) => ({
      name: run.name,
      feet: run.feet,
      level: run.level,
      part: runPart(run),
      ...(run.area ? { area: run.area } : {}),
      ...(typeof run.gable === "boolean" ? { gable: run.gable } : {}),
      ...(typeof run.rate === "number" && run.rate > 0 ? { rate: run.rate } : {}),
      ...(typeof run.flat === "number" && run.flat >= 0 ? { flat: run.flat } : {}),
      ...trackFields(run),
    })),
    runsFingerprint: q.runs_fingerprint,
    pricePerFt: q.price_per_ft,
    boxPrice: q.box_price,
    boxCount: q.box_count,
    adders: q.adders.map((a) => ({ label: a.label, amount: a.amount, upperOnly: a.upper_only === true })),
    discounts: q.discounts.map((d) => {
      const percent = usablePercent(d.percent);
      return percent !== null ? { label: d.label, amount: d.amount, percent } : { label: d.label, amount: d.amount };
    }),
    colourTiming: q.colour_timing,
    rushFee: q.rush_fee ?? null,
    upperAccessFee: q.upper_access_fee ?? null,
    upperGableAccessFee: q.upper_gable_access_fee ?? null,
    minJobTotal: q.min_job_total,
    gstEnabled: q.gst_enabled,
    gstRate: q.gst_rate,
    trackColourName: q.track_colour_name?.trim() || null,
    trackCustom: q.track_custom === true,
  };
}

// A quotes row (Keenan's side), read the same way the customer's page reads
// it, so the lead page and the link always show the same total.
export function quoteFromRow(row: unknown): CustomerQuote["quote"] | null {
  const parsed = quoteSchema.safeParse(row);
  return parsed.success ? toQuote(parsed.data) : null;
}

const pointSchema = z.object({
  icon: z.enum(POINT_ICONS).catch("check"),
  text: z.string().catch(""),
});

const liveSchema = z.object({
  state: z.literal("live"),
  first_name: z.string(),
  last_name: z.string().nullable().catch(null),
  address: z.string(),
  city: z.string().nullable().catch(null),
  valid_until: z.string().nullable().catch(null),
  today: z.string().nullable().optional().catch(null),
  quote: quoteSchema,
  warranty: z.string().catch(""),
  service_call_fee: z.coerce.number().nullable().optional().catch(null),
  christmas: z
    .object({
      book_by_white: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      book_by_colour: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().catch(null),
      season_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      words: z
        .object({
          book_by: z.string().catch(CHRISTMAS_WORD_DEFAULTS.bookBy),
          white: z.string().catch(CHRISTMAS_WORD_DEFAULTS.white),
          colour: z.string().catch(CHRISTMAS_WORD_DEFAULTS.colour),
          no_colour: z.string().catch(CHRISTMAS_WORD_DEFAULTS.noColour),
          after: z.string().catch(CHRISTMAS_WORD_DEFAULTS.after),
        })
        .catch({
          book_by: CHRISTMAS_WORD_DEFAULTS.bookBy,
          white: CHRISTMAS_WORD_DEFAULTS.white,
          colour: CHRISTMAS_WORD_DEFAULTS.colour,
          no_colour: CHRISTMAS_WORD_DEFAULTS.noColour,
          after: CHRISTMAS_WORD_DEFAULTS.after,
        }),
    })
    .nullable()
    .optional()
    .catch(null),
  product_points: z.array(pointSchema.catch({ icon: "check", text: "" })).catch([]),
  next_steps: z
    .object({
      colour_confirmed: z.boolean().catch(false),
      install_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().catch(null),
      what_we_need: z.string().nullable().catch(null),
    })
    .nullable()
    .optional()
    .catch(null),
  gallery: z.array(z.string()).catch([]),
  company: companySchema,
  mockup_path: z.string().nullable().catch(null),
  selection: z.array(z.number().int()).nullable().catch(null),
  selection_offer: text,
  booked_offer: text,
  booked_at: z.string().nullable().catch(null),
  booked_option: z.string().nullable().catch(null),
  // The meeting's words from settings.deck.lines, when the database hands
  // them over; otherwise the defaults below, which are the same words.
  lines: z.record(z.string(), z.unknown()).nullable().optional().catch(null),
});

// The database's answer, as the page uses it. Anything that isn't a live
// quote, however it arrives, is the closed screen.
export function parseCustomerQuote(data: unknown): CustomerQuote | ClosedQuote {
  const live = liveSchema.safeParse(data);
  if (!live.success) {
    const company = companySchema.parse(
      data && typeof data === "object" ? (data as { company?: unknown }).company : undefined,
    );
    return { state: "closed", company };
  }
  const v = live.data;
  const fee = v.service_call_fee ?? null;
  const christmas: ChristmasSettings | null = v.christmas
    ? {
        bookByWhite: v.christmas.book_by_white,
        bookByColour: v.christmas.book_by_colour ?? v.christmas.book_by_white,
        seasonEnd: v.christmas.season_end,
        words: {
          bookBy: v.christmas.words.book_by,
          white: v.christmas.words.white,
          colour: v.christmas.words.colour,
          noColour: v.christmas.words.no_colour,
          after: v.christmas.words.after,
        },
      }
    : null;
  return {
    state: "live",
    firstName: v.first_name,
    lastName: v.last_name,
    address: v.address,
    city: v.city,
    validUntil: v.valid_until,
    today: v.today ?? null,
    quote: toQuote(v.quote),
    warranty: v.warranty,
    serviceCallFee: fee !== null && Number.isFinite(fee) && fee > 0 ? fee : null,
    christmas,
    productPoints: v.product_points
      .map((point) => ({ icon: point.icon, text: point.text.trim() }))
      .filter((point) => point.text !== ""),
    nextSteps: {
      colourConfirmed: v.next_steps?.colour_confirmed === true,
      installOn: v.next_steps?.install_on ?? null,
      whatWeNeed: v.next_steps?.what_we_need?.trim() || null,
    },
    gallery: v.gallery.filter((path) => path.trim() !== ""),
    company: v.company,
    mockupPath: v.mockup_path,
    selection: v.selection,
    selectionOffer: v.selection_offer?.trim() || null,
    bookedOffer: v.booked_offer?.trim() || null,
    bookedAt: v.booked_at,
    bookedOption: v.booked_option,
    words: parseDeckLines(v.lines),
  };
}

// ---------------------------------------------------------------- the words

// The page's words (round 9): settings.deck.lines, the same map and the
// same defaults as meeting mode (lib/deck.ts), so the four steps, the
// shared price lines and the stock colour line read the same on the iPad
// and the link, and the link's own lines (link_*) are Keenan's to edit in
// Settings too. Until the database hands the map over, the defaults are
// the words.
export type LinkWords = DeckLines;

// The track colour section's lines (round 17, Keenan, 2026-11-12): one
// colour rule, the same as Your price in the meeting. White is in stock and
// included. Any other colour is made to order: installed this season at no
// extra cost by default, or in spring; a rush fee is Keenan's choice on a
// quote and is named only when he charged it (this season with an amount),
// so a link never mentions a fee its customer isn't paying. The words are
// the meeting's own (colour_stock, colour_made and the two timing buttons).
// The old September to November window is gone: the Christmas banner runs
// by Keenan's dates instead (lib/quote-link/christmas.ts).
export function colourSectionLines({
  words,
  colourName,
  custom,
  timing,
  rushFee,
}: {
  words: DeckLines;
  colourName: string | null;
  custom: boolean;
  timing: ColourTiming | null;
  rushFee: number | null;
}): { stock: string | null; other: string | null; made: string | null; timing: string | null } {
  const name = (colourName ?? "").trim();
  const madeToOrder = custom || (name !== "" && !isWhiteTrack(name));
  if (!madeToOrder) {
    return { stock: deckLine(words, "colour_stock"), other: "Any other colour is made to order at no extra cost.", made: null, timing: null };
  }
  const fee = timing === "rush" && rushFee !== null && Number.isFinite(rushFee) && rushFee > 0 ? rushFee : null;
  const lowerFirst = (text: string) => (text ? text.charAt(0).toLowerCase() + text.slice(1) : text);
  const when =
    timing === "factory_order"
      ? `${deckLine(words, "colour_spring_label")}, ${lowerFirst(deckLine(words, "colour_spring_value"))}.`
      : `${deckLine(words, "colour_season_label")}, ${lowerFirst(
          fee === null ? deckLine(words, "colour_season_included") : deckLine(words, "colour_season_value", { fee: formatMoney(fee) }),
        )}.`;
  return { stock: null, other: null, made: deckLine(words, "colour_made", { colour: name || "Your colour" }), timing: when };
}

// Whether the price hold has passed: after the valid-until date (Calgary),
// the page still works and says prices may have changed. Today comes from
// the database; without it, the hold counts as not passed.
export function priceHoldPassed(validUntil: string | null, today: string | null): boolean {
  return validUntil !== null && today !== null && validUntil < today;
}

// Positions that are on this quote, sorted, without repeats; null when
// they cover every run (the Recommended package) or nothing usable is left.
export function cleanSelection(runCount: number, positions: readonly number[] | null): number[] | null {
  if (positions === null) return null;
  const kept = Array.from(new Set(positions.filter((p) => Number.isInteger(p) && p >= 0 && p < runCount))).sort(
    (a, b) => a - b,
  );
  return kept.length === 0 || kept.length === runCount ? null : kept;
}

// The pricing inputs for the runs they have on: the quote's own prices,
// never Settings, so the link always matches what was quoted.
export function customerInputs(quote: CustomerQuote["quote"], positions: readonly number[] | null): QuoteInputs {
  return {
    runs: selectRuns(quote.runs, cleanSelection(quote.runs.length, positions)),
    boxCount: quote.boxCount,
    pricePerFt: quote.pricePerFt,
    boxPrice: quote.boxPrice,
    adders: quote.adders.map((a) => ({ label: a.label, amount: a.amount, ...(a.upperOnly ? { upperOnly: true } : {}) })),
    discounts: quote.discounts,
    colourTiming: quote.colourTiming,
    rushFee: quote.colourTiming === "rush" ? quote.rushFee : null,
    upperAccessFee: quote.upperAccessFee,
    upperGableAccessFee: quote.upperGableAccessFee,
    minJobTotal: quote.minJobTotal,
    gstEnabled: quote.gstEnabled,
    gstRate: quote.gstRate,
    colourName: quote.trackColourName,
  };
}

export function priceSelection(quote: CustomerQuote["quote"], positions: readonly number[] | null): QuoteTotals {
  return priceQuote(customerInputs(quote, positions));
}

// The total as a customer reads it: "$3,450 + GST" while GST is on.
export function customerTotal(quote: CustomerQuote["quote"], positions: readonly number[] | null): string {
  return screenTotal(priceSelection(quote, positions).subtotal, quote.gstEnabled);
}

// ---------------------------------------------------------------- the options

// The options a customer sees (round 9): those covering at least one run,
// each priced with the quote's own prices and its own box count, biggest
// first, the same order as the iPad (lib/quotes/offers.ts).
export function linkOffers(quote: CustomerQuote["quote"]): PricedOffer[] {
  return shownOffers(customerInputs(quote, null), quote.offers);
}

// One option by id, named and priced the way the customer reads it. Null
// when the quote has no such option or it covers no run. Book my install's
// total on the server comes from here, from the stored quote, never from
// the browser.
export function offerChoice(
  quote: CustomerQuote["quote"],
  offerId: string | null,
): { id: string; name: string; total: string; totals: QuoteTotals; offer: QuoteOffer } | null {
  if (!offerId) return null;
  // Never a hidden one (round 13): the customer can't see or book it.
  const offer = quote.offers.find((candidate) => candidate.id === offerId && candidate.hidden !== true);
  const totals = offer ? priceOffer(customerInputs(quote, null), offer) : null;
  if (!offer || !totals) return null;
  return { id: offer.id, name: offer.name, total: screenTotal(totals.subtotal, quote.gstEnabled), totals, offer };
}

// Which option the page opens on: the one they booked, else the one chosen
// at the meeting, else the biggest. Null when no option covers a run.
export function openingOffer(
  shown: readonly PricedOffer[],
  { booked, meeting }: { booked: string | null; meeting: string | null },
): string | null {
  for (const id of [booked, meeting]) {
    if (id && shown.some((priced) => priced.offer.id === id)) return id;
  }
  return shown[0]?.offer.id ?? null;
}

// ---------------------------------------------------------------- Build your own (take 3)

// The areas a customer can tick in Build your own (Keenan, 2026-11-11):
// measured (feet over 0) and in one of the options Keenan shows them, never
// one only in an option he hid, in the quote's order. The database allows
// exactly these (quote_link_book_custom).
export function buildableRuns(quote: Pick<CustomerQuote["quote"], "runs" | "offers">): number[] {
  const wanted = new Set<number>();
  for (const offer of quote.offers) {
    if (offer.hidden === true || isCustomerOffer(offer)) continue;
    for (const at of offer.runs) {
      if (at >= 0 && at < quote.runs.length && cleanFeet(quote.runs[at].feet) > 0) wanted.add(at);
    }
  }
  return [...wanted].sort((a, b) => a - b);
}

// Whether Build your own is worth offering: two areas or more to choose
// from, on a quote not yet accepted.
export function offersBuildYourOwn(quote: Pick<CustomerQuote["quote"], "runs" | "offers" | "accepted">): boolean {
  return !quote.accepted && buildableRuns(quote).length > 1;
}

// Their own option, priced like any other with the quote's own prices: the
// areas they ticked (buildable ones only), the box count of the option they
// started from, upper access at the automatic amount, and the quote's
// discounts, minimum and GST. Null with nothing ticked. The server books it
// from the same positions and prices it again from the stored quote.
export function customOption(
  quote: CustomerQuote["quote"],
  runs: readonly number[],
  fromOfferId: string | null,
): { offer: QuoteOffer; totals: QuoteTotals } | null {
  const allowed = new Set(buildableRuns(quote));
  const picked = [...new Set(runs)].filter((at) => allowed.has(at)).sort((a, b) => a - b);
  if (picked.length === 0) return null;
  const from = quote.offers.find((offer) => offer.id === fromOfferId && offer.hidden !== true && !isCustomerOffer(offer));
  const offer: QuoteOffer = {
    id: CUSTOMER_OFFER_ID,
    name: CUSTOMER_OFFER_NAME,
    runs: picked,
    boxes: from?.boxes ?? null,
    upperAccess: null,
    fromCustomer: true,
  };
  const totals = priceOffer(customerInputs(quote, null), offer);
  return totals ? { offer, totals } : null;
}

// The customer's own last build, if the quote still has it.
export function customerOffer(quote: Pick<CustomerQuote["quote"], "offers">): QuoteOffer | null {
  return quote.offers.find((offer) => isCustomerOffer(offer) && offer.hidden !== true) ?? null;
}

// ---------------------------------------------------------------- About your track (take 3)

// The track types the options on the link use (Hat, then Double, then J):
// About your track explains these and no others.
export function tracksUsed(quote: Pick<CustomerQuote["quote"], "runs" | "offers">): TrackType[] {
  const used = new Set<TrackType>();
  for (const offer of quote.offers) {
    if (offer.hidden === true) continue;
    for (const at of offer.runs) {
      const run = quote.runs[at];
      if (run && cleanFeet(run.feet) > 0) used.add(runTrack(run));
    }
  }
  return TRACK_TYPES.filter((track) => used.has(track));
}

// ---------------------------------------------------------------- documents and the agreement (take 3)

// A document the link shows, with a ten-minute link to open it on the
// phone and one that downloads it.
export type LinkDocument = { id: string; name: string; contentType: string; size: number; url: string; downloadUrl: string };

// What quote_link_documents hands the server: the files to sign.
export type LinkDocumentFile = { id: string; name: string; path: string; contentType: string; size: number };

const documentSchema = z.object({
  id: z.string(),
  name: z.string().catch(""),
  path: z.string(),
  content_type: z.string().catch("application/pdf"),
  size: z.coerce.number().catch(0),
});

export function parseLinkDocuments(data: unknown): LinkDocumentFile[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((item) => {
    const parsed = documentSchema.safeParse(item);
    if (!parsed.success || parsed.data.path.trim() === "") return [];
    const d = parsed.data;
    return [{ id: d.id, name: d.name.trim() || "Document", path: d.path, contentType: d.content_type, size: d.size }];
  });
}

// The file name a download is saved under: the document's name and its
// type's ending, with nothing a phone would refuse in a file name.
export function documentFileName(name: string, contentType: string): string {
  const base = name.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Document";
  const ending = contentType === "application/pdf" ? ".pdf" : contentType === "image/png" ? ".png" : contentType === "image/webp" ? ".webp" : ".jpg";
  return base.toLowerCase().endsWith(ending) ? base : `${base}${ending}`;
}

// The agreement on the link: its text from Settings, and the signing on
// this link once there is one. Null: the lead doesn't have Agreement to
// sign on, or Settings has no text.
export type LinkAgreement = {
  text: string;
  signed: { signerName: string; signedAt: string; offerId: string; offerName: string } | null;
};

const agreementSchema = z.object({
  text: z.string(),
  signed: z
    .object({ signer_name: z.string(), signed_at: z.string(), offer_id: z.string().catch(""), offer_name: z.string().catch("") })
    .nullable()
    .optional()
    .catch(null),
});

export function parseLinkAgreement(data: unknown): LinkAgreement | null {
  const parsed = agreementSchema.safeParse(data);
  if (!parsed.success || parsed.data.text.trim() === "") return null;
  const s = parsed.data.signed;
  return {
    text: parsed.data.text.trim(),
    signed: s ? { signerName: s.signer_name, signedAt: s.signed_at, offerId: s.offer_id, offerName: s.offer_name } : null,
  };
}

// ---------------------------------------------------------------- what happens next

export type NextStep = { key: "colour" | "day" | "on_day" | "pay"; label: string; text: string; done: boolean };

// The meeting's four steps in the same words (round 9, section 4): the
// colour, read back from the initials taken at the meeting; the install
// day if one is planned; the day itself; and paying.
export function nextStepsFor(view: Pick<CustomerQuote, "nextSteps" | "words"> & { quote: Pick<CustomerQuote["quote"], "trackColourName"> }): NextStep[] {
  const w = view.words;
  const { colourConfirmed, installOn } = view.nextSteps;
  return [
    {
      key: "colour",
      label: w.step_colour_label,
      text: colourConfirmed ? fillLine(w.link_colour_done, { colour: view.quote.trackColourName ?? "Your track colour" }) : w.step_colour_todo,
      done: colourConfirmed,
    },
    { key: "day", label: w.step_day_label, text: installOn ? formatLongDay(installOn) : w.step_day_none, done: installOn !== null },
    { key: "on_day", label: w.step_on_day_label, text: w.step_on_day, done: false },
    { key: "pay", label: w.step_pay_label, text: NO_PAYMENT_LINE, done: false },
  ];
}

// What Keenan gets in touch about once they ask to book: with an install
// day already planned (What happens next shows it), confirming that day;
// otherwise setting one (the critique, 2026-11-10).
export function inTouchAbout(installOn: string | null): string {
  return installOn ? "to confirm your install day" : "to set your install date";
}

// The mockup shows every run lit, so its caption shows only when the
// option on screen leaves a run out. No option, no caption.
export function leavesRunsOut(runCount: number, positions: readonly number[] | null | undefined): boolean {
  if (!positions || runCount <= 0) return false;
  const covered = new Set(positions.filter((at) => Number.isInteger(at) && at >= 0 && at < runCount));
  return covered.size < runCount;
}

// A run's name, never blank.
export function runName(run: QuoteRun, position: number): string {
  return run.name.trim() || `Run ${position + 1}`;
}

// The option in words, the same way the database names it on Book my
// install: never a price.
export function optionName(runs: QuoteRun[], positions: readonly number[] | null): string {
  const kept = cleanSelection(runs.length, positions);
  if (kept === null) return "Recommended package";
  return `Start smaller: ${kept.map((p) => runName(runs[p], p)).join(", ")}`;
}

// The option the way people say it. Since round 9 a booking names one of
// Keenan's options ("Main floor"), which reads as it is. A link booked
// before then named the runs: "Recommended package", "Garage only",
// "Front and Garage", "Front, Front upper and Garage" (the database kept
// the plain form, "Start smaller: Front, Garage"); this is for reading.
export function choiceLabel(option: string): string {
  if (option === "Recommended package" || !/^Start smaller:/.test(option)) return option;
  const names = option
    .replace(/^Start smaller:\s*/, "")
    .split(/,\s*/)
    .map((name) => name.trim())
    .filter(Boolean);
  if (names.length === 0) return option;
  if (names.length === 1) return `${names[0]} only`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// The same inside a sentence: "the Recommended package", or the parts.
export function choiceInSentence(option: string): string {
  return option === "Recommended package" ? "the Recommended package" : choiceLabel(option);
}

// The customer's own words for it (2026-11-04): the page calls everything
// they were quoted "the full quote"; "Recommended package" stays the name
// the database and Keenan's card use.
// The customer's own build (take 3) is saved under Keenan's name for it,
// "Custom quote (from the customer)"; to the customer it is their own option
// (OWN_OPTION, lib/quotes/offers.ts).
export function customerChoice(option: string): string {
  if (option === CUSTOMER_OFFER_NAME) return OWN_OPTION;
  return option === "Recommended package" ? "The full quote" : choiceLabel(option);
}

export function customerChoiceInSentence(option: string): string {
  if (option === CUSTOMER_OFFER_NAME) return "your own option";
  return option === "Recommended package" ? "the full quote" : choiceLabel(option);
}

// "64 ft, upper level"
export function runDetail(run: QuoteRun): string {
  return `${Math.max(0, Math.round(run.feet))} ft, ${run.level === "upper" ? "upper" : "lower"} level`;
}

// The link, from the base address (QUOTE_BASE_URL or the app's own).
export function quoteLinkUrl(base: string, token: string): string {
  return `${base.replace(/\/+$/, "")}/q/${token}`;
}

// The text Keenan can edit and send from his own phone. Plain, no dashes,
// no promises beyond what the quote says.
export function quoteLinkMessage({
  firstName,
  link,
  validUntil,
  phone,
}: {
  firstName: string;
  link: string;
  validUntil: string | null;
  phone: string;
}): string {
  const hello = firstName.trim() ? `Hi ${firstName.trim()}, here's your Vesper quote:` : "Here's your Vesper quote:";
  const held = validUntil ? `Your price is held until ${formatLongDay(validUntil)}. ` : "";
  return `${hello}\n${link}\n\n${held}When you're ready, tap Book my install, or call or text me with any questions.\n\nKeenan, Vesper Lighting\n${phone}`;
}

// tel: and sms: want the digits; Canadian numbers get the +1.
export function phoneHref(phone: string, scheme: "tel" | "sms"): string {
  const digits = phone.replace(/\D/g, "");
  const full = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith("1") ? `+${digits}` : digits;
  return `${scheme}:${full}`;
}

// A text to Vesper that starts with a line they can keep or delete
// (2026-11-04): Keenan can place it whoever sends it. "?&body=" opens with
// the words on both iPhone and Android.
export function smsWithBody(phone: string, body: string): string {
  return `${phoneHref(phone, "sms")}?&body=${encodeURIComponent(body)}`;
}

// The breakdown's money, as the page shows it: a true minus for discounts.
export const lineAmount = (amount: number) => (amount < 0 ? `\u2212${formatMoney(-amount)}` : formatMoney(amount));

// Mockups per house (round 10): the pictures the link may show, from
// quote_link_mockups: the Main and the ones Keenan marked for offers, Main
// first. Paths only; the server signs each for a live token. Round 13: the
// house's phone scenes come too, each by name, for the Looks row of "See it
// on your house" (only a scene carries a name), and an offer's picture
// comes only while that offer is shown to the customer.
export type LinkMockup = { path: string; main: boolean; scene: boolean; name: string; offers: string[] };

const linkMockupSchema = z.object({
  path: z.string().min(1),
  main: z.boolean().catch(false),
  scene: z.boolean().catch(false),
  name: z.string().catch(""),
  offers: z.array(z.string()).catch([]),
});

export function parseLinkMockups(data: unknown): LinkMockup[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((item) => {
    const parsed = linkMockupSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

// A mockup the page may show, signed for ten minutes (lib/quote-link/server.ts).
export type LinkPicture = { url: string; main: boolean; scene: boolean; name: string; offers: string[] };

// The Main picture, or none.
export function mainPicture<T extends { main: boolean }>(pictures: readonly T[]): T | null {
  return pictures.find((picture) => picture.main) ?? null;
}

// The picture for an option (Keenan, 2026-11-10): its own (a picture marked
// for that offer), else the Main, else none. own says which it is, so the
// Main's caption can say it shows every run.
export function offerPicture<T extends { main: boolean; offers: readonly string[] }>(
  pictures: readonly T[],
  offerId: string | null | undefined,
): { picture: T; own: boolean } | null {
  const own = offerId ? pictures.find((picture) => picture.offers.includes(offerId)) : undefined;
  if (own) return { picture: own, own: true };
  const main = mainPicture(pictures);
  return main ? { picture: main, own: false } : null;
}

// ---------------------------------------------------------------- see it on your house

// "See it on your house" (round 13, Keenan, 2026-11-11): one picture of
// their house with two rows of buttons under it. Looks are the house's
// phone scenes by name (Christmas, Halloween, Warm white); Options are the
// offers they are shown.

// The Looks row: the scenes with a name, in Keenan's order, each name once.
export function linkLooks<T extends { scene: boolean; name: string }>(pictures: readonly T[]): T[] {
  const seen = new Set<string>();
  return pictures.filter((picture) => {
    const name = picture.name.trim();
    if (!picture.scene || name === "" || seen.has(name.toLowerCase())) return false;
    seen.add(name.toLowerCase());
    return true;
  });
}

// The picture on screen: the look they tapped, else the option's own
// picture, else the Main, else none. kind says which, for the caption (only
// an option's own picture shows exactly what that option covers).
export function seeItPicture<T extends { main: boolean; scene: boolean; name: string; offers: readonly string[] }>(
  pictures: readonly T[],
  offerId: string | null | undefined,
  look: string | null,
): { picture: T; kind: "look" | "own" | "main" } | null {
  const scene = look ? linkLooks(pictures).find((picture) => picture.name.trim() === look) : undefined;
  if (scene) return { picture: scene, kind: "look" };
  const chosen = offerPicture(pictures, offerId);
  return chosen ? { picture: chosen.picture, kind: chosen.own ? "own" : "main" } : null;
}

// Whether the page shows the section with its rows: there is a picture, and
// something to switch (a look, or more than one option). With one option
// and no scene the picture sits in Your price, as before.
export function showsSeeIt(pictures: readonly { scene: boolean; name: string }[], optionCount: number): boolean {
  return pictures.length > 0 && (linkLooks(pictures).length > 0 || optionCount > 1);
}
