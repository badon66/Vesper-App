"use server";

import { revalidatePath } from "next/cache";
import { NotOwnerError, ReadOnlyError, requireOwnerForAction } from "@/lib/auth/profile";
import { leadColumnsFromValues, leadFormDataToInput, parseLeadForm } from "@/lib/leads/schema";
import { leadName, STATUS_LABELS } from "@/lib/leads/status";
import { leadIdsByPhone } from "@/lib/leads/contacts";
import { cleanSearch, searchFilter } from "@/lib/leads/search";
import { normalizePhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
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
  const search = cleanSearch(query);
  const supabase = await createClient();
  const phoneMatches = search.digits.length >= 3 ? await leadIdsByPhone(supabase, { id: me.id, role: "owner" }, search.digits) : [];
  const filter = searchFilter(search, phoneMatches);
  if (!filter) return { ok: true, leads: [] };
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
    const { first_name, last_name, address_line } = parsed.errors;
    if (first_name || last_name || address_line) {
      return { error: "A field needs a look.", errors: { first_name, last_name, address_line } };
    }
    return { error: "The address details didn't look right. Pick the address from the suggestions, or type it again." };
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

// ---------------------------------------------------------------- the prep list (round 7)

export type PrepActionResult = { ok: true; at?: string | null } | { ok: false; error: string };

// Time confirmed (Keenan, 2026-11-08): Keenan texts or calls them himself,
// then taps Confirmed, which records when. Taking it back clears it.
export async function confirmMeeting(meetingId: string, confirmed: boolean): Promise<PrepActionResult> {
  const me = await owner();
  if (typeof me === "string") return { ok: false, error: me };
  if (!/^[0-9a-f-]{36}$/i.test(meetingId)) return { ok: false, error: "That meeting was not found." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_meeting", { p_meeting: meetingId, p_confirmed: confirmed });
  if (error) return { ok: false, error: error.code === "P0001" ? "That meeting isn't booked any more." : "It didn't save. Check your signal and try again." };
  revalidatePath("/app/meetings");
  revalidatePath("/app");
  revalidatePath("/app/schedule");
  return { ok: true, at: data ?? null };
}

// Missing answers (Keenan, 2026-11-08): the questions left Not collected or
// never asked, answered from the prep list. Only the questions sent are
// changed, and an answer always clears its Not collected.
const ANSWER_VALUES: Record<string, readonly string[]> = {
  owns_home: ["yes", "no"],
  wants_price: ["yes", "not_yet"],
  both_decision_makers: ["yes", "no"],
  christmas_lights_now: ["hires", "diy", "none", "hires_and_diy"],
  looked_into_before: ["got_quotes", "thought_about_it", "new_to_them", "quotes_and_thought"],
};

type LeadUpdate = Database["public"]["Tables"]["leads"]["Update"];

export async function fillMissingAnswers(leadId: string, answers: Record<string, string>): Promise<PrepActionResult> {
  const me = await owner();
  if (typeof me === "string") return { ok: false, error: me };
  if (!/^[0-9a-f-]{36}$/i.test(leadId)) return { ok: false, error: "That lead was not found." };
  const update: LeadUpdate = {};
  const answered: string[] = [];
  for (const [question, value] of Object.entries(answers)) {
    if (question === "phone") {
      const phone = normalizePhone(value);
      if (!phone.ok || !phone.e164) return { ok: false, error: phone.ok ? "Type the number." : phone.error };
      update.phone = phone.e164;
      answered.push("phone");
      continue;
    }
    const allowed = ANSWER_VALUES[question];
    if (!allowed || !allowed.includes(value)) return { ok: false, error: "Pick one of the answers." };
    if (question === "owns_home") update.owns_home = value === "yes";
    else if (question === "both_decision_makers") update.both_decision_makers = value === "yes";
    else if (question === "wants_price") update.wants_price = value === "yes";
    else if (question === "christmas_lights_now") update.christmas_lights_now = value as LeadUpdate["christmas_lights_now"];
    else update.looked_into_before = value as LeadUpdate["looked_into_before"];
    answered.push(question);
  }
  if (answered.length === 0) return { ok: false, error: "Answer at least one question." };
  const supabase = await createClient();
  const { data: row } = await supabase.from("leads").select("not_collected").eq("id", leadId).maybeSingle();
  if (!row) return { ok: false, error: "That lead was not found." };
  update.not_collected = (row.not_collected ?? []).filter((item) => !answered.includes(item));
  const { error } = await supabase.from("leads").update(update).eq("id", leadId);
  if (error) return { ok: false, error: "It didn't save. Check your signal and try again." };
  revalidatePath("/app/meetings");
  revalidatePath(`/app/meetings/prep/${leadId}`);
  revalidatePath(`/app/leads/${leadId}`);
  return { ok: true };
}
