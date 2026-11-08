"use client";

import { ArrowDown, ArrowUp, Check, Circle, Crosshair, ImagePlus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SLOT_BY_KEY, WORD_LIMITS, wordCount, type DeckSlot } from "@/lib/deck";
import {
  DECK_BUCKET,
  deckPhotoPaths,
  focusFromPoint,
  galleryPhotos,
  isGallerySlot,
  nudgeFocus,
  photosInOrder,
  shrinkDeckPhoto,
  slotCrop,
  slotStatus,
  sortGroup,
  withSortChanges,
  type Focus,
  type ReferenceRow,
} from "@/lib/photos-deck";
import { captionIssue } from "@/lib/settings/deck-schema";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import {
  addDeckPhoto,
  moveDeckPhoto,
  removeDeckPhoto,
  setDeckPhotoCaption,
  setDeckPhotoFocus,
  type DeckPhotoRecord,
} from "./actions";
import { ReferenceFrame } from "./reference-frame";

// One slot of the shot list (round 7): its name, what a customer sees
// today, the exact shot to take, Keenan's photo (focus point, replace,
// remove, a gallery caption) and the example to copy beside it. Photos go
// from this browser straight into the private presentation bucket with the
// owner's own session, at 3200 px with a 640 px copy, and are recorded by
// an owner-only action; the screen keeps its own copy, so nothing reloads.

export type DeckPhotoView = DeckPhotoRecord & { url: string | null };
export type PhotosUpdate = (update: (photos: DeckPhotoView[]) => DeckPhotoView[]) => void;

type SlotCardProps = {
  slot: DeckSlot;
  photos: DeckPhotoView[];
  references: ReferenceRow[];
  onPhotos: PhotosUpdate;
  onReference: (reference: ReferenceRow) => void;
  onBlobUrl: (url: string) => void;
};

