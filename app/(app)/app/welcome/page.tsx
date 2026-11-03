import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { WelcomeFlow } from "@/components/welcome/welcome-flow";
import { getViewer } from "@/lib/auth/profile";
import { devicesFor } from "@/lib/push/devices";
import { pushKeys } from "@/lib/push/send";
import { welcomeStep } from "@/lib/welcome";

export const metadata: Metadata = {
  title: "Welcome",
};

// A setter's first sign-in (Keenan, 2026-11-03): three skippable steps that
// get the phone ready for the door, then one screen on how a door goes.
// Home sends a setter here until it is finished or skipped; it can be
// opened again from Notifications. Keenan and crew go Home. While Keenan
// views the app as a setter, it shows as they see it and nothing works.
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ step?: string | string[] }> }) {
  const viewer = await getViewer();
  if (viewer.profile.role !== "sales") redirect("/app");
  const { step } = await searchParams;
  const devices = viewer.viewingAs ? [] : await devicesFor(viewer);
  return (
    <WelcomeFlow
      step={welcomeStep(step)}
      firstName={viewer.profile.full_name.split(" ")[0] || viewer.profile.full_name}
      publicKey={pushKeys()?.publicKey ?? null}
      deviceHashes={devices.flatMap((device) => (device.hash ? [device.hash] : []))}
      readOnly={viewer.viewingAs}
    />
  );
}
