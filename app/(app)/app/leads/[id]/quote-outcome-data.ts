import "server-only";

import type { QuoteOutcomeData } from "@/components/quotes/quote-outcome";
import { namesById } from "@/lib/leads/queries";
import type { LeadStatus } from "@/lib/leads/status";
import {
  bookedStartSmaller,
  currentCommission,
  optionWords,
  pickOutcomeQuote,
  previewCommission,
  runsFromJson,
  standingCommission,
  type CommissionRow,
} from "@/lib/quotes/outcome-card";
import { createClient } from "@/lib/supabase/server";

// The facts for Keenan's outcome card on the lead page (round 8,
// 2026-11-09). Owner only: the page loads it only for the owner, never
// under View as. The quote is the lead's accepted one while it has one,
// otherwise its newest of any status. Null when the lead has no quote.

type Client = Awaited<ReturnType<typeof createClient>>;

type LeadForOutcome = {
  id: string;
  status: LeadStatus;
  assigned_to: string | null;
  created_by: string;
  installed_at: string | null;
};

export async function loadQuoteOutcome(supabase: Client, lead: LeadForOutcome): Promise<QuoteOutcomeData | null> {
  // The commission goes to the lead's setter, the same person as the
  // booking pay; the database decides it again on Accepted.
  const receiverId = lead.assigned_to ?? lead.created_by;
  const [
    { data: quoteRows },
    { data: linkRow },
    { data: earningRows },
    { data: settings },
    { data: receiverRow },
    { data: planned },
  ] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        "id, status, created_at, runs, box_count, price_per_ft, box_price, discounts, accepted_at, accepted_runs, declined_at, decline_reason, cancelled_at, cancel_reason, outcome_note",
      )
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("quote_links")
      .select("booked_at, booked_option, booked_selection")
      .eq("lead_id", lead.id)
      .not("booked_at", "is", null)
      .order("booked_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("earnings")
      .select("id, profile_id, amount, status, payable_at, paid_at, note, quote_id, source_quote_id, created_at")
      .eq("lead_id", lead.id)
      .eq("type", "commission")
      .order("created_at", { ascending: false }),
    supabase.from("settings").select("commission_rate").eq("id", 1).maybeSingle(),
    supabase.from("profiles").select("id, role").eq("id", receiverId).maybeSingle(),
    // The planned install day, read here so the lead page's shared field
    // list stays as it is.
    supabase.from("leads").select("install_on").eq("id", lead.id).maybeSingle(),
  ]);

  const quote = pickOutcomeQuote(quoteRows ?? []);
  if (!quote) return null;

  const earnings: CommissionRow[] = (earningRows ?? []).map((row) => ({ ...row, amount: Number(row.amount) }));
  const earning = currentCommission(earnings, quote.id);
  const names = await namesById(supabase, [receiverId, earning?.profile_id]);
  const receiver = { name: names.get(receiverId) ?? "the setter", role: receiverRow?.role ?? null };
  const runs = runsFromJson(quote.runs);
  const rate = Number(settings?.commission_rate ?? 0);
  // The commission reads only these, never a total (lib/pay/commission.ts).
  const priced = {
    runs: quote.runs,
    box_count: quote.box_count,
    price_per_ft: Number(quote.price_per_ft),
    box_price: Number(quote.box_price),
    discounts: quote.discounts,
  };
  // What accepting would pay, per option: the customer's booked Start
  // smaller first when it still matches, then the full quote.
  const standing = earning && earning.status !== "void" ? earning : null;
  const booked = bookedStartSmaller(runs, linkRow ?? null);
  const options = [...(booked ? [booked] : []), null].map((positions) => ({
    positions,
    ...optionWords(runs, positions),
    booked: positions !== null,
    commission: previewCommission({ receiver, existing: standing, quote: priced, positions, rate }),
  }));

  return {
    leadId: lead.id,
    leadStatus: lead.status,
    installOn: planned?.install_on ?? null,
    installedAt: lead.installed_at,
    quote: {
      id: quote.id,
      status: quote.status,
      acceptedAt: quote.accepted_at,
      declinedAt: quote.declined_at,
      cancelledAt: quote.cancelled_at,
      declineReason: quote.decline_reason,
      cancelReason: quote.cancel_reason,
      note: quote.outcome_note,
      option:
        quote.status === "accepted" || quote.status === "cancelled" ? optionWords(runs, quote.accepted_runs) : null,
    },
    options,
    commission: standingCommission(earning, receiver, names),
  };
}
