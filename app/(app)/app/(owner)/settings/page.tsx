import type { Metadata } from "next";
import { settingsRowToFormDefaults } from "@/lib/settings/schema";
import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: settings, error } = await supabase
    .from("settings")
    .select("*")
    .eq("id", 1)
    .single();

  if (error || !settings) {
    throw new Error("Settings could not be loaded.");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything the business tunes without a deploy.
        </p>
      </div>
      <SettingsForm defaults={settingsRowToFormDefaults(settings)} />
    </div>
  );
}
