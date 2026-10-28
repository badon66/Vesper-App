"use client";

import { Camera, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { attachLeadPhotos } from "@/app/(app)/app/leads/actions";
import { Button } from "@/components/ui/button";
import { MAX_PHOTOS_PER_FORM, PHOTO_BUCKET, photoPath, shrinkPhoto } from "@/lib/photos";
import { createClient } from "@/lib/supabase/client";

type Item = {
  key: string;
  status: "working" | "done" | "failed";
  preview: string;
  source: Blob;
  path?: string;
};

// Takes photos with the phone camera, shrinks each one in the browser and
// uploads it straight away into the setter's own folder. In a lead form the
// uploaded paths travel with the form; on a lead page each photo is attached
// to the lead as soon as it is up.
export function PhotoPicker({
  userId,
  mode,
  leadId,
  onBusyChange,
}: {
  userId: string;
  mode: "form" | "attach";
  leadId?: string;
  onBusyChange?: (busy: boolean) => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const working = useRef(0);
  const previews = useRef(new Set<string>());

  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  function preview(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    previews.current.add(url);
    return url;
  }

  function busy(delta: number) {
    working.current += delta;
    onBusyChange?.(working.current > 0);
  }

  function patch(key: string, change: Partial<Item>) {
    setItems((list) => list.map((item) => (item.key === key ? { ...item, ...change } : item)));
  }

  async function upload(key: string, source: Blob) {
    busy(1);
    patch(key, { status: "working" });
    try {
      const small = await shrinkPhoto(source);
      patch(key, { preview: preview(small) });
      const path = photoPath(userId, crypto.randomUUID());
      const { error } = await createClient()
        .storage.from(PHOTO_BUCKET)
        .upload(path, small, { contentType: "image/jpeg", upsert: false });
      if (error) throw error;
      if (mode === "attach" && leadId) {
        const result = await attachLeadPhotos(leadId, [path]);
        if (!result.ok) throw new Error(result.error);
        setItems((list) => list.filter((item) => item.key !== key));
        router.refresh();
      } else {
        patch(key, { status: "done", path });
      }
    } catch {
      patch(key, { status: "failed" });
    } finally {
      busy(-1);
    }
  }

  function onFiles(files: FileList | null) {
    setMessage(null);
    if (!files || files.length === 0) return;
    const room = Math.max(0, MAX_PHOTOS_PER_FORM - items.length);
    const chosen = Array.from(files).slice(0, room);
    if (chosen.length < files.length) {
      setMessage(`At most ${MAX_PHOTOS_PER_FORM} photos at a time.`);
    }
    for (const file of chosen) {
      const key = crypto.randomUUID();
      setItems((list) => [...list, { key, status: "working", preview: preview(file), source: file }]);
      void upload(key, file);
    }
    if (input.current) input.current.value = "";
  }

  function remove(key: string) {
    setItems((list) => list.filter((item) => item.key !== key));
  }

  const label =
    items.length > 0 ? "Add another photo" : mode === "attach" ? "Add photo" : "Take photo";

  return (
    <div className="flex flex-col gap-3">
      {items.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2" aria-label="Photos">
          {items.map((item) => (
            <li
              key={item.key}
              className="relative aspect-square overflow-hidden rounded-md border bg-muted"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of a photo being uploaded */}
              <img src={item.preview} alt="Photo of the house" className="size-full object-cover" />
              {item.status === "working" ? (
                <span className="absolute inset-x-0 bottom-0 bg-background px-2 py-1 text-center text-xs font-semibold">
                  Uploading
                </span>
              ) : null}
              {item.status === "failed" ? (
                <button
                  type="button"
                  onClick={() => void upload(item.key, item.source)}
                  className="absolute inset-0 flex items-center justify-center bg-background px-2 text-center text-xs font-semibold text-destructive"
                >
                  Didn&apos;t upload. Tap to try again.
                </button>
              ) : null}
              {item.status === "done" && mode === "form" ? (
                <>
                  <input type="hidden" name="photo_paths" value={item.path} />
                  <button
                    type="button"
                    aria-label="Remove photo"
                    onClick={() => remove(item.key)}
                    className="absolute top-1 right-1 flex size-11 items-center justify-center rounded-full border bg-background text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X aria-hidden="true" className="size-5" />
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {items.length < MAX_PHOTOS_PER_FORM ? (
        <Button type="button" variant="outline" size="lg" onClick={() => input.current?.click()}>
          <Camera aria-hidden="true" />
          {label}
        </Button>
      ) : null}
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        data-testid="photo-input"
        onChange={(event) => onFiles(event.currentTarget.files)}
      />
      {message ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {message}
        </p>
      ) : null}
    </div>
  );
}
