"use client";

import { Camera, Check, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { attachLeadPhotos } from "@/app/(app)/app/leads/actions";
import { PhotoGuide } from "@/components/leads/photo-guides";
import { Button } from "@/components/ui/button";
import { useViewAs } from "@/components/view-as-context";
import { PHOTO_SLOT_HINT, PHOTO_SLOT_HINT_SHORT, PHOTO_SLOTS, slotFieldName, type PhotoSlot } from "@/lib/leads/door";
import { PHOTO_BUCKET, photoPath, shrinkPhoto } from "@/lib/photos";
import { createClient } from "@/lib/supabase/client";
import { VIEW_AS_NOTHING_SAVED } from "@/lib/view-as";

type Taken = {
  attempt: number;
  status: "working" | "done" | "failed";
  preview: string;
  source: Blob;
  path?: string;
  // View as: shown on this screen only, never uploaded.
  actedOut?: boolean;
};

// The four guided photos. Each slot has a big Take photo button that opens
// the camera, a smaller Upload button for a photo already on the phone, and
// a line drawing of the angle to shoot (round 2, Keenan, 2026-11-03). It
// shows the photo once it is taken and offers a retake. Photos are shrunk
// in the browser and uploaded straight away, like every other photo. In a
// lead form the uploaded path travels with the form; on a lead page the
// photo goes into its slot as soon as it is up, and the photo it replaces
// stays as an extra. The booking sheet uses the tiles layout: each tile is
// the Take photo button, so all four fit on a phone screen. While Keenan
// views the app as someone, a photo shows on screen only and nothing is
// uploaded.
export function PhotoSlots({
  userId,
  mode,
  leadId,
  saved = {},
  canTake = true,
  layout = "list",
  onBusyChange,
  onTakenChange,
  onPathsChange,
  initial,
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
  // A form's uploaded paths by slot, for the booking sheet (round 3), which
  // keeps them with a person not saved yet and attaches them at the save.
  onPathsChange?: (paths: Partial<Record<PhotoSlot, string>>) => void;
  // A form's photos already uploaded, brought back from a draft after a
  // reload: the path and a signed link to show it.
  initial?: Partial<Record<PhotoSlot, { path: string; preview: string }>>;
}) {
  const router = useRouter();
  const { viewingAs } = useViewAs();
  const [taken, setTaken] = useState<Partial<Record<PhotoSlot, Taken>>>(() =>
    Object.fromEntries(
      Object.entries(initial ?? {}).map(([slot, photo]) => [
        slot,
        { attempt: 0, status: "done", preview: photo.preview, source: new Blob(), path: photo.path } satisfies Taken,
      ]),
    ),
  );
  const inputs = useRef<Partial<Record<PhotoSlot, HTMLInputElement | null>>>({});
  const uploads = useRef<Partial<Record<PhotoSlot, HTMLInputElement | null>>>({});
  const working = useRef(0);
  const attempts = useRef(0);
  const previews = useRef(new Set<string>());

  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const doneKey = PHOTO_SLOTS.filter(({ slot }) => taken[slot]?.status === "done" && (taken[slot]?.path || taken[slot]?.actedOut))
    .map(({ slot }) => slot)
    .join(",");
  useEffect(() => {
    onTakenChange?.(doneKey ? (doneKey.split(",") as PhotoSlot[]) : []);
  }, [doneKey, onTakenChange]);

  const pathsKey = PHOTO_SLOTS.map(({ slot }) => (taken[slot]?.status === "done" && taken[slot]?.path ? `${slot}=${taken[slot]?.path}` : ""))
    .filter(Boolean)
    .join("|");
  useEffect(() => {
    if (!onPathsChange) return;
    const paths: Partial<Record<PhotoSlot, string>> = {};
    for (const pair of pathsKey ? pathsKey.split("|") : []) {
      const [slot, path] = pair.split("=");
      paths[slot as PhotoSlot] = path;
    }
    onPathsChange(paths);
  }, [pathsKey, onPathsChange]);

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

  function onFile(slot: PhotoSlot, files: FileList | null, from: HTMLInputElement | null | undefined) {
    const file = files?.[0];
    if (from) from.value = "";
    if (!file) return;
    attempts.current += 1;
    const attempt = attempts.current;
    if (viewingAs) {
      // Acted out: the photo shows here and goes nowhere.
      setTaken((all) => ({
        ...all,
        [slot]: { attempt, status: "done", preview: preview(file), source: file, actedOut: true },
      }));
      return;
    }
    setTaken((all) => ({
      ...all,
      [slot]: { attempt, status: "working", preview: preview(file), source: file },
    }));
    void upload(slot, attempt, file);
  }

  // Two hidden inputs per slot: the camera, and the phone's photos.
  const inputsFor = (slot: PhotoSlot) => (
    <>
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
        onChange={(event) => onFile(slot, event.currentTarget.files, inputs.current[slot])}
      />
      <input
        ref={(element) => {
          uploads.current[slot] = element;
        }}
        type="file"
        accept="image/*"
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        data-testid={`slot-upload-${slot}`}
        onChange={(event) => onFile(slot, event.currentTarget.files, uploads.current[slot])}
      />
    </>
  );

  const actedOut = PHOTO_SLOTS.some(({ slot }) => taken[slot]?.actedOut);
  const actedOutNote = actedOut ? (
    <p role="status" className="text-sm font-medium text-pretty" data-testid="view-as-nothing-saved">
      {VIEW_AS_NOTHING_SAVED}
    </p>
  ) : null;

  if (layout === "tiles") {
    return (
      <div className="flex flex-col gap-2">
        <ul className="grid grid-cols-2 gap-2 rounded-md min-[420px]:gap-3" aria-label="Guided photos">
          {PHOTO_SLOTS.map(({ slot, label, hint, short }) => {
            const local = taken[slot];
            const src = local?.preview ?? saved[slot];
            const failed = local?.status === "failed";
            const working = local?.status === "working";
            const action = failed ? "Try the upload again" : src ? "Retake" : "Take photo";
            // Front and both corners are needed to book; the soffit close-up helps.
            const optional = slot === "soffit";
            const status = working ? `${label}: uploading` : failed ? `${label}: didn't upload. Tap to try again.` : "";
            // A hyphen that never breaks: "Soffit close-up" wraps as words.
            const name = label.replace("-", "\u2011");
            return (
              <li key={slot} data-slot={slot} className="relative">
                {/* The tile is the big Take photo button. Upload, for a photo
                    already on the phone, sits quietly in its corner until the
                    slot has its photo. */}
                <button
                  type="button"
                  disabled={!canTake}
                  aria-label={`${action}, ${label}`}
                  aria-describedby={`slot-hint-${slot}`}
                  onClick={() => (failed && local ? void upload(slot, local.attempt, local.source) : inputs.current[slot]?.click())}
                  className="relative flex aspect-[4/3] w-full overflow-hidden rounded-md border bg-muted text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed min-[420px]:aspect-[6/5]"
                >
                  {src ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element -- a local preview, or a private photo behind a short-lived signed link */}
                      <img src={src} alt={`${label} photo of the house`} className="absolute inset-0 size-full object-cover" />
                      <span className="absolute inset-x-0 bottom-0 flex min-h-11 items-center gap-1.5 bg-background px-2 text-sm font-semibold">
                        {working ? null : failed ? null : <Check aria-hidden="true" className="size-4 shrink-0" />}
                        <span className="flex min-w-0 flex-col leading-tight">
                          <span className="truncate">{name}</span>
                          <span className="text-xs font-normal text-muted-foreground min-[420px]:text-sm">
                            {working ? "Uploading" : failed ? "" : local?.actedOut ? "Tap to retake" : "Saved. Tap to retake"}
                          </span>
                        </span>
                      </span>
                    </>
                  ) : (
                    <span className="flex size-full flex-col justify-between p-2 pb-0">
                      {/* Room on the right for Upload, in the top corner. */}
                      <span className="pr-16 text-sm leading-tight font-semibold text-pretty min-[420px]:text-base min-[420px]:leading-tight">{name}</span>
                      {/* The drawing shows the angle; on a wide phone a few
                          words say it too. The whole tile is the button, so
                          its Take photo line needn't be tall. */}
                      <span className="flex flex-col items-center gap-1">
                        <PhotoGuide slot={slot} className="h-12 w-auto min-[420px]:h-14" />
                        <span className="hidden text-center text-sm leading-tight text-muted-foreground min-[420px]:block">{short}</span>
                      </span>
                      <span className="flex min-h-8 items-center gap-1.5 pb-1.5 text-sm leading-tight font-semibold min-[420px]:text-base min-[420px]:leading-tight">
                        <Camera aria-hidden="true" className="size-5 shrink-0" />
                        {/* On a wide phone the few words above say Optional. */}
                        {optional ? (
                          <>
                            <span className="min-[420px]:hidden">Take photo, optional</span>
                            <span className="hidden min-[420px]:inline">Take photo</span>
                          </>
                        ) : (
                          "Take photo"
                        )}
                      </span>
                    </span>
                  )}
                  {failed ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-background px-3 text-center text-sm font-semibold text-pretty text-destructive">
                      {label} didn&apos;t upload. Tap to try again.
                    </span>
                  ) : null}
                </button>
                {canTake && !src && !failed ? (
                  <button
                    type="button"
                    aria-label={`Upload a photo from the phone, ${label}`}
                    onClick={() => uploads.current[slot]?.click()}
                    data-testid={`slot-upload-button-${slot}`}
                    className="absolute top-0 right-0 inline-flex min-h-11 items-center gap-1 rounded-tr-md px-2 text-xs font-medium text-muted-foreground underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring min-[420px]:text-sm"
                  >
                    <Upload aria-hidden="true" className="size-3.5" />
                    Upload
                  </button>
                ) : null}
                <span id={`slot-hint-${slot}`} className="sr-only">
                  {hint}
                </span>
                <span className="sr-only" aria-live="polite">
                  {status}
                </span>
                {canTake ? inputsFor(slot) : null}
              </li>
            );
          })}
        </ul>
        {canTake ? <p className="text-sm text-pretty text-muted-foreground">{PHOTO_SLOT_HINT_SHORT}</p> : null}
        {actedOutNote}
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
                  <span className="flex size-full items-center justify-center px-3">
                    <PhotoGuide slot={slot} className="h-3/4 w-auto max-w-full" />
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
                <p className="text-sm text-pretty text-muted-foreground">{hint}</p>
              </div>
              {canTake ? (
                <div className="flex flex-col gap-1">
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-fit text-muted-foreground"
                    aria-label={`Upload a photo from the phone, ${label}`}
                    onClick={() => uploads.current[slot]?.click()}
                    data-testid={`slot-upload-button-${slot}`}
                  >
                    <Upload aria-hidden="true" className="size-4" />
                    Upload
                  </Button>
                  {inputsFor(slot)}
                </div>
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
      {canTake ? <p className="text-sm text-pretty text-muted-foreground">{PHOTO_SLOT_HINT}</p> : null}
      {actedOutNote}
    </div>
  );
}
