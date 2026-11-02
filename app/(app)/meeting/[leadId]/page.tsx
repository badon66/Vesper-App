import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { MeetingMode } from "@/components/meeting/meeting-mode";
import type { MeetingPayload } from "@/lib/meeting/state";
import { NotForYourRole } from "@/components/not-for-your-role";
import { getViewer } from "@/lib/auth/profile";
import { leadName } from "@/lib/leads/status";
import { leadTrackColour, sortTrackColours, trackColourText } from "@/lib/leads/track-colour";
import { pageHasContent, parsePresentation } from "@/lib/presentation";
import { PHOTO_BUCKET } from "@/lib/photos";
import { createClient } from "@/lib/supabase/server";
import { calgaryToday } from "@/lib/time";

export const metadata: Metadata = {
  title: "Meeting",
};

// Signed links long enough for an evening of meetings, so an iPad that
// cached the page keeps working photos while the signal comes and goes.
const SIGNED_URL_SECONDS = 12 * 3600;

// Meeting mode (M5): Keenan at the kitchen table, iPad in landscape,
// customer watching. Everything the meeting needs is loaded here, once,
// and handed to the client whole, so weak signal in the house changes
// nothing after this page opens. Owner only: this screen prices the house.
export default async function MeetingPage({ params }: { params: Promise<{ leadId: string }> }) {
  const { profile } = await getViewer();
  if (profile.role !== "owner") return <NotForYourRole />;

  const { leadId } = await params;
  if (!z.uuid().safeParse(leadId).success) notFound();

  const supabase = await createClient();
  const [{ data: lead }, { data: settings }, { data: colourRows }] = await Promise.all([
    supabase
      .from("leads")
      .select(
        "id, first_name, last_name, address_line, neighbourhood, soffit_colour, soffit_note, track_colour_id, track_ral_code, track_colour_initials, track_colour_initialled_at",
      )
      .eq("id", leadId)
      .maybeSingle(),
    supabase
      .from("settings")
      .select(
        "presentation, warranty_text, price_per_ft, box_price, neighbour_discount, gst_enabled, gst_rate, gst_number, rush_colour_fee_per_ft, service_call_fee, quote_valid_days",
      )
      .eq("id", 1)
      .single(),
    supabase.from("track_colours").select("id, name, ral_code, sort_order, active"),
  ]);
  if (!lead || !settings) notFound();

  // The colour by name, exactly as the lead page says it.
  const colours = sortTrackColours(colourRows ?? []);
  const colourById = new Map(colours.map((colour) => [colour.id, colour]));
  const listColour = lead.track_colour_id ? colourById.get(lead.track_colour_id) : undefined;
  const ralCodes = [lead.track_ral_code, listColour?.ral_code].filter((code): code is string => Boolean(code));
  const { data: ralRows } =
    ralCodes.length > 0
      ? await supabase.from("ral_classic_colours").select("code, name").in("code", ralCodes)
      : { data: [] };
  const trackColour = leadTrackColour(lead, colourById, new Map((ralRows ?? []).map((row) => [row.code, row.name])));

  // The presentation, with its photos signed for the evening. Pages with
  // nothing in them are dropped here, so the iPad never shows one empty.
  const pages = parsePresentation(settings.presentation).filter((page) =>
    pageHasContent(page, settings.warranty_text),
  );
  const presentationPaths = Array.from(new Set(pages.flatMap((page) => page.image_paths.filter(Boolean))));
  const { data: signedPresentation } =
    presentationPaths.length > 0
      ? await supabase.storage.from("presentation").createSignedUrls(presentationPaths, SIGNED_URL_SECONDS)
      : { data: [] };
  const presentationUrl = new Map(
    (signedPresentation ?? []).flatMap((item) => (item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [])),
  );

  // The customer's mockup, and the lead's one draft quote.
  const [{ data: mockupRow }, { data: draft }] = await Promise.all([
    supabase
      .from("lead_photos")
      .select("storage_path")
      .eq("lead_id", lead.id)
      .eq("slot", "mockup")
      .maybeSingle(),
    supabase
      .from("quotes")
      .select(
        "id, runs, box_count, price_per_ft, box_price, adders, discounts, colour_timing, rush_fee_per_ft, financing_offered, valid_until, updated_at",
      )
      .eq("lead_id", lead.id)
      .eq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const mockupUrl = mockupRow
    ? (await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(mockupRow.storage_path, SIGNED_URL_SECONDS)).data
        ?.signedUrl ?? null
    : null;

  const payload: MeetingPayload = {
    lead: {
      id: lead.id,
      name: leadName(lead),
      firstName: lead.first_name ?? "",
      addressLine: lead.address_line,
      neighbourhood: lead.neighbourhood,
      soffitColour: lead.soffit_colour,
      soffitNote: lead.soffit_note,
      colourKind: trackColour.kind,
      colourText: trackColourText(trackColour),
      initials: lead.track_colour_initials,
      initialledAt: lead.track_colour_initialled_at,
    },
    pages: pages.map((page) => ({
      kind: page.kind,
      title: page.title,
      body: page.body,
      images: page.image_paths.map((path) => (path ? (presentationUrl.get(path) ?? null) : null)),
    })),
    warrantyText: settings.warranty_text,
    serviceCallFee: settings.service_call_fee,
    mockupUrl,
    pricing: {
      pricePerFt: settings.price_per_ft,
      boxPrice: settings.box_price,
      neighbourDiscount: settings.neighbour_discount,
      gstEnabled: settings.gst_enabled,
      gstRate: settings.gst_rate,
      gstNumber: settings.gst_number,
      rushFeePerFt: settings.rush_colour_fee_per_ft,
      quoteValidDays: settings.quote_valid_days,
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
          financingOffered: draft.financing_offered,
          validUntil: draft.valid_until,
          updatedAt: draft.updated_at,
        }
      : null,
    today: calgaryToday(),
  };

  return <MeetingMode payload={payload} />;
}
