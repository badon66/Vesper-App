import { ChevronLeft, Presentation } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NotForYourRole } from "@/components/not-for-your-role";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth/profile";
import { parseDeckWords, parseLooks } from "@/lib/deck";
import { companyLines, companyOf } from "@/lib/meeting/deck-pages";
import { parseTalkingPoints } from "@/lib/meeting/talking-points";
import { DECK_BUCKET, type ReferenceRow } from "@/lib/photos-deck";
import { createClient } from "@/lib/supabase/server";
import { DeckEditor, type DeckPhotoView } from "./deck-editor";

export const metadata: Metadata = {
  title: "Presentation",
};

// The deck's Settings (round 7, Branch B): each page's words in deck order,
// with its photo slots (Keenan's photo, or an example to copy), and the
// light picker's looks. Owner only: the owner group's layout refuses
// everyone else, View as included, and the page checks again before it
// reads anything. The examples load in the browser straight from where
// they live, with no referrer; they never reach a meeting.
export default async function PresentationSettingsPage() {
  const me = await requireProfile();
  if (me.role !== "owner") return <NotForYourRole />;

  const supabase = await createClient();
  const [{ data: settings, error }, { data: photoRows }, { data: referenceRows }] = await Promise.all([
    supabase.from("settings").select("deck, light_looks, warranty_text, company").eq("id", 1).single(),
    supabase
      .from("deck_photos")
      .select("id, slot, path, thumb_path, focus_x, focus_y, caption, sort, created_at")
      .order("sort")
      .order("created_at"),
    supabase.from("presentation_references").select("id, slot, rank, image_url, page_url, site, why, shot").order("slot").order("rank"),
  ]);
  if (error || !settings) throw new Error("Settings could not be loaded.");

  // Settings shows the 640 px copies, behind short-lived signed links: the
  // bucket is private and owner only.
  const rows = photoRows ?? [];
  const paths = rows.map((row) => row.thumb_path ?? row.path);
  const urls = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage.from(DECK_BUCKET).createSignedUrls(paths, 3600);
    for (const item of signed ?? []) {
      if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
    }
  }
  const photos: DeckPhotoView[] = rows.map((row) => ({
    id: row.id,
    slot: row.slot,
    focus_x: row.focus_x,
    focus_y: row.focus_y,
    caption: row.caption,
    sort: row.sort,
    created_at: row.created_at,
    url: urls.get(row.thumb_path ?? row.path) ?? null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href="/app/admin/settings"
          className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-semibold text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          Settings
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex max-w-2xl flex-col gap-1">
            <h1 className="text-2xl font-bold">Presentation</h1>
            <p className="text-pretty text-muted-foreground">
              The meeting&apos;s pages in the order customers see them: the words on each and your photo for each slot.
              Pages no longer in the meeting come last, with their words and photos kept. Every word in a box here is read by
              customers. The notes, shots and examples are for you.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/app/admin/settings/rehearsal">
              <Presentation aria-hidden="true" />
              Rehearse the presentation
            </Link>
          </Button>
        </div>
      </div>
      <DeckEditor
        words={parseDeckWords(settings.deck)}
        looks={parseLooks(settings.light_looks)}
        warrantyText={settings.warranty_text}
        companyLines={companyLines(companyOf(settings.company))}
        photos={photos}
        references={(referenceRows ?? []) as ReferenceRow[]}
        talking={parseTalkingPoints(settings.deck)}
      />
    </div>
  );
}
