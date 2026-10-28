import Link from "next/link";
import { AppTabs } from "@/components/app-tabs";
import { Wordmark } from "@/components/brand/wordmark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { ViewAsBar } from "@/components/view-as-bar";
import { getViewer } from "@/lib/auth/profile";
import { cn } from "@/lib/utils";
import { signOut } from "./actions";

// Everything under /app needs a signed-in, active user with a profile.
// proxy.ts already redirects signed-out visitors; this check is the second
// lock on the same door, and it is the one that knows about roles.
//
// The tabs live here, in the layout every screen shares, so moving between
// tabs never reloads them. While the owner is viewing the app as someone,
// every screen renders as that person and sits inside a disabled fieldset:
// no button, field or choice works, while links and tabs still do.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile, viewingAs, viewAsEnded } = await getViewer();
  const showViewAsBar = viewingAs || viewAsEnded;

  return (
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
              <ThemeToggle />
              <form action={signOut}>
                <Button type="submit" variant="ghost" size="sm" disabled={viewingAs}>
                  Sign out
                </Button>
              </form>
            </div>
          </div>
        </header>
      </div>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-10">
        {viewingAs ? (
          <fieldset disabled className="m-0 min-w-0 border-0 p-0">
            {children}
          </fieldset>
        ) : (
          children
        )}
      </main>
      <AppTabs role={profile.role} />
    </div>
  );
}
