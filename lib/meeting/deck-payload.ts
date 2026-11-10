import "server-only";

import { leadName } from "@/lib/leads/status";
import { CUSTOM_CHOICE, leadTrackColour, sortTrackColours, trackColourText } from "@/lib/leads/track-colour";
import {
  buildDeckPayload,
  deckPhotoPathsToSign,
  pickerFrom,
  type DeckSettingsRow,
} from "@/lib/meeting/deck-pages";
import type { DeckPayload, MeetingPayload } from "@/lib/meeting/state";
import { DECK_BUCKET } from "@/lib/photos-deck";
import { PHOTO_BUCKET } from "@/lib/photos";
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
    { data: draft },
    { data: trace },
    deckPhotoRows,
  ] = await Promise.all([
      supabase
        .from("leads")
        .select(
          "id, first_name, last_name, address_line, neighbourhood, soffit_colour, soffit_colour_2, track_colour_id, track_ral_code, track_colour_initials, track_colour_initialled_at",
        )
        .eq("id", leadId)
        .maybeSingle(),
      supabase
        .from("settings")
        .select(
          `${DECK_SETTINGS}, price_per_ft, box_price, neighbour_discount, gst_enabled, gst_rate, gst_number, rush_colour_fee, upper_access_fee, upper_gable_access_fee, price_hold_days, min_job_total`,
        )
        .eq("id", 1)
        .single(),
      supabase.from("track_colours").select("id, name, ral_code, sort_order, active"),
      // The whole RAL Classic list (216 names), so a colour changed at the
      // table is named on the iPad the moment it is typed.
      supabase.from("ral_classic_colours").select("code, name"),
      supabase.from("lead_photos").select("id, slot, storage_path").eq("lead_id", leadId),
      supabase
        .from("quotes")
        .select(
          "id, runs, box_count, price_per_ft, box_price, adders, discounts, colour_timing, rush_fee, upper_access_fee, upper_gable_access_fee, financing_offered, valid_until, updated_at",
        )
        .eq("lead_id", leadId)
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("roofline_traces").select(TRACE).eq("lead_id", leadId).maybeSingle(),
      deckPhotos(supabase),
    ]);
  if (!lead || !settings) return null;

  // The colour by name, exactly as the lead page says it.
  const colours = sortTrackColours(colourRows ?? []);
  const colourById = new Map(colours.map((colour) => [colour.id, colour]));
  const ralNames = Object.fromEntries((ralRows ?? []).map((row) => [row.code, row.name]));
  const trackColour = leadTrackColour(lead, colourById, new Map(Object.entries(ralNames)));

  // The customer's mockup and the photo the roofline was traced on, signed
  // together. Only those two of the lead's photos ever reach the iPad.
  const photos = leadPhotos ?? [];
  const mockup = photos.find((photo) => photo.slot === "mockup") ?? null;
  const tracePhoto = trace ? photos.find((photo) => photo.id === trace.photo_id) : undefined;
  const signedLeadPhotos = await signAll(
    supabase,
    PHOTO_BUCKET,
    [mockup?.storage_path, tracePhoto?.storage_path].filter((path): path is string => Boolean(path)),
  );

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
    },
    deck,
    colours: {
      list: colours,
      ralNames,
      choice: lead.track_ral_code ? CUSTOM_CHOICE : lead.track_colour_id,
      ralCode: lead.track_ral_code,
    },
    mockupUrl: mockup ? (signedLeadPhotos.get(mockup.storage_path) ?? null) : null,
    pricing: {
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
    },
    draft: draft
      ? {
          quoteId: draft.id,
          runs: draft.runs,
          boxCount: draft.box_count,
          pricePerFt: draft.price_per_ft,
          boxPrice: draft.box_price,
          adders: draft.adders,
          discounts: draft.discounts,
          colourTiming: draft.colour_timing,
          rushFee: draft.rush_fee,
          upperAccessFee: draft.upper_access_fee,
          upperGableAccessFee: draft.upper_gable_access_fee,
          financingOffered: draft.financing_offered,
          validUntil: draft.valid_until,
          updatedAt: draft.updated_at,
        }
      : null,
    today: calgaryToday(),
  };
}
