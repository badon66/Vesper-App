"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { checkTraceSave, DIDNT_SAVE } from "@/components/roofline/trace-save";
import { NotOwnerError, ReadOnlyError, requireOwnerForAction } from "@/lib/auth/profile";
import { isOwnPhotoPath, PHOTO_BUCKET } from "@/lib/photos";
import { createClient } from "@/lib/supabase/server";
import { VIEW_AS_READ_ONLY } from "@/lib/view-as";

// Tracing the roofline in prep (round 7, light_picker.tracing). Owner only,
// like everything about meetings: refused to setters, to View as, and to
// anyone signed out, and the roofline_traces table is owner only by Row
// Level Security too.

async function owner(): Promise<{ id: string } | string> {
  try {
    return await requireOwnerForAction();
  } catch (e) {
    if (e instanceof ReadOnlyError) return VIEW_AS_READ_ONLY;
    if (e instanceof NotOwnerError) return "Only Keenan traces rooflines.";
    throw e;
  }
}

// The photos a roofline can be traced on: the guided house photos, or an
// extra one (Keenan's own upload). Never the mockup or the soffit close-up.
const TRACEABLE_SLOTS = new Set<string | null>(["front", "left_corner", "right_corner", null]);

export type RooflineSaveResult = { ok: true; lightCount: number } | { ok: false; error: string };

// Saves the trace: the lines (0 to 1 on the photo), their measured feet,
// the scale, the dusk numbers measured from the photo, the light count
// (recounted here), the photo and the slot it is in now. One per lead; a
// new save replaces it.
export async function saveRooflineTrace(input: unknown): Promise<RooflineSaveResult> {
  const me = await owner();
  if (typeof me === "string") return { ok: false, error: me };
  const check = checkTraceSave(input);
  if (!check.ok) return check;

  const supabase = await createClient();
  const { data: photo } = await supabase
    .from("lead_photos")
    .select("id, slot")
    .eq("id", check.photoId)
    .eq("lead_id", check.leadId)
    .maybeSingle();
  if (!photo) return { ok: false, error: "That photo isn't on this lead any more. Pick another and trace it again." };
  if (!TRACEABLE_SLOTS.has(photo.slot)) return { ok: false, error: "Trace it on a photo of the house, not the mockup or the soffit close-up." };

  const { error } = await supabase.from("roofline_traces").upsert(
    {
      lead_id: check.leadId,
      photo_id: photo.id,
      photo_slot: photo.slot,
      lines: check.row.lines,
      line_feet: check.row.line_feet,
      scale: check.row.scale,
      dusk_brightness: check.row.dusk_brightness,
      luminance: check.row.luminance,
      light_count: check.row.light_count,
      updated_at: new Date().toISOString(),
      updated_by: me.id,
    },
    { onConflict: "lead_id" },
  );
  if (error) return { ok: false, error: error.code === "42501" ? "Only Keenan traces rooflines." : DIDNT_SAVE };

  revalidatePath(`/app/meetings/prep/${check.leadId}`);
  revalidatePath(`/app/meetings/prep/${check.leadId}/roofline`);
  revalidatePath("/app/meetings");
  revalidatePath(`/app/leads/${check.leadId}`);
  revalidatePath("/app");
  return { ok: true, lightCount: check.row.light_count };
}

export type TracePhotoResult = { ok: true; photo: { id: string; url: string } } | { ok: false; error: string };

// Change photo, Upload: a photo Keenan took (kept at 3200 px) is added to
// the lead as an extra photo, the same way the lead page adds one (already
// uploaded to his own folder in the lead-photos bucket), and handed back
// with a signed link so the tracer can open it.
export async function addTracePhoto(leadId: string, path: string): Promise<TracePhotoResult> {
  const me = await owner();
  if (typeof me === "string") return { ok: false, error: me };
  if (!z.uuid().safeParse(leadId).success) return { ok: false, error: "That lead was not found." };
  if (!isOwnPhotoPath(path, me.id)) return { ok: false, error: "The photo did not upload properly. Try it again." };

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("lead_photos")
    .insert({ lead_id: leadId, storage_path: path, slot: null })
    .select("id, storage_path")
    .single();
  if (error || !row) return { ok: false, error: "The photo could not be added. Check your signal and try again." };
  const { data: signed } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(row.storage_path, 3600);
  if (!signed?.signedUrl) return { ok: false, error: "The photo was added, but it won't open yet. Reload the page." };

  revalidatePath(`/app/leads/${leadId}`);
  return { ok: true, photo: { id: row.id, url: signed.signedUrl } };
}
