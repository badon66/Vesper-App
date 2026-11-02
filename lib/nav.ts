import type { UserRole } from "@/lib/roles";

// The tabs each role sees, in order. The same items show in the bottom tab
// bar on phone and iPad and in the side rail from 1024 px (CLAUDE.md,
// Navigation). The owner's Admin (People, Settings and Pay) is a gear in
// the header instead of a tab: six items crowd a phone's bar (Keenan,
// 2026-11-02).

export type TabIcon = "home" | "plus" | "list" | "schedule" | "meetings" | "pay";

export type Tab = {
  href: string;
  label: string;
  icon: TabIcon;
  // New lead is the prominent gold button.
  prominent?: boolean;
};

const HOME: Tab = { href: "/app", label: "Home", icon: "home" };
const NEW_LEAD: Tab = { href: "/app/leads/new", label: "New lead", icon: "plus", prominent: true };
const LEADS: Tab = { href: "/app/leads", label: "Leads", icon: "list" };
const SCHEDULE: Tab = { href: "/app/schedule", label: "Schedule", icon: "schedule" };
const MEETINGS: Tab = { href: "/app/meetings", label: "Meetings", icon: "meetings" };
const MY_PAY: Tab = { href: "/app/pay", label: "My pay", icon: "pay" };

export function tabsFor(role: UserRole): Tab[] {
  if (role === "owner") return [HOME, SCHEDULE, MEETINGS, NEW_LEAD, LEADS];
  if (role === "sales") return [HOME, SCHEDULE, NEW_LEAD, LEADS, MY_PAY];
  // Crew has no screens until V2, so no tabs.
  return [];
}

// Admin's gear in the header: the owner's only, marked while an Admin page
// (People, Settings or Pay) is open.
export const ADMIN_HREF = "/app/admin";
export function showsAdminGear(role: UserRole): boolean {
  return role === "owner";
}
export function inAdmin(pathname: string): boolean {
  return pathname === ADMIN_HREF || pathname.startsWith(`${ADMIN_HREF}/`);
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
