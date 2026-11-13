import "server-only";

import { deckLine, parseDeckLines } from "@/lib/deck";
import { leadName } from "@/lib/leads/status";
import { CUSTOM_CHOICE, leadTrackColour, sortTrackColours, trackColourText } from "@/lib/leads/track-colour";
import {
  buildDeckPayload,
  deckPhotoPathsToSign,
  pickerFrom,
  type DeckSettingsRow,
} from "@/lib/meeting/deck-pages";
import { pickEditableQuote, type DeckPayload, type MeetingPayload, type QuoteDraft } from "@/lib/meeting/state";
import { DECK_BUCKET } from "@/lib/photos-deck";
import { PHOTO_BUCKET } from "@/lib/photos";
import { blackFridayFrom } from "@/lib/quotes/black-friday";
import { CHRISTMAS_WORD_DEFAULTS, type ChristmasSettings } from "@/lib/quote-link/christmas";
import type { createClient } from "@/lib/supabase/server";
import { calgaryToday } from "@/lib/time";

// The meeting's payload, loaded once on the server (round 7). Server only,
// and read with the signed-in owner's own session: every table here is
// owner only by Row Level Security, so nothing else can load it.
//
// CONTRACT (the meeting page uses both; the rehearsal view's own server
// function reuses them, adding its reference shots separately, never here)
//   loadDeckPayload(supabase, { leadId, settings? })
//       the deck: settings.deck's words, Keenan's photos as signed storage
//       links (with the gallery's 640 px copies), the looks on offer, the
//       picker's photo and trace while the trace is still valid (leadId null:
//       no picker), the company line and the warranty
//   loadMeetingPayload(supabase, leadId)
//       everything meeting mode needs for one lead, deck included; null when
//       the lead or settings can't be read
//
// Signed links last an evening of meetings, so an iPad that saved tonight's
// meetings keeps working photos while the signal comes and goes.

export const SIGNED_URL_SECONDS = 12 * 3600;

type Supabase = Awaited<ReturnType<typeof createClient>>;

const DECK_SETTINGS = "deck, light_looks, company, warranty_text, service_call_fee, gst_enabled";

async function signAll(supabase: Supabase, bucket: string, paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, SIGNED_URL_SECONDS);
  return new Map((data ?? []).flatMap((item) => (item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [])));
}

const TRACE = "photo_id, photo_slot, lines, line_feet, scale, dusk_brightness, light_count";
const EMPTY_SETTINGS: DeckSettingsRow = { deck: {}, light_looks: [], company: {}, warranty_text: "", service_call_fee: null, gst_enabled: false };

// Keenan's deck photos, every one signed for the evening.
async function deckPhotos(supabase: Supabase) {
  const { data } = await supabase
    .from("deck_photos")
    .select("id, slot, path, thumb_path, focus_x, focus_y, caption, sort, created_at");
  const rows = data ?? [];
  return { rows, signed: await signAll(supabase, DECK_BUCKET, deckPhotoPathsToSign(rows)) };
}

export async function loadDeckPayload(
  supabase: Supabase,
  { leadId, settings }: { leadId: string | null; settings?: DeckSettingsRow },
): Promise<DeckPayload> {
  const [settingsRow, photos, trace, leadPhotos] = await Promise.all([
    settings
      ? Promise.resolve(settings)
      : supabase
          .from("settings")
          .select(DECK_SETTINGS)
          .eq("id", 1)
          .single()
          .then(({ data }) => data),
    deckPhotos(supabase),
    leadId
      ? supabase.from("roofline_traces").select(TRACE).eq("lead_id", leadId).maybeSingle().then(({ data }) => data)
      : Promise.resolve(null),
    leadId
      ? supabase.from("lead_photos").select("id, slot, storage_path").eq("lead_id", leadId).then(({ data }) => data ?? [])
      : Promise.resolve([]),
  ]);
  const tracePhoto = trace ? leadPhotos.find((photo) => photo.id === trace.photo_id) : undefined;
  const signedLead = await signAll(supabase, PHOTO_BUCKET, tracePhoto ? [tracePhoto.storage_path] : []);
  return buildDeckPayload({
    settings: settingsRow ?? EMPTY_SETTINGS,
    photos: photos.rows,
    signed: photos.signed,
    picker: pickerFrom(trace, leadPhotos, signedLead),
  });
}

