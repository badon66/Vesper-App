"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NotOwnerError, ReadOnlyError, requireOwnerForAction } from "@/lib/auth/profile";
import { DOCUMENT_MAX_BYTES, DOCUMENT_TYPES, isLeadUploadPath, isLibraryPath } from "@/lib/quote-link/documents";
import { createClient } from "@/lib/supabase/server";
import { VIEW_AS_READ_ONLY } from "@/lib/view-as";

// Documents on the customer's link and the agreement to sign (quote link
// take 3, Keenan, 2026-11-11). Keenan's alone: refused under View as and for
// everyone else, and the database refuses them too (owner-only policies).
// Rows are never taken out of a table: unticking or removing sets
// removed_at, and Remove in Settings retires a standard document.

export type DocumentsResult = { ok: true } | { ok: false; message: string };

const FAILED = "That didn't save. Check your signal and try again.";

async function owner(): Promise<{ id: string } | { ok: false; message: string }> {
  try {
    return await requireOwnerForAction();
  } catch (e) {
    if (e instanceof ReadOnlyError) return { ok: false, message: VIEW_AS_READ_ONLY };
    if (e instanceof NotOwnerError) return { ok: false, message: "Only Keenan changes what the customer's link shows." };
    throw e;
  }
}

const refused = (me: { id: string } | { ok: false; message: string }): me is { ok: false; message: string } => "ok" in me;

const uuid = z.uuid();
const docName = z.string().trim().min(1, { error: "Give it a name." }).max(80, { error: "Keep the name under 80 characters." });
const fileFacts = z.object({
  path: z.string().min(1).max(300),
  contentType: z.enum(DOCUMENT_TYPES),
  size: z.number().int().min(0).max(DOCUMENT_MAX_BYTES),
});

// ---------------------------------------------------------------- Settings, Documents

// A standard document, after the page has put its file in the bucket.
export async function addLibraryDocument(input: { name: string; path: string; contentType: string; size: number }): Promise<DocumentsResult> {
  const me = await owner();
  if (refused(me)) return me;
  const name = docName.safeParse(input.name);
  if (!name.success) return { ok: false, message: name.error.issues[0]?.message ?? "Give it a name." };
  const file = fileFacts.safeParse(input);
  if (!file.success || !isLibraryPath(file.data.path)) return { ok: false, message: FAILED };
  const supabase = await createClient();
  const { count } = await supabase.from("link_documents").select("id", { count: "exact", head: true });
  const { error } = await supabase.from("link_documents").insert({
    name: name.data,
    storage_path: file.data.path,
    content_type: file.data.contentType,
    size_bytes: file.data.size,
    position: count ?? 0,
  });
  if (error) return { ok: false, message: FAILED };
  revalidatePath("/app/admin/settings/documents");
  return { ok: true };
}

export async function renameLibraryDocument(id: string, name: string): Promise<DocumentsResult> {
  const me = await owner();
  if (refused(me)) return me;
  const which = uuid.safeParse(id);
  const named = docName.safeParse(name);
  if (!which.success) return { ok: false, message: FAILED };
  if (!named.success) return { ok: false, message: named.error.issues[0]?.message ?? "Give it a name." };
  const supabase = await createClient();
  const { error } = await supabase.from("link_documents").update({ name: named.data }).eq("id", which.data);
  if (error) return { ok: false, message: FAILED };
  revalidatePath("/app/admin/settings/documents");
  return { ok: true };
}

// Remove: retired, so every link that showed it stops showing it.
export async function retireLibraryDocument(id: string): Promise<DocumentsResult> {
  const me = await owner();
  if (refused(me)) return me;
  const which = uuid.safeParse(id);
  if (!which.success) return { ok: false, message: FAILED };
  const supabase = await createClient();
  const { error } = await supabase.from("link_documents").update({ retired_at: new Date().toISOString() }).eq("id", which.data);
  if (error) return { ok: false, message: FAILED };
  revalidatePath("/app/admin/settings/documents");
  return { ok: true };
}

