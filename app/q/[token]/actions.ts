"use server";

import { z } from "zod";
import { sendPush } from "@/lib/push/send";
import { anonymousClient } from "@/lib/quote-link/server";
import { customOption, offerChoice, parseCustomerQuote, TOKEN_PATTERN } from "@/lib/quote-link/view";
import { screenTotal } from "@/lib/pricing";
import { CUSTOMER_OFFER_ID } from "@/lib/quotes/offers";
import { createClient as createSessionClient } from "@/lib/supabase/server";

// The customer's page writes (2026-11-02; round 9, options). Anyone holding
// the link can call these, so each one goes through a token function with
// the publishable key and no session: it changes only that link, and
// nothing here can read or write anything else. The browser sends an
// option's id, never a price; totals are worked out here from the stored
// quote.

const token = z.string().regex(TOKEN_PATTERN);
// An option's id, as the database keeps it (1 to 40 characters).
const offerId = z.string().trim().min(1).max(40);

// A signed-in member (Keenan previewing) isn't a customer visit.
async function signedInMember(): Promise<boolean> {
  try {
    const { data } = await (await createSessionClient()).auth.getClaims();
    return Boolean(data?.claims?.sub);
  } catch {
    return false;
  }
}

// One visit: a count and a time, nothing about the visitor.
export async function recordVisit(value: string): Promise<void> {
  const parsed = token.safeParse(value);
  if (!parsed.success || (await signedInMember())) return;
  await anonymousClient().rpc("quote_link_visit", { p_token: parsed.data });
}

// The option they are looking at, so Keenan's card can say so. The page
// opens on the option they booked, else the meeting's, else the biggest.
export async function saveSelection(value: string, offer: string): Promise<boolean> {
  const t = token.safeParse(value);
  const o = offerId.safeParse(offer);
  if (!t.success || !o.success) return false;
  if (await signedInMember()) return true;
  const { data, error } = await anonymousClient().rpc("quote_link_select_offer", { p_token: t.data, p_offer: o.data });
  return !error && data === true;
}

export type BookResult =
  // preview: a signed-in member (Keenan) tapped it; nothing was saved or sent.
  | { ok: true; option: string; total: string; preview?: boolean }
  | { ok: false; code: "closed" | "changed" | "failed"; message: string };

const CLOSED = "This quote link is closed.";

const CHANGED = "Your quote was updated since you opened it. Reload the page to see the latest.";

const FAILED = "That didn’t go through. Check your signal and try again, or call or text us.";

// The option and its total as the page would show them, read fresh from
// the stored quote through the token.
async function choiceFromStoredQuote(t: string, offer: string) {
  const view = parseCustomerQuote((await anonymousClient().rpc("quote_for_customer", { p_token: t })).data);
  if (view.state !== "live") return { state: "closed" as const };
  const choice = offerChoice(view.quote, offer);
  return choice ? { state: "live" as const, choice } : { state: "changed" as const };
}

// Book my install: saves the option (its id, its name and its runs), tells
// Keenan, and returns the option's total for the thank-you, worked out here
// from the stored quote and the option's id, never from a total the
// browser sends. It never accepts the quote and never creates commission.
export async function bookInstall(value: string, offer: string): Promise<BookResult> {
  const t = token.safeParse(value);
  const o = offerId.safeParse(offer);
  if (!t.success || !o.success) return { ok: false, code: "failed", message: FAILED };

  // Keenan looking at a customer's link while signed in: show him the
  // thank-you, but write nothing and notify no one, so the customer's
  // timeline only ever holds what the customer did.
  if (await signedInMember()) {
    const read = await choiceFromStoredQuote(t.data, o.data);
    if (read.state === "closed") return { ok: false, code: "closed", message: CLOSED };
    if (read.state === "changed") return { ok: false, code: "changed", message: CHANGED };
    return { ok: true, option: read.choice.name, total: read.choice.total, preview: true };
  }

  const { data, error } = await anonymousClient().rpc("quote_link_book_offer", { p_token: t.data, p_offer: o.data });
  if (error || !data || typeof data !== "object") return { ok: false, code: "failed", message: FAILED };
  const booked = data as {
    ok: boolean;
    state?: string;
    option?: string;
    name?: string;
    lead_id?: string;
    notify?: boolean;
    targets?: { id: string; sealed: string }[];
  };
  if (!booked.ok || !booked.option) {
    // An option Keenan has since changed or taken off the quote.
    if (booked.state === "no_offer" || booked.state === "no_runs") return { ok: false, code: "changed", message: CHANGED };
    return { ok: false, code: "closed", message: CLOSED };
  }

  if (booked.notify && booked.targets && booked.targets.length > 0 && booked.lead_id) {
    // Their name and the option's name, never a price.
    await sendPush(booked.targets, {
      title: `${booked.name ?? "A customer"} tapped Book my install`,
      body: booked.option,
      url: `/app/leads/${booked.lead_id}#quote`,
      tag: `book-${booked.lead_id}`,
    }).catch(() => undefined);
  }

  const read = await choiceFromStoredQuote(t.data, o.data).catch(() => null);
  const total = read?.state === "live" ? read.choice.total : "";
  return { ok: true, option: booked.option, total };
}

// ---------------------------------------------------------------- Build your own (take 3)

const positions = z.array(z.number().int().min(0).max(29)).min(1).max(30);

