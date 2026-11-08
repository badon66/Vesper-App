import { DECK_SLOTS, PAGE_LAYOUT, SLOT_BY_KEY, type DeckSlot } from "@/lib/deck";
import { MEETING_PHOTO_MAX_EDGE, shrinkPhoto } from "@/lib/photos";

// Keenan's own photos for the deck's named slots (round 7, Branch B): where
// they live, how they are ordered, what a customer sees while a slot is
// empty, and the crop every focus point serves. Pure apart from
// shrinkDeckPhoto, which runs in the browser. Shared by Settings' shot list
// and, for the order, by the meeting's payload and the rehearsal view.
//
// CONTRACT
//   DECK_BUCKET, deckPhotoPaths(id), isDeckPhotoId(id)
//                              the private presentation bucket, at
//                              deck/<uuid>.jpg and deck/<uuid>-640.jpg
//   shrinkDeckPhoto(file)      browser only: { full (3200 px), thumb (640 px) }
//   photosInOrder(photos)      by sort, then upload time
//   sortGroup(slot)            "gallery" for every gallery slot (one order
//                              across them all), else the slot itself
//   galleryPhotos(photos)      the gallery's photos in Keenan's order
//   placeNewPhoto(group, id, slot)
//                              the sorts after adding a photo: the gallery
//                              keeps warm whites first and the holiday look last
//   movedSorts(group, id, delta)
//                              the sorts after moving one photo a place
//   withSortChanges(photos, changes)
//                              a screen's copy of the photos, re-sorted
//   filledSlotCount(photos)    "N of 20 slots filled" (a slot with several
//                              photos counts once)
//   slotStatus(slot, photos)   what a customer sees today, in Keenan's words
//   slotCrop(slot)             the shape the meeting crops this slot's photo to
//   focusFromPoint(box, x, y), nudgeFocus(focus, key)
//   standardPoints(text)       the shooting standard as a list
//   referencesBySlot(refs)     example links per slot, best first

export const DECK_BUCKET = "presentation";
export const DECK_PHOTO_MAX_EDGE = MEETING_PHOTO_MAX_EDGE;
export const DECK_THUMB_EDGE = 640;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isDeckPhotoId(id: unknown): id is string {
  return typeof id === "string" && UUID.test(id);
}

// One id names the row and both files, so a photo's files are always found.
export function deckPhotoPaths(id: string): { path: string; thumbPath: string } {
  return { path: `deck/${id}.jpg`, thumbPath: `deck/${id}-${DECK_THUMB_EDGE}.jpg` };
}

// Browser only: the photo at 3200 px on the long edge for the meeting, and
// a 640 px copy for the gallery's grid and Settings. Re-encoding as JPEG
// also drops the location a camera writes into the file.
export async function shrinkDeckPhoto(file: Blob): Promise<{ full: Blob; thumb: Blob }> {
  const full = await shrinkPhoto(file, DECK_PHOTO_MAX_EDGE);
  const thumb = await shrinkPhoto(full, DECK_THUMB_EDGE);
  return { full, thumb };
}

// ---------------------------------------------------------------- order

export type Ordered = { id: string; slot: string; sort: number; created_at: string };

export function photosInOrder<T extends Ordered>(photos: T[]): T[] {
  return [...photos].sort(
    (a, b) => a.sort - b.sort || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
  );
}

export const isGallerySlot = (slot: string) => SLOT_BY_KEY.get(slot)?.page === "gallery";

export function sortGroup(slot: string): string {
  return isGallerySlot(slot) ? "gallery" : slot;
}

export function inGroup<T extends Ordered>(photos: T[], group: string): T[] {
  return photosInOrder(photos.filter((photo) => sortGroup(photo.slot) === group));
}

export function galleryPhotos<T extends Ordered>(photos: T[]): T[] {
  return inGroup(photos, "gallery");
}

export type SortChange = { id: string; sort: number };

// Numbers a group 0, 1, 2... in the given order and returns only the
// photos whose sort changed.
function renumber(order: { id: string; sort: number }[]): SortChange[] {
  return order.flatMap((photo, at) => (photo.sort === at ? [] : [{ id: photo.id, sort: at }]));
}

const HOLIDAY_SLOT = "gallery.holiday";

// Where a new photo goes in its group: last, except that in the gallery a
// photo that isn't the holiday look goes before the first holiday photo
// ("warm whites first and colour looks last"). Returns the new photo's sort
// and any others that moved.
export function placeNewPhoto(group: Ordered[], id: string, slot: string): { sort: number; changes: SortChange[] } {
  const order: { id: string; sort: number }[] = photosInOrder(group).map(({ id: photoId, sort }) => ({ id: photoId, sort }));
  let at = order.length;
  if (isGallerySlot(slot) && slot !== HOLIDAY_SLOT) {
    const holiday = photosInOrder(group).findIndex((photo) => photo.slot === HOLIDAY_SLOT);
    if (holiday >= 0) at = holiday;
  }
  order.splice(at, 0, { id, sort: Number.NaN });
  const changes = renumber(order);
  return { sort: at, changes: changes.filter((change) => change.id !== id) };
}

// Moves one photo a place earlier (-1) or later (+1) in its group.
export function movedSorts(group: Ordered[], id: string, delta: -1 | 1): SortChange[] {
  const order = photosInOrder(group).map(({ id: photoId, sort }) => ({ id: photoId, sort }));
  const from = order.findIndex((photo) => photo.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= order.length) return [];
  [order[from], order[to]] = [order[to], order[from]];
  return renumber(order);
}

