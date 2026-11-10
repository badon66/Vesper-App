import "server-only";
import { PHOTO_BUCKET } from "@/lib/photos";
import { parseOffers } from "@/lib/quotes/offers";
import type { createClient } from "@/lib/supabase/server";
import type { LeadMockupItem, MockupOffer } from "@/lib/leads/mockup-roles";

export type { LeadMockupItem, MockupOffer } from "@/lib/leads/mockup-roles";

// The Mockups section's facts (round 10): the lead's mockups, signed for an
// hour, in Keenan's order, and the offers on the same quote the Quote card
// shows (the latest draft, presented or accepted one), for the "for an
// offer" chips. Owner only: the database returns nothing to anyone else,
// and the pages call this only for Keenan, never under View as.
export async function loadLeadMockups(
  supabase: Awaited<ReturnType<typeof createClient>>,
  leadId: string,
): Promise<{ mockups: LeadMockupItem[]; offers: MockupOffer[] }> {
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
  const list = rows ?? [];
  const signed =
    list.length > 0
      ? ((await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(list.map((row) => row.storage_path), 3600)).data ?? [])
      : [];
  const urlByPath = new Map(signed.flatMap((item) => (item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [])));
  const runCount = Array.isArray(quoteRow?.runs) ? quoteRow.runs.length : 0;
  const offers = quoteRow ? parseOffers(quoteRow.offers, runCount).map((offer) => ({ id: offer.id, name: offer.name })) : [];
  return {
    mockups: list.map((row) => ({
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
