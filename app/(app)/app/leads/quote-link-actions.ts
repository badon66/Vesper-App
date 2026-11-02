"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NotOwnerError, ReadOnlyError, requireOwnerForAction } from "@/lib/auth/profile";
import { quoteBaseUrl } from "@/lib/quote-link/server";
import { quoteLinkUrl } from "@/lib/quote-link/view";
import { createClient } from "@/lib/supabase/server";
import { VIEW_AS_READ_ONLY } from "@/lib/view-as";

// Keenan's side of the customer quote link (2026-11-02). Owner only, and
// refused under View as. The database makes the token and keeps one live
// link per lead; nothing here sends anything to the customer.

type Refused = { ok: false; message: string };

async function owner(): Promise<Refused | null> {
  try {
    await requireOwnerForAction();
    return null;
  } catch (e) {
    if (e instanceof ReadOnlyError) return { ok: false, message: VIEW_AS_READ_ONLY };
    if (e instanceof NotOwnerError) return { ok: false, message: "Only Keenan can send a quote link." };
    throw e;
  }
}

export type SendLinkResult = { ok: true; link: string } | Refused;

// The lead's live link, made the first time. Tapping Send again reuses it.
export async function sendQuoteLink(leadId: string): Promise<SendLinkResult> {
  const refused = await owner();
  if (refused) return refused;
  const id = z.uuid().safeParse(leadId);
  if (!id.success) return { ok: false, message: "That lead was not found." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("issue_quote_link", { p_lead_id: id.data });
  if (error || !data) {
    return {
      ok: false,
      message: /Save a quote/.test(error?.message ?? "")
        ? "Save the quote in meeting mode first, then send the link."
        : "The link couldn't be made. Check your signal and try again.",
    };
  }
  revalidatePath(`/app/leads/${id.data}`);
  return { ok: true, link: quoteLinkUrl(await quoteBaseUrl(), data) };
}

export type TurnOffResult = { ok: true } | Refused;

// Kills the live link. Sending again makes a new one.
export async function turnOffQuoteLink(leadId: string): Promise<TurnOffResult> {
  const refused = await owner();
  if (refused) return refused;
  const id = z.uuid().safeParse(leadId);
  if (!id.success) return { ok: false, message: "That lead was not found." };
  const { error } = await (await createClient()).rpc("revoke_quote_link", { p_lead_id: id.data });
  if (error) return { ok: false, message: "The link couldn't be turned off. Check your signal and try again." };
  revalidatePath(`/app/leads/${id.data}`);
  return { ok: true };
}
