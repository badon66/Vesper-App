import { calgaryDateOf, formatDay, formatTime } from "@/lib/time";
import type { Database } from "@/types/database";

export type MeetingStatus = Database["public"]["Enums"]["meeting_status"];

export const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = {
  booked: "Booked",
  confirmed: "Confirmed",
  qualified: "Qualified",
  not_qualified: "Not qualified",
  no_show: "No-show",
  cancelled: "Cancelled",
  moved: "Moved",
};

export const OUTCOMES = ["qualified", "not_qualified", "no_show", "cancelled"] as const satisfies readonly MeetingStatus[];
export type Outcome = (typeof OUTCOMES)[number];

export const LIVE_STATUSES: readonly MeetingStatus[] = ["booked", "confirmed"];

export function isLive(status: MeetingStatus): boolean {
  return LIVE_STATUSES.includes(status);
}

export function hasOutcome(status: MeetingStatus): boolean {
  return (OUTCOMES as readonly string[]).includes(status);
}

// "Mon, Nov 2 at 5:35 p.m."
export function formatMeetingTime(startsAt: string): string {
  return `${formatDay(calgaryDateOf(startsAt))} at ${formatTime(startsAt)}`;
}

// Ends a sentence once: times already end in "p.m."
export function sentence(text: string): string {
  return text.endsWith(".") ? text : `${text}.`;
}

export const PHOTO_SKIP_LABELS: Record<string, string> = {
  homeowner_said_no: "Homeowner said no",
  other: "Other",
};

export function positionSourceText(source: string | null, accuracy: number | null): string | null {
  if (source === "picked") return "Address picked from the suggestions";
  if (source === "device") {
    return accuracy !== null
      ? `Placed from the phone at the door, accurate to about ${Math.round(accuracy)} m`
      : "Placed from the phone at the door";
  }
  return null;
}
