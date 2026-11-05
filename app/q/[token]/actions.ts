"use server";

import { z } from "zod";
import { sendPush } from "@/lib/push/send";
import { anonymousClient } from "@/lib/quote-link/server";
import { customerTotal, optionName, parseCustomerQuote, TOKEN_PATTERN } from "@/lib/quote-link/view";
import { createClient as createSessionClient } from "@/lib/supabase/server";

// The customer's page writes (2026-11-02). Anyone holding the link can call
// these, so each one goes through a token function with the publishable
// key and no session: it changes only that link, and nothing here can
// read or write anything else. The browser never sends a price; totals are
// worked out here from the stored quote.

const token = z.string().regex(TOKEN_PATTERN);
const positions = z.array(z.number().int().min(0).max(199)).max(200);

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

// The runs they have switched on, so the page opens the same way next time
// and Keenan can see what they are looking at.
export async function saveSelection(value: string, chosen: number[]): Promise<boolean> {
  const t = token.safeParse(value);
  const p = positions.safeParse(chosen);
  // An empty list is the Recommended package: every run.
  if (!t.success || !p.success) return false;
  if (await signedInMember()) return true;
  const { data, error } = await anonymousClient().rpc("quote_link_select", { p_token: t.data, p_positions: p.data });
  return !error && data === true;
}

export type BookResult =
  // preview: a signed-in member (Keenan) tapped it; nothing was saved or sent.
  | { ok: true; option: string; total: string; preview?: boolean }
  | { ok: false; code: "closed" | "failed"; message: string };

const CLOSED = "This quote link is closed.";

const FAILED = "That didn't go through. Check your signal and try again, or call or text us.";

// Book my install: saves the option in words, tells Keenan, and returns
// the total for the thank-you, worked out here from the stored quote and
// the runs saved with the booking. It never accepts the quote and never
// creates commission.
export async function bookInstall(value: string, chosen: number[]): Promise<BookResult> {
  const t = token.safeParse(value);
  const p = positions.safeParse(chosen);
  if (!t.success || !p.success) return { ok: false, code: "failed", message: FAILED };

  const client = anonymousClient();

  // Keenan looking at a customer's link while signed in: show him the
  // thank-you, but write nothing and notify no one, so the customer's
  // timeline only ever holds what the customer did.
  if (await signedInMember()) {
    const view = parseCustomerQuote((await client.rpc("quote_for_customer", { p_token: t.data })).data);
    if (view.state !== "live") return { ok: false, code: "closed", message: CLOSED };
    const chosen = p.data.length === 0 ? null : p.data;
    return { ok: true, option: optionName(view.quote.runs, chosen), total: customerTotal(view.quote, chosen), preview: true };
  }

  const { data, error } = await client.rpc("quote_link_book", { p_token: t.data, p_positions: p.data });
  if (error || !data || typeof data !== "object") return { ok: false, code: "failed", message: FAILED };
  const booked = data as {
    ok: boolean;
    option?: string;
    name?: string;
    lead_id?: string;
    notify?: boolean;
    targets?: { id: string; sealed: string }[];
  };
  if (!booked.ok || !booked.option) {
    return { ok: false, code: "closed", message: CLOSED };
  }

  if (booked.notify && booked.targets && booked.targets.length > 0 && booked.lead_id) {
    // Their name and the option in words, never a price.
    await sendPush(booked.targets, {
      title: `${booked.name ?? "A customer"} tapped Book my install`,
      body: booked.option,
      url: `/app/leads/${booked.lead_id}#quote`,
      tag: `book-${booked.lead_id}`,
    }).catch(() => undefined);
  }

  const view = parseCustomerQuote((await client.rpc("quote_for_customer", { p_token: t.data })).data);
  const total = view.state === "live" ? customerTotal(view.quote, view.selection) : "";
  return { ok: true, option: booked.option, total };
}
