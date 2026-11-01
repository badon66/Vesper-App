"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NotOwnerError, ReadOnlyError, requireOwnerForAction } from "@/lib/auth/profile";
import { reorderTrackColours, trackColourFormSchema } from "@/lib/leads/track-colour";
import { createClient } from "@/lib/supabase/server";
import { VIEW_AS_READ_ONLY } from "@/lib/view-as";

// Keenan's track colour list. Colours are added, renamed, given a RAL code,
// reordered and retired; nothing here removes one, and no policy in the
// database allows it, so leads that have a colour always keep it.

export type TrackColourFormState = {
  ok?: boolean;
  error?: string;
  errors?: { name?: string; ral_code?: string };
};

export type TrackColourResult = { ok: true } | { ok: false; error: string };

// null when the owner may go ahead, or the message to show instead.
async function refusal(): Promise<string | null> {
  try {
    await requireOwnerForAction();
    return null;
  } catch (e) {
    if (e instanceof ReadOnlyError) return VIEW_AS_READ_ONLY;
    if (e instanceof NotOwnerError) return "Not for your role.";
    throw e;
  }
}

function parseColourForm(
  formData: FormData,
): { ok: true; name: string; ral_code: string | null } | { ok: false; state: TrackColourFormState } {
  const parsed = trackColourFormSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    ral_code: String(formData.get("ral_code") ?? ""),
  });
  if (parsed.success) return { ok: true, ...parsed.data };
  const errors: TrackColourFormState["errors"] = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] === "ral_code" ? "ral_code" : "name";
    errors[field] ??= issue.message;
  }
  return { ok: false, state: { error: "The colour needs a look.", errors } };
}

function saveError(error: { code?: string }): TrackColourFormState {
  if (error.code === "23505") {
    return {
      error: "The colour needs a look.",
      errors: { name: "There is already a colour with that name." },
    };
  }
  if (error.code === "23503") {
    return {
      error: "The colour needs a look.",
      errors: { ral_code: "That number isn't on the RAL Classic list. Check it in the RAL K7 book." },
    };
  }
  return { error: "The colour could not be saved. Try again." };
}

function done() {
  revalidatePath("/app/admin/settings");
  revalidatePath("/app/leads", "layout");
}

export async function addTrackColour(
  _previous: TrackColourFormState,
  formData: FormData,
): Promise<TrackColourFormState> {
  const refused = await refusal();
  if (refused) return { error: refused };
  const parsed = parseColourForm(formData);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("track_colours")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabase.from("track_colours").insert({
    name: parsed.name,
    ral_code: parsed.ral_code,
    sort_order: (last?.sort_order ?? 0) + 1,
  });
  if (error) return saveError(error);
  done();
  return { ok: true };
}

export async function updateTrackColour(
  _previous: TrackColourFormState,
  formData: FormData,
): Promise<TrackColourFormState> {
  const refused = await refusal();
  if (refused) return { error: refused };
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "That colour was not found." };
  const parsed = parseColourForm(formData);
  if (!parsed.ok) return parsed.state;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("track_colours")
    .update({ name: parsed.name, ral_code: parsed.ral_code })
    .eq("id", id.data)
    .select("id");
  if (error) return saveError(error);
  if (!data || data.length === 0) return { error: "That colour was not found." };
  done();
  return { ok: true };
}

export async function moveTrackColour(
  colourId: string,
  direction: "up" | "down",
): Promise<TrackColourResult> {
  const refused = await refusal();
  if (refused) return { ok: false, error: refused };
  const id = z.uuid().safeParse(colourId);
  const way = z.enum(["up", "down"]).safeParse(direction);
  if (!id.success || !way.success) return { ok: false, error: "That colour was not found." };

  const supabase = await createClient();
  const { data: colours, error } = await supabase
    .from("track_colours")
    .select("id, name, ral_code, sort_order, active");
  if (error || !colours) return { ok: false, error: "The list could not be loaded. Try again." };

  for (const change of reorderTrackColours(colours, id.data, way.data)) {
    const { error: moveError } = await supabase
      .from("track_colours")
      .update({ sort_order: change.sort_order })
      .eq("id", change.id);
    if (moveError) return { ok: false, error: "The colour could not be moved. Try again." };
  }
  done();
  return { ok: true };
}

// Retiring takes a colour off the choices for leads; leads that have it keep
// it. Restoring puts it back.
export async function setTrackColourActive(
  colourId: string,
  active: boolean,
): Promise<TrackColourResult> {
  const refused = await refusal();
  if (refused) return { ok: false, error: refused };
  const id = z.uuid().safeParse(colourId);
  if (!id.success || typeof active !== "boolean") {
    return { ok: false, error: "That colour was not found." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("track_colours")
    .update({ active })
    .eq("id", id.data)
    .select("id");
  if (error || !data || data.length === 0) {
    return { ok: false, error: "The colour could not be changed. Try again." };
  }
  done();
  return { ok: true };
}
