import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";

// Round 12 (Keenan, 2026-11-11): the meeting carries the lead's real answer
// to "everyone who decides will be there" in meetings.everyone_deciding:
// yes, no or not_asked. Until this round every booking recorded a yes (the
// old everyone_deciding_present column, whose rule forces true, still says
// so and nothing reads it). The database fills the new column from the lead
// at booking and when a meeting is moved, and keeps the meetings that
// haven't started in step when the lead's answer changes. Booking is never
// blocked by it.
//
// Everything books against a throwaway test host, so Keenan's real evenings
// are never touched. A throwaway setter and the host are created here;
// their leads are named "TEST LEAD (automated)" and carry "(TEST)" in the
// address, and everything is removed at the end.

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
const anon: Client = createClient<Database>(url, anonKey, noSession);
const stamp = Date.now().toString(36);
const TEST_LEAD = "TEST LEAD (automated)";

type TestUser = { email: string; password: string; name: string; id: string; client: Client };
const users: Record<"a" | "host", TestUser> = {
  a: { email: `rls-everyone-a-${stamp}@example.com`, password: `Rls-ev-a-${stamp}-pass`, name: "RLS Everyone A", id: "", client: admin },
  host: { email: `rls-everyone-host-${stamp}@example.com`, password: `Rls-ev-h-${stamp}-pass`, name: "RLS Everyone Host", id: "", client: admin },
};

// Open times on the test host, at least a few hours away, handed out once each.
let pool: string[] = [];
const take = () => {
  const slot = pool.shift();
  if (!slot) throw new Error("ran out of test times; widen the booking window or add fewer tests");
  return slot;
};
const street = () => `${Math.floor(Math.random() * 900) + 100} Everyone Street NW (TEST)`;

