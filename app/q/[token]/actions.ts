"use server";

import { z } from "zod";
import { sendPush } from "@/lib/push/send";
import { anonymousClient } from "@/lib/quote-link/server";
import { offerChoice, parseCustomerQuote, TOKEN_PATTERN } from "@/lib/quote-link/view";
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
