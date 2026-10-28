import type { UserRole } from "@/lib/roles";

// The tabs each role sees, in order. The same items show in the bottom tab
// bar on phone and iPad and in the side rail from 1024 px. A tab that belongs
// to a later milestone is left out until it is built: Schedule and My pay in
// M3, and Pay inside Admin (CLAUDE.md, Navigation).

export type TabIcon = "home" | "plus" | "list" | "admin";

export type Tab = {
  href: string;
  label: string;
  icon: TabIcon;
  // New lead is the prominent centre button.
  prominent?: boolean;
};

const HOME: Tab = { href: "/app", label: "Home", icon: "home" };
const NEW_LEAD: Tab = { href: "/app/leads/new", label: "New lead", icon: "plus", prominent: true };
const LEADS: Tab = { href: "/app/leads", label: "Leads", icon: "list" };
const ADMIN: Tab = { href: "/app/admin", label: "Admin", icon: "admin" };

export function tabsFor(role: UserRole): Tab[] {
  if (role === "owner") return [HOME, NEW_LEAD, LEADS, ADMIN];
  if (role === "sales") return [HOME, NEW_LEAD, LEADS];
  // Crew has no screens until V2, so no tabs.
  return [];
}

// Which tab a path belongs to, so the right one is shown as current.
export function currentTab(pathname: string, tabs: Tab[]): string | null {
  if (pathname === "/app") return tabs.some((tab) => tab.href === "/app") ? "/app" : null;
  if (pathname === "/app/leads/new") return tabs.some((tab) => tab.href === "/app/leads/new") ? "/app/leads/new" : null;
  const match = tabs
    .filter((tab) => tab.href !== "/app" && (pathname === tab.href || pathname.startsWith(`${tab.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return match?.href ?? null;
}

// The lead form has its own Cancel and Save bar at the bottom of a phone, so
// the bottom tab bar steps aside there. The side rail stays.
export function hidesBottomBar(pathname: string): boolean {
  return pathname === "/app/leads/new" || /^\/app\/leads\/[^/]+\/edit$/.test(pathname);
}
