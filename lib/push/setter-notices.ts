import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cancelledNotice, movedNotice, outcomeNotice, type OutcomeChange } from "@/lib/push/notices";
import { sendPush, type PushNotice } from "@/lib/push/send";
import { formatMeetingTime } from "@/lib/schedule/meetings";
import type { Database } from "@/types/database";

// Notices to a setter when Keenan marks, moves or cancels their booking
// (Keenan, 2026-11-03). Sent from Keenan's own action, with his own
// session: the setter's addresses come from an owner-only function, sealed,
// and only the server opens them. Nothing here runs for a setter's own
// moves and cancels, and nothing is sent about anyone but that setter.

type Client = SupabaseClient<Database>;

type Booking = { leadId: string; setterId: string; address: string };

// The booking's setter (the person whose lead it is, who earns the fee),
// when that person is an active setter other than whoever is acting.
async function bookingOf(supabase: Client, meetingId: string, actingId: string): Promise<Booking | null> {
  const { data: meeting } = await supabase
    .from("meetings")
    .select("lead_id, setter_id, leads (address_line)")
    .eq("id", meetingId)
    .maybeSingle();
  if (!meeting?.setter_id || meeting.setter_id === actingId) return null;
  const { data: setter } = await supabase
    .from("profiles")
    .select("role, active")
    .eq("id", meeting.setter_id)
    .maybeSingle();
  if (!setter || setter.role !== "sales" || !setter.active) return null;
  return { leadId: meeting.lead_id, setterId: meeting.setter_id, address: meeting.leads?.address_line ?? "" };
}

async function deliver(supabase: Client, setterId: string, notice: PushNotice): Promise<void> {
  const { data: targets } = await supabase.rpc("push_targets_for_member", { p_profile_id: setterId });
  if (!targets || targets.length === 0) return;
  await sendPush(targets, notice);
}

const leadUrl = (leadId: string) => `/app/leads/${leadId}`;

// After Keenan marks the outcome. Qualified says the fee only when one was
// actually added for this booking (one per lead, ever).
export async function notifyOutcome(
  supabase: Client,
  meetingId: string,
  actingId: string,
  outcome: "qualified" | "not_qualified" | "no_show" | "cancelled",
  reason: { text: string | null; listed: boolean },
): Promise<void> {
  const booking = await bookingOf(supabase, meetingId, actingId);
  if (!booking) return;
  let change: OutcomeChange;
  if (outcome === "qualified") {
    const { data: fee } = await supabase
      .from("earnings")
      .select("amount")
      .eq("meeting_id", meetingId)
      .eq("type", "booking")
      .eq("status", "pending")
      .maybeSingle();
    change = { kind: "qualified", feeAdded: fee ? Number(fee.amount) : null };
  } else if (outcome === "not_qualified") {
    change = { kind: "not_qualified", reason: reason.text, listed: reason.listed };
  } else if (outcome === "no_show") {
    change = { kind: "no_show" };
  } else {
    change = { kind: "cancelled_outcome" };
  }
  await deliver(supabase, booking.setterId, outcomeNotice(booking.address, change, leadUrl(booking.leadId)));
}

// After Keenan moves a setter's booking to a new time.
export async function notifyMoved(supabase: Client, meetingId: string, actingId: string, newStartsAt: string): Promise<void> {
  const booking = await bookingOf(supabase, meetingId, actingId);
  if (!booking) return;
  await deliver(supabase, booking.setterId, movedNotice(booking.address, formatMeetingTime(newStartsAt), leadUrl(booking.leadId)));
}

// After Keenan cancels a setter's booking before its time.
export async function notifyCancelled(supabase: Client, meetingId: string, actingId: string): Promise<void> {
  const booking = await bookingOf(supabase, meetingId, actingId);
  if (!booking) return;
  await deliver(supabase, booking.setterId, cancelledNotice(booking.address, leadUrl(booking.leadId)));
}
