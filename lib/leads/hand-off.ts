import type { LeadDraft } from "@/lib/leads/draft";

// Keep as a lead (round 2 polish, 2026-11-03): the booking sheet hands a
// person it can't book to New lead, with everything entered. On a setter's
// phone it also goes in New lead's own draft, so a reload keeps it; while
// Keenan views the app as someone, nothing is kept on his device, so it
// passes in memory only, for the one visit to New lead.
let pending: LeadDraft | null = null;

const FRESH_MS = 10 * 60_000;

export function handOffToNewLead(draft: LeadDraft): void {
  pending = draft;
}

// The hand-off, once, if it is recent.
export function takeHandOff(now: number): LeadDraft | null {
  const draft = pending;
  pending = null;
  return draft && now - draft.savedAt <= FRESH_MS ? draft : null;
}
