import "server-only";
import type { DeviceRow } from "@/components/notifications/notifications-card";
import type { Viewer } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

// The devices that get the person's notifications (2026-11-03). Their own
// rows (Row Level Security) with each device's hashed push address, so the
// page can tell whether this browser is one of them. While Keenan views the
// app as a setter, that setter's devices come from an owner-only function,
// without the hashes: his browser is never theirs.
export async function devicesFor(viewer: Pick<Viewer, "profile" | "viewingAs">): Promise<DeviceRow[]> {
  const supabase = await createClient();
  if (viewer.viewingAs) {
    const { data } = await supabase.rpc("push_devices_for_member", { p_profile_id: viewer.profile.id });
    return (data ?? []).map((row) => ({ id: row.id, label: row.label, createdAt: row.created_at, lastSentAt: row.last_sent_at }));
  }
  const { data } = await supabase
    .from("push_subscriptions")
    .select("id, label, created_at, last_sent_at, endpoint_hash")
    .eq("profile_id", viewer.profile.id)
    .is("removed_at", null)
    .order("created_at");
  return (data ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    createdAt: row.created_at,
    lastSentAt: row.last_sent_at,
    hash: row.endpoint_hash,
  }));
}
