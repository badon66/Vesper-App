import "server-only";
import { PHOTO_BUCKET } from "@/lib/photos";
import { parseOffers } from "@/lib/quotes/offers";
import type { createClient } from "@/lib/supabase/server";
import type { LeadMockupItem, MockupOffer } from "@/lib/leads/mockup-roles";

export type { LeadMockupItem, MockupOffer } from "@/lib/leads/mockup-roles";

// The Mockups section's facts (round 10): the lead's mockups, signed for an
// hour, in Keenan's order, and the offers on the same quote the Quote card
// shows (the latest draft, presented or accepted one), to say which offers
// use each picture. Owner only: the database returns nothing to anyone
// else, and the pages call this only for Keenan, never under View as.
// Round 13: in two halves, so the lead page reads the rows with everything
// else it asks for first, and signs the pictures alongside the rest after.
type MockupRow = {
  id: string;
  storage_path: string;
  name: string;
  is_main: boolean;
  is_day: boolean;
  is_night: boolean;
  is_scene: boolean;
  offer_ids: string[] | null;
};
export type LeadMockupRows = { rows: MockupRow[]; offers: MockupOffer[] };

export async function loadLeadMockupRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  leadId: string,
): Promise<LeadMockupRows> {
  const [{ data: rows }, { data: quoteRow }] = await Promise.all([
    supabase
      .from("lead_mockups")
      .select("id, storage_path, name, is_main, is_day, is_night, is_scene, offer_ids, position, created_at")
      .eq("lead_id", leadId)
      .is("removed_at", null)
      .order("position")
      .order("created_at"),
    supabase
      .from("quotes")
      .select("runs, offers")
      .eq("lead_id", leadId)
      .in("status", ["draft", "presented", "accepted"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const runCount = Array.isArray(quoteRow?.runs) ? quoteRow.runs.length : 0;
  const offers = quoteRow
    ? parseOffers(quoteRow.offers, runCount).map((offer) => ({ id: offer.id, name: offer.name, ...(offer.hidden ? { hidden: true } : {}) }))
    : [];
  return { rows: rows ?? [], offers };
}

export async function signLeadMockups(
  supabase: Awaited<ReturnType<typeof createClient>>,
  { rows, offers }: LeadMockupRows,
): Promise<{ mockups: LeadMockupItem[]; offers: MockupOffer[] }> {
  const signed =
    rows.length > 0
      ? ((await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(rows.map((row) => row.storage_path), 3600)).data ?? [])
      : [];
  const urlByPath = new Map(signed.flatMap((item) => (item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [])));
  return {
    mockups: rows.map((row) => ({
      id: row.id,
      url: urlByPath.get(row.storage_path) ?? null,
      name: row.name,
      main: row.is_main,
      day: row.is_day,
      night: row.is_night,
      scene: row.is_scene,
      offers: row.offer_ids ?? [],
    })),
    offers,
  };
}

export async function loadLeadMockups(
  supabase: Awaited<ReturnType<typeof createClient>>,
  leadId: string,
): Promise<{ mockups: LeadMockupItem[]; offers: MockupOffer[] }> {
  return signLeadMockups(supabase, await loadLeadMockupRows(supabase, leadId));
}
