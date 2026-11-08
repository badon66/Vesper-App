import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";

// Round 7 (Keenan, 2026-11-08): Keenan confirms each meeting himself, from
// the prep list; setters never do. confirm_meeting is the only way in, and
// only the owner's own session gets through. The ready-made text's wording
// lives in Settings, which stay the owner's. One throwaway setter, a lead
// and a meeting at 11 pm on the last evening of the window, hosted by the
// setter so no real evening is touched; everything removed at the end.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  throw new Error("RLS tests need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY. See .env.example.");
}

type Client = SupabaseClient<Database>;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin: Client = createClient<Database>(url, serviceKey, noSession);
const anon: Client = createClient<Database>(url, anonKey, noSession);
const stamp = Date.now().toString(36);
const setter = { email: `rls-r7-${stamp}@example.com`, password: `Rls-r7-${stamp}-pass`, id: "", client: admin };
let leadId = "";
let meetingId = "";

// 11 pm Calgary (UTC-6) on the window's last evening.
function lastEvening(): { starts: string; ends: string } {
  const calgaryNow = new Date(Date.now() - 6 * 3600_000);
  const day = new Date(Date.UTC(calgaryNow.getUTCFullYear(), calgaryNow.getUTCMonth(), calgaryNow.getUTCDate() + 14));
  const starts = new Date(day.getTime() + 29 * 3600_000); // 23:00 Calgary is 05:00 UTC the next day
  return { starts: starts.toISOString(), ends: new Date(starts.getTime() + 45 * 60_000).toISOString() };
}

beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({
    email: setter.email,
    password: setter.password,
    email_confirm: true,
    user_metadata: { full_name: "RLS R7" },
    app_metadata: { role: "sales" },
  });
  if (error || !data.user) throw new Error(`could not create ${setter.email}: ${error?.message}`);
  setter.id = data.user.id;
  const client = createClient<Database>(url!, anonKey!, noSession);
  const signedIn = await client.auth.signInWithPassword({ email: setter.email, password: setter.password });
  if (signedIn.error) throw new Error(`sign in failed: ${signedIn.error.message}`);
  setter.client = client;

  const lead = await admin
    .from("leads")
    .insert({ created_by: setter.id, first_name: `TEST R7 ${stamp}`, address_line: `1 Prep Test Way NW (TEST ${stamp})` })
    .select("id")
    .single();
  if (lead.error || !lead.data) throw new Error(`could not create the lead: ${lead.error?.message}`);
  leadId = lead.data.id;
  const when = lastEvening();
  const meeting = await admin
    .from("meetings")
    .insert({
      lead_id: leadId,
      host_id: setter.id,
      setter_id: setter.id,
      booked_by: setter.id,
      starts_at: when.starts,
      ends_at: when.ends,
      everyone_deciding_present: true,
    })
    .select("id")
    .single();
  if (meeting.error || !meeting.data) throw new Error(`could not create the meeting: ${meeting.error?.message}`);
  meetingId = meeting.data.id;
});

afterAll(async () => {
  if (leadId) {
    await admin.from("meetings").delete().eq("lead_id", leadId);
    await admin.from("lead_events").delete().eq("lead_id", leadId);
    await admin.from("leads").delete().eq("id", leadId);
  }
  if (setter.id) await admin.auth.admin.deleteUser(setter.id);
});

async function confirmedAt(): Promise<string | null> {
  const { data } = await admin.from("meetings").select("confirmed_at").eq("id", meetingId).single();
  return data?.confirmed_at ?? null;
}

describe("Confirming a meeting is Keenan's alone", () => {
  it("starts unconfirmed", async () => {
    expect(await confirmedAt()).toBeNull();
  });

  it("refuses a setter, even on their own lead's meeting, and changes nothing", async () => {
    const { data, error } = await setter.client.rpc("confirm_meeting", { p_meeting: meetingId, p_confirmed: true });
    expect(data).toBeNull();
    expect(error?.code).toBe("42501");
    expect(await confirmedAt()).toBeNull();
  });

  it("refuses anyone signed out", async () => {
    const { error } = await anon.rpc("confirm_meeting", { p_meeting: meetingId, p_confirmed: true });
    expect(error).not.toBeNull();
    expect(await confirmedAt()).toBeNull();
  });

  it("has no back door for a session that isn't the owner's (the secret key included)", async () => {
    const { error } = await admin.rpc("confirm_meeting", { p_meeting: meetingId, p_confirmed: true });
    expect(error?.code).toBe("42501");
    expect(await confirmedAt()).toBeNull();
  });

  it("can't be written straight to the table by a setter", async () => {
    const { data } = await setter.client.from("meetings").update({ confirmed_at: new Date().toISOString() }).eq("id", meetingId).select("id");
    expect(data ?? []).toEqual([]);
    expect(await confirmedAt()).toBeNull();
  });
});

describe("The confirmation text's wording", () => {
  it("starts as Keenan's ready-made text, with its blanks", async () => {
    const { data, error } = await admin.from("settings").select("confirm_text").eq("id", 1).single();
    expect(error).toBeNull();
    expect(data?.confirm_text).toContain("{first_name}");
    expect(data?.confirm_text).toContain("{time}");
  });

  it("stays out of what setters can read", async () => {
    const fromSettings = await setter.client.from("settings").select("confirm_text").eq("id", 1);
    expect(fromSettings.data ?? []).toEqual([]);
    // settings_public lists its columns one by one, so a new one isn't in it.
    const fromPublic = await setter.client.from("settings_public").select("confirm_text" as "booking_window_days").limit(1);
    expect(fromPublic.error).not.toBeNull();
  });
});
