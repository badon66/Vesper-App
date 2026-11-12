"use client";

import { DOCUMENT_MAX_BYTES, isDocumentType, LINK_DOCUMENTS_BUCKET, type DocumentType } from "@/lib/quote-link/documents";
import { createClient } from "@/lib/supabase/client";

// Puts one of Keenan's documents in the private link-documents bucket,
// straight from his browser (the storage rule lets only him add there),
// and says where it went. The page then records it with a server action.
export type UploadedDocument = { path: string; contentType: DocumentType; size: number };

export async function uploadLinkDocument(
  file: File,
  pathFor: (id: string, type: DocumentType) => string,
): Promise<{ ok: true; file: UploadedDocument } | { ok: false; message: string }> {
  if (!isDocumentType(file.type)) return { ok: false, message: "Choose a PDF or a photo (JPEG, PNG or WebP)." };
  if (file.size > DOCUMENT_MAX_BYTES) return { ok: false, message: "That file is over 25 MB. Choose a smaller one." };
  const path = pathFor(crypto.randomUUID(), file.type);
  const { error } = await createClient()
    .storage.from(LINK_DOCUMENTS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) return { ok: false, message: "That file didn't upload. Check your signal and try again." };
  return { ok: true, file: { path, contentType: file.type, size: file.size } };
}
