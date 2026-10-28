"use client";

import { House, List, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// Phone navigation within thumb reach. Hidden on the lead form pages, which
// have their own Save bar at the bottom of the screen.
export function BottomNav() {
  const pathname = usePathname();
  if (pathname === "/app/leads/new" || pathname.endsWith("/edit")) return null;

  const items = [
    { href: "/app", label: "Home", icon: House, current: pathname === "/app" },
    { href: "/app/leads/new", label: "New lead", icon: Plus, current: false },
    {
      href: "/app/leads",
      label: "Leads",
      icon: List,
      current: pathname.startsWith("/app/leads"),
    },
  ];

  return (
    <nav
      aria-label="Phone"
      className="fixed inset-x-0 bottom-0 z-20 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-3">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={item.current ? "page" : undefined}
              className={cn(
                "flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                item.current && "text-foreground",
                item.label === "New lead" && "text-primary",
              )}
            >
              <item.icon aria-hidden="true" className="size-6" />
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
