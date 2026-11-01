import type { Metadata } from "next";
import { sortTrackColours } from "@/lib/leads/track-colour";
import { settingsRowToFormDefaults } from "@/lib/settings/schema";
import { createClient } from "@/lib/supabase/server";
import { ChangePasswordForm } from "./change-password-form";
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything the business tunes without a deploy.
        </p>
      </div>
      <SettingsForm defaults={settingsRowToFormDefaults(settings)} />
      <TrackColours colours={sortTrackColours(colours ?? [])} ralNames={ralNames} />
      <ChangePasswordForm />
    </div>
  );
}