async function signedIn(email: string, password: string): Promise<Client> {
  const client = createClient<Database>(url!, anonKey!, noSession);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in failed for ${email}: ${error.message}`);
  return client;
}

// A bookable lead with the given answer to "everyone who decides will be there".
async function leadWith(answer: boolean | null): Promise<string> {
  const { data, error } = await users.a.client
    .from("leads")
    .insert({
      first_name: TEST_LEAD,
      address_line: street(),
      created_by: users.a.id,
      phone: "4035550100",
      owns_home: true,
      wants_price: true,
      both_decision_makers: answer,
      not_collected: answer === null ? ["both_decision_makers"] : [],
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`lead: ${error?.message}`);
  return data.id;
}

// Booking still sends the old parameter; the meeting's answer comes from the lead.
function book(lead: string, at: string, everyone: boolean) {
  return users.a.client.rpc("book_meeting", {
    p_lead_id: lead,
    p_starts_at: at,
    p_everyone_deciding_present: everyone,
    p_photos_skipped: "homeowner_said_no",
    p_photos_skip_note: null as unknown as string,
    p_host: users.host.id,
  });
}

async function answerOf(meetingId: string) {
  const { data, error } = await admin.from("meetings").select("everyone_deciding, everyone_deciding_present").eq("id", meetingId).single();
  if (error || !data) throw new Error(`meeting: ${error?.message}`);
  return data;
}

async function removeEverything() {
  const ids = Object.values(users).map((u) => u.id).filter(Boolean);
  if (ids.length === 0) return;
  const { data: leads } = await admin.from("leads").select("id").in("created_by", ids);
  const leadIds = (leads ?? []).map((lead) => lead.id);
  if (leadIds.length > 0) await admin.from("earnings").delete().in("lead_id", leadIds);
  await admin.from("slot_holds").delete().in("holder_id", ids);
  if (users.host.id) {
    await admin.from("slot_holds").delete().eq("host_id", users.host.id);
    await admin.from("meetings").update({ rebooked_as: null }).eq("host_id", users.host.id);
    await admin.from("meetings").delete().eq("host_id", users.host.id);
  }
  if (leadIds.length > 0) {
    await admin.from("meetings").update({ rebooked_as: null }).in("lead_id", leadIds);
    await admin.from("meetings").delete().in("lead_id", leadIds);
  }
  for (const id of ids) {
    await admin.from("leads").delete().eq("created_by", id);
    await admin.from("knock_sessions").delete().eq("user_id", id);
    await admin.auth.admin.deleteUser(id);
  }
}

beforeAll(async () => {
  for (const key of ["a", "host"] as const) {
    const u = users[key];
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { full_name: u.name },
      app_metadata: { role: "sales" },
    });
    if (error || !data.user) throw new Error(`could not create ${u.email}: ${error?.message}`);
    u.id = data.user.id;
    u.client = await signedIn(u.email, u.password);
  }
  const hosting = await admin.from("profiles").update({ hosts_meetings: true }).eq("id", users.host.id);
  if (hosting.error) throw new Error(`host: ${hosting.error.message}`);

  const soon = Date.now() + 3 * 3600_000;
  const { data: board, error } = await users.a.client.rpc("schedule_board", { p_host: users.host.id });
  if (error) throw new Error(`board: ${error.message}`);
  pool = (board ?? [])
    .filter((row) => row.state === "open" && new Date(row.starts_at).getTime() > soon)
    .map((row) => row.starts_at);
  if (pool.length < 5) throw new Error(`only ${pool.length} open test times; the test host needs more evenings`);
});

afterAll(async () => {
  await removeEverything();
});

describe("the meeting carries the real answer to everyone who decides", () => {
  it("records a No as no, whatever the booking sends, and still books", async () => {
    const lead = await leadWith(false);
    const booked = await book(lead, take(), true);
    expect(booked.error).toBeNull();
    expect(await answerOf(booked.data as string)).toEqual({ everyone_deciding: "no", everyone_deciding_present: true });
  });

  it("records a Yes as yes", async () => {
    const lead = await leadWith(true);
    const booked = await book(lead, take(), true);
    expect(booked.error).toBeNull();
    expect(await answerOf(booked.data as string)).toEqual({ everyone_deciding: "yes", everyone_deciding_present: true });
  });

  it("records not asked when the question wasn't asked (book now, finish later), and follows the lead once it is", async () => {
    const lead = await leadWith(null);
    const booked = await book(lead, take(), false);
    expect(booked.error).toBeNull();
    const id = booked.data as string;
    expect((await answerOf(id)).everyone_deciding).toBe("not_asked");

    // Finished on the sidewalk: a No.
    const no = await users.a.client.from("leads").update({ both_decision_makers: false, not_collected: [] }).eq("id", lead);
    expect(no.error).toBeNull();
    expect((await answerOf(id)).everyone_deciding).toBe("no");

    // Corrected to a Yes.
    const yes = await users.a.client.from("leads").update({ both_decision_makers: true }).eq("id", lead);
    expect(yes.error).toBeNull();
    expect((await answerOf(id)).everyone_deciding).toBe("yes");

    // Back to not collected.
    const cleared = await users.a.client.from("leads").update({ both_decision_makers: null, not_collected: ["both_decision_makers"] }).eq("id", lead);
    expect(cleared.error).toBeNull();
    expect((await answerOf(id)).everyone_deciding).toBe("not_asked");
  });

  it("a moved meeting carries the answer too", async () => {
    const lead = await leadWith(false);
    const booked = await book(lead, take(), true);
    expect(booked.error).toBeNull();
    const to = take();
    const held = await users.a.client.rpc("hold_slot", { p_starts_at: to, p_host: users.host.id });
    expect(held.error).toBeNull();
    const moved = await users.a.client.rpc("move_meeting", { p_meeting_id: booked.data as string, p_new_starts_at: to });
    expect(moved.error).toBeNull();
    expect((await answerOf(moved.data as string)).everyone_deciding).toBe("no");
  });

  it("a meeting that has started, or was cancelled, keeps the answer it had", async () => {
    const lead = await leadWith(false);
    // One in the past, written straight in as Keenan's service role would
    // never do in the app: only to see the trigger leave it alone.
    const past = new Date(Date.now() - 2 * 24 * 3600_000);
    const { data: old, error } = await admin
      .from("meetings")
      .insert({
        lead_id: lead,
        host_id: users.host.id,
        setter_id: users.a.id,
        booked_by: users.a.id,
        starts_at: past.toISOString(),
        ends_at: new Date(past.getTime() + 45 * 60_000).toISOString(),
        everyone_deciding_present: true,
        status: "no_show",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect((await answerOf(old!.id)).everyone_deciding).toBe("no");

    // And one to come, cancelled.
    const booked = await book(lead, take(), true);
    expect(booked.error).toBeNull();
    const cancelled = await users.a.client.rpc("cancel_meeting", { p_meeting_id: booked.data as string });
    expect(cancelled.error).toBeNull();

    const yes = await admin.from("leads").update({ both_decision_makers: true }).eq("id", lead);
    expect(yes.error).toBeNull();
    expect((await answerOf(old!.id)).everyone_deciding).toBe("no");
    expect((await answerOf(booked.data as string)).everyone_deciding).toBe("no");
  });

  it("setters can read the answer on a meeting, and nobody can call the helper functions", async () => {
    const lead = await leadWith(false);
    const booked = await book(lead, take(), true);
    expect(booked.error).toBeNull();
    const { data: mine } = await users.a.client.from("meetings").select("everyone_deciding").eq("id", booked.data as string).single();
    expect(mine?.everyone_deciding).toBe("no");

    const client = users.a.client as unknown as SupabaseClient;
    const asSetter = await client.rpc("everyone_deciding_of", { p_lead: lead });
    expect(asSetter.error?.message).toMatch(/permission denied|not find/i);
    const asAnon = await (anon as unknown as SupabaseClient).rpc("everyone_deciding_of", { p_lead: lead });
    expect(asAnon.error?.message).toMatch(/permission denied|not find/i);
  });
});