// Uploading a photo into a slot, shared by the slot's card and its row in
// the shot list grouped by when to shoot: the hidden file input, what is
// happening, and any error. pick(null) adds a photo, pick(id) replaces one.
function useSlotUpload(slot: DeckSlot, onPhotos: PhotosUpdate, onBlobUrl: (url: string) => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const replacing = useRef<string | null>(null);

  function pick(replaceId: string | null) {
    replacing.current = replaceId;
    input.current?.click();
  }

  async function upload(file: File | undefined) {
    if (input.current) input.current.value = "";
    if (!file) return;
    const replaceId = replacing.current;
    let landed: { path: string; thumbPath: string } | null = null;
    setBusy(replaceId ?? "add");
    setError(null);
    try {
      const id = crypto.randomUUID();
      const { path, thumbPath } = deckPhotoPaths(id);
      const storage = createClient().storage.from(DECK_BUCKET);
      setProgress("Preparing the photo");
      const { full, thumb } = await shrinkDeckPhoto(file);
      setProgress("Uploading");
      const [big, small] = await Promise.all([
        storage.upload(path, full, { contentType: "image/jpeg", upsert: false }),
        storage.upload(thumbPath, thumb, { contentType: "image/jpeg", upsert: false }),
      ]);
      landed = { path, thumbPath };
      if (big.error || small.error) throw new Error("That photo didn't upload. Check your connection and try again.");
      const result = await addDeckPhoto({ slot: slot.key, id, replaceId });
      if (!result.ok || !result.photo) throw new Error(result.ok ? "The photo could not be saved. Try again." : result.error);
      const url = URL.createObjectURL(thumb);
      onBlobUrl(url);
      const added: DeckPhotoView = { ...result.photo, url };
      onPhotos((previous) => withSortChanges([...previous.filter((photo) => photo.id !== replaceId), added], result.sorts ?? []));
    } catch (e) {
      // Take back whatever landed, so nothing is left in the bucket unrecorded.
      if (landed) void createClient().storage.from(DECK_BUCKET).remove([landed.path, landed.thumbPath]).catch(() => undefined);
      setError(e instanceof Error && e.message ? e.message : "That photo didn't upload. Try again.");
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  const fileInput = (
    <input
      ref={input}
      type="file"
      accept="image/*"
      tabIndex={-1}
      aria-hidden="true"
      className="sr-only"
      data-testid={`deck-slot-input-${slot.key}`}
      onChange={(event) => void upload(event.currentTarget.files?.[0])}
    />
  );
  const messages = (
    <>
      {progress ? (
        <p role="status" className="text-sm text-muted-foreground">
          {progress}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {error}
        </p>
      ) : null}
    </>
  );
  return { busy, pick, fileInput, messages };
}

export function SlotCard({ slot, photos, references, onPhotos, onReference, onBlobUrl }: SlotCardProps) {
  const mine = photosInOrder(photos.filter((photo) => photo.slot === slot.key));
  const status = slotStatus(slot, photos);
  const [main, ...others] = references;
  const { busy, pick, fileInput, messages } = useSlotUpload(slot, onPhotos, onBlobUrl);
  const room = mine.length < slot.max;
  const headingId = `slot-${slot.key.replace(".", "-")}`;

  return (
    <Card id={slotAnchor(slot.key)} role="group" aria-labelledby={headingId} data-testid="deck-slot" data-slot-key={slot.key} className="scroll-mt-24">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <h3 id={headingId} className="text-lg leading-tight font-bold">
            {slot.name}
          </h3>
          <p className="flex items-center gap-1.5 text-sm font-semibold" data-testid="deck-slot-status">
            {status.filled ? <Check aria-hidden="true" className="size-4" /> : <Circle aria-hidden="true" className="size-4 text-muted-foreground" />}
            <span className={status.filled ? undefined : "text-muted-foreground"}>{status.text}</span>
          </p>
        </div>
        <CardDescription className="max-w-prose text-base text-foreground">
          <span className="font-semibold">The shot: </span>
          {slot.scenario}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-2">
        <div className="flex flex-col gap-4">
          <p className="text-sm font-semibold">{slot.max > 1 ? `Your photos, up to ${slot.max}` : "Your photo"}</p>
          {mine.map((photo, at) => (
            <PhotoTile
              key={photo.id}
              slot={slot}
              photo={photo}
              position={{ at, count: mine.length }}
              busy={busy !== null}
              replacingThis={busy === photo.id}
              onReplace={() => pick(photo.id)}
              onPhotos={onPhotos}
            />
          ))}
          {mine.length === 0 ? (
            <div className="flex flex-col items-start gap-3 rounded-md border bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">No photo yet.</p>
              <Button type="button" variant="outline" disabled={busy !== null} onClick={() => pick(null)}>
                <ImagePlus aria-hidden="true" />
                {busy === "add" ? "Uploading" : "Upload my photo"}
              </Button>
            </div>
          ) : room ? (
            <Button type="button" variant="outline" className="self-start" disabled={busy !== null} onClick={() => pick(null)}>
              <ImagePlus aria-hidden="true" />
              {busy === "add" ? "Uploading" : "Add another photo"}
            </Button>
          ) : null}
          {fileInput}
          {messages}
        </div>
        <div className="flex flex-col gap-4">
          {main ? (
            <ReferenceFrame reference={main} slotName={slot.name} onSaved={onReference} />
          ) : (
            <p className="text-sm text-muted-foreground">No example for this one: the shot above says what to take.</p>
          )}
          {others.length > 0 ? <OtherExamples references={others} slotName={slot.name} onSaved={onReference} /> : null}
        </div>
      </CardContent>
    </Card>
  );
}

// Backups render only once opened, so their photos load only when asked for.
function OtherExamples({ references, slotName, onSaved }: { references: ReferenceRow[]; slotName: string; onSaved: (reference: ReferenceRow) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="rounded-md border px-3" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Other examples ({references.length})
      </summary>
      {open ? (
        <div className="flex flex-col gap-6 pb-3">
          {references.map((reference) => (
            <ReferenceFrame key={reference.id} reference={reference} slotName={slotName} onSaved={onSaved} />
          ))}
        </div>
      ) : null}
    </details>
  );
}

// Where a slot's card is on the page, for a link from its row.
export const slotAnchor = (key: string) => `slot-card-${key.replace(".", "-")}`;

// One slot in the shot list grouped by when to shoot (round 7 review,
// Keenan): its name, the shot in one line, what customers see today, and
// the same upload as its card. Readable at 390 px: the button wraps under
// the words on a phone.
export function ShotRow({
  slot,
  photos,
  onPhotos,
  onBlobUrl,
  onOpen,
}: {
  slot: DeckSlot;
  photos: DeckPhotoView[];
  onPhotos: PhotosUpdate;
  onBlobUrl: (url: string) => void;
  // Shows the slot's card (its page, its example and its full shot).
  onOpen: () => void;
}) {
  const mine = photosInOrder(photos.filter((photo) => photo.slot === slot.key));
  const status = slotStatus(slot, photos);
  const { busy, pick, fileInput, messages } = useSlotUpload(slot, onPhotos, onBlobUrl);
  const first = mine[0] ?? null;
  const room = mine.length < slot.max;
  const action = room
    ? { label: mine.length === 0 ? "Upload my photo" : "Add another photo", replaceId: null }
    : slot.max === 1 && first
      ? { label: "Replace", replaceId: first.id }
      : null;
  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0" data-testid="shot-row" data-slot-key={slot.key}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
        {first?.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- Keenan's own 640 px copy behind a signed link, or a local copy just uploaded
          <img src={first.url} alt="" className="h-14 w-20 shrink-0 rounded-sm border object-cover" />
        ) : null}
        <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
          <p className="font-semibold">{slot.name}</p>
          <p className="text-sm text-pretty">{slot.line}</p>
          <p className="flex items-center gap-1.5 text-sm" data-testid="shot-row-status">
            {status.filled ? <Check aria-hidden="true" className="size-4 shrink-0" /> : <Circle aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
            <span className={status.filled ? "font-semibold" : "text-muted-foreground"}>{status.text}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {action ? (
            <Button type="button" variant="outline" disabled={busy !== null} onClick={() => pick(action.replaceId)}>
              {action.replaceId ? <RefreshCw aria-hidden="true" /> : <ImagePlus aria-hidden="true" />}
              {busy !== null ? "Uploading" : action.label}
              <span className="sr-only">: {slot.name}</span>
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="sm" onClick={onOpen}>
            The full shot<span className="sr-only">: {slot.name}</span>
          </Button>
        </div>
      </div>
      {fileInput}
      {messages}
    </li>
  );
}

// ---------------------------------------------------------------- one of Keenan's photos

function PhotoTile({
  slot,
  photo,
  position,
  busy,
  replacingThis,
  onReplace,
  onPhotos,
}: {
  slot: DeckSlot;
  photo: DeckPhotoView;
  position: { at: number; count: number };
  busy: boolean;
  replacingThis: boolean;
  onReplace: () => void;
  onPhotos: PhotosUpdate;
}) {
  const [focusing, setFocusing] = useState(false);
  const [draftFocus, setDraftFocus] = useState<Focus | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  const focus = draftFocus ?? { x: photo.focus_x, y: photo.focus_y };
  const crop = slotCrop(slot);
  const movesInSlot = sortGroup(slot.key) === slot.key && position.count > 1;
  const label = slot.max > 1 ? `${slot.name}, photo ${position.at + 1}` : slot.name;
  const disabled = busy || pending;

  useEffect(() => {
    if (!confirmRemove) return;
    const timer = window.setTimeout(() => setConfirmRemove(false), 4000);
    return () => window.clearTimeout(timer);
  }, [confirmRemove]);

  useEffect(() => {
    if (focusing) box.current?.focus();
  }, [focusing]);

  function saveFocus(next: Focus) {
    const before = { x: photo.focus_x, y: photo.focus_y };
    setFocusing(false);
    setDraftFocus(null);
    setMessage(null);
    onPhotos((previous) => previous.map((item) => (item.id === photo.id ? { ...item, focus_x: next.x, focus_y: next.y } : item)));
    startTransition(async () => {
      const result = await setDeckPhotoFocus(photo.id, next.x, next.y);
      if (!result.ok) {
        onPhotos((previous) => previous.map((item) => (item.id === photo.id ? { ...item, focus_x: before.x, focus_y: before.y } : item)));
        setMessage(result.error);
      }
    });
  }

  function remove() {
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    setConfirmRemove(false);
    setMessage(null);
    startTransition(async () => {
      const result = await removeDeckPhoto(photo.id);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      onPhotos((previous) => previous.filter((item) => item.id !== photo.id));
    });
  }

  function move(delta: -1 | 1) {
    setMessage(null);
    startTransition(async () => {
      const result = await moveDeckPhoto(photo.id, delta);
      if (!result.ok) setMessage(result.error);
      else onPhotos((previous) => withSortChanges(previous, result.sorts ?? []));
    });
  }

  return (
    <div className="flex flex-col gap-3" data-testid="deck-photo">
      <div
        ref={box}
        tabIndex={focusing ? 0 : -1}
        role={focusing ? "button" : undefined}
        aria-label={focusing ? `${label}. Tap where every crop should centre, or move the point with the arrow keys and press Enter.` : undefined}
        className={cn(
          "relative overflow-hidden rounded-md border outline-none focus-visible:ring-2 focus-visible:ring-ring",
          focusing && "cursor-crosshair ring-2 ring-foreground",
        )}
        onClick={(event) => {
          if (!focusing || !box.current) return;
          saveFocus(focusFromPoint(box.current.getBoundingClientRect(), event.clientX, event.clientY));
        }}
        onKeyDown={(event) => {
          if (!focusing) return;
          if (event.key === "Escape") {
            setFocusing(false);
            setDraftFocus(null);
            return;
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            saveFocus(focus);
            return;
          }
          const next = nudgeFocus(focus, event.key);
          if (next) {
            event.preventDefault();
            setDraftFocus(next);
          }
        }}
      >
        {photo.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- Keenan's own photo behind a short-lived signed link, or a local copy just uploaded
          <img src={photo.url} alt={focusing ? "" : label} draggable={false} className="block h-auto w-full select-none" />
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center bg-muted/40 p-4 text-center text-sm text-muted-foreground">
            This photo couldn&apos;t be shown. Reload the page.
          </div>
        )}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white outline-2 outline-[#132E3F]"
          style={{ left: `${focus.x * 100}%`, top: `${focus.y * 100}%` }}
        />
      </div>
      {focusing ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold">Tap the photo where every crop should centre.</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setFocusing(false);
              setDraftFocus(null);
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={disabled || !photo.url} onClick={() => setFocusing(true)}>
            <Crosshair aria-hidden="true" className="size-4" />
            Set focus point<span className="sr-only"> for {label}</span>
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onReplace}>
            <RefreshCw aria-hidden="true" className="size-4" />
            {replacingThis ? "Uploading" : "Replace"}
            <span className="sr-only"> {label}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={remove}
            className={confirmRemove ? "font-bold text-destructive" : "text-muted-foreground"}
          >
            <Trash2 aria-hidden="true" className="size-4" />
            {confirmRemove ? "Tap again to remove" : "Remove"}
            <span className="sr-only"> {label}</span>
          </Button>
          {movesInSlot ? (
            <>
              <Button type="button" variant="ghost" size="icon" disabled={disabled || position.at === 0} onClick={() => move(-1)}>
                <ArrowUp aria-hidden="true" />
                <span className="sr-only">Show {label} earlier</span>
              </Button>
              <Button type="button" variant="ghost" size="icon" disabled={disabled || position.at === position.count - 1} onClick={() => move(1)}>
                <ArrowDown aria-hidden="true" />
                <span className="sr-only">Show {label} later</span>
              </Button>
            </>
          ) : null}
        </div>
      )}
      {crop && photo.url ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm text-muted-foreground">At the meeting: {crop.label.toLowerCase()}</p>
          <div
            className={cn("overflow-hidden rounded-md border", crop.aspect < 1 ? "w-40" : "w-full max-w-sm")}
            style={{ aspectRatio: crop.aspect }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- the same photo, cropped around its focus point */}
            <img
              src={photo.url}
              alt=""
              draggable={false}
              className="h-full w-full object-cover"
              style={{ objectPosition: `${focus.x * 100}% ${focus.y * 100}%` }}
            />
          </div>
        </div>
      ) : null}
      {isGallerySlot(slot.key) ? <CaptionField photo={photo} label={label} onPhotos={onPhotos} /> : null}
      {message ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {message}
        </p>
      ) : null}
    </div>
  );
}

