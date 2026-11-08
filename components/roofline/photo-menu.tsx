"use client";

import { Check, ImagePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { addTracePhoto } from "@/app/(app)/app/(owner)/meetings/roofline-actions";
import { Button } from "@/components/ui/button";
import { MEETING_PHOTO_MAX_EDGE, PHOTO_BUCKET, photoPath, shrinkPhoto } from "@/lib/photos";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Change photo (round 7, light_picker.tracing): the Front, Left corner and
// Right corner photos, or Upload, which adds Keenan's own photo to the lead
// as an extra photo, the same way the lead page does, kept at 3200 px (his
// straight-on shot from across the street is the best base).

export type TracerPhoto = { id: string; label: string; url: string };

export function PhotoMenu({
  leadId,
  userId,
  photos,
  currentId,
  hasLines,
  onPick,
  onUploaded,
  onClose,
}: {
  leadId: string;
  userId: string;
  photos: TracerPhoto[];
  currentId: string | null;
  hasLines: boolean;
  onPick: (id: string) => void;
  onUploaded: (photo: TracerPhoto) => void;
  onClose: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function onFile(files: FileList | null) {
    const file = files?.[0];
    if (input.current) input.current.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const small = await shrinkPhoto(file, MEETING_PHOTO_MAX_EDGE);
      const path = photoPath(userId, crypto.randomUUID());
      const { error: uploadError } = await createClient()
        .storage.from(PHOTO_BUCKET)
        .upload(path, small, { contentType: "image/jpeg", upsert: false });
      if (uploadError) throw new Error("The photo didn't upload. Check your signal and try again.");
      const result = await addTracePhoto(leadId, path);
      if (!result.ok) throw new Error(result.error);
      onUploaded({ id: result.photo.id, label: "Your photo", url: result.photo.url });
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "The photo didn't upload. Check your signal and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* A tap anywhere else closes the menu. */}
      <button type="button" aria-label="Close the photo menu" tabIndex={-1} className="fixed inset-0 z-20 cursor-default" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-label="Change photo"
        className="absolute top-full right-3 z-30 mt-2 flex w-80 max-w-[calc(100vw-1.5rem)] flex-col gap-2 rounded-lg border bg-card p-3 text-card-foreground"
        data-testid="roofline-photo-menu"
      >
        {hasLines ? <p className="px-1 text-sm text-pretty text-muted-foreground">Another photo starts a new trace. Undo brings these lines back.</p> : null}
        <ul className="flex max-h-[min(60vh,26rem)] flex-col gap-2 overflow-y-auto">
          {photos.map((photo) => {
            const chosen = photo.id === currentId;
            return (
              <li key={photo.id}>
                <button
                  type="button"
                  aria-pressed={chosen}
                  onClick={() => (chosen ? onClose() : onPick(photo.id))}
                  className={cn(
                    "flex min-h-14 w-full items-center gap-3 rounded-md border p-1.5 pr-3 text-left text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    chosen ? "border-foreground bg-foreground text-background" : "border-input hover:bg-muted",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- a private photo behind a short-lived signed link */}
                  <img src={photo.url} alt="" crossOrigin="anonymous" className="h-12 w-16 shrink-0 rounded object-cover" />
                  <span className="flex-1">{photo.label}</span>
                  {chosen ? <Check aria-hidden="true" className="size-5 shrink-0" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
        <Button type="button" variant="outline" disabled={busy} onClick={() => input.current?.click()} data-testid="roofline-upload">
          <ImagePlus aria-hidden="true" />
          {busy ? "Uploading" : "Upload a photo"}
        </Button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          data-testid="roofline-upload-input"
          onChange={(event) => void onFile(event.currentTarget.files)}
        />
        {error ? (
          <p role="alert" className="px-1 text-sm font-semibold text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </>
  );
}
