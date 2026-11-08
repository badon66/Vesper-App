import "server-only";

import { loadDeckPayload, loadMeetingPayload } from "@/lib/meeting/deck-payload";
import type { createClient } from "@/lib/supabase/server";
import { calgaryDayStart, calgaryToday, requestTime } from "@/lib/time";

import {
  chosenLead,
  firstExamples,
  LIVE_STATUSES,
  rehearsalChoices,
  type ReferenceLinkRow,
  type RehearsalData,
  type UpcomingRow,
} from "./rehearsal";

// The rehearsal view's own server function (round 7, rehearsal_and_references:
// "rehearsal data comes from its own server function"). It builds the deck
// exactly as a meeting does, through lib/meeting/deck-payload.ts, and reads
// the example shots from presentation_references separately: they travel
// beside the meeting's payload in RehearsalData.examples, never inside it,
// and nothing a meeting loads ever reads them.
//
// Read only: selects and signed photo links, nothing written. Called only
// by the rehearsal page, after it has checked the signed-in person is the
// owner; every table here is owner only by Row Level Security as well.

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Two weeks of evenings at four meetings each fit well inside this.
const UPCOMING_LIMIT = 80;

export async function loadRehearsal(supabase: Supabase, requested: string | null): Promise<RehearsalData> {
  const now = requestTime();
  const today = calgaryToday(new Date(now));

  // The lead's payload starts loading with everything else; it is used only
  // if that lead turns out to be one of the upcoming meetings offered.
  const [upcoming, references, asked, deckAlone] = await Promise.all([
    supabase
      .from("meetings")
      .select("lead_id, starts_at, ends_at, status, lead:leads!meetings_lead_id_fkey(first_name, last_name, address_line, neighbourhood)")
      .gte("starts_at", calgaryDayStart(today))
      .in("status", [...LIVE_STATUSES])
      .order("starts_at")
      .limit(UPCOMING_LIMIT)
      .then(({ data }) => (data ?? []) as unknown as UpcomingRow[]),
    supabase
      .from("presentation_references")
      .select("slot, rank, image_url, page_url, site")
      .order("slot")
      .order("rank")
      .then(({ data }) => (data ?? []) as ReferenceLinkRow[]),
    requested ? loadMeetingPayload(supabase, requested) : Promise.resolve(null),
    requested ? Promise.resolve(null) : loadDeckPayload(supabase, { leadId: null }),
  ]);

  const choices = rehearsalChoices(upcoming, { today, now });
  const leadId = asked ? chosenLead(requested, choices) : null;
  const meeting = leadId ? asked : null;
  const deck = meeting?.deck ?? deckAlone ?? (await loadDeckPayload(supabase, { leadId: null }));

  return { deck, meeting, examples: firstExamples(references), choices, leadId };
}
