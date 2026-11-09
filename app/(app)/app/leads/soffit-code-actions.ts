"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { setTrackColour } from "@/app/(app)/app/leads/actions";
import {
  NotAllowedError,
  NotOwnerError,
  ReadOnlyError,
  requireOwnerForAction,
  requireSalesSideForAction,
  type SessionProfile,
} from "@/lib/auth/profile";
import {
  parseSoffitCode,
  SOFFIT_CODE_ERROR,
  SOFFIT_CODE_COLUMN,
  SOFFIT_CODE_NOT_SPLIT,
  SOFFIT_CODE_UNKNOWN,
  soffitCodeLabel,
  trackChoiceFor,
  trackChoiceForm,
  trackChoiceText,
} from "@/lib/leads/soffit-code";
import { createClient } from "@/lib/supabase/server";
import { VIEW_AS_READ_ONLY } from "@/lib/view-as";

// Soffit colour code (Keenan, 2026-11-09). The lead's own setter and Keenan
// set or clear each code; everyone else is refused here and by the leads
// update policy. Keenan's Use for the track goes through the track colour
// form's own action, so the owner-only guard, the timeline and what it
// refreshes stay exactly as they are. Nothing here writes a note or a
// timeline entry; the leads trigger names the field that changed.

export type SoffitCodeResult = { ok: true; code: string | null; label: string | null } | { ok: false; error: string };
// On success, the words for the colour the server actually set.
export type UseForTrackResult = { ok: true; text: string } | { ok: false; error: string };

const NOT_YOURS = "You can only change your own leads.";
const NOT_FOUND = "That lead was not found.";

const codeInput = z.object({
  leadId: z.uuid(),
  which: z.union([z.literal(1), z.literal(2)]),
  typed: z.string().max(40),
});

const trackInput = z.object({
  leadId: z.uuid(),
  which: z.union([z.literal(1), z.literal(2)]),
});

async function salesSide(): Promise<SessionProfile | string> {
  try {
    return await requireSalesSideForAction();
  } catch (e) {
    if (e instanceof ReadOnlyError) return VIEW_AS_READ_ONLY;
    if (e instanceof NotAllowedError) return "Not for your role.";
    throw e;
  }
}

function refresh(leadId: string) {
  revalidatePath(`/app/leads/${leadId}`);
  revalidatePath(`/app/meetings/prep/${leadId}`);
}

// Sets or clears one of a lead's soffit codes: which 1 is the soffit (the
// first colour when split), which 2 the split soffit's second colour.
export async function saveSoffitCode(leadId: string, which: 1 | 2, typed: string): Promise<SoffitCodeResult> {
  const me = await salesSide();
  if (typeof me === "string") return { ok: false, error: me };
  const input = codeInput.safeParse({ leadId, which, typed });
  if (!input.success) {
    const field = input.error.issues[0]?.path[0];
    return { ok: false, error: field === "typed" ? SOFFIT_CODE_ERROR : field === "which" ? "That soffit colour was not found." : NOT_FOUND };
  }
  const parsed = parseSoffitCode(input.data.typed);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, created_by, assigned_to, soffit_colour_2")
    .eq("id", input.data.leadId)
    .maybeSingle();
  if (leadError) return { ok: false, error: "The code could not be saved. Try again." };
  if (!lead) return { ok: false, error: NOT_FOUND };
  if (me.role !== "owner" && lead.created_by !== me.id && lead.assigned_to !== me.id) return { ok: false, error: NOT_YOURS };
  if (input.data.which === 2 && lead.soffit_colour_2 === null) return { ok: false, error: SOFFIT_CODE_NOT_SPLIT };

  let label: string | null = null;
  if (parsed.code) {
    const { data: ral, error: ralError } = await supabase.from("ral_classic_colours").select("code, name").eq("code", parsed.code).maybeSingle();
    // A failed lookup is not a wrong number: never send them back to the book for it.
    if (ralError) return { ok: false, error: "The code could not be saved. Try again." };
    if (!ral) return { ok: false, error: SOFFIT_CODE_UNKNOWN };
    label = soffitCodeLabel(ral.code, { [ral.code]: ral.name });
  }

  const column = SOFFIT_CODE_COLUMN[input.data.which];
  const { data, error } = await supabase
    .from("leads")
    .update(column === "soffit_ral_code" ? { soffit_ral_code: parsed.code } : { soffit_ral_code_2: parsed.code })
    .eq("id", lead.id)
    .select("id");
  if (error) {
    if (error.code === "23503") return { ok: false, error: SOFFIT_CODE_UNKNOWN };
    return { ok: false, error: error.code === "42501" ? NOT_YOURS : "The code could not be saved. Try again." };
  }
  if (!data || data.length === 0) return { ok: false, error: NOT_YOURS };

  refresh(lead.id);
  return { ok: true, code: parsed.code, label };
}

// Keenan's one tap: the track colour from a saved soffit code. The code is
// read here, never taken from the browser; the stock colour on his list
// with that RAL code wins, otherwise Custom with it. Saved through the
// track colour form's own action.
export async function setTrackFromSoffitCode(leadId: string, which: 1 | 2): Promise<UseForTrackResult> {
  try {
    await requireOwnerForAction();
  } catch (e) {
    if (e instanceof ReadOnlyError) return { ok: false, error: VIEW_AS_READ_ONLY };
    if (e instanceof NotOwnerError) return { ok: false, error: "Only Keenan sets the track colour." };
    throw e;
  }
  const input = trackInput.safeParse({ leadId, which });
  if (!input.success) return { ok: false, error: NOT_FOUND };

  const supabase = await createClient();
  const [{ data: lead }, { data: colours }] = await Promise.all([
    supabase.from("leads").select("id, soffit_ral_code, soffit_ral_code_2").eq("id", input.data.leadId).maybeSingle(),
    supabase.from("track_colours").select("id, name, ral_code, sort_order, active"),
  ]);
  if (!lead) return { ok: false, error: NOT_FOUND };
  const code = input.data.which === 1 ? lead.soffit_ral_code : lead.soffit_ral_code_2;
  if (!code) return { ok: false, error: "Save the soffit colour code first." };

  const picked = trackChoiceFor(code, colours ?? []);
  const choice = trackChoiceForm(picked);
  const form = new FormData();
  form.set("id", lead.id);
  form.set("choice", choice.choice);
  form.set("ral_code", choice.ral_code);
  const result = await setTrackColour({}, form);
  if (!result.ok) {
    return { ok: false, error: result.errors?.ral_code ?? result.errors?.choice ?? result.error ?? "The track colour could not be saved. Try again." };
  }
  // Name what was set from the server's own choice, so the line is right
  // even if the track colour list changed since the page was drawn.
  const codes = [code, picked.kind === "list" ? picked.colour.ral_code : null].filter((value): value is string => Boolean(value));
  const { data: names } = await supabase.from("ral_classic_colours").select("code, name").in("code", codes);
  return { ok: true, text: trackChoiceText(picked, new Map((names ?? []).map((row) => [row.code, row.name]))) };
}
