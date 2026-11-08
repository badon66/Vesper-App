import "server-only";
import { type ContactViewer, maySeeContact } from "@/lib/leads/contact-rules";
import { cleanAnswerNotes, type AnswerNotes } from "@/lib/leads/questions";
import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

// Notes on a lead (round 6, Keenan, 2026-11-07): the setter's notes, a note
// on each answer and the notes on the timeline are for the lead's own setter
// and Keenan only, like the phone and email. They come only from the
// lead_notes view, which already holds back other setters' leads from a
// setter's own session; the rule is applied again here so View as, which
// reads with Keenan's session, shows a setter exactly what they would see.
export type LeadNotes = { notes: string | null; answerNotes: AnswerNotes };
export const NO_NOTES: LeadNotes = { notes: null, answerNotes: {} };

export async function notesForLeads(supabase: Client, viewer: ContactViewer, leadIds: string[]): Promise<Map<string, LeadNotes>> {
  const out = new Map<string, LeadNotes>();
  const ids = [...new Set(leadIds.filter(Boolean))];
  if (ids.length === 0) return out;
  const { data } = await supabase.from("lead_notes").select("lead_id, notes, answer_notes, created_by, assigned_to").in("lead_id", ids);
  for (const row of data ?? []) {
    if (!row.lead_id || !row.created_by) continue;
    if (!maySeeContact(viewer, { created_by: row.created_by, assigned_to: row.assigned_to })) continue;
    out.set(row.lead_id, { notes: row.notes, answerNotes: cleanAnswerNotes(row.answer_notes) });
  }
  return out;
}

export async function notesFor(supabase: Client, viewer: ContactViewer, leadId: string): Promise<LeadNotes> {
  return (await notesForLeads(supabase, viewer, [leadId])).get(leadId) ?? NO_NOTES;
}
