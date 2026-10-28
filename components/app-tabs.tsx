"use client";

import { House, List, Plus, Settings, type LucideIcon } from "lucide-react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { currentTab, hidesBottomBar, tabsFor, type Tab, type TabIcon } from "@/lib/nav";
import type { UserRole } from "@/lib/roles";
import { cn } from "@/lib/utils";

const ICONS: Record<TabIcon, LucideIcon> = {
  home: House,
  plus: Plus,
  list: List,
  admin: Settings,
};

const COLUMNS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
};

// The app's only navigation: a bottom tab bar on phone and iPad and a slim
// side rail from 1024 px, with the same items (CLAUDE.md, Navigation). It
// lives in the shared app layout, so switching tabs never reloads it. Tab
// links use Next.js's automatic prefetch, which with each tab's loading
// screen makes a tap switch at once while the data streams in.
export function AppTabs({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const tabs = tabsFor(role);
  if (tabs.length === 0) return null;
  const current = currentTab(pathname, tabs);

  return (
    <>
      <nav
        aria-label="Tabs"
        className={cn(
          "fixed inset-x-0 bottom-0 z-20 border-t bg-background pb-[env(safe-area-inset-bottom)] lg:hidden",
          hidesBottomBar(pathname) && "hidden",
        )}
      >
        <ul className={cn("grid", COLUMNS[tabs.length])}>
          {tabs.map((tab) => (
            <li key={tab.href}>
              <TabLink tab={tab} current={current === tab.href} layout="bar" />
            </li>
          ))}
        </ul>
      </nav>
      <nav
        aria-label="Tabs"
        className="fixed inset-y-0 left-0 z-20 hidden w-20 flex-col border-r bg-background pt-[calc(env(safe-area-inset-top)+4.5rem)] lg:flex"
      >
        <ul className="flex flex-col gap-1 px-1">
          {tabs.map((tab) => (
            <li key={tab.href}>
              <TabLink tab={tab} current={current === tab.href} layout="rail" />
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

function TabLink({ tab, current, layout }: { tab: Tab; current: boolean; layout: "bar" | "rail" }) {
  const Icon = ICONS[tab.icon];
  return (
    <Link
      href={tab.href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "relative flex flex-col items-center justify-center gap-1 text-xs font-semibold text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        layout === "bar" ? "h-16" : "h-16 rounded-md",
        current && "text-foreground",
        tab.prominent && "text-primary",
      )}
    >
      {tab.prominent ? (
        <span
          className={cn(
            "flex items-center justify-center rounded-full bg-primary text-primary-foreground ring-4 ring-background",
            layout === "bar" ? "-mt-5 size-14" : "size-11",
          )}
        >
          <Icon aria-hidden="true" className="size-7" />
        </span>
      ) : (
        <Icon aria-hidden="true" className="size-6" />
      )}
      {tab.label}
      <PendingMark current={current} layout={layout} />
    </Link>
  );
}

// Shows at once that a tap registered, even before the next screen arrives,
// and marks the current tab.
function PendingMark({ current, layout }: { current: boolean; layout: "bar" | "rail" }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute rounded-full bg-primary transition-opacity",
        layout === "bar" ? "inset-x-6 top-0 h-0.5" : "inset-y-3 left-0 w-0.5",
        current || pending ? "opacity-100" : "opacity-0",
        pending && "animate-pulse",
      )}
    />
  );
}
