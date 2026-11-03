import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NotForYourRole } from "@/components/not-for-your-role";
import { Notifications } from "@/components/notifications/notifications-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getViewer } from "@/lib/auth/profile";
import { devicesFor } from "@/lib/push/devices";
import { pushKeys } from "@/lib/push/send";

export const metadata: Metadata = {
  title: "Notifications",
};

// A setter's notifications (Keenan, 2026-11-03), from the bell in the
// header: turn them on or off for this phone, see which devices get them,
// send a test, and open the welcome again. Keenan's own card is in
// Settings. While Keenan views the app as a setter, this is that setter's
// page, read only, with their devices.
export default async function NotificationsPage() {
  const viewer = await getViewer();
  const { profile, viewingAs } = viewer;
  if (profile.role === "owner") redirect("/app/admin/settings#notifications");
  if (profile.role !== "sales") {
    return <NotForYourRole message="Notifications are for sales associates for now." />;
  }
  const devices = await devicesFor(viewer);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Notifications</h1>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">
          Yours to turn on or off, on each phone you use.
        </p>
      </div>

      <Notifications
        owner={false}
        readOnly={viewingAs}
        publicKey={pushKeys()?.publicKey ?? null}
        devices={devices}
        description="When Keenan marks one of your bookings, or moves or cancels it. A notice names the street only, never the house number or the customer, because it shows on your lock screen."
      />

      <Card>
        <CardHeader>
          <CardTitle>The welcome</CardTitle>
          <CardDescription className="text-pretty">
            Add Vesper to your home screen, allow location and turn on notifications, then how a door goes, on one
            screen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/app/welcome" data-testid="welcome-again">
              See the welcome again
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
