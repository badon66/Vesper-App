"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NotOwnerError, ReadOnlyError, requireOwnerForAction, type SessionProfile } from "@/lib/auth/profile";
import { deckWordsToJson, parseDeckWords, SLOT_BY_KEY } from "@/lib/deck";
import {
  DECK_BUCKET,
  deckPhotoPaths,
  inGroup,
  isDeckPhotoId,
  isFocus,
  isGallerySlot,
  movedSorts,
  placeNewPhoto,
  sortGroup,
  type SortChange,
} from "@/lib/photos-deck";
import {
  captionIssue,
  looksToJson,
  mergeEditableWords,
  parseDeckWordsInput,
  parseLooksInput,
  parseReferenceInput,
  tidyCaption,
  type DeckWordErrors,
} from "@/lib/settings/deck-schema";
import { createClient } from "@/lib/supabase/server";
import { VIEW_AS_READ_ONLY } from "@/lib/view-as";
import type { Database, Json } from "@/types/database";

// The deck's Settings (round 7, Branch B), owner only. Every write runs as
// the owner's own signed-in session, so the database's owner-only policies
// on settings, deck_photos, presentation_references and the presentation
// bucket are the real gate; View as is refused here like every other
// owner action. Photo files upload from the browser with the same session
// (lib/photos-deck.ts); these actions record them and remove them.
//
// The photo and link actions return what changed and the screen updates
// itself, so they don't re-render the page (and re-sign every photo's link)
// on each tap.

type Refused = { ok: false; error: string };

async function owner(): Promise<{ ok: true; profile: SessionProfile } | Refused> {
  try {
    return { ok: true, profile: await requireOwnerForAction() };
  } catch (e) {
    if (e instanceof ReadOnlyError) return { ok: false, error: VIEW_AS_READ_ONLY };
    if (e instanceof NotOwnerError) return { ok: false, error: "Not for your role." };
    throw e;
  }
}

// ---------------------------------------------------------------- the words and the looks

export type SaveDeckResult =
  | { ok: true; savedAt: string }
  | { ok: false; error: string; wordErrors?: DeckWordErrors };

