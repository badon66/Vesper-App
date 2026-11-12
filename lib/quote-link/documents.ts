// Documents on the customer's quote link (quote link take 3, Keenan,
// 2026-11-11): where the files live and what they may be. Keenan's standard
// set sits under library/, a customer's own files under leads/<lead id>/, in
// the private link-documents bucket (Keenan reads and adds; a live link's
// token signs only what that link shows).

export const LINK_DOCUMENTS_BUCKET = "link-documents";

// PDFs and photos, as the bucket allows, up to 25 MB each.
export const DOCUMENT_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export const DOCUMENT_MAX_BYTES = 26_214_400;
export const DOCUMENT_ACCEPT = DOCUMENT_TYPES.join(",");

const EXTENSION: Record<DocumentType, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function isDocumentType(value: string): value is DocumentType {
  return (DOCUMENT_TYPES as readonly string[]).includes(value);
}

export function libraryPath(id: string, type: DocumentType): string {
  return `library/${id}.${EXTENSION[type]}`;
}

export function leadUploadPath(leadId: string, id: string, type: DocumentType): string {
  return `leads/${leadId}/${id}.${EXTENSION[type]}`;
}

export function isLeadUploadPath(leadId: string, path: string): boolean {
  return new RegExp(`^leads/${leadId}/[0-9a-f-]{36}\\.(pdf|jpg|png|webp)$`).test(path);
}

export function isLibraryPath(path: string): boolean {
  return /^library\/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/.test(path);
}

// A file's name without its ending, as the name box starts.
export function nameFromFile(fileName: string): string {
  return fileName.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

// "PDF, 1.2 MB" or "Photo, 340 KB".
export function documentFacts(type: string, bytes: number): string {
  const kind = type === "application/pdf" ? "PDF" : "Photo";
  if (!(bytes > 0)) return kind;
  const size = bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;
  return `${kind}, ${size}`;
}