export async function loadMeetingPayload(supabase: Supabase, leadId: string): Promise<MeetingPayload | null> {
  const [
    { data: lead },
    { data: settings },
    { data: colourRows },
    { data: ralRows },
    { data: leadPhotos },
    { data: mockupList },
    draft,
    { data: trace },
    deckPhotoRows,
    { data: linkOptions },
    { data: siteVisit },
    { data: agreementRow },
  ] = await Promise.all([
      supabase
        .from("leads")
        .select(
          "id, first_name, last_name, address_line, neighbourhood, soffit_colour, soffit_colour_2, track_colour_id, track_ral_code, track_colour_initials, track_colour_initialled_at, status",
        )
        .eq("id", leadId)
        .maybeSingle(),
      supabase.from("settings").select(`${DECK_SETTINGS}, ${PRICING_SETTINGS}`).eq("id", 1).single(),
      supabase.from("track_colours").select("id, name, ral_code, sort_order, active"),
      // The whole RAL Classic list (216 names), so a colour changed at the
      // table is named on the iPad the moment it is typed.
      supabase.from("ral_classic_colours").select("code, name"),
      supabase.from("lead_photos").select("id, slot, storage_path").eq("lead_id", leadId),
      supabase
        .from("lead_mockups")
        .select("id, name, storage_path, is_main, is_day, is_night, is_scene, offer_ids, position, created_at")
        .eq("lead_id", leadId)
        .is("removed_at", null)
        .order("position")
        .order("created_at"),
      editableQuotes(supabase, leadId),
      supabase.from("roofline_traces").select(TRACE).eq("lead_id", leadId).maybeSingle(),
      deckPhotos(supabase),
      // Round 17, Where you're at: the agreement tick, the site visit, and
      // whether Settings has an agreement at all (only a yes or no leaves
      // the server; the text never reaches the iPad).
      supabase.from("lead_link_options").select("agreement_to_sign").eq("lead_id", leadId).maybeSingle(),
      supabase.from("lead_site_visits").select("visit_on, done_at").eq("lead_id", leadId).maybeSingle(),
      supabase.from("settings").select("agreement_text").eq("id", 1).maybeSingle(),
    ]);
  if (!lead || !settings) return null;

  // The colour by name, exactly as the lead page says it.
  const colours = sortTrackColours(colourRows ?? []);
  const colourById = new Map(colours.map((colour) => [colour.id, colour]));
  const ralNames = Object.fromEntries((ralRows ?? []).map((row) => [row.code, row.name]));
  const trackColour = leadTrackColour(lead, colourById, new Map(Object.entries(ralNames)));

  // The customer's mockup, the photo the roofline was traced on, and (round
  // 9) their Front photo when there is no mockup and no trace, for Your
  // house, signed together. Only these of the lead's photos reach the iPad.
  const photos = leadPhotos ?? [];
  // Round 10: the mockups live in lead_mockups (the old slot was carried
  // over as each house's Main); the Main stands where the mockup stood.
  const mockupRows = mockupList ?? [];
  const mainRow = mockupRows.find((row) => row.is_main) ?? null;
  const mockup = mainRow ? { storage_path: mainRow.storage_path } : null;
  const tracePhoto = trace ? photos.find((photo) => photo.id === trace.photo_id) : undefined;
  const front = !mockup && !tracePhoto ? (photos.find((photo) => photo.slot === "front") ?? null) : null;
  const signedLeadPhotos = await signAll(
    supabase,
    PHOTO_BUCKET,
    [...mockupRows.map((row) => row.storage_path), tracePhoto?.storage_path, front?.storage_path].filter((path): path is string => Boolean(path)),
  );
  const mockups = mockupRows
    .flatMap((row) => {
      const url = signedLeadPhotos.get(row.storage_path);
      return url
        ? [{ id: row.id, name: row.name, url, main: row.is_main, day: row.is_day, night: row.is_night, scene: row.is_scene, offers: row.offer_ids ?? [] }]
        : [];
    })
    .sort((a, b) => Number(b.main) - Number(a.main));

  const deck = buildDeckPayload({
    settings,
    photos: deckPhotoRows.rows,
    signed: deckPhotoRows.signed,
    picker: pickerFrom(trace, photos, signedLeadPhotos),
  });

  return {
    lead: {
      id: lead.id,
      name: leadName(lead),
      firstName: lead.first_name ?? "",
      addressLine: lead.address_line,
      neighbourhood: lead.neighbourhood,
      soffitColour: lead.soffit_colour,
      soffitColour2: lead.soffit_colour_2,
      colourKind: trackColour.kind,
      colourText: trackColourText(trackColour),
      initials: lead.track_colour_initials,
      initialledAt: lead.track_colour_initialled_at,
      progress: {
        sign: Boolean(linkOptions?.agreement_to_sign) && Boolean(agreementRow?.agreement_text?.trim()),
        siteVisitOn: siteVisit?.visit_on ?? null,
        siteVisitDone: Boolean(siteVisit?.done_at),
        installed: lead.status === "installed",
      },
    },
    deck,
    colours: {
      list: colours,
      ralNames,
      choice: lead.track_ral_code ? CUSTOM_CHOICE : lead.track_colour_id,
      ralCode: lead.track_ral_code,
    },
    mockupUrl: mockup ? (signedLeadPhotos.get(mockup.storage_path) ?? null) : null,
    mockups,
    frontPhotoUrl: front ? (signedLeadPhotos.get(front.storage_path) ?? null) : null,
    pricing: pricingFrom(settings),
    draft,
    today: calgaryToday(),
  };
}