// Saves the deck's words, the looks, or both, in one write. The words are
// merged over what is stored, so only the fields Settings shows change.
export async function saveDeck(input: { words?: unknown; looks?: unknown }): Promise<SaveDeckResult> {
  const guard = await owner();
  if (!guard.ok) return guard;
  if (input.words === undefined && input.looks === undefined) return { ok: true, savedAt: new Date().toISOString() };

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase.from("settings").select("deck, warranty_text").eq("id", 1).single();
  if (readError || !current) return { ok: false, error: "Settings could not be read. Try again." };

  const update: { deck?: Json; light_looks?: Json } = {};
  if (input.words !== undefined) {
    const parsed = parseDeckWordsInput(input.words, current.warranty_text);
    if (!parsed.ok) return { ok: false, error: "Some words need a look.", wordErrors: parsed.errors };
    update.deck = deckWordsToJson(mergeEditableWords(parseDeckWords(current.deck), parsed.words));
  }
  if (input.looks !== undefined) {
    const parsed = parseLooksInput(input.looks);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    update.light_looks = looksToJson(parsed.looks);
  }

  const { error } = await supabase.from("settings").update(update).eq("id", 1);
  if (error) return { ok: false, error: "The presentation could not be saved. Try again." };
  revalidatePath("/app/admin/settings");
  return { ok: true, savedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------- Keenan's photos

type PhotoRow = Database["public"]["Tables"]["deck_photos"]["Row"];
const PHOTO_FIELDS = "id, slot, path, thumb_path, focus_x, focus_y, caption, sort, created_at" as const;

export type DeckPhotoRecord = Pick<PhotoRow, "id" | "slot" | "focus_x" | "focus_y" | "caption" | "sort" | "created_at">;

export type PhotoResult = { ok: true; photo?: DeckPhotoRecord; sorts?: SortChange[] } | Refused;

async function applySorts(supabase: Awaited<ReturnType<typeof createClient>>, changes: SortChange[]) {
  const results = await Promise.all(changes.map((change) => supabase.from("deck_photos").update({ sort: change.sort }).eq("id", change.id)));
  return results.every((result) => !result.error);
}

async function groupRows(supabase: Awaited<ReturnType<typeof createClient>>, slot: string) {
  const query = supabase.from("deck_photos").select(PHOTO_FIELDS);
  const { data, error } = isGallerySlot(slot) ? await query.like("slot", "gallery.%") : await query.eq("slot", slot);
  return error ? null : inGroup((data ?? []) as PhotoRow[], sortGroup(slot));
}

const addSchema = z.object({ slot: z.string().max(80), id: z.string(), replaceId: z.string().nullable().optional() });

// Records a photo whose two files already landed at deck/<id>.jpg and
// deck/<id>-640.jpg. With replaceId, the new photo takes the old one's
// place (its order and caption) and the old row and files go.
export async function addDeckPhoto(input: { slot: string; id: string; replaceId?: string | null }): Promise<PhotoResult> {
  const guard = await owner();
  if (!guard.ok) return guard;
  const parsed = addSchema.safeParse(input);
  const slot = parsed.success ? SLOT_BY_KEY.get(parsed.data.slot) : undefined;
  if (!parsed.success || !slot || !isDeckPhotoId(parsed.data.id) || (parsed.data.replaceId && !isDeckPhotoId(parsed.data.replaceId))) {
    return { ok: false, error: "That photo could not be added." };
  }
  const { id, replaceId } = parsed.data;

  const supabase = await createClient();
  const group = await groupRows(supabase, slot.key);
  if (!group) return { ok: false, error: "The photos could not be read. Try again." };
  const replacing = replaceId ? group.find((photo) => photo.id === replaceId && photo.slot === slot.key) : undefined;
  if (replaceId && !replacing) return { ok: false, error: "The photo to replace was not found. Reload the page." };
  const inSlot = group.filter((photo) => photo.slot === slot.key && photo.id !== replaceId).length;
  if (inSlot >= slot.max) return { ok: false, error: slot.max === 1 ? "This slot already has a photo. Replace it instead." : `This slot holds ${slot.max} photos at most.` };

  const placed = replacing ? { sort: replacing.sort, changes: [] } : placeNewPhoto(group, id, slot.key);
  const { path, thumbPath } = deckPhotoPaths(id);
  const { data: row, error } = await supabase
    .from("deck_photos")
    .insert({
      id,
      slot: slot.key,
      path,
      thumb_path: thumbPath,
      sort: placed.sort,
      caption: replacing?.caption ?? null,
      created_by: guard.profile.id,
    })
    .select(PHOTO_FIELDS)
    .single();
  if (error || !row) return { ok: false, error: "The photo could not be saved. Try again." };

  if (replacing) {
    const { error: removeError } = await supabase.from("deck_photos").delete().eq("id", replacing.id);
    if (!removeError) {
      await supabase.storage.from(DECK_BUCKET).remove([replacing.path, ...(replacing.thumb_path ? [replacing.thumb_path] : [])]);
    }
  }
  const sorted = placed.changes.length > 0 ? await applySorts(supabase, placed.changes) : true;
  return { ok: true, photo: toRecord(row as PhotoRow), sorts: sorted ? placed.changes : [] };
}

function toRecord(row: PhotoRow): DeckPhotoRecord {
  return { id: row.id, slot: row.slot, focus_x: row.focus_x, focus_y: row.focus_y, caption: row.caption, sort: row.sort, created_at: row.created_at };
}

// Takes a photo out of its slot, then its two files out of the bucket.
export async function removeDeckPhoto(id: string): Promise<PhotoResult> {
  const guard = await owner();
  if (!guard.ok) return guard;
  if (!isDeckPhotoId(id)) return { ok: false, error: "That photo was not found." };
  const supabase = await createClient();
  const { data: row } = await supabase.from("deck_photos").select(PHOTO_FIELDS).eq("id", id).maybeSingle();
  if (!row) return { ok: false, error: "That photo was not found. Reload the page." };
  const { error } = await supabase.from("deck_photos").delete().eq("id", id);
  if (error) return { ok: false, error: "The photo could not be removed. Try again." };
  // The row goes first: a file left behind is harmless, a row without its
  // file would show a broken photo.
  await supabase.storage.from(DECK_BUCKET).remove([row.path, ...(row.thumb_path ? [row.thumb_path] : [])]);
  return { ok: true };
}

// The focus point every crop of this photo centres on.
export async function setDeckPhotoFocus(id: string, x: number, y: number): Promise<PhotoResult> {
  const guard = await owner();
  if (!guard.ok) return guard;
  if (!isDeckPhotoId(id) || !isFocus(x, y)) return { ok: false, error: "That focus point could not be saved." };
  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("deck_photos")
    .update({ focus_x: Math.round(x * 1000) / 1000, focus_y: Math.round(y * 1000) / 1000 })
    .eq("id", id)
    .select(PHOTO_FIELDS)
    .maybeSingle();
  if (error || !row) return { ok: false, error: "The focus point could not be saved. Try again." };
  return { ok: true, photo: toRecord(row as PhotoRow) };
}

// A gallery photo's caption: the look only, 4 words at most.
export async function setDeckPhotoCaption(id: string, caption: string): Promise<PhotoResult> {
  const guard = await owner();
  if (!guard.ok) return guard;
  if (!isDeckPhotoId(id) || typeof caption !== "string") return { ok: false, error: "That caption could not be saved." };
  const issue = captionIssue(caption);
  if (issue) return { ok: false, error: issue };
  const supabase = await createClient();
  const { data: current } = await supabase.from("deck_photos").select("slot").eq("id", id).maybeSingle();
  if (!current || !isGallerySlot(current.slot)) return { ok: false, error: "Only gallery photos have captions." };
  const { data: row, error } = await supabase
    .from("deck_photos")
    .update({ caption: tidyCaption(caption) })
    .eq("id", id)
    .select(PHOTO_FIELDS)
    .maybeSingle();
  if (error || !row) return { ok: false, error: "The caption could not be saved. Try again." };
  return { ok: true, photo: toRecord(row as PhotoRow) };
}

// Moves a photo one place earlier or later: across the whole gallery for a
// gallery photo, within its slot otherwise.
export async function moveDeckPhoto(id: string, delta: number): Promise<PhotoResult> {
  const guard = await owner();
  if (!guard.ok) return guard;
  if (!isDeckPhotoId(id) || (delta !== -1 && delta !== 1)) return { ok: false, error: "That photo was not found." };
  const supabase = await createClient();
  const { data: current } = await supabase.from("deck_photos").select("slot").eq("id", id).maybeSingle();
  if (!current) return { ok: false, error: "That photo was not found. Reload the page." };
  const group = await groupRows(supabase, current.slot);
  if (!group) return { ok: false, error: "The order could not be saved. Try again." };
  const changes = movedSorts(group, id, delta);
  if (changes.length > 0 && !(await applySorts(supabase, changes))) {
    return { ok: false, error: "The order could not be saved. Try again." };
  }
  return { ok: true, sorts: changes };
}

// ---------------------------------------------------------------- example links

export type ReferenceResult = { ok: true } | Refused;

// Replaces an example link in place. Links only: nothing is downloaded,
// copied or stored but the addresses and Keenan's words.
export async function updateReference(id: string, input: unknown): Promise<ReferenceResult> {
  const guard = await owner();
  if (!guard.ok) return guard;
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "That example was not found." };
  const parsed = parseReferenceInput(input);
  if (!parsed.ok) return parsed;
  const supabase = await createClient();
  const { data, error } = await supabase.from("presentation_references").update(parsed.value).eq("id", id).select("id").maybeSingle();
  if (error || !data) return { ok: false, error: "The example could not be saved. Try again." };
  return { ok: true };
}
