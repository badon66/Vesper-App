import "server-only";
import { leadName } from "@/lib/leads/status";
import {
  GUIDED_PHOTO_SLOTS,
  guidedPhotoCount,
  isOwnLead,
  isUpcomingBooking,
  toFinish,
  type ToFinishItem,
  type ToFinishLead,
} from "@/lib/leads/to-finish";
import { heldTimeLabel } from "@/lib/schedule/meetings";
import { createClient } from "@/lib/supabase/server";
import { requestTime } from "@/lib/time";
import type { Database } from "@/types/database";

// One booking on the setter's reminder bar, with what it still needs.
export type BookingToFinish = {
  meetingId: string;
  leadId: string;
  name: string;
  address: string;
  startsAt: string;
  // "Tonight, 6:45 p.m.", "Tomorrow, 6:00 p.m.", "Sat, Nov 14, 7:30 p.m."
  when: string;
  items: ToFinishItem[];
};

// Only what the list needs. Never the phone, the email or the notes
// (contact privacy, 2026-11-04; round 6): phone_saved says a number is saved.
const LEAD_COLUMNS =
  "id, first_name, last_name, address_line, created_by, assigned_to, name_to_come, address_to_come, lat, lng, phone_saved, owns_home, wants_price, both_decision_makers, christmas_lights_now, looked_into_before, soffit_colour, not_collected";

type LeadRow = ToFinishLead &
  Pick<Database["public"]["Tables"]["leads"]["Row"], "first_name" | "last_name" | "address_line" | "created_by" | "assigned_to">;
type MeetingRow = Pick<Database["public"]["Tables"]["meetings"]["Row"], "id" | "starts_at" | "status" | "photos_skipped"> & {
  lead: LeadRow | null;
};

// Book now, finish later (Keenan, 2026-11-10): a setter's own upcoming
// bookings (booked or confirmed, not started yet, on leads they made or that
// are assigned to them) that still miss anything on the old Before you book
// list, soonest first. Setters only: Keenan's own leads have no bar.
//
// View as: the person is the one being viewed, while the reading is done
// with the owner's own session, which sees every booking. So the bookings
// are kept to the person's own leads here, in code, never by the database's
// rules alone, and the bar shows exactly what that setter sees.
export async function bookingsToFinish(person: { id: string; role: string }): Promise<BookingToFinish[]> {
  if (person.role !== "sales") return [];
  const supabase = await createClient();
  const now = requestTime();
  // Bookings open 14 days ahead, so the upcoming ones are a short list.
  const { data } = await supabase
    .from("meetings")
    .select(`id, starts_at, status, photos_skipped, lead:leads!meetings_lead_id_fkey(${LEAD_COLUMNS})`)
    .in("status", ["booked", "confirmed"])
    .gt("starts_at", new Date(now).toISOString())
    .order("starts_at")
    .limit(200);
  const own = ((data ?? []) as unknown as MeetingRow[]).filter(
    (meeting): meeting is MeetingRow & { lead: LeadRow } =>
      meeting.lead !== null && isOwnLead(meeting.lead, person.id) && isUpcomingBooking(meeting, now),
  );
  if (own.length === 0) return [];

  const leadIds = [...new Set(own.map((meeting) => meeting.lead.id))];
  const { data: photoRows } = await supabase
    .from("lead_photos")
    .select("lead_id, slot")
    .in("lead_id", leadIds)
    .in("slot", [...GUIDED_PHOTO_SLOTS]);
  const slotsByLead = new Map<string, (string | null)[]>();
  for (const photo of photoRows ?? []) {
    slotsByLead.set(photo.lead_id, [...(slotsByLead.get(photo.lead_id) ?? []), photo.slot]);
  }

  return own.flatMap((meeting) => {
    const items = toFinish(
      meeting.lead,
      { guided: guidedPhotoCount(slotsByLead.get(meeting.lead.id) ?? []), skipped: meeting.photos_skipped !== null },
      "booking",
    );
    if (items.length === 0) return [];
    return [
      {
        meetingId: meeting.id,
        leadId: meeting.lead.id,
        name: leadName(meeting.lead),
        address: meeting.lead.address_line,
        startsAt: new Date(meeting.starts_at).toISOString(),
        when: heldTimeLabel(meeting.starts_at),
        items,
      },
    ];
  });
}
