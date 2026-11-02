"use client";

import { ImagePlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { attachLeadPhotos } from "@/app/(app)/app/leads/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PHOTO_BUCKET, photoPath, shrinkPhoto } from "@/lib/photos";
import { createClient } from "@/lib/supabase/client";

// The customer's mockup (M5): made outside the app, uploaded here by
// Keenan, shown full screen in meeting mode. One per lead; a new upload
// takes the slot and the old one stays with the lead's extra photos.
export function MockupCard({ leadId, userId, mockupUrl }: { leadId: string; userId: string; mockupUrl: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown = preview ?? mockupUrl;

  async function onFile(files: FileList | null) {
    const file = files?.[0];
    if (input.current) input.current.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const small = await shrinkPhoto(file);
      setPreview(URL.createObjectURL(small));
      const path = photoPath(userId, crypto.randomUUID());
      const { error: uploadError } = await createClient()
        .storage.from(PHOTO_BUCKET)
        .upload(path, small, { contentType: "image/jpeg", upsert: false });
      if (uploadError) throw uploadError;
      const result = await attachLeadPhotos(leadId, [path], "mockup");
      if (!result.ok) throw new Error(result.error);
      router.refresh();
    } catch {
      setPreview(null);
      setError("The mockup didn't upload. Check your signal and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-testid="mockup-card">
      <CardHeader>
        <CardTitle>Meeting mode</CardTitle>
        <CardDescription>
          The full-screen presentation and live quote for this house, on the iPad. Upload their mockup first so This
          house has their home in lights.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {shown ? (
          <div className="overflow-hidden rounded-md border">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local preview, or a private photo behind a short-lived signed link */}
            <img src={shown} alt="The customer's mockup, lights on" className="max-h-72 w-full object-cover" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No mockup yet. The mockup screen is skipped until one is up.</p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild>
            <Link href={`/meeting/${leadId}`}>Open meeting mode</Link>
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => input.current?.click()}>
            <ImagePlus aria-hidden="true" />
            {busy ? "Uploading" : shown ? "Replace the mockup" : "Upload the mockup"}
          </Button>
          <input
            ref={input}
            type="file"
            accept="image/*"
            tabIndex={-1}
            aria-hidden="true"
            className="sr-only"
            data-testid="mockup-input"
            onChange={(event) => void onFile(event.currentTarget.files)}
          />
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
