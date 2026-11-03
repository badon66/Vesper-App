"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// A setter's Notifications, as a bell in the header (Keenan, 2026-11-03):
// they turn their own notifications on or off there, without Keenan's
// Settings. Marked while the page is open.
export const NOTIFICATIONS_HREF = "/app/notifications";

export function BellLink() {
  const current = usePathname() === NOTIFICATIONS_HREF;
  return (
    <Link
      href={NOTIFICATIONS_HREF}
      aria-label="Notifications"
      aria-current={current ? "page" : undefined}
      data-testid="bell"
      className={cn(
        "inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-md px-2.5 text-sm font-semibold text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
        current && "bg-muted",
      )}
    >
      <Bell aria-hidden="true" className="size-5" />
      {/* Named where there is room; a phone shows the bell alone. */}
      <span className="hidden sm:inline">Notifications</span>
    </Link>
  );
}
