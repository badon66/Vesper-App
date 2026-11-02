import type { Metadata } from "next";
import { sortTrackColours } from "@/lib/leads/track-colour";
import { parsePresentation } from "@/lib/presentation";
import { settingsRowToFormDefaults } from "@/lib/settings/schema";
import { createClient } from "@/lib/supabase/server";
import { ChangePasswordForm } from "./change-password-form";
import { PresentationImages, type PresentationImageItem } from "./presentation-images";
import { SettingsForm } from "./settings-form";
import { TrackColours } from "./track-colours";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const [{ data: settings, error }, { data: colours }, { data: ral }] = await Promise.all([
    supabase.from("settings").select("*").eq("id", 1).single(),
    supabase.from("track_colours").select("id, name, ral_code, sort_order, active"),
    supabase.from("ral_classic_colours").select("code, name"),
  ]);

  if (error || !settings) {
    throw new Error("Settings could not be loaded.");
  }

  const ralNames = Object.fromEntries((ral ?? []).map((colour) => [colour.code, colour.name]));

  // The presentation's photos, behind short-lived signed links. The
  // bucket is private and owner-only; this page is owner-only too.
  const presentation = parsePresentation(settings.presentation);
  const hiddenByDay = presentation.find((page) => page.kind === "hidden_by_day");
  const gallery = presentation.find((page) => page.kind === "gallery");
  const paths = [
    ...(hiddenByDay?.image_paths ?? []),
    ...(gallery?.image_paths ?? []),
  ].filter(Boolean);
  const urls = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage.from("presentation").createSignedUrls(paths, 3600);
    for (const item of signed ?? []) {
      if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
    }
  }
  const item = (path: string | undefined): PresentationImageItem | null =>
    path ? { path, url: urls.get(path) ?? null } : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything the business tunes without a deploy.
        </p>
      </div>
      <SettingsForm
        defaults={settingsRowToFormDefaults(settings)}
        presentation={presentation.map(({ kind, title, body }) => ({ kind, title, body }))}
      />
      <PresentationImages
        hiddenByDay={{ day: item(hiddenByDay?.image_paths[0] || undefined), night: item(hiddenByDay?.image_paths[1] || undefined) }}
        gallery={(gallery?.image_paths ?? []).filter(Boolean).flatMap((path) => item(path) ?? [])}
      />
      <TrackColours colours={sortTrackColours(colours ?? [])} ralNames={ralNames} />
      <ChangePasswordForm />
    </div>
  );
}
