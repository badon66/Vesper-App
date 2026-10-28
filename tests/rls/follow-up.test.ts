import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, calgaryToday } from "@/lib/time";
import type { Database } from "@/types/database";

// Proves the follow-up date rules in the database, signed in as two
// throwaway setters. Their leads are named "TEST LEAD (automated)" and
// everything they make is deleted at the end with their accounts.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  throw new Error(
    "RLS tests need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY. See .env.example.",
  );
}

type Client = SupabaseClient<Database>;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin: Client = createClient<Database>(url, serviceKey, noSession);
const stamp = Date.now().toString(36);
const TEST_LEAD = "TEST LEAD (automated)";
const today = calgaryToday();
const tomorrow = addDays(today, 1);
const nextWeek = addDays(today, 7);

type TestUser = { email: string; password: string; id: string; client: Client };
const users: Record<"a" | "b", TestUser> = {
  a: { email: `rls-fu-a-${stamp}@example.com`, password: `Rls-fu-a-${stamp}-pass`, id: "", client: admin },
  b: { email: `rls-fu-b-${stamp}@example.com`, password: `Rls-fu-b-${stamp}-pass`, id: "", client: admin },
};
let lead = "";

beforeAll(async () => {
  for (const key of ["a", "b"] as const) {
    const u = users[key];
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { full_name: `RLS FU ${key.toUpperCase()}` },
      app_metadata: { role: "sales" },
    });
    if (error || !data.user) throw new Error(`could not create ${u.email}: ${error?.message}`);
    u.id = data.user.id;
    u.client = createClient<Database>(url, anonKey, noSession);
    const signIn = await u.client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (signIn.error) throw new Error(`sign in failed for ${u.email}: ${signIn.error.message}`);
  }
  const { data, error } = await users.a.client
    .from("leads")
    .insert({ first_name: TEST_LEAD, address_line: "1 Follow Up Way NW (TEST)", created_by: users.a.id })
    .select("id")
    .single();
  if (error || !data) throw new Error(`could not add the lead: ${error?.message}`);
  lead = data.id;
});

afterAll(async () => {
  for (const u of Object.values(users)) {
    if (!u.id) continue;
    await admin.from("leads").delete().eq("created_by", u.id);
    await admin.auth.admin.deleteUser(u.id);
  }
});

async function statusEvents() {
  const { data } = await admin
    .from("lead_events")
    .select("type, actor_id, from_status, to_status, payload")
    .eq("lead_id", lead)
    .in("type", ["status_change", "edited"])
    .order("created_at");
  return data ?? [];
}

describe("follow-up date", () => {
  it("Follow up needs a date", async () => {
    const { error } = await users.a.client.from("leads").update({ status: "follow_up" }).eq("id", lead);
    expect(error?.code).toBe("23514");
    const { data } = await admin.from("leads").select("status, follow_up_on").eq("id", lead).single();
    expect(data).toEqual({ status: "new", follow_up_on: null });
  });

  it("a setter cannot pick a day before today", async () => {
    const { error } = await users.a.client
      .from("leads")
      .update({ status: "follow_up", follow_up_on: addDays(today, -1) })
      .eq("id", lead);
    expect(error?.code).toBe("22023");
  });

  it("moving to Follow up saves the date and records it in the timeline", async () => {
    const { data, error } = await users.a.client
      .from("leads")
      .update({ status: "follow_up", follow_up_on: tomorrow })
      .eq("id", lead)
      .select("status, follow_up_on");
    expect(error).toBeNull();
    expect(data).toEqual([{ status: "follow_up", follow_up_on: tomorrow }]);
    const events = await statusEvents();
    expect(events).toEqual([
      { type: "status_change", actor_id: users.a.id, from_status: "new", to_status: "follow_up", payload: { follow_up_on: tomorrow } },
    ]);
  });

  it("moving the date alone is an edit that names the field", async () => {
    const { data } = await users.a.client
      .from("leads")
      .update({ follow_up_on: nextWeek })
      .eq("id", lead)
      .select("follow_up_on");
    expect(data).toEqual([{ follow_up_on: nextWeek }]);
    const events = await statusEvents();
    expect(events.at(-1)).toEqual({
      type: "edited",
      actor_id: users.a.id,
      from_status: null,
      to_status: null,
      payload: { fields: ["follow_up_on"] },
    });
  });

  it("another setter cannot move the date", async () => {
    const { data } = await users.b.client.from("leads").update({ follow_up_on: tomorrow }).eq("id", lead).select("id");
    expect(data ?? []).toEqual([]);
    const { data: still } = await admin.from("leads").select("follow_up_on").eq("id", lead).single();
    expect(still?.follow_up_on).toBe(nextWeek);
  });

  it("an overdue date stays put while other details change", async () => {
    // Only the service role can set a past date, as it would be after a few days.
    await admin.from("leads").update({ follow_up_on: addDays(today, -3) }).eq("id", lead);
    const { error } = await users.a.client.from("leads").update({ notes: "TEST note (automated)" }).eq("id", lead);
    expect(error).toBeNull();
    const { data } = await admin.from("leads").select("follow_up_on").eq("id", lead).single();
    expect(data?.follow_up_on).toBe(addDays(today, -3));
  });

  it("leaving Follow up clears the date, and a date cannot sit on a lead in another status", async () => {
    const { data } = await users.a.client
      .from("leads")
      .update({ status: "new" })
      .eq("id", lead)
      .select("status, follow_up_on");
    expect(data).toEqual([{ status: "new", follow_up_on: null }]);
    const stray = await users.a.client
      .from("leads")
      .update({ follow_up_on: tomorrow })
      .eq("id", lead)
      .select("follow_up_on");
    expect(stray.data).toEqual([{ follow_up_on: null }]);
    const events = await statusEvents();
    expect(events.at(-1)).toMatchObject({ type: "status_change", from_status: "follow_up", to_status: "new", payload: null });
  });

  it("a setter can add a lead straight into Follow up, with a date", async () => {
    const { data, error } = await users.a.client
      .from("leads")
      .insert({
        first_name: TEST_LEAD,
        address_line: "2 Follow Up Way NW (TEST)",
        created_by: users.a.id,
        status: "follow_up",
        follow_up_on: today,
      })
      .select("status, follow_up_on")
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({ status: "follow_up", follow_up_on: today });
  });
});
