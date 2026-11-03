"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import {
  NotAllowedError,
  NotOwnerError,
  ReadOnlyError,
  requireOwnerForAction,
  requireSalesSideForAction,
  type SessionProfile,
} from "@/lib/auth/profile";
import { notifyCancelled, notifyMoved, notifyOutcome } from "@/lib/push/setter-notices";
import { bookingMessage, errorCode } from "@/lib/schedule/messages";
import { OUTCOMES } from "@/lib/schedule/meetings";
import { createClient } from "@/lib/supabase/server";
import { VIEW_AS_READ_ONLY } from "@/lib/view-as";

// Every hold, booking, move, cancel, outcome, block and payout goes through
// the database's booking functions, called with the signed-in person's own
// session. The database decides; these actions turn its answer into words.
// While the owner views the app as someone, every one of them is refused.

export type ActionResult = { ok: true } | { ok: false; code: string; message: string };

const instant = z.iso.datetime({ offset: true });
const id = z.uuid();

async function salesSide(): Promise<SessionProfile | ActionResult> {
  try {
    return await requireSalesSideForAction();
  } catch (e) {
    if (e instanceof ReadOnlyError) return { ok: false, code: "read_only", message: VIEW_AS_READ_ONLY };
    if (e instanceof NotAllowedError) return { ok: false, code: "not_allowed", message: "Not for your role." };
    throw e;
  }
}

async function owner(): Promise<SessionProfile | ActionResult> {
  try {
    return await requireOwnerForAction();
  } catch (e) {
    if (e instanceof ReadOnlyError) return { ok: false, code: "read_only", message: VIEW_AS_READ_ONLY };
    if (e instanceof NotOwnerError) return { ok: false, code: "not_allowed", message: "Only Keenan can do that." };
    throw e;
  }
}

const isResult = (value: unknown): value is ActionResult =>
  typeof value === "object" && value !== null && "ok" in value;

function failed(error: { message?: string; hint?: string | null; details?: string | null }): { ok: false; code: string; message: string } {
  return { ok: false, code: errorCode(error), message: bookingMessage(error) };
}

function refreshSchedule(leadId?: string | null) {
  revalidatePath("/app");
  revalidatePath("/app/schedule");
  revalidatePath("/app/leads");
  revalidatePath("/app/pay");
  if (leadId) revalidatePath(`/app/leads/${leadId}`);
}

// ---------------------------------------------------------------- holds

// When a hold runs out, by the database's own clock (round 2).
export type HoldTimer = { expiresAt: string; now: string };
export type HoldResult = ({ ok: true } & HoldTimer) | { ok: false; code: string; message: string };

function timerOf(data: unknown): HoldTimer | null {
  const value = data as { expires_at?: unknown; now?: unknown } | null;
  if (typeof value?.expires_at !== "string" || typeof value.now !== "string") return null;
  return { expiresAt: new Date(value.expires_at).toISOString(), now: new Date(value.now).toISOString() };
}

// Tapping an open time holds it, for booking a lead or moving a booking. It
// lasts the hold length in Settings (round 2: the timer is what frees it).
export async function holdTime(
  startsAt: string,
  opts: { leadId?: string | null; meetingId?: string | null } = {},
): Promise<HoldResult> {
  const me = await salesSide();
  if (isResult(me)) return me.ok ? { ok: false, code: "unknown", message: "Try again." } : me;
  const at = instant.safeParse(startsAt);
  const lead = opts.leadId ? id.safeParse(opts.leadId) : null;
  const meeting = opts.meetingId ? id.safeParse(opts.meetingId) : null;
  if (!at.success || (lead && !lead.success) || (meeting && !meeting.success)) {
    return { ok: false, code: "not_a_slot", message: "That isn't one of the meeting times." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hold_slot", {
    p_starts_at: at.data,
    ...(lead?.success ? { p_lead_id: lead.data } : {}),
    ...(meeting?.success ? { p_meeting_id: meeting.data } : {}),
  });
  if (error) return failed(error);
  const timer = timerOf(data);
  return timer ? { ok: true, ...timer } : { ok: false, code: "unknown", message: "That didn't hold. Try again." };
}

export type HoldStatus = { status: "held" | "expired" | "lost" | "none"; startsAt?: string; retaken?: boolean } & Partial<HoldTimer>;

