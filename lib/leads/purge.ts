import "server-only";
import { PHOTO_BUCKET } from "@/lib/photos";
import { isLeadUploadPath, LINK_DOCUMENTS_BUCKET } from "@/lib/quote-link/documents";
import { createAdminClient } from "@/lib/supabase/admin";

// Round 20 (Keenan, 2026-11-14): a deleted lead stays in Deleted for 30
// days, then it's removed for good: the lead, its quotes, links, photos,
// mockups and files. Keenan approved this removal.
//
// It runs from Keenan's own visits (Admin > Deleted, and his Home after the
// page is sent), never from a setter's request or under View as, and never
// from a migration (CLAUDE.md rule 4 keeps removal out of the database
// connector). The secret key is needed because a deleted lead is out of
// every read of the table, Keenan's included, and its files sit in private
// buckets; this is the one owner-only path that uses it on app tables.
//
// A lead that can't be deleted (an accepted quote, or booking pay or
// commission that isn't void) never reaches Deleted, so nothing here can
// take away a sale or someone's pay. Void earnings go with the lead.

export const DELETED_DAYS = 30;
const BATCH = 20;

export function goneAfter(deletedAt: string): Date {
  return new Date(Date.parse(deletedAt) + DELETED_DAYS * 24 * 60 * 60 * 1000);
}

// Removes every lead deleted more than 30 days ago. Returns how many went.
// Quiet on failure: a lead that couldn't be removed stays in Deleted and is
// tried again on the next visit.
export async function purgeExpiredLeads(now: Date = new Date()): Promise<number> {
  const admin = createAdminClient();
  const cutoff = new Date(now.getTime() - DELETED_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: due } = await admin
    .from("leads")
    .select("id")
    .not("deleted_at", "is", null)
    .lt("deleted_at", cutoff)
    .limit(BATCH);
  let removed = 0;
  for (const row of due ?? []) {
    if (await removeLeadForGood(admin, row.id, cutoff)) removed += 1;
  }
  return removed;
}

type Admin = ReturnType<typeof createAdminClient>;

async function removeLeadForGood(admin: Admin, leadId: string, cutoff: string): Promise<boolean> {
  // Check again, as it is now: still deleted past the 30 days, and nothing
  // that would have stopped the delete has appeared since.
  const { data: lead } = await admin.from("leads").select("id, deleted_at").eq("id", leadId).maybeSingle();
  if (!lead?.deleted_at || lead.deleted_at >= cutoff) return false;
  const [{ count: accepted }, { count: pay }] = await Promise.all([
    admin.from("quotes").select("id", { count: "exact", head: true }).eq("lead_id", leadId).eq("status", "accepted"),
    admin.from("earnings").select("id", { count: "exact", head: true }).eq("lead_id", leadId).neq("status", "void"),
  ]);
  if ((accepted ?? 0) > 0 || (pay ?? 0) > 0) return false;

  // The files first, while the rows still say where they are.
  const [{ data: photos }, { data: mockups }, { data: documents }] = await Promise.all([
    admin.from("lead_photos").select("storage_path").eq("lead_id", leadId),
    admin.from("lead_mockups").select("storage_path").eq("lead_id", leadId),
    admin.from("lead_link_documents").select("storage_path").eq("lead_id", leadId),
  ]);
  const photoPaths = [...(photos ?? []), ...(mockups ?? [])].map((row) => row.storage_path).filter(Boolean) as string[];
  // Only the customer's own uploads; a standard document from Settings is shared.
  const documentPaths = (documents ?? [])
    .map((row) => row.storage_path)
    .filter((path): path is string => typeof path === "string" && isLeadUploadPath(leadId, path));
  if (photoPaths.length > 0) await admin.storage.from(PHOTO_BUCKET).remove(photoPaths);
  if (documentPaths.length > 0) await admin.storage.from(LINK_DOCUMENTS_BUCKET).remove(documentPaths);

  // Then the rows, children before parents.
  const steps: (() => PromiseLike<{ error: unknown }>)[] = [
    () => admin.from("earnings").delete().eq("lead_id", leadId),
    () => admin.from("quote_revisions").delete().eq("lead_id", leadId),
    () => admin.from("agreement_signatures").delete().eq("lead_id", leadId),
    () => admin.from("lead_link_documents").delete().eq("lead_id", leadId),
    () => admin.from("lead_link_options").delete().eq("lead_id", leadId),
    () => admin.from("lead_site_visits").delete().eq("lead_id", leadId),
    () => admin.from("slot_holds").delete().eq("lead_id", leadId),
    () => admin.from("meetings").update({ rebooked_as: null }).eq("lead_id", leadId),
    () => admin.from("meetings").delete().eq("lead_id", leadId),
    () => admin.from("quote_links").delete().eq("lead_id", leadId),
    () => admin.from("quotes").delete().eq("lead_id", leadId),
    () => admin.from("roofline_traces").delete().eq("lead_id", leadId),
    () => admin.from("lead_mockups").delete().eq("lead_id", leadId),
    // lead_photos and lead_events go with the lead (on delete cascade).
    () => admin.from("leads").delete().eq("id", leadId).not("deleted_at", "is", null),
  ];
  for (const step of steps) {
    const { error } = await step();
    if (error) return false;
  }
  return true;
}
