"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PAGE_LABELS, type PresentationKind } from "@/lib/presentation";
import { shrinkPhoto } from "@/lib/photos";
import { createClient } from "@/lib/supabase/client";
import { addPresentationImage, removePresentationImage } from "./actions";

// The presentation's photos (M5): the day and night pair for Hidden by
// day, and the gallery of real installs. Uploads land in the private
// presentation bucket and attach at once; only Vesper's own photos, ever.

export type PresentationImageItem = { path: string; url: string | null };
export type PresentationImagesProps = {
  hiddenByDay: { day: PresentationImageItem | null; night: PresentationImageItem | null };
  gallery: PresentationImageItem[];
};

export function PresentationImages({ hiddenByDay, gallery }: PresentationImagesProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  async function upload(kind: PresentationKind, slotIndex: number | null, files: FileList | null, key: string) {
    const file = files?.[0];
    const input = inputs.current[key];
    if (input) input.value = "";
    if (!file) return;
    setBusy(key);
    setError(null);
    try {
      const small = await shrinkPhoto(file);
      const path = `pages/${kind}/${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await createClient()
        .storage.from("presentation")
        .upload(path, small, { contentType: "image/jpeg", upsert: false });
      if (uploadError) throw uploadError;
      const result = await addPresentationImage(kind, path, slotIndex);
      if (!result.ok) throw new Error(result.error);
      router.refresh();
    } catch {
      setError("That photo didn't upload. Check your signal and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(kind: PresentationKind, path: string, key: string) {
    setBusy(key);
    setError(null);
    try {
      const result = await removePresentationImage(kind, path);
      if (!result.ok) throw new Error(result.error);
      router.refresh();
    } catch {
      setError("That photo couldn't be removed. Try again.");
    } finally {
      setBusy(null);
    }
  }

  function slotInput(key: string, kind: PresentationKind, slotIndex: number | null) {
    return (
      <input
        ref={(element) => {
          inputs.current[key] = element;
        }}
        type="file"
        accept="image/*"
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        data-testid={`presentation-input-${key}`}
        onChange={(event) => void upload(kind, slotIndex, event.currentTarget.files, key)}
      />
    );
  }

  function pairSlot(label: string, item: PresentationImageItem | null, slotIndex: number) {
    const key = `hidden_by_day-${slotIndex}`;
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold">{label}</p>
        {item?.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- private photo behind a short-lived signed link
          <img src={item.url} alt={label} className="aspect-[4/3] w-full rounded-md border object-cover" />
        ) : (
          <div className="flex aspect-[4/3] w-full items-center justify-center rounded-md border bg-muted text-sm text-muted-foreground">
            Not uploaded yet
          </div>
        )}
        <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => inputs.current[key]?.click()}>
          <ImagePlus aria-hidden="true" />
          {busy === key ? "Uploading" : item?.url ? "Replace" : "Upload"}
        </Button>
        {slotInput(key, "hidden_by_day", slotIndex)}
      </div>
    );
  }

  return (
    <Card data-testid="presentation-images">
      <CardHeader>
        <CardTitle>Presentation photos</CardTitle>
        <CardDescription>
          Only Vesper&apos;s own photos. {PAGE_LABELS.hidden_by_day} needs the same house by day and by night; the
          gallery shows at the meeting in this order. Pages without photos are skipped, never shown empty.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-4 sm:max-w-xl">
          {pairSlot("Day photo", hiddenByDay.day, 0)}
          {pairSlot("Night photo", hiddenByDay.night, 1)}
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">Gallery</p>
          {gallery.length === 0 ? (
            <p className="text-sm text-muted-foreground">No install photos yet. The gallery page is skipped until the first one is up.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Gallery photos">
              {gallery.map((item, at) => (
                <li key={item.path} className="flex flex-col gap-1.5">
                  {item.url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- private photo behind a short-lived signed link
                    <img src={item.url} alt={`Install photo ${at + 1}`} className="aspect-[4/3] w-full rounded-md border object-cover" />
                  ) : (
                    <div className="aspect-[4/3] w-full rounded-md border bg-muted" />
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => void remove("gallery", item.path, `gallery-remove-${at}`)}
                    aria-label={`Remove install photo ${at + 1}`}
                    className="self-start text-muted-foreground"
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Button type="button" variant="outline" size="sm" className="self-start" disabled={busy !== null} onClick={() => inputs.current.gallery?.click()}>
            <ImagePlus aria-hidden="true" />
            {busy === "gallery" ? "Uploading" : "Add an install photo"}
          </Button>
          {slotInput("gallery", "gallery", null)}
        </div>

        {error ? (
          <p role="alert" className="text-sm font-semibold text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
