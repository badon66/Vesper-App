import "server-only";
import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { getExtrasEnv, getPublicEnv } from "@/lib/env";
import { PHOTO_BUCKET } from "@/lib/photos";
import { parseCustomerQuote, TOKEN_PATTERN, type ClosedQuote, type CustomerQuote } from "@/lib/quote-link/view";
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

export type LoadedQuote = (CustomerQuote & { mockupUrl: string | null; galleryUrls: string[] }) | ClosedQuote;

// What the page shows for a token. Throws only when the database can't be
// reached; every other kind of bad link is the closed screen.
export async function loadCustomerQuote(token: string): Promise<LoadedQuote> {
  const { data, error } = await anonymousClient().rpc("quote_for_customer", {
    p_token: TOKEN_PATTERN.test(token) ? token : "",
  });
  if (error) throw new Error(`quote_for_customer: ${error.message}`);
  const view = parseCustomerQuote(data);
  if (view.state !== "live") return view;

  const storage = anonymousClient(token).storage;
  const [mockup, gallery] = await Promise.all([
    view.mockupPath ? storage.from(PHOTO_BUCKET).createSignedUrl(view.mockupPath, MOCKUP_SECONDS) : null,
    view.gallery.length > 0 ? storage.from(PRESENTATION_BUCKET).createSignedUrls(view.gallery, MOCKUP_SECONDS) : null,
  ]);
  const mockupUrl = mockup?.data?.signedUrl ?? null;
  // A photo that can't be signed is left out rather than shown broken.
  const galleryUrls = (gallery?.data ?? []).flatMap((item) => (item.signedUrl ? [item.signedUrl] : []));
  return { ...view, mockupUrl, galleryUrls };
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