// ---------------------------------------------------------------- the quote

// The prices Settings gives a new quote (shared with the lead page's quote
// editor, lib/quotes/editor-data.ts).
export const PRICING_SETTINGS =
  "price_per_ft, box_price, neighbour_discount, gst_enabled, gst_rate, gst_number, rush_colour_fee, upper_access_fee, upper_gable_access_fee, price_hold_days, min_job_total, black_friday_kind, black_friday_value, double_track_per_ft, j_track_per_ft, christmas_banner_on, christmas_book_by_white, christmas_book_by_colour, christmas_season_end, christmas_banner_book_by, christmas_banner_white, christmas_banner_colour, christmas_banner_no_colour, christmas_banner_after, deck";

type PricingRow = {
  price_per_ft: number;
  box_price: number;
  neighbour_discount: number;
  gst_enabled: boolean;
  gst_rate: number;
  gst_number: string | null;
  rush_colour_fee: number | null;
  upper_access_fee: number | null;
  upper_gable_access_fee: number | null;
  price_hold_days: number;
  min_job_total: number | null;
  black_friday_kind?: string | null;
  black_friday_value?: number | null;
  double_track_per_ft?: number | null;
  j_track_per_ft?: number | null;
  christmas_banner_on?: boolean;
  christmas_book_by_white?: string | null;
  christmas_book_by_colour?: string | null;
  christmas_season_end?: string | null;
  christmas_banner_book_by?: string;
  christmas_banner_white?: string;
  christmas_banner_colour?: string;
  christmas_banner_no_colour?: string;
  christmas_banner_after?: string;
  // Round 18: the deck's words, for the controller line's two lines.
  deck?: unknown;
};