// The screen's own copy of the photos, with the sorts an action reported.
export function withSortChanges<T extends { id: string; sort: number }>(photos: T[], changes: SortChange[]): T[] {
  if (changes.length === 0) return photos;
  const next = new Map(changes.map((change) => [change.id, change.sort]));
  return photos.map((photo) => (next.has(photo.id) ? { ...photo, sort: next.get(photo.id) as number } : photo));
}

// ---------------------------------------------------------------- what a customer sees today

export function filledSlotCount(photos: { slot: string }[]): number {
  const filled = new Set(photos.map((photo) => photo.slot));
  return DECK_SLOTS.filter((slot) => filled.has(slot.key)).length;
}

const PAIRS: Record<string, string> = {
  "hidden_by_day.day": "hidden_by_day.night",
  "hidden_by_day.night": "hidden_by_day.day",
  "whites_first.warm": "whites_first.cool",
  "whites_first.cool": "whites_first.warm",
};

export type SlotStatus = { filled: boolean; text: string };

export function slotStatus(slot: DeckSlot, photos: { slot: string }[]): SlotStatus {
  const count = photos.filter((photo) => photo.slot === slot.key).length;
  const partner = PAIRS[slot.key];
  if (count > 0) {
    if (partner && !photos.some((photo) => photo.slot === partner)) {
      return { filled: true, text: "Your photo. Customers see the drawings until its pair is in." };
    }
    return { filled: true, text: slot.max > 1 ? `Your photos, ${count} of ${slot.max}` : "Your photo" };
  }
  if (partner && photos.some((photo) => photo.slot === partner)) {
    return { filled: false, text: "Empty: customers see the drawings until this is in" };
  }
  switch (slot.fallback) {
    case "words":
      return { filled: false, text: "Empty: words only" };
    case "skip":
      return photos.some((photo) => isGallerySlot(photo.slot))
        ? { filled: false, text: "Empty: the gallery shows your other photos" }
        : { filled: false, text: "Empty: page skipped" };
    default:
      return { filled: false, text: "Empty: customers see the drawing" };
  }
}

// ---------------------------------------------------------------- crops and the focus point

// At 1180 x 820: a band page's photo is the full width above a band 30% of
// the height; a split page's picture, and every More layer's, is the left
// 56% at full height.
export const BAND_PHOTO_ASPECT = 1180 / (820 * 0.7);
export const SPLIT_PHOTO_ASPECT = (1180 * 0.56) / 820;

// The shape the meeting crops a slot's photo to, around its focus point, or
// null where the photo is shown whole (app screenshots, the warm and cool
// pair side by side).
export function slotCrop(slot: DeckSlot): { aspect: number; label: string } | null {
  if (slot.role === "warm" || slot.role === "cool") return null;
  if (slot.role === "more") {
    return slot.max > 1 ? null : { aspect: SPLIT_PHOTO_ASPECT, label: "Behind the button, beside its words" };
  }
  if (PAGE_LAYOUT[slot.page] === "split") return { aspect: SPLIT_PHOTO_ASPECT, label: "On the left of the page" };
  return { aspect: BAND_PHOTO_ASPECT, label: "Above the band" };
}

export type Focus = { x: number; y: number };

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round3 = (n: number) => Math.round(n * 1000) / 1000;

// A tap on the photo, as a point from 0 to 1 across and down.
export function focusFromPoint(box: { left: number; top: number; width: number; height: number }, clientX: number, clientY: number): Focus {
  if (!(box.width > 0) || !(box.height > 0)) return { x: 0.5, y: 0.5 };
  return { x: round3(clamp01((clientX - box.left) / box.width)), y: round3(clamp01((clientY - box.top) / box.height)) };
}

export const FOCUS_STEP = 0.05;

// Arrow keys move the point a step, for a keyboard.
export function nudgeFocus(focus: Focus, key: string): Focus | null {
  const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[key];
  if (!step) return null;
  return { x: round3(clamp01(focus.x + step[0] * FOCUS_STEP)), y: round3(clamp01(focus.y + step[1] * FOCUS_STEP)) };
}

export function isFocus(x: unknown, y: unknown): boolean {
  return typeof x === "number" && typeof y === "number" && x >= 0 && x <= 1 && y >= 0 && y <= 1;
}

// ---------------------------------------------------------------- the shot list's text

// "Every night shot: a; b; c. Day shots: d." as { night: [A, B, C], day: "D" }.
export function standardPoints(text: string): { night: string[]; day: string } {
  const [nightPart = "", dayPart = ""] = text.split(/\s*Day shots:\s*/);
  const upper = (line: string) => (line ? line.charAt(0).toUpperCase() + line.slice(1) : line);
  const night = nightPart
    .replace(/^\s*Every night shot:\s*/, "")
    .replace(/\.\s*$/, "")
    .split(/;\s*/)
    .map((line) => upper(line.trim()))
    .filter(Boolean);
  return { night, day: upper(dayPart.trim()) };
}

export type ReferenceRow = {
  id: string;
  slot: string;
  rank: number;
  image_url: string | null;
  page_url: string;
  site: string;
  why: string;
  shot: string;
};

export function referencesBySlot<T extends Pick<ReferenceRow, "slot" | "rank">>(refs: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const ref of [...refs].sort((a, b) => a.rank - b.rank)) {
    out.set(ref.slot, [...(out.get(ref.slot) ?? []), ref]);
  }
  return out;
}
