"use client";

import { Camera } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { attachLeadPhotos } from "@/app/(app)/app/leads/actions";
import { Button } from "@/components/ui/button";
import { PHOTO_SLOT_HINT, PHOTO_SLOTS, slotFieldName, type PhotoSlot } from "@/lib/leads/door";
import { PHOTO_BUCKET, photoPath, shrinkPhoto } from "@/lib/photos";
import { createClient } from "@/lib/supabase/client";

type Taken = {
  attempt: number;
  status: "working" | "done" | "failed";
  preview: string;
  source: Blob;
  path?: string;
};

// The four guided photos. Each slot opens the camera, shows the photo once
// it is taken and offers a retake. Photos are shrunk in the browser and
// uploaded straight away, like every other photo. In a lead form the
// uploaded path travels with the form; on a lead page the photo goes into
// its slot as soon as it is up, and the photo it replaces stays as an extra.
// The booking sheet uses the tiles layout: each slot is one tap target, so
// all four fit on a phone screen without scrolling.
export function PhotoSlots({
  userId,
  mode,
  leadId,
  saved = {},
  canTake = true,
  layout = "list",
  onBusyChange,
  onTakenChange,
}: {
  userId: string;
  mode: "form" | "attach";
  leadId?: string;
  layout?: "list" | "tiles";
  // Signed links to the photos already in each slot, on a lead page.
  saved?: Partial<Record<PhotoSlot, string>>;
  canTake?: boolean;
  onBusyChange?: (busy: boolean) => void;
  // Which slots have a photo ready to save, for Before you book on New lead.
  onTakenChange?: (slots: PhotoSlot[]) => void;
}) {
  const router = useRouter();
  const [taken, setTaken] = useState<Partial<Record<PhotoSlot, Taken>>>({});
  const inputs = useRef<Partial<Record<PhotoSlot, HTMLInputElement | null>>>({});
  const working = useRef(0);
  const attempts = useRef(0);
  const previews = useRef(new Set<string>());

  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const doneKey = PHOTO_SLOTS.filter(({ slot }) => taken[slot]?.status === "done" && taken[slot]?.path)
    .map(({ slot }) => slot)
    .join(",");
  useEffect(() => {
    onTakenChange?.(doneKey ? (doneKey.split(",") as PhotoSlot[]) : []);
  }, [doneKey, onTakenChange]);

  function preview(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    previews.current.add(url);
    return url;
  }

  function busy(delta: number) {
    working.current += delta;
    onBusyChange?.(working.current > 0);
  }

  // Only the latest photo for a slot may change it, so a retake taken while
  // an earlier photo is still uploading wins.
  function patch(slot: PhotoSlot, attempt: number, change: Partial<Taken>) {
    setTaken((all) => {
      const current = all[slot];
      if (!current || current.attempt !== attempt) return all;
      return { ...all, [slot]: { ...current, ...change } };
    });
  }

  async function upload(slot: PhotoSlot, attempt: number, source: Blob) {
    busy(1);
    patch(slot, attempt, { status: "working" });
    try {
      const small = await shrinkPhoto(source);
      patch(slot, attempt, { preview: preview(small) });
      const path = photoPath(userId, crypto.randomUUID());
      const { error } = await createClient()
        .storage.from(PHOTO_BUCKET)
        .upload(path, small, { contentType: "image/jpeg", upsert: false });
      if (error) throw error;
      if (mode === "attach" && leadId) {
        const result = await attachLeadPhotos(leadId, [path], slot);
        if (!result.ok) throw new Error(result.error);
        router.refresh();
      }
      patch(slot, attempt, { status: "done", path });
    } catch {
      patch(slot, attempt, { status: "failed" });
    } finally {
      busy(-1);
    }
  }

  function onFile(slot: PhotoSlot, files: FileList | null) {
    const file = files?.[0];
    const input = inputs.current[slot];
    if (input) input.value = "";
    if (!file) return;
    attempts.current += 1;
    const attempt = attempts.current;
    setTaken((all) => ({
      ...all,
      [slot]: { attempt, status: "working", preview: preview(file), source: file },
    }));
    void upload(slot, attempt, file);
  }

  const input = (slot: PhotoSlot) => (
    <input
      ref={(element) => {
        inputs.current[slot] = element;
      }}
      type="file"
      accept="image/*"
      capture="environment"
      tabIndex={-1}
      aria-hidden="true"
      className="sr-only"
      data-testid={`slot-input-${slot}`}
      onChange={(event) => onFile(slot, event.currentTarget.files)}
    />
  );

  if (layout === "tiles") {
    return (
      <div className="flex flex-col gap-3">
        <ul className="grid grid-cols-2 gap-3" aria-label="Guided photos">
          {PHOTO_SLOTS.map(({ slot, label, hint }) => {
            const local = taken[slot];
            const src = local?.preview ?? saved[slot];
            const failed = local?.status === "failed";
            const action = failed ? "Try the upload again" : src ? "Retake" : "Take photo";
            // Front and both corners are needed to book; the soffit close-up helps.
            const optional = slot === "soffit";
            const status = local?.status === "working" ? `${label}: uploading` : failed ? `${label}: didn't upload. Tap to try again.` : "";
            return (
              <li key={slot} data-slot={slot}>
                <button
                  type="button"
                  disabled={!canTake}
                  aria-label={`${action}, ${label}`}
                  onClick={() => (failed && local ? void upload(slot, local.attempt, local.source) : inputs.current[slot]?.click())}
                  className="relative flex aspect-[16/10] w-full overflow-hidden rounded-md border bg-muted text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
                >
                  {src ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element -- a local preview, or a private photo behind a short-lived signed link */}
                      <img src={src} alt={`${label} photo of the house`} className="absolute inset-0 size-full object-cover" />
                      <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-background px-2 py-1 text-xs font-semibold">
                        <span className="truncate">{label}</span>
                        {local?.status === "working" ? (
                          <span className="shrink-0 text-muted-foreground">Uploading</span>
                        ) : failed ? null : canTake ? (
                          <span className="inline-flex shrink-0 items-center gap-1 text-muted-foreground">
                            <Camera aria-hidden="true" className="size-3.5" />
                            Retake
                          </span>
                        ) : null}
                      </span>
                    </>
                  ) : (
                    <span className="flex size-full flex-col items-center justify-center gap-1 px-3 text-center">
                      <Camera aria-hidden="true" className="size-6 text-muted-foreground" />
                      <span className="text-sm font-semibold">{label}</span>
                      <span className="text-xs text-pretty text-muted-foreground">{optional ? `Optional. ${hint}` : hint}</span>
                    </span>
                  )}
                  {failed ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-background px-3 text-center text-sm font-semibold text-pretty text-destructive">
                      {label} didn&apos;t upload. Tap to try again.
                    </span>
                  ) : null}
                </button>
                <span className="sr-only" aria-live="polite">
                  {status}
                </span>
                {canTake ? input(slot) : null}
              </li>
            );
          })}
        </ul>
        {canTake ? <p className="text-xs text-pretty text-muted-foreground">{PHOTO_SLOT_HINT}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-2 gap-3" aria-label="Guided photos">
        {PHOTO_SLOTS.map(({ slot, label, hint }) => {
          const local = taken[slot];
          const src = local?.preview ?? saved[slot];
          return (
            <li key={slot} className="flex flex-col gap-2" data-slot={slot}>
              <div className="relative aspect-[4/3] overflow-hidden rounded-md border bg-muted">
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a local preview, or a private photo behind a short-lived signed link
                  <img src={src} alt={`${label} photo of the house`} className="size-full object-cover" />
                ) : (
                  <span className="flex size-full items-center justify-center text-muted-foreground">
                    <Camera aria-hidden="true" className="size-6" />
                  </span>
                )}
                {local?.status === "working" ? (
                  <span className="absolute inset-x-0 bottom-0 bg-background px-2 py-1 text-center text-xs font-semibold">
                    Uploading
                  </span>
                ) : null}
                {local?.status === "failed" ? (
                  <button
                    type="button"
                    onClick={() => void upload(slot, local.attempt, local.source)}
                    className="absolute inset-0 flex items-center justify-center bg-background px-2 text-center text-xs font-semibold text-destructive"
                  >
                    Didn&apos;t upload. Tap to try again.
                  </button>
                ) : null}
              </div>
              <div>
                <p className="text-sm font-semibold">{label}</p>
                <p className="text-xs text-muted-foreground">{hint}</p>
              </div>
              {canTake ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    className="w-full"
                    aria-label={`${src ? "Retake" : "Take photo"}, ${label}`}
                    onClick={() => inputs.current[slot]?.click()}
                  >
                    <Camera aria-hidden="true" />
                    {src ? "Retake" : "Take photo"}
                  </Button>
                  {input(slot)}
                </>
              ) : !src ? (
                <p className="text-xs text-muted-foreground">No photo yet.</p>
              ) : null}
              {mode === "form" && local?.status === "done" && local.path ? (
                <input type="hidden" name={slotFieldName(slot)} value={local.path} />
              ) : null}
            </li>
          );
        })}
      </ul>
      {canTake ? <p className="text-sm text-muted-foreground">{PHOTO_SLOT_HINT}</p> : null}
    </div>
  );
}
