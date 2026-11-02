"use server";

import { revalidatePath } from "next/cache";
import { NotOwnerError, ReadOnlyError, requireOwnerForAction } from "@/lib/auth/profile";
import { leadColumnsFromValues, leadFormDataToInput, parseLeadForm } from "@/lib/leads/schema";
import { leadName, STATUS_LABELS } from "@/lib/leads/status";
import { cleanSearch, searchFilter } from "@/lib/leads/search";
import { createClient } from "@/lib/supabase/server";
import { VIEW_AS_READ_ONLY } from "@/lib/view-as";

// Start a meeting on the Meetings page (Keenan, 2026-11-02): for someone
// not booked through the schedule, find their lead or add them, then open
// meeting mode. Owner only, like everything about meetings.

async function owner(): Promise<{ id: string } | string> {
  try {
    return await requireOwnerForAction();
  } catch (e) {
    if (e instanceof ReadOnlyError) return VIEW_AS_READ_ONLY;
    if (e instanceof NotOwnerError) return "Only Keenan starts meetings.";
    throw e;
  }
}

export type LeadMatch = { id: string; name: string; address: string; status: string };
export type LeadSearchResult = { ok: true; leads: LeadMatch[] } | { ok: false; error: string };

// The Leads search (names, address, neighbourhood, phone digits) over every
// lead, newest first.
export async function searchLeadsForMeeting(query: string): Promise<LeadSearchResult> {
  const me = await owner();
  if (typeof me === "string") return { ok: false, error: me };
  const filter = searchFilter(cleanSearch(query));
  if (!filter) return { ok: true, leads: [] };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("id, first_name, last_name, address_line, neighbourhood, status")
    .or(filter)
    .order("created_at", { ascending: false })
    .limit(8);
  if (error) return { ok: false, error: "The search didn't work. Check your signal and try again." };
  return {
    ok: true,
    leads: (data ?? []).map((lead) => ({
      id: lead.id,
      name: leadName(lead),
      address: [lead.address_line, lead.neighbourhood].filter(Boolean).join(", "),
      status: STATUS_LABELS[lead.status],
    })),
  };
}

export type NewPersonState = {
  leadId?: string;
  error?: string;
  errors?: { first_name?: string; last_name?: string; address_line?: string };
};

// Someone new: a lead like any other, saved with New lead's own checks, as
// New with source Other (changeable on the lead page). The page then opens
// meeting mode with a full page load, so the iPad keeps it.
export async function startMeetingForNewPerson(_previous: NewPersonState, formData: FormData): Promise<NewPersonState> {
  const me = await owner();
  if (typeof me === "string") return { error: me };

  const input = leadFormDataToInput(formData);
  const parsed = parseLeadForm({ ...input, source: "other" });
  if (!parsed.ok) {
    const { first_name, last_name, address_line, lat } = parsed.errors;
    return {
      error: "A field needs a look.",
      errors: { first_name, last_name, address_line: address_line ?? lat },
    };
  }
  const { values } = parsed;
  const supabase = await createClient();
  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      ...leadColumnsFromValues(values),
      first_name: values.first_name,
      address_line: values.address_line,
      created_by: me.id,
      status: "new",
      knock_session_id: null,
    })
    .select("id")
    .single();
  if (error || !lead) return { error: "They could not be added. Check your signal and try again." };
  revalidatePath("/app/leads");
  revalidatePath("/app/meetings");
  return { leadId: lead.id };
}
