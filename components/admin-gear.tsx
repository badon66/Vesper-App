"use client";

import { Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_HREF, inAdmin } from "@/lib/nav";
import { cn } from "@/lib/utils";

// The owner's Admin (People, Settings and Pay) as a small gear in the
// header: with Meetings in the tabs, six items crowd a phone's bar (Keenan,
// 2026-11-02). Shown only to the owner, marked while an Admin page is open.
export function AdminGear() {
  const pathname = usePathname();
  const current = inAdmin(pathname);
  return (
    <Link
      href={ADMIN_HREF}
      aria-label="Admin"
      aria-current={current ? "page" : undefined}
      data-testid="admin-gear"
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring",
        current ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Settings aria-hidden="true" className="size-5" />
    </Link>
  );
}