function holdStatusOf(data: unknown): HoldStatus {
  if (!data || typeof data !== "object" || Array.isArray(data)) return { status: "none" };
  const value = data as { status?: string; starts_at?: string; retaken?: boolean };
  const status = value.status === "held" || value.status === "expired" || value.status === "lost" ? value.status : "none";
  return {
    status,
    ...(value.starts_at ? { startsAt: new Date(value.starts_at).toISOString() } : {}),
    ...(timerOf(data) ?? {}),
    ...(value.retaken ? { retaken: true } : {}),
  };
}

// The caller's own hold and when it runs out. Reading only.
export async function myHoldStatus(): Promise<HoldStatus> {
  const me = await salesSide();
  if (isResult(me)) return { status: "none" };
  const { data, error } = await (await createClient()).rpc("hold_status");
  return error ? { status: "none" } : holdStatusOf(data);
}

// Add 5 minutes (round 2): the hold length again, for the holder only, or
// the time taken back with a fresh timer while it's still free.
export async function extendMyHold(): Promise<HoldStatus | { status: "refused"; message: string }> {
  const me = await salesSide();
  if (isResult(me)) return { status: "refused", message: me.ok === false ? me.message : "" };
  const { data, error } = await (await createClient()).rpc("extend_hold");
  return error ? { status: "none" } : holdStatusOf(data);
}

export type RenewResult = { status: "held" | "lost" | "none"; startsAt?: string };

// Before round 2 the screen checked in here to keep its hold alive; now it
// only reports, and a run-out hold reads as lost.
export async function renewMyHold(): Promise<RenewResult> {
  const result = await myHoldStatus();
  return {
    status: result.status === "held" ? "held" : result.status === "none" ? "none" : "lost",
    ...(result.startsAt ? { startsAt: result.startsAt } : {}),
  };
}

// Backing out lets the hold go at once.
export async function releaseMyHold(): Promise<void> {
  const me = await salesSide();
  if (isResult(me)) return;
  const supabase = await createClient();
  await supabase.rpc("release_hold");
}

// ---------------------------------------------------------------- booking

export type BookState = { ok?: false; code?: string; message?: string; problems?: string[] };

const bookSchema = z.object({
  lead_id: id,
  starts_at: instant,
  everyone: z.literal("yes", { error: "Confirm everyone who decides will be at the meeting." }).or(z.literal("")),
  photos_skipped: z.enum(["", "homeowner_said_no", "other"]),
  photos_skip_note: z.string().trim().max(300),
});

export async function bookMeeting(_previous: BookState, formData: FormData): Promise<BookState> {
  const me = await salesSide();
  if (isResult(me)) return me.ok ? {} : { ok: false, code: me.code, message: me.message };
  const parsed = bookSchema.safeParse({
    lead_id: formData.get("lead_id"),
    starts_at: formData.get("starts_at"),
    everyone: String(formData.get("everyone") ?? ""),
    photos_skipped: String(formData.get("photos_skipped") ?? ""),
    photos_skip_note: String(formData.get("photos_skip_note") ?? ""),
  });
  if (!parsed.success) return { ok: false, code: "invalid", message: "Pick a time and a lead first." };
  const values = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("book_meeting", {
    p_lead_id: values.lead_id,
    p_starts_at: values.starts_at,
    p_everyone_deciding_present: values.everyone === "yes",
    ...(values.photos_skipped ? { p_photos_skipped: values.photos_skipped } : {}),
    ...(values.photos_skip_note ? { p_photos_skip_note: values.photos_skip_note } : {}),
  });
  if (error) {
    return {
      ok: false,
      code: errorCode(error),
      message: bookingMessage(error),
      problems: errorCode(error) === "not_ready" ? (error.details ?? "").split(",").filter(Boolean) : undefined,
    };
  }
  refreshSchedule(values.lead_id);
  redirect(`/app/leads/${values.lead_id}?booked=${data}`);
}

