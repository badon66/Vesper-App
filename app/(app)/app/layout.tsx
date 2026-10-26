import Link from "next/link";
import { AppNav, type NavItem } from "@/components/app-nav";
import { Wordmark } from "@/components/brand/wordmark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { requireProfile } from "@/lib/auth/profile";
import { signOut } from "./actions";

const ownerNav: NavItem[] = [
  { href: "/app", label: "Home" },
  { href: "/app/people", label: "People" },
  { href: "/app/settings", label: "Settings" },
  { href: "/app/dashboard", label: "Dashboard" },
];

// Everything under /app needs a signed-in, active user with a profile.
// proxy.ts already redirects signed-out visitors; this check is the second
// lock on the same door, and it is the one that knows about roles.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b bg-background pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
          <Link
            href="/app"
            className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Wordmark />
          </Link>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      {profile.role === "owner" ? <AppNav items={ownerNav} /> : null}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {children}
      </main>
    </div>
  );
}