// Book my install on their own build: the areas they ticked (positions,
// never a price) and the option they started from. The database checks
// every area is one Keenan measured and shows, saves it as their one
// custom option (replacing their last) and books it; the total comes from
// the stored quote, here, never from the browser.
export async function bookCustom(value: string, runs: number[], from: string | null): Promise<BookResult> {
  const t = token.safeParse(value);
  const r = positions.safeParse(runs);
  const f = from === null ? { success: true as const, data: null } : offerId.safeParse(from);
  if (!t.success || !r.success || !f.success) return { ok: false, code: "failed", message: FAILED };

  // Keenan previewing: the thank-you with the price worked out here, and
  // nothing saved or sent.
  if (await signedInMember()) {
    const view = parseCustomerQuote((await anonymousClient().rpc("quote_for_customer", { p_token: t.data })).data);
    if (view.state !== "live") return { ok: false, code: "closed", message: CLOSED };
    const built = customOption(view.quote, r.data, f.data);
    if (!built) return { ok: false, code: "changed", message: CHANGED };
    return { ok: true, option: built.offer.name, total: screenTotal(built.totals.subtotal, view.quote.gstEnabled), preview: true };
  }

  const { data, error } = await anonymousClient().rpc("quote_link_book_custom", { p_token: t.data, p_runs: r.data, p_from: f.data ?? undefined });
  if (error || !data || typeof data !== "object") return { ok: false, code: "failed", message: FAILED };
  const booked = data as { ok: boolean; state?: string; option?: string; name?: string; lead_id?: string; notify?: boolean; targets?: { id: string; sealed: string }[] };
  if (!booked.ok || !booked.option) {
    if (booked.state === "bad_runs" || booked.state === "no_runs" || booked.state === "no_offer") return { ok: false, code: "changed", message: CHANGED };
    return { ok: false, code: "closed", message: CLOSED };
  }
  if (booked.notify && booked.targets && booked.targets.length > 0 && booked.lead_id) {
    await sendPush(booked.targets, {
      title: `${booked.name ?? "A customer"} tapped Book my install`,
      body: booked.option,
      url: `/app/leads/${booked.lead_id}#quote`,
      tag: `book-${booked.lead_id}`,
    }).catch(() => undefined);
  }
  const read = await choiceFromStoredQuote(t.data, CUSTOMER_OFFER_ID).catch(() => null);
  const total = read?.state === "live" ? read.choice.total : "";
  return { ok: true, option: booked.option, total };
}

// ---------------------------------------------------------------- the agreement (take 3)

export type SignResult =
  | { ok: true; signerName: string; signedAt: string; option: string; preview?: boolean }
  | { ok: false; code: "closed" | "changed" | "failed" | "invalid" | "signed"; message: string };

const signerName = z.string().trim().min(2).max(120);
// A PNG from the signature pad, as a data URL; the database checks it too.
const signature = z.string().startsWith("data:image/png;base64,").min(200).max(400_000);

// Sign: their typed name, their finger signature and the option on screen
// (their own build is booked first, then signed). The database saves the
// signing with a copy of the quote as it stands, books the option and says
// who to tell; Keenan gets the same alert as Book my install.
export async function signAgreement(value: string, input: { name: string; signature: string; offer: string }): Promise<SignResult> {
  const t = token.safeParse(value);
  const n = signerName.safeParse(input.name);
  const p = signature.safeParse(input.signature);
  const o = offerId.safeParse(input.offer);
  if (!t.success || !o.success) return { ok: false, code: "failed", message: FAILED };
  if (!n.success) return { ok: false, code: "invalid", message: "Type your full name to sign." };
  if (!p.success) return { ok: false, code: "invalid", message: "Sign in the box with your finger first." };

  // Keenan previewing: nothing is saved, signed or sent.
  if (await signedInMember()) {
    return { ok: true, signerName: n.data, signedAt: new Date().toISOString(), option: o.data, preview: true };
  }

  const { data, error } = await anonymousClient().rpc("quote_link_sign_agreement", {
    p_token: t.data,
    p_name: n.data,
    p_offer: o.data,
    p_signature: p.data,
  });
  if (error || !data || typeof data !== "object") return { ok: false, code: "failed", message: FAILED };
  const signed = data as { ok: boolean; state?: string; option?: string; name?: string; lead_id?: string; targets?: { id: string; sealed: string }[] };
  if (!signed.ok || !signed.option) {
    if (signed.state === "already_signed") return { ok: false, code: "signed", message: "This agreement is already signed." };
    if (signed.state === "no_offer") return { ok: false, code: "changed", message: CHANGED };
    if (signed.state === "bad_name") return { ok: false, code: "invalid", message: "Type your full name to sign." };
    if (signed.state === "bad_signature") return { ok: false, code: "invalid", message: "Sign in the box with your finger first." };
    return { ok: false, code: "closed", message: CLOSED };
  }
  if (signed.targets && signed.targets.length > 0 && signed.lead_id) {
    // Their name and the option's name, never a price.
    await sendPush(signed.targets, {
      title: `${signed.name ?? "A customer"} signed the agreement`,
      body: signed.option,
      url: `/app/leads/${signed.lead_id}#quote`,
      tag: `book-${signed.lead_id}`,
    }).catch(() => undefined);
  }
  return { ok: true, signerName: n.data, signedAt: new Date().toISOString(), option: signed.option };
}
