import "server-only";
import { prepSummary, rooflineFacts, rooflineState, type PrepSummary, type RooflineState } from "@/lib/meetings/prep";
import type { QuestionLead } from "@/lib/leads/questions";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type Client = Awaited<ReturnType<typeof createClient>>;
type PhotoSlot = Database["public"]["Enums"]["photo_slot"];

// The prep list's facts for some leads (round 7, Keenan, 2026-11-08): the
// mockup, the track colour, a quote with runs, the six questions, and (round
// 7, Branch B) the roofline traced for the light picker. Owner only: quotes
// and traces are his alone, and the screens that call this are his.
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
  const [{ data: colours }, { data: photos }, { data: quotes }, { data: traces }] = await Promise.all([
    supabase.from("leads").select("id, track_colour_id, track_ral_code").in("id", ids),
    supabase.from("lead_photos").select("id, lead_id, slot").in("lead_id", ids),
    supabase.from("quotes").select("lead_id, runs").in("lead_id", ids),
    supabase.from("roofline_traces").select("lead_id, photo_id, photo_slot").in("lead_id", ids),
  ]);
  const hasColour = new Set((colours ?? []).filter((row) => row.track_colour_id || row.track_ral_code).map((row) => row.id));
  const hasMockup = new Set((photos ?? []).filter((row) => row.slot === "mockup").map((row) => row.lead_id));
  const hasQuote = new Set((quotes ?? []).filter((row) => Array.isArray(row.runs) && row.runs.length > 0).map((row) => row.lead_id));
  const roofline = rooflineStates(traces ?? [], photos ?? []);
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
        ...rooflineFacts(roofline.get(lead.id) ?? "none"),
      }),
    );
  }
  return out;
}

function rooflineStates(
  traces: { lead_id: string; photo_id: string; photo_slot: PhotoSlot | null }[],
  photos: { id: string; lead_id: string; slot: PhotoSlot | null }[],
): Map<string, RooflineState> {
  const photosByLead = new Map<string, { id: string; slot: string | null }[]>();
  for (const photo of photos) {
    const list = photosByLead.get(photo.lead_id) ?? [];
    list.push({ id: photo.id, slot: photo.slot });
    photosByLead.set(photo.lead_id, list);
  }
  return new Map(traces.map((trace) => [trace.lead_id, rooflineState(trace, photosByLead.get(trace.lead_id) ?? [])]));
}

// One lead's roofline, for the prep page: whether it counts as traced, and
// what the item says when it does (which photo, how many lights).
export type RooflineFact = { state: RooflineState; photoSlot: PhotoSlot | null; lightCount: number | null };

export async function rooflineFor(supabase: Client, leadId: string): Promise<RooflineFact> {
  const [{ data: trace }, { data: photos }] = await Promise.all([
    supabase.from("roofline_traces").select("photo_id, photo_slot, light_count").eq("lead_id", leadId).maybeSingle(),
    supabase.from("lead_photos").select("id, slot").eq("lead_id", leadId),
  ]);
  const state = rooflineState(trace, photos ?? []);
  return {
    state,
    photoSlot: trace?.photo_slot ?? null,
    lightCount: state === "traced" ? (trace?.light_count ?? null) : null,
  };
}
