import "server-only";

import { editableQuotes, PRICING_SETTINGS, pricingFrom } from "@/lib/meeting/deck-payload";
import type { MeetingPayload, QuoteDraft } from "@/lib/meeting/state";
import type { createClient } from "@/lib/supabase/server";
import { calgaryToday } from "@/lib/time";

// The lead page's quote editor (round 9): the same quote and prices meeting
// mode loads (lib/meeting/deck-payload.ts), read with the signed-in owner's
// own session (quotes and settings' prices are owner only by Row Level
// Security). The page loads it only for the owner, never under View as.

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type QuoteEditorData = {
  pricing: MeetingPayload["pricing"];
  today: string;
  // The lead's accepted quote while it has one (read only), else its draft.
  draft: QuoteDraft | null;
};

export async function loadQuoteEditor(supabase: Supabase, leadId: string): Promise<QuoteEditorData | null> {
  const [{ data: settings }, draft] = await Promise.all([
    supabase.from("settings").select(PRICING_SETTINGS).eq("id", 1).maybeSingle(),
    editableQuotes(supabase, leadId),
  ]);
  if (!settings) return null;
  return { pricing: pricingFrom(settings), today: calgaryToday(), draft };
}
