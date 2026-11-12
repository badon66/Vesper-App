import "server-only";
import { LINK_DOCUMENTS_BUCKET, documentFacts } from "@/lib/quote-link/documents";
import type { createClient } from "@/lib/supabase/server";
import { calgaryDateOf, formatLongDay, formatTime } from "@/lib/time";

// What the lead page's "On their link" card shows (quote link take 3,
// Keenan, 2026-11-11): Keenan's standard documents with this lead's ticks,
// the files uploaded for this customer only, Agreement to sign (and whether
// Settings has the agreement's text yet) and the agreements signed. Read
// with Keenan's own session: every table here is owner-only.

export type LinkExtrasData = {
  leadId: string;
  standard: { id: string; name: string; facts: string; on: boolean }[];
  uploads: { id: string; name: string; facts: string; url: string | null }[];
  agreement: { ready: boolean; on: boolean };
  signed: { id: string; signerName: string; when: string; option: string; href: string }[];
};

export async function loadLinkExtras(supabase: Awaited<ReturnType<typeof createClient>>, leadId: string): Promise<LinkExtrasData> {
  const [{ data: library }, { data: rows }, { data: options }, { data: settings }, { data: signatures }] = await Promise.all([
    supabase
      .from("link_documents")
      .select("id, name, content_type, size_bytes, position, created_at")
      .is("retired_at", null)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("lead_link_documents")
      .select("id, document_id, name, storage_path, content_type, size_bytes, created_at")
      .eq("lead_id", leadId)
      .is("removed_at", null)
      .order("created_at", { ascending: true }),
    supabase.from("lead_link_options").select("agreement_to_sign").eq("lead_id", leadId).maybeSingle(),
    supabase.from("settings").select("agreement_text").eq("id", 1).single(),
    supabase
      .from("agreement_signatures")
      .select("id, signer_name, signed_at, offer_name")
      .eq("lead_id", leadId)
      .order("signed_at", { ascending: false }),
  ]);
  const ticked = new Set((rows ?? []).flatMap((row) => (row.document_id ? [row.document_id] : [])));
  const own = (rows ?? []).filter((row) => row.storage_path !== null);
  const signedUrls =
    own.length > 0
      ? await supabase.storage.from(LINK_DOCUMENTS_BUCKET).createSignedUrls(own.map((row) => row.storage_path as string), 600)
      : null;
  const urls = new Map((signedUrls?.data ?? []).flatMap((item) => (item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [])));
  const ready = Boolean(settings?.agreement_text?.trim());
  return {
    leadId,
    standard: (library ?? []).map((doc) => ({
      id: doc.id,
      name: doc.name,
      facts: documentFacts(doc.content_type, Number(doc.size_bytes)),
      on: ticked.has(doc.id),
    })),
    uploads: own.map((row) => ({
      id: row.id,
      name: row.name ?? "Document",
      facts: documentFacts(row.content_type ?? "", Number(row.size_bytes ?? 0)),
      url: urls.get(row.storage_path as string) ?? null,
    })),
    agreement: { ready, on: ready && options?.agreement_to_sign === true },
    signed: (signatures ?? []).map((sig) => ({
      id: sig.id,
      signerName: sig.signer_name,
      when: `${formatLongDay(calgaryDateOf(sig.signed_at))}, ${formatTime(sig.signed_at)}`,
      option: sig.offer_name,
      href: `/app/leads/${leadId}/agreements/${sig.id}`,
    })),
  };
}
