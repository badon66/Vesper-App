import "server-only";
import { prepSummary, type PrepSummary } from "@/lib/meetings/prep";
import type { QuestionLead } from "@/lib/leads/questions";
import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

// The prep list's facts for some leads (round 7, Keenan, 2026-11-08): the
// mockup, the track colour, a quote with runs, and the six questions. Owner
// only: quotes are his alone, and the screens that call this are his.
export type PrepLead = QuestionLead & { id: string };
export type PrepMeeting = { id: string; confirmed_at: string | null } | null;

export async function prepFor(
  supabase: Client,
  leads: PrepLead[],
  meetingFor: (leadId: string) => PrepMeeting,
): Promise<Map<string, PrepSummary>> {
  const out = new Map<string, PrepSummary>();
  const ids = [...new Set(leads.map((lead) => lead.id))];
  if (ids.length === 0) return out;
  const [{ data: colours }, { data: mockups }, { data: quotes }] = await Promise.all([
    supabase.from("leads").select("id, track_colour_id, track_ral_code").in("id", ids),
    supabase.from("lead_photos").select("lead_id").eq("slot", "mockup").in("lead_id", ids),
    supabase.from("quotes").select("lead_id, runs").in("lead_id", ids),
  ]);
  const hasColour = new Set((colours ?? []).filter((row) => row.track_colour_id || row.track_ral_code).map((row) => row.id));
  const hasMockup = new Set((mockups ?? []).map((row) => row.lead_id));
  const hasQuote = new Set((quotes ?? []).filter((row) => Array.isArray(row.runs) && row.runs.length > 0).map((row) => row.lead_id));
  for (const lead of leads) {
    const meeting = meetingFor(lead.id);
    out.set(
      lead.id,
      prepSummary({
        hasMockup: hasMockup.has(lead.id),
        hasTrackColour: hasColour.has(lead.id),
        hasQuoteWithRuns: hasQuote.has(lead.id),
        hasMeeting: meeting !== null,
        confirmedAt: meeting?.confirmed_at ?? null,
        lead,
      }),
    );
  }
  return out;
}
