import type { UserRole } from "@/lib/roles";
import type { Database } from "@/types/database";

export type LeadStatus = Database["public"]["Enums"]["lead_status"];
export type LeadSource = Database["public"]["Enums"]["lead_source"];
export type HouseType = Database["public"]["Enums"]["house_type"];
export type SoffitColour = Database["public"]["Enums"]["soffit_colour"];

export const STATUS_ORDER: readonly LeadStatus[] = [
  "new",
  "follow_up",
  "meeting_booked",
  "met",
  "quoted",
  "sold",
  "installed",
  "lost",
];

export const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  follow_up: "Follow up",
  meeting_booked: "Meeting booked",
  met: "Met",
  quoted: "Quoted",
  sold: "Sold",
  installed: "Installed",
  lost: "Lost",
};

// What a setter may set by hand, in M2. Booking sets Meeting booked in M3;
// the owner sets everything after it. The database enforces the same rule.
export const SETTER_STATUSES: readonly LeadStatus[] = ["new", "follow_up", "lost"];

export const SOURCE_OPTIONS: { value: LeadSource; label: string }[] = [
  { value: "door", label: "Door" },
  { value: "referral", label: "Referral" },
  { value: "neighbour_card", label: "Neighbour card" },
  { value: "website", label: "Website" },
  { value: "other", label: "Other" },
];

export const HOUSE_TYPE_OPTIONS: { value: HouseType; label: string }[] = [
  { value: "bungalow", label: "Bungalow" },
  { value: "bi_level", label: "Bi-level" },
  { value: "two_storey", label: "Two storey" },
  { value: "other", label: "Other" },
];

export const SOFFIT_OPTIONS: { value: SoffitColour; label: string }[] = [
  { value: "white", label: "White" },
  { value: "black", label: "Black" },
  { value: "brown", label: "Brown" },
  { value: "other", label: "Other" },
];

export function labelFor<T extends string>(
  options: { value: T; label: string }[],
  value: T | null | undefined,
): string {
  return options.find((option) => option.value === value)?.label ?? "";
}

// The statuses a person can pick for a lead in this status. Empty means the
// status is not theirs to change.
export function statusChoices(role: UserRole, current: LeadStatus): LeadStatus[] {
  if (role === "owner") return [...STATUS_ORDER];
  if (role === "sales" && SETTER_STATUSES.includes(current)) return [...SETTER_STATUSES];
  return [];
}

export function canChangeStatus(role: UserRole, from: LeadStatus, to: LeadStatus): boolean {
  return from !== to && statusChoices(role, from).includes(to);
}

export function groupByStatus<T extends { status: LeadStatus }>(
  leads: T[],
): { status: LeadStatus; leads: T[] }[] {
  return STATUS_ORDER.map((status) => ({
    status,
    leads: leads.filter((lead) => lead.status === status),
  })).filter((group) => group.leads.length > 0);
}

export function leadName(lead: { first_name: string; last_name: string | null }): string {
  return [lead.first_name, lead.last_name].filter(Boolean).join(" ");
}