// The agreement customers sign on their link. Empty: Agreement to sign
// stays off on every lead.
export async function saveAgreementText(text: string): Promise<DocumentsResult> {
  const me = await owner();
  if (refused(me)) return me;
  const parsed = z.string().max(20_000, { error: "Keep the agreement under 20,000 characters." }).safeParse(text);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? FAILED };
  const value = parsed.data.replace(/\r\n/g, "\n").trim();
  const supabase = await createClient();
  const { error } = await supabase.from("settings").update({ agreement_text: value === "" ? null : value }).eq("id", 1);
  if (error) return { ok: false, message: FAILED };
  revalidatePath("/app/admin/settings/documents");
  return { ok: true };
}

// ---------------------------------------------------------------- on a lead

// Tick or untick a standard document for this customer's link.
export async function setLeadDocument(leadId: string, documentId: string, on: boolean): Promise<DocumentsResult> {
  const me = await owner();
  if (refused(me)) return me;
  const lead = uuid.safeParse(leadId);
  const doc = uuid.safeParse(documentId);
  if (!lead.success || !doc.success) return { ok: false, message: FAILED };
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("lead_link_documents")
    .select("id, removed_at")
    .eq("lead_id", lead.data)
    .eq("document_id", doc.data)
    .maybeSingle();
  const { error } = existing
    ? await supabase
        .from("lead_link_documents")
        .update({ removed_at: on ? null : new Date().toISOString() })
        .eq("id", existing.id)
    : on
      ? await supabase.from("lead_link_documents").insert({ lead_id: lead.data, document_id: doc.data })
      : { error: null };
  if (error) return { ok: false, message: FAILED };
  revalidatePath(`/app/leads/${lead.data}`);
  return { ok: true };
}

// A file for this customer only, after the card has put it in the bucket.
export async function addLeadUpload(leadId: string, input: { name: string; path: string; contentType: string; size: number }): Promise<DocumentsResult> {
  const me = await owner();
  if (refused(me)) return me;
  const lead = uuid.safeParse(leadId);
  const name = docName.safeParse(input.name);
  const file = fileFacts.safeParse(input);
  if (!lead.success || !file.success || !isLeadUploadPath(lead.data, file.data.path)) {
    return { ok: false, message: FAILED };
  }
  if (!name.success) return { ok: false, message: name.error.issues[0]?.message ?? "Give it a name." };
  const supabase = await createClient();
  const { error } = await supabase.from("lead_link_documents").insert({
    lead_id: lead.data,
    name: name.data,
    storage_path: file.data.path,
    content_type: file.data.contentType,
    size_bytes: file.data.size,
  });
  if (error) return { ok: false, message: FAILED };
  revalidatePath(`/app/leads/${lead.data}`);
  return { ok: true };
}

// Remove a customer's own file from their link (the row is kept, marked
// removed; the file stays in the private bucket, which nothing signs any
// more).
export async function removeLeadUpload(leadId: string, id: string): Promise<DocumentsResult> {
  const me = await owner();
  if (refused(me)) return me;
  const lead = uuid.safeParse(leadId);
  const which = uuid.safeParse(id);
  if (!lead.success || !which.success) return { ok: false, message: FAILED };
  const supabase = await createClient();
  const { error } = await supabase
    .from("lead_link_documents")
    .update({ removed_at: new Date().toISOString() })
    .eq("id", which.data)
    .eq("lead_id", lead.data);
  if (error) return { ok: false, message: FAILED };
  revalidatePath(`/app/leads/${lead.data}`);
  return { ok: true };
}

// Agreement to sign: on only once Settings has the agreement's text.
export async function setAgreementToSign(leadId: string, on: boolean): Promise<DocumentsResult> {
  const me = await owner();
  if (refused(me)) return me;
  const lead = uuid.safeParse(leadId);
  if (!lead.success) return { ok: false, message: FAILED };
  const supabase = await createClient();
  if (on) {
    const { data: settings } = await supabase.from("settings").select("agreement_text").eq("id", 1).single();
    if (!settings?.agreement_text?.trim()) return { ok: false, message: "Add the agreement text in Settings first." };
  }
  const { error } = await supabase
    .from("lead_link_options")
    .upsert({ lead_id: lead.data, agreement_to_sign: on, updated_at: new Date().toISOString() }, { onConflict: "lead_id" });
  if (error) return { ok: false, message: FAILED };
  revalidatePath(`/app/leads/${lead.data}`);
  return { ok: true };
}

