import "server-only";
import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { getExtrasEnv, getPublicEnv } from "@/lib/env";
import { PHOTO_BUCKET } from "@/lib/photos";
import {
  documentFileName,
  mainPicture,
  parseCustomerQuote,
  parseLinkAgreement,
  parseLinkDocuments,
  parseLinkMockups,
  TOKEN_PATTERN,
  type ClosedQuote,
  type CustomerQuote,
  type LinkAgreement,
  type LinkDocument,
  type LinkPicture,
} from "@/lib/quote-link/view";
import type { Database } from "@/types/database";

// The customer quote link's server side (2026-11-02). The customer's page
// always reads as an anonymous caller with the publishable key and no
// session, whoever opens it, so Keenan previewing a link sees exactly what
// the customer sees, and the secret key never runs in a customer's request
// (CLAUDE.md). Everything goes through the token functions.

// The mockup's signed link lasts ten minutes: long enough to load and zoom,
// short enough that a forwarded image address soon stops working.
export const MOCKUP_SECONDS = 600;

export function anonymousClient(token?: string) {
  const env = getPublicEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Storage reads this header in its rule for the mockup: a live token
    // signs that quote's mockup and nothing else.
    ...(token ? { global: { headers: { "x-quote-token": token } } } : {}),
  });
}

// The presentation bucket holds Keenan's own photos; a live token signs the
// gallery's, and nothing else there (storage policy, 2026-11-04).
const PRESENTATION_BUCKET = "presentation";

// A mockup the page may show (round 10): the Main and the ones marked for
// offers, each signed for ten minutes; round 13 adds the phone scenes.
export type { LinkPicture };

// Documents (take 3): the files the link shows, in the private
// link-documents bucket, signed by the token like the mockups.
const DOCUMENTS_BUCKET = "link-documents";

export type LoadedQuote =
  | (CustomerQuote & {
      mockupUrl: string | null;
      pictures: LinkPicture[];
      galleryUrls: string[];
      // Take 3: the documents the link shows (none: no Documents section),
      // and the agreement to sign (null: none on this link).
      documents: LinkDocument[];
      agreement: LinkAgreement | null;
    })
  | ClosedQuote;

// What the page shows for a token. Throws only when the database can't be
// reached; every other kind of bad link is the closed screen.
export async function loadCustomerQuote(token: string): Promise<LoadedQuote> {
  const { data, error } = await anonymousClient().rpc("quote_for_customer", {
    p_token: TOKEN_PATTERN.test(token) ? token : "",
  });
  if (error) throw new Error(`quote_for_customer: ${error.message}`);
  const view = parseCustomerQuote(data);
  if (view.state !== "live") return view;

  // The house's mockups (round 10): the Main and the ones for offers. If
  // the list can't be read, the old mockup slot stands in as the Main.
  // Take 3: the documents and the agreement are read at the same time.
  const [listed, documentList, agreementRead] = await Promise.all([
    anonymousClient().rpc("quote_link_mockups", { p_token: token }),
    anonymousClient().rpc("quote_link_documents", { p_token: token }),
    anonymousClient().rpc("quote_link_agreement", { p_token: token }),
  ]);
  const mockups = listed.error
    ? view.mockupPath
      ? [{ path: view.mockupPath, main: true, scene: false, name: "", offers: [] }]
      : []
    : parseLinkMockups(listed.data);

  const storage = anonymousClient(token).storage;
  const files = documentList.error ? [] : parseLinkDocuments(documentList.data);
  const [signedMockups, gallery, documents] = await Promise.all([
    mockups.length > 0 ? storage.from(PHOTO_BUCKET).createSignedUrls(mockups.map((m) => m.path), MOCKUP_SECONDS) : null,
    view.gallery.length > 0 ? storage.from(PRESENTATION_BUCKET).createSignedUrls(view.gallery, MOCKUP_SECONDS) : null,
    signDocuments(storage, files),
  ]);
  // A photo that can't be signed is left out rather than shown broken.
  const urlByPath = new Map(
    (signedMockups?.data ?? []).flatMap((item) => (item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [])),
  );
  const pictures: LinkPicture[] = mockups.flatMap((m) => {
    const url = urlByPath.get(m.path);
    return url ? [{ url, main: m.main, scene: m.scene, name: m.name, offers: m.offers }] : [];
  });
  const mockupUrl = mainPicture(pictures)?.url ?? null;
  const galleryUrls = (gallery?.data ?? []).flatMap((item) => (item.signedUrl ? [item.signedUrl] : []));
  const agreement = agreementRead.error ? null : parseLinkAgreement(agreementRead.data);
  return { ...view, mockupUrl, pictures, galleryUrls, documents, agreement };
}

// Each document twice: a link that opens it on the phone and one that
// saves it under its name. A file that can't be signed is left out.
async function signDocuments(
  storage: ReturnType<typeof anonymousClient>["storage"],
  files: ReturnType<typeof parseLinkDocuments>,
): Promise<LinkDocument[]> {
  if (files.length === 0) return [];
  const bucket = storage.from(DOCUMENTS_BUCKET);
  const signed = await Promise.all(
    files.map(async (file) => {
      const [open, save] = await Promise.all([
        bucket.createSignedUrl(file.path, MOCKUP_SECONDS),
        bucket.createSignedUrl(file.path, MOCKUP_SECONDS, { download: documentFileName(file.name, file.contentType) }),
      ]);
      if (!open.data?.signedUrl || !save.data?.signedUrl) return null;
      return {
        id: file.id,
        name: file.name,
        contentType: file.contentType,
        size: file.size,
        url: open.data.signedUrl,
        downloadUrl: save.data.signedUrl,
      } satisfies LinkDocument;
    }),
  );
  return signed.filter((item): item is LinkDocument => item !== null);
}

// The address links start with: QUOTE_BASE_URL when it is set (later
// https://quote.vesperlighting.ca), otherwise the address this request came
// in on, which is right for previews and the Vercel address.
export async function quoteBaseUrl(): Promise<string> {
  const configured = getExtrasEnv().QUOTE_BASE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  return requestOrigin();
}

// The address this request came in on: the app's own, for Keenan's Preview,
// where his sign-in makes a tap a preview instead of the customer's.
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