// Round 17: the Christmas banner's dates and words while it is on and dated.
function christmasFrom(settings: PricingRow): ChristmasSettings | null {
  const white = settings.christmas_book_by_white ?? null;
  const end = settings.christmas_season_end ?? null;
  if (!settings.christmas_banner_on || !white || !end) return null;
  return {
    bookByWhite: white,
    bookByColour: settings.christmas_book_by_colour ?? white,
    seasonEnd: end,
    words: {
      bookBy: settings.christmas_banner_book_by ?? CHRISTMAS_WORD_DEFAULTS.bookBy,
      white: settings.christmas_banner_white ?? CHRISTMAS_WORD_DEFAULTS.white,
      colour: settings.christmas_banner_colour ?? CHRISTMAS_WORD_DEFAULTS.colour,
      noColour: settings.christmas_banner_no_colour ?? CHRISTMAS_WORD_DEFAULTS.noColour,
      after: settings.christmas_banner_after ?? CHRISTMAS_WORD_DEFAULTS.after,
    },
  };
}

export function pricingFrom(settings: PricingRow): MeetingPayload["pricing"] {
  return {
    pricePerFt: settings.price_per_ft,
    boxPrice: settings.box_price,
    neighbourDiscount: settings.neighbour_discount,
    gstEnabled: settings.gst_enabled,
    gstRate: settings.gst_rate,
    gstNumber: settings.gst_number,
    rushFee: settings.rush_colour_fee,
    upperAccessFee: settings.upper_access_fee,
    upperGableAccessFee: settings.upper_gable_access_fee,
    priceHoldDays: settings.price_hold_days,
    minJobTotal: settings.min_job_total,
    blackFriday: blackFridayFrom(settings),
    trackPrices: { double: settings.double_track_per_ft ?? null, j: settings.j_track_per_ft ?? null },
    christmas: christmasFrom(settings),
    // Read on the server only; a browser has no such variable and reads no.
    polishReady: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    controller: controllerFrom(settings.deck),
  };
}

// Round 18: the controller line's words from Settings (deck lines).
function controllerFrom(deck: unknown): { label: string; detail: string } {
  const lines = parseDeckLines(deck && typeof deck === "object" ? (deck as { lines?: unknown }).lines : undefined);
  return { label: deckLine(lines, "controller_label"), detail: deckLine(lines, "controller_detail") };
}

const QUOTE_COLUMNS =
  "id, status, runs, box_count, price_per_ft, box_price, adders, discounts, colour_timing, rush_fee, upper_access_fee, upper_gable_access_fee, min_job_total, financing_offered, valid_until, offers, meeting_offer, meeting_install_on, accepted_offer, updated_at";

// The quote meeting mode and the lead page's editor open (round 9): the
// accepted one while the lead has one, read only, otherwise its draft (one
// per lead). Null with neither.
export async function editableQuotes(supabase: Supabase, leadId: string): Promise<QuoteDraft | null> {
  const { data } = await supabase
    .from("quotes")
    .select(QUOTE_COLUMNS)
    .eq("lead_id", leadId)
    .in("status", ["draft", "accepted"])
    .order("created_at", { ascending: false })
    .limit(10);
  const row = pickEditableQuote(data ?? []);
  if (!row) return null;
  return {
    quoteId: row.id,
    runs: row.runs,
    boxCount: row.box_count,
    pricePerFt: row.price_per_ft,
    boxPrice: row.box_price,
    adders: row.adders,
    discounts: row.discounts,
    colourTiming: row.colour_timing,
    rushFee: row.rush_fee,
    upperAccessFee: row.upper_access_fee,
    upperGableAccessFee: row.upper_gable_access_fee,
    minJobTotal: row.min_job_total,
    financingOffered: row.financing_offered,
    validUntil: row.valid_until,
    offers: row.offers,
    meetingOffer: row.meeting_offer,
    meetingInstallOn: row.meeting_install_on,
    accepted: row.status === "accepted",
    acceptedOffer: row.status === "accepted" ? row.accepted_offer : null,
    updatedAt: row.updated_at,
  };
}