// Moving a booking to a time the person already holds.
export async function moveBooking(meetingId: string, startsAt: string): Promise<ActionResult> {
  const me = await salesSide();
  if (isResult(me)) return me;
  const meeting = id.safeParse(meetingId);
  const at = instant.safeParse(startsAt);
  if (!meeting.success || !at.success) return { ok: false, code: "no_meeting", message: "That booking was not found." };
  const supabase = await createClient();
  const { data: before } = await supabase.from("meetings").select("lead_id").eq("id", meeting.data).maybeSingle();
  const { error } = await supabase.rpc("move_meeting", { p_meeting_id: meeting.data, p_new_starts_at: at.data });
  if (error) return failed(error);
  refreshSchedule(before?.lead_id);
  // Keenan moving a setter's booking tells that setter, after the answer.
  if (me.role === "owner") after(() => notifyMoved(supabase, meeting.data, me.id, at.data).catch(() => undefined));
  return { ok: true };
}

export async function cancelBooking(meetingId: string, note: string): Promise<ActionResult> {
  const me = await salesSide();
  if (isResult(me)) return me;
  const meeting = id.safeParse(meetingId);
  if (!meeting.success) return { ok: false, code: "no_meeting", message: "That booking was not found." };
  const supabase = await createClient();
  const { data: before } = await supabase.from("meetings").select("lead_id").eq("id", meeting.data).maybeSingle();
  const { error } = await supabase.rpc("cancel_meeting", {
    p_meeting_id: meeting.data,
    ...(note.trim() ? { p_note: note.trim().slice(0, 500) } : {}),
  });
  if (error) return failed(error);
  refreshSchedule(before?.lead_id);
  if (me.role === "owner") after(() => notifyCancelled(supabase, meeting.data, me.id).catch(() => undefined));
  return { ok: true };
}

// ---------------------------------------------------------------- the owner's

const outcomeSchema = z.object({
  meeting_id: id,
  outcome: z.enum(OUTCOMES),
  reason: z.string().trim().max(200),
  other_reason: z.string().trim().max(200),
  note: z.string().trim().max(500),
});

export async function setOutcome(_previous: ActionResult | null, formData: FormData): Promise<ActionResult | null> {
  const me = await owner();
  if (isResult(me)) return me;
  const parsed = outcomeSchema.safeParse({
    meeting_id: formData.get("meeting_id"),
    outcome: formData.get("outcome"),
    reason: String(formData.get("reason") ?? ""),
    other_reason: String(formData.get("other_reason") ?? ""),
    note: String(formData.get("note") ?? ""),
  });
  if (!parsed.success) return { ok: false, code: "bad_outcome", message: "Pick an outcome." };
  const { meeting_id, outcome, reason, other_reason, note } = parsed.data;
  const finalReason = reason === "Other" ? other_reason : reason;
  if (outcome === "not_qualified" && !finalReason) {
    return { ok: false, code: "reason_needed", message: reason === "Other" ? "Say why, in a few words." : "Pick a reason." };
  }
  const supabase = await createClient();
  const { data: before } = await supabase.from("meetings").select("lead_id").eq("id", meeting_id).maybeSingle();
  const { error } = await supabase.rpc("set_meeting_outcome", {
    p_meeting_id: meeting_id,
    p_outcome: outcome,
    ...(outcome === "not_qualified" ? { p_reason: finalReason } : {}),
    ...(note && (outcome === "no_show" || outcome === "cancelled") ? { p_note: note } : {}),
  });
  if (error) return failed(error);
  refreshSchedule(before?.lead_id);
  revalidatePath("/app/admin/pay");
  // The setter hears about it on their phone: the reason only when it came
  // from the list, never a note typed by hand (CLAUDE.md).
  after(() =>
    notifyOutcome(supabase, meeting_id, me.id, outcome, {
      text: outcome === "not_qualified" ? finalReason : null,
      listed: outcome === "not_qualified" && reason !== "Other",
    }).catch(() => undefined),
  );
  return { ok: true };
}

export async function addTimeBlock(startsAt: string, endsAt: string, reason: string): Promise<ActionResult> {
  const me = await owner();
  if (isResult(me)) return me;
  const from = instant.safeParse(startsAt);
  const to = instant.safeParse(endsAt);
  if (!from.success || !to.success) return { ok: false, code: "bad_block", message: "Pick the times to block." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_time_block", {
    p_starts_at: from.data,
    p_ends_at: to.data,
    ...(reason.trim() ? { p_reason: reason.trim().slice(0, 200) } : {}),
  });
  if (error) return failed(error);
  refreshSchedule();
  return { ok: true };
}

