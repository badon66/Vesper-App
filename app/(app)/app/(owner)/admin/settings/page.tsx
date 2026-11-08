import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth/profile";
import { activeLooks, DECK_SLOTS, parseLooks } from "@/lib/deck";
import { sortTrackColours } from "@/lib/leads/track-colour";
import { filledSlotCount } from "@/lib/photos-deck";
import { devicesFor } from "@/lib/push/devices";
import { pushKeys } from "@/lib/push/send";
import { settingsRowToFormDefaults } from "@/lib/settings/schema";
import { createClient } from "@/lib/supabase/server";
import { ChangePasswordForm } from "./change-password-form";
import { Notifications } from "@/components/notifications/notifications-card";
import { SettingsForm } from "./settings-form";
import { TrackColours } from "./track-colours";

export const metadata: Metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const [{ data: settings, error }, { data: colours }, { data: ral }, { data: deckPhotos }, devices] = await Promise.all([
    supabase.from("settings").select("*").eq("id", 1).single(),
    supabase.from("track_colours").select("id, name, ral_code, sort_order, active"),
    supabase.from("ral_classic_colours").select("code, name"),
    supabase.from("deck_photos").select("slot"),
    // Keenan's own devices, with notifications on.
    devicesFor({ profile: await requireProfile(), viewingAs: false }),
  ]);

  if (error || !settings) {
    throw new Error("Settings could not be loaded.");
  }

  const ralNames = Object.fromEntries((ral ?? []).map((colour) => [colour.code, colour.name]));
  const filled = filledSlotCount(deckPhotos ?? []);
  const looksOn = activeLooks(parseLooks(settings.light_looks)).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything the business tunes without a deploy.
        </p>
      </div>
      <SettingsForm defaults={settingsRowToFormDefaults(settings)} />
      <PresentationCard filled={filled} looksOn={looksOn} />
      <TrackColours colours={sortTrackColours(colours ?? [])} ralNames={ralNames} />
      <Notifications publicKey={pushKeys()?.publicKey ?? null} devices={devices} />
      <ChangePasswordForm />
    </div>
  );
}

// The meeting's presentation lives on its own pages (round 7): its words,
// Keenan's photos with an example to copy for each slot, the light picker's
// looks, and the rehearsal view. Links only here, so Settings stays quick.
function PresentationCard({ filled, looksOn }: { filled: number; looksOn: number }) {
  const rows = [
    {
      href: "/app/admin/settings/presentation",
      title: "Words and photos",
      text: `Every page's words, and your photo for each slot. ${filled} of ${DECK_SLOTS.length} slots filled.`,
    },
    {
      href: "/app/admin/settings/presentation#looks",
      title: "Light looks",
      text: `The looks on the light picker, with a preview and the iPad setup note. ${looksOn} ${looksOn === 1 ? "look" : "looks"} on.`,
    },
    {
      href: "/app/admin/settings/rehearsal",
      title: "Rehearse the presentation",
      text: "Walk through the pages with an example in each empty slot. Customer view shows exactly what a customer sees.",
    },
  ];
  return (
    <Card data-testid="presentation-settings">
      <CardHeader>
        <CardTitle>Presentation</CardTitle>
        <CardDescription>What the iPad shows at a meeting, page by page.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y rounded-md border">
          {rows.map((row) => (
            <li key={row.href}>
              <Link
                href={row.href}
                className="flex min-h-16 items-center justify-between gap-4 px-4 py-3 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="font-semibold">{row.title}</span>
                  <span className="text-sm text-pretty text-muted-foreground">{row.text}</span>
                </span>
                <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
