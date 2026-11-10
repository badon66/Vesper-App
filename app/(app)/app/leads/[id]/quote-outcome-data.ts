import "server-only";

import type { QuoteOutcomeData } from "@/components/quotes/quote-outcome";
import { namesById } from "@/lib/leads/queries";
import type { LeadStatus } from "@/lib/leads/status";
import {
  acceptedOption,
  acceptOptions,
  currentCommission,
  pickOutcomeQuote,
  previewCommission,
  standingCommission,
  type CommissionRow,
} from "@/lib/quotes/outcome-card";
import { createClient } from "@/lib/supabase/server";

// The facts for Keenan's outcome card on the lead page (round 8,
// 2026-11-09). Owner only: the page loads it only for the owner, never
// under View as. The quote is the lead's accepted one while it has one,
// otherwise its newest of any status. Null when the lead has no quote.
// Accepted lists the quote's offers biggest first, with the one the
// customer booked on their link chosen to start (round 9, 2026-11-10).

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
        "id, status, created_at, runs, offers, box_count, price_per_ft, box_price, adders, discounts, colour_timing, rush_fee, upper_access_fee, upper_gable_access_fee, min_job_total, gst_enabled, gst_rate, accepted_at, accepted_runs, declined_at, decline_reason, cancelled_at, cancel_reason, outcome_note",
      )
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("quote_links")
      .select("booked_at, booked_option, booked_offer, booked_selection")
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
  const rate = Number(settings?.commission_rate ?? 0);
  // The quote's own prices as numbers. The commission reads only the runs,
  // the boxes, the two prices and the discounts, never a total
  // (lib/pay/commission.ts); the offers' prices read the rest.
  const priced = {
    ...quote,
    box_count: Number(quote.box_count),
    price_per_ft: Number(quote.price_per_ft),
    box_price: Number(quote.box_price),
    gst_rate: Number(quote.gst_rate),
  };
  // What accepting would pay, per offer: the offer's own runs, or every
  // run (null) for the offer that covers them all, and its own box count
  // when it has one, the database's way.
  const standing = earning && earning.status !== "void" ? earning : null;
  const options = acceptOptions({
    quote: priced,
    link: linkRow ?? null,
    commission: (positions, boxes) =>
      previewCommission({ receiver, existing: standing, quote: priced, positions, boxes, rate }),
  });

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
        quote.status === "accepted" || quote.status === "cancelled" ? acceptedOption(quote, quote.accepted_runs) : null,
    },
    options,
    commission: standingCommission(earning, receiver, names),
  };
}
