import Link from "next/link";
import { AdminGear } from "@/components/admin-gear";
import { AppTabs } from "@/components/app-tabs";
import { BookingSheetHost } from "@/components/booking/booking-sheet";
import { BellLink } from "@/components/notifications/bell-link";
import { Wordmark } from "@/components/brand/wordmark";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { ToFinishBar } from "@/components/to-finish/to-finish-bar";
import { UpdateNotice } from "@/components/update-notice";
import { ViewAsBar } from "@/components/view-as-bar";
import { ViewAsProvider } from "@/components/view-as-context";
import { getViewer } from "@/lib/auth/profile";
import { showsAdminGear } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { signOut } from "./actions";

// Everything under /app needs a signed-in, active user with a profile.
// proxy.ts already redirects signed-out visitors; this check is the second
// lock on the same door, and it is the one that knows about roles.
//
// The tabs live here, in the layout every screen shares, so moving between
// tabs never reloads them. While the owner is viewing the app as someone,
// every screen renders as that person and can be clicked through (round 2,
// Keenan, 2026-11-03): screens read the View as context, act out what needs
// a write to go on, and every write is refused on the server.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, real, viewingAs, viewAsEnded } = await getViewer();
  const showViewAsBar = viewingAs || viewAsEnded;

  return (
    <ViewAsProvider viewingAs={viewingAs} name={viewingAs ? profile.full_name : null}>
    <div className="flex min-h-dvh flex-col lg:pl-20">
      <div
        className={cn(
          "sticky top-0 z-30 pt-[env(safe-area-inset-top)]",
          showViewAsBar ? "bg-primary" : "bg-background",
        )}
      >
        {showViewAsBar ? <ViewAsBar name={profile.full_name} ended={viewAsEnded} /> : null}
        <header className="border-b bg-background">
          <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
            <Link
              href="/app"
              className="inline-flex min-h-11 items-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Wordmark />
            </Link>
            <div className="flex items-center gap-1">
              {showsAdminGear(profile.role) ? <AdminGear /> : null}
              {profile.role === "sales" ? <BellLink /> : null}
              <ThemeToggle />
              <SignOutButton action={signOut} disabled={viewingAs} askKeenan={real.role !== "owner"} />
            </div>
          </div>
        </header>
        {/* Book now, finish later (Keenan, 2026-11-10): a setter's bookings
            that still miss something, as one slim line under the header.
            While Keenan views the app as a setter, it is that setter's. */}
        <ToFinishBar person={{ id: profile.id, role: profile.role }} />
        {/* A quiet line when a newer build is live (Keenan, 2026-11-11);
            meeting mode has its own layout without it, and it hides while
            the booking sheet is open. */}
        <UpdateNotice />
      </div>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-10">
        {children}
      </main>
      <AppTabs role={profile.role} />
      <BookingSheetHost enabled={!viewAsEnded} userId={profile.id} />
    </div>
    </ViewAsProvider>
  );
}