// A gallery photo's caption: the look only, saved on its own.
function CaptionField({ photo, label, onPhotos }: { photo: DeckPhotoView; label: string; onPhotos: PhotosUpdate }) {
  const [value, setValue] = useState(photo.caption ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const id = `caption-${photo.id}`;
  const issue = captionIssue(value);
  const changed = value.trim() !== (photo.caption ?? "");
  const words = wordCount(value);

  function save() {
    setMessage(null);
    setSaved(false);
    if (issue || !changed) return;
    startTransition(async () => {
      const result = await setDeckPhotoCaption(photo.id, value);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      onPhotos((previous) => previous.map((item) => (item.id === photo.id ? { ...item, caption: result.photo?.caption ?? null } : item)));
      setSaved(true);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <Label htmlFor={id}>Caption</Label>
        <p id={`${id}-count`} className={cn("text-sm tabular-nums", words > WORD_LIMITS.captionWords ? "font-semibold text-destructive" : "text-muted-foreground")}>
          {words} of {WORD_LIMITS.captionWords} words
        </p>
      </div>
      <div className="flex gap-2">
        <Input
          id={id}
          value={value}
          placeholder="Warm white"
          autoComplete="off"
          aria-label={`Caption for ${label}`}
          aria-invalid={issue ? true : undefined}
          aria-describedby={`${id}-count ${id}-hint${issue || message ? ` ${id}-error` : ""}`}
          onChange={(event) => {
            setValue(event.currentTarget.value);
            setSaved(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              save();
            }
          }}
        />
        {changed ? (
          <Button type="button" variant="outline" disabled={pending || Boolean(issue)} onClick={save}>
            {pending ? "Saving" : "Save"}
          </Button>
        ) : null}
      </div>
      <p id={`${id}-hint`} className="text-sm text-muted-foreground">
        The look only, like Warm white or After a snowfall. Never a street, neighbourhood or name.
        {saved ? <span role="status"> Saved.</span> : null}
      </p>
      <FieldError id={`${id}-error`} message={issue ?? message ?? undefined} />
    </div>
  );
}

// ---------------------------------------------------------------- the gallery's order

export function GalleryOrder({ photos, onPhotos }: { photos: DeckPhotoView[]; onPhotos: PhotosUpdate }) {
  const list = galleryPhotos(photos);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function move(id: string, delta: -1 | 1) {
    setMessage(null);
    startTransition(async () => {
      const result = await moveDeckPhoto(id, delta);
      if (!result.ok) setMessage(result.error);
      else onPhotos((previous) => withSortChanges(previous, result.sorts ?? []));
    });
  }

  return (
    <Card data-testid="gallery-order">
      <CardHeader>
        <h3 className="text-lg leading-tight font-bold">Gallery order</h3>
        <CardDescription>
          The page steps through the first 6 in this order; See all shows every one. Warm whites first, colour looks last.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">No gallery photos yet. The page is skipped until the first one is in below.</p>
        ) : (
          <ol className="flex flex-col divide-y rounded-md border" aria-label="Gallery photos, in order">
            {list.map((photo, at) => {
              const name = SLOT_BY_KEY.get(photo.slot)?.name ?? "Gallery photo";
              return (
                <li key={photo.id} className="flex items-center gap-3 p-2">
                  <span className="w-6 text-center text-sm font-bold tabular-nums">{at + 1}</span>
                  {photo.url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- Keenan's own 640 px copy behind a signed link
                    <img src={photo.url} alt="" className="h-14 w-20 shrink-0 rounded-sm border object-cover" />
                  ) : (
                    <span className="h-14 w-20 shrink-0 rounded-sm border bg-muted/40" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{photo.caption ?? "No caption"}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {name}
                      {at >= 6 ? ", in See all only" : ""}
                    </p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" disabled={pending || at === 0} onClick={() => move(photo.id, -1)}>
                    <ArrowUp aria-hidden="true" />
                    <span className="sr-only">Show {photo.caption ?? name} earlier</span>
                  </Button>
                  <Button type="button" variant="ghost" size="icon" disabled={pending || at === list.length - 1} onClick={() => move(photo.id, 1)}>
                    <ArrowDown aria-hidden="true" />
                    <span className="sr-only">Show {photo.caption ?? name} later</span>
                  </Button>
                </li>
              );
            })}
          </ol>
        )}
        {message ? (
          <p role="alert" className="text-sm font-semibold text-destructive">
            {message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
