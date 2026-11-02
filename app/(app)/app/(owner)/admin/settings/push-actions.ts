"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NotOwnerError, ReadOnlyError, requireOwnerForAction, type SessionProfile } from "@/lib/auth/profile";
import { endpointHash, readSubscription, seal } from "@/lib/push/seal";
import { pushKeys, sendPush } from "@/lib/push/send";
import { createClient } from "@/lib/supabase/server";
import { VIEW_AS_READ_ONLY } from "@/lib/view-as";

// Notifications on Keenan's devices (2026-11-02): turn them on for this
// device, switch a device off, and send a test. Each member's devices are
// their own rows; the push address is stored sealed.

type Refused = { ok: false; message: string };

async function owner(): Promise<SessionProfile | Refused> {
  try {
    return await requireOwnerForAction();
  } catch (e) {
    if (e instanceof ReadOnlyError) return { ok: false, message: VIEW_AS_READ_ONLY };
    if (e instanceof NotOwnerError) return { ok: false, message: "Only Keenan can change notifications here." };
    throw e;
  }
}

const refused = (value: SessionProfile | Refused): value is Refused => "ok" in value;

const NOT_SET_UP = "Notifications aren't set up yet: the two keys need to be added in Vercel first.";
const SETTINGS = "/app/admin/settings";

export type PushActionResult = { ok: true; message?: string } | Refused;

// This device's push address, sealed and kept for this member.
export async function saveThisDevice(subscription: unknown, label: string): Promise<PushActionResult> {
  const me = await owner();
  if (refused(me)) return me;
  const keys = pushKeys();
  if (!keys) return { ok: false, message: NOT_SET_UP };
  const sub = readSubscription(subscription);
  const name = z.string().trim().min(1).max(60).safeParse(label);
  if (!sub || !name.success) return { ok: false, message: "This device's notification details didn't come through. Try again." };

  const supabase = await createClient();
  const hash = endpointHash(sub.endpoint);
  const sealed = seal(JSON.stringify(sub), keys.privateKey);
  const { data: existing } = await supabase.from("push_subscriptions").select("id").eq("endpoint_hash", hash).maybeSingle();
  const write = existing
    ? await supabase.from("push_subscriptions").update({ sealed, label: name.data, removed_at: null }).eq("id", existing.id)
    : await supabase.from("push_subscriptions").insert({ profile_id: me.id, endpoint_hash: hash, sealed, label: name.data });
  if (write.error) return { ok: false, message: "That didn't save. Check your signal and try again." };
  revalidatePath(SETTINGS);
  return { ok: true };
}

// Stops sending to a device. The row stays, sealed, marked removed.
export async function switchOffDevice(id: string): Promise<PushActionResult> {
  const me = await owner();
  if (refused(me)) return me;
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { ok: false, message: "That device wasn't found." };
  const { error } = await (await createClient())
    .from("push_subscriptions")
    .update({ removed_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .eq("profile_id", me.id);
  if (error) return { ok: false, message: "That didn't save. Check your signal and try again." };
  revalidatePath(SETTINGS);
  return { ok: true };
}

// The same as switchOffDevice, found by the browser's own push address.
export async function switchOffThisDevice(subscription: unknown): Promise<PushActionResult> {
  const me = await owner();
  if (refused(me)) return me;
  const sub = readSubscription(subscription);
  if (!sub) return { ok: true };
  const { error } = await (await createClient())
    .from("push_subscriptions")
    .update({ removed_at: new Date().toISOString() })
    .eq("endpoint_hash", endpointHash(sub.endpoint))
    .eq("profile_id", me.id);
  if (error) return { ok: false, message: "That didn't save. Check your signal and try again." };
  revalidatePath(SETTINGS);
  return { ok: true };
}

// A test to every device that has notifications on, so Keenan can see
// they arrive. Devices the push service says are gone are switched off.
export async function sendTestNotification(): Promise<PushActionResult> {
  const me = await owner();
  if (refused(me)) return me;
  if (!pushKeys()) return { ok: false, message: NOT_SET_UP };
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("push_subscriptions")
    .select("id, sealed")
    .eq("profile_id", me.id)
    .is("removed_at", null);
  if (!rows || rows.length === 0) {
    return { ok: false, message: "No device has notifications on yet. Turn them on for this device first." };
  }
  const result = await sendPush(rows, {
    title: "Vesper",
    body: "This is a test. Notifications are working on this device.",
    url: `${SETTINGS}#notifications`,
    tag: "test",
  });
  const now = new Date().toISOString();
  if (result.sent.length > 0) {
    await supabase.from("push_subscriptions").update({ last_sent_at: now }).in("id", result.sent);
  }
  if (result.gone.length > 0) {
    await supabase.from("push_subscriptions").update({ removed_at: now }).in("id", result.gone);
  }
  revalidatePath(SETTINGS);
  const sent = result.sent.length;
  const parts = [
    sent === 0 ? "Nothing was sent." : `Sent to ${sent === 1 ? "1 device" : `${sent} devices`}.`,
    result.gone.length > 0
      ? `${result.gone.length === 1 ? "1 device has" : `${result.gone.length} devices have`} stopped taking notifications and ${result.gone.length === 1 ? "was" : "were"} switched off.`
      : "",
    result.failed.length > 0 ? `${result.failed.length === 1 ? "1 device" : `${result.failed.length} devices`} didn't answer; try again in a minute.` : "",
  ];
  return sent > 0 ? { ok: true, message: parts.filter(Boolean).join(" ") } : { ok: false, message: parts.filter(Boolean).join(" ") };
}