export async function removeTimeBlock(blockId: string): Promise<ActionResult> {
  const me = await owner();
  if (isResult(me)) return me;
  const block = id.safeParse(blockId);
  if (!block.success) return { ok: false, code: "bad_block", message: "That block was not found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_time_block", { p_block_id: block.data });
  if (error) return failed(error);
  refreshSchedule();
  return { ok: true };
}

// ---------------------------------------------------------------- one evening's times (M3.5)

export type DayScope = "day" | "all" | "usual";
export type DaySchedulePreview = {
  ok: true;
  times: string[];
  misaligned: { meetingId: string; startsAt: string; name: string; neighbourhood: string | null; setterName: string | null }[];
  holds: { startsAt: string; holderName: string }[];
  ownDaysKept: string[];
};

const dayTemplateSchema = z.object({
  day: z.iso.date(),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  minutes: z.number().int().min(15).max(180),
  count: z.number().int().min(1).max(12),
  scope: z.enum(["day", "all", "usual"]),
});

// What a day change would do, before Keenan saves it: the evening's new
// times, bookings that would no longer line up (they keep their times),
// holds that would let go, and which evenings keep their own times.
export async function previewDaySchedule(input: {
  day: string;
  start: string;
  minutes: number;
  count: number;
  scope: DayScope;
}): Promise<DaySchedulePreview | ActionResult> {
  const me = await owner();
  if (isResult(me)) return me;
  const parsed = dayTemplateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "bad_template", message: "Check the start, length and number of meetings." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("day_schedule_preview", {
    p_day: parsed.data.day,
    p_start: parsed.data.start,
    p_minutes: parsed.data.minutes,
    p_count: parsed.data.count,
    p_scope: parsed.data.scope,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return error ? failed(error) : { ok: false, code: "unknown", message: "The preview didn't load. Try again." };
  }
  const plan = data as {
    times?: string[];
    misaligned?: { meeting_id: string; starts_at: string; first_name: string; last_name: string | null; neighbourhood: string | null; setter_name: string | null }[];
    holds?: { starts_at: string; holder_name: string }[];
    own_days_kept?: string[];
  };
  return {
    ok: true,
    times: (plan.times ?? []).map((time) => new Date(time).toISOString()),
    misaligned: (plan.misaligned ?? []).map((meeting) => ({
      meetingId: meeting.meeting_id,
      startsAt: new Date(meeting.starts_at).toISOString(),
      name: [meeting.first_name, meeting.last_name].filter(Boolean).join(" "),
      neighbourhood: meeting.neighbourhood,
      setterName: meeting.setter_name,
    })),
    holds: (plan.holds ?? []).map((hold) => ({ startsAt: new Date(hold.starts_at).toISOString(), holderName: hold.holder_name })),
    ownDaysKept: plan.own_days_kept ?? [],
  };
}

// Keenan's day change from Schedule's pencil: this evening only, all days
// (which updates Settings), or back to the usual times. It never moves or
// cancels a booking.
export async function setDaySchedule(input: {
  day: string;
  start: string;
  minutes: number;
  count: number;
  scope: DayScope;
}): Promise<ActionResult> {
  const me = await owner();
  if (isResult(me)) return me;
  const parsed = dayTemplateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "bad_template", message: "Check the start, length and number of meetings." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_day_schedule", {
    p_day: parsed.data.day,
    p_start: parsed.data.start,
    p_minutes: parsed.data.minutes,
    p_count: parsed.data.count,
    p_scope: parsed.data.scope,
  });
  if (error) return failed(error);
  refreshSchedule();
  if (parsed.data.scope === "all") revalidatePath("/app/admin/settings");
  return { ok: true };
}

export async function markPaid(_previous: ActionResult | null, formData: FormData): Promise<ActionResult | null> {
  const me = await owner();
  if (isResult(me)) return me;
  const ids = formData.getAll("earning_id").map(String);
  const parsed = z.array(id).min(1).safeParse(ids);
  if (!parsed.success) return { ok: false, code: "none_picked", message: "Tick the lines you've paid first." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_earnings_paid", { p_ids: parsed.data });
  if (error) return failed(error);
  revalidatePath("/app/admin/pay");
  revalidatePath("/app/pay");
  return { ok: true };
}
