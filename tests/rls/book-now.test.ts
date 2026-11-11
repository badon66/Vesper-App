import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";

// Book now, finish later (Keenan, 2026-11-10), in the database itself. A
// booking needs only a time and a name or an address; a No on owns the home
// is the only answer that still rules it out. A missing name is saved as
// "Name to come" with leads.name_to_come, a missing address as "Address to
// come" with leads.address_to_come, and each flag clears itself the moment
// its field changes to anything else.
//
// Everything books against a throwaway test host, so Keenan's real evenings
// are never touched. Two throwaway setters, an account with no profile and
// the host are created here; their leads are named "TEST LEAD (automated)"
// or carry "(TEST)" in the address, and everything is removed at the end.
// The service role stands in for Keenan where only he may look (the
// timeline, booking_problems), because the tests never sign in as him.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  throw new Error(
    "RLS tests need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY. See .env.example.",
  );
}

type Client = SupabaseClient<Database>;
type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin: Client = createClient<Database>(url, serviceKey, noSession);
const anon: Client = createClient<Database>(url, anonKey, noSession);
const stamp = Date.now().toString(36);
const TEST_LEAD = "TEST LEAD (automated)";
const NAME_TO_COME = "Name to come";
const ADDRESS_TO_COME = "Address to come";
const FLAGS = "first_name, address_line, name_to_come, address_to_come";

type TestUser = { email: string; password: string; name: string; id: string; client: Client };
const users: Record<"a" | "b" | "host" | "nobody", TestUser> = {
  a: { email: `rls-booknow-a-${stamp}@example.com`, password: `Rls-bn-a-${stamp}-pass`, name: "RLS Book Now A", id: "", client: admin },
  b: { email: `rls-booknow-b-${stamp}@example.com`, password: `Rls-bn-b-${stamp}-pass`, name: "RLS Book Now B", id: "", client: admin },
  host: { email: `rls-booknow-host-${stamp}@example.com`, password: `Rls-bn-h-${stamp}-pass`, name: "RLS Book Now Host", id: "", client: admin },
  nobody: { email: `rls-booknow-none-${stamp}@example.com`, password: `Rls-bn-n-${stamp}-pass`, name: "RLS Book Now Nobody", id: "", client: admin },
};

// Open times on the test host, at least a few hours away, handed out once each.
let pool: string[] = [];
const take = () => {
  const slot = pool.shift();
  if (!slot) throw new Error("ran out of test times; widen the booking window or add fewer tests");
  return slot;
};

const hintOf = (error: PostgrestError | null) => error?.hint ?? null;
const street = () => `${Math.floor(Math.random() * 900) + 100} Book Now Street NW (TEST)`;

async function signedIn(email: string, password: string): Promise<Client> {
  const client = createClient<Database>(url!, anonKey!, noSession);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in failed for ${email}: ${error.message}`);
  return client;
}

// A lead with nothing answered, only what `fields` gives.
async function bareLead(user: TestUser, fields: Partial<LeadInsert>): Promise<string> {
  const { data, error } = await user.client
    .from("leads")
    .insert({ first_name: TEST_LEAD, address_line: street(), created_by: user.id, ...fields })
    .select("id")
    .single();
  if (error || !data) throw new Error(`lead: ${error?.message}`);
  return data.id;
}

type BookArgs = { lead: string; at: string; everyone?: boolean; skip?: string | null; note?: string | null };
function book(user: TestUser, args: BookArgs) {
  return user.client.rpc("book_meeting", {
    p_lead_id: args.lead,
    p_starts_at: args.at,
    p_everyone_deciding_present: args.everyone ?? false,
    p_photos_skipped: (args.skip ?? null) as string,
    p_photos_skip_note: (args.note ?? null) as string,
    p_host: users.host.id,
  });
}

function problems(lead: string, skip: string | null = null, note: string | null = null) {
  return admin.rpc("booking_problems", {
    p_lead_id: lead,
    p_everyone_deciding_present: false,
    p_photos_skipped: skip as string,
    p_photos_skip_note: note as string,
  });
}

async function flagsOf(lead: string) {
  const { data, error } = await admin.from("leads").select(FLAGS).eq("id", lead).single();
  if (error || !data) throw new Error(`flags: ${error?.message}`);
  return data;
}

async function board(user: TestUser) {
  const { data, error } = await user.client.rpc("schedule_board", { p_host: users.host.id });
  if (error) throw new Error(`board: ${error.message}`);
  return data ?? [];
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
  for (const key of ["a", "b", "host", "nobody"] as const) {
    const u = users[key];
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { full_name: u.name },
      app_metadata: key === "nobody" ? {} : { role: "sales" },
    });
    if (error || !data.user) throw new Error(`could not create ${u.email}: ${error?.message}`);
    u.id = data.user.id;
    u.client = await signedIn(u.email, u.password);
  }
  const hosting = await admin.from("profiles").update({ hosts_meetings: true }).eq("id", users.host.id);
  if (hosting.error) throw new Error(`host: ${hosting.error.message}`);

  // Every open time on the test host at least three hours away.
  const soon = Date.now() + 3 * 3600_000;
  pool = (await board(users.a))
    .filter((row) => row.state === "open" && new Date(row.starts_at).getTime() > soon)
    .map((row) => row.starts_at);
  if (pool.length < 4) throw new Error(`only ${pool.length} open test times; the test host needs more evenings`);
});

afterAll(async () => {
  await removeEverything();
});

describe("booking with only a name or an address", () => {
  it("books with only a name: the address waits as Address to come, with no map position and nothing answered", async () => {
    const lead = await bareLead(users.a, { address_line: ADDRESS_TO_COME, address_to_come: true });
    expect(await flagsOf(lead)).toEqual({
      first_name: TEST_LEAD,
      address_line: ADDRESS_TO_COME,
      name_to_come: false,
      address_to_come: true,
    });
    const booked = await book(users.a, { lead, at: take(), everyone: false, skip: null });
    expect(booked.error).toBeNull();
    const { data: meeting } = await admin
      .from("meetings")
      .select("status, everyone_deciding_present, everyone_deciding, photos_skipped, photos_skip_note, setter_id, booked_by")
      .eq("id", booked.data as string)
      .single();
    // The old everyone_deciding_present column still says true (its rule
    // can't be dropped additively; nothing reads it); since round 12 the
    // meeting carries the lead's real answer in everyone_deciding, here
    // not asked yet.
    expect(meeting).toEqual({
      status: "booked",
      everyone_deciding_present: true,
      everyone_deciding: "not_asked",
      photos_skipped: null,
      photos_skip_note: null,
      setter_id: users.a.id,
      booked_by: users.a.id,
    });
    const { data: after } = await admin
      .from("leads")
      .select("status, address_to_come, lat, lng, phone_saved, owns_home, both_decision_makers")
      .eq("id", lead)
      .single();
    expect(after).toEqual({
      status: "meeting_booked",
      address_to_come: true,
      lat: null,
      lng: null,
      phone_saved: false,
      owns_home: null,
      both_decision_makers: null,
    });
  });

  it("books with only an address: the name waits as Name to come, and Not collected answers wait too", async () => {
    const lead = await bareLead(users.a, {
      first_name: NAME_TO_COME,
      name_to_come: true,
      not_collected: ["phone", "owns_home", "wants_price", "both_decision_makers"],
    });
    const booked = await book(users.a, { lead, at: take() });
    expect(booked.error).toBeNull();
    const { data: after } = await admin
      .from("leads")
      .select("status, first_name, name_to_come, address_to_come, not_collected")
      .eq("id", lead)
      .single();
    expect(after).toEqual({
      status: "meeting_booked",
      first_name: NAME_TO_COME,
      name_to_come: true,
      address_to_come: false,
      not_collected: ["both_decision_makers", "owns_home", "phone", "wants_price"],
    });
  });

  it("refuses a No on owns the home, by name, and books nothing; Not collected or no answer there passes", async () => {
    const lead = await bareLead(users.a, { owns_home: false });
    const at = take();
    const refused = await book(users.a, { lead, at });
    expect(hintOf(refused.error)).toBe("not_ready");
    expect(refused.error?.details).toBe("owns_home");
    const { data: meetings } = await admin.from("meetings").select("id").eq("lead_id", lead);
    expect(meetings ?? []).toEqual([]);
    const { data: still } = await admin.from("leads").select("status").eq("id", lead).single();
    expect(still?.status).toBe("new");

    // No answer yet, or Not collected, is finished later.
    expect((await problems(lead)).data).toEqual(["owns_home"]);
    await admin.from("leads").update({ owns_home: null, not_collected: ["owns_home"] }).eq("id", lead);
    expect((await problems(lead)).data).toEqual([]);
    await admin.from("leads").update({ not_collected: [] }).eq("id", lead);
    expect((await problems(lead)).data).toEqual([]);
    // The time it was refused stays free for the next booking.
    expect((await book(users.a, { lead, at })).error).toBeNull();
  });

  it("treats a No on wants a price or on everyone who decides as an answer, not a reason to refuse", async () => {
    const lead = await bareLead(users.a, { owns_home: true, wants_price: false, both_decision_makers: false });
    expect((await problems(lead)).data).toEqual([]);
  });

  it("still asks for the note when the photos were skipped for Other, because the booking can't store Other without it", async () => {
    const lead = await bareLead(users.a, {});
    expect((await problems(lead, "other", " ")).data).toEqual(["photos_skip_note"]);
    expect((await problems(lead, "other", "Dog in the yard")).data).toEqual([]);
    expect((await problems(lead, "homeowner_said_no")).data).toEqual([]);
    expect((await problems(lead, null)).data).toEqual([]);
  });

  it("answers no_lead for a lead that doesn't exist", async () => {
    expect((await problems(crypto.randomUUID())).data).toEqual(["no_lead"]);
  });
});

describe("the to-come flags", () => {
  it("clear themselves the moment the name or the address changes to anything else, and only then", async () => {
    const lead = await bareLead(users.a, {
      first_name: NAME_TO_COME,
      name_to_come: true,
      address_line: ADDRESS_TO_COME,
      address_to_come: true,
    });
    expect(await flagsOf(lead)).toMatchObject({ name_to_come: true, address_to_come: true });

    // Another field changing leaves both alone.
    const other = await users.a.client.from("leads").update({ phone: "+14035550144" }).eq("id", lead).select("id");
    expect(other.data).toHaveLength(1);
    expect(await flagsOf(lead)).toMatchObject({ name_to_come: true, address_to_come: true });

    // A save that sends the placeholder again, as a retry does, keeps them.
    await users.a.client
      .from("leads")
      .update({ first_name: NAME_TO_COME, name_to_come: true, address_line: ADDRESS_TO_COME, address_to_come: true })
      .eq("id", lead);
    expect(await flagsOf(lead)).toMatchObject({ name_to_come: true, address_to_come: true });

    // The name filled in: its flag clears, the address's stays.
    await users.a.client.from("leads").update({ first_name: "Jordan (TEST)" }).eq("id", lead);
    expect(await flagsOf(lead)).toEqual({
      first_name: "Jordan (TEST)",
      address_line: ADDRESS_TO_COME,
      name_to_come: false,
      address_to_come: true,
    });

    // The address filled in, without touching the flag: it clears too.
    const filled = street();
    await users.a.client.from("leads").update({ address_line: filled, lat: 51.05, lng: -114.07 }).eq("id", lead);
    expect(await flagsOf(lead)).toEqual({
      first_name: "Jordan (TEST)",
      address_line: filled,
      name_to_come: false,
      address_to_come: false,
    });

    // A flag can't be turned on beside a real name or address.
    await users.a.client.from("leads").update({ name_to_come: true, address_to_come: true }).eq("id", lead);
    expect(await flagsOf(lead)).toMatchObject({ name_to_come: false, address_to_come: false });
    const real = await bareLead(users.a, { name_to_come: true, address_to_come: true });
    expect(await flagsOf(real)).toMatchObject({ name_to_come: false, address_to_come: false });
  });

  it("aren't listed on the timeline: the name and the address are", async () => {
    const lead = await bareLead(users.a, { first_name: NAME_TO_COME, name_to_come: true });
    await users.a.client.from("leads").update({ first_name: "Robin (TEST)" }).eq("id", lead);
    expect((await flagsOf(lead)).name_to_come).toBe(false);
    const { data: events } = await admin.from("lead_events").select("payload").eq("lead_id", lead).eq("type", "edited");
    const fields = (events ?? []).flatMap((event) => (event.payload as { fields?: string[] } | null)?.fields ?? []);
    expect(fields).toContain("first_name");
    expect(fields).not.toContain("name_to_come");
    expect(fields).not.toContain("address_to_come");
  });

  it("are read by every setter; only the lead's own setter sets them; no one else reads them", async () => {
    const lead = await bareLead(users.a, {
      first_name: NAME_TO_COME,
      name_to_come: true,
      address_line: ADDRESS_TO_COME,
      address_to_come: true,
    });

    // Setters work as a team: B reads A's flags, column by column.
    const seen = await users.b.client.from("leads").select("id, name_to_come, address_to_come").eq("id", lead).single();
    expect(seen.error).toBeNull();
    expect(seen.data).toEqual({ id: lead, name_to_come: true, address_to_come: true });

    // B can't change A's lead, flags or name.
    const flagChange = await users.b.client
      .from("leads")
      .update({ name_to_come: false, address_to_come: false })
      .eq("id", lead)
      .select("id");
    expect(flagChange.data ?? []).toEqual([]);
    const nameChange = await users.b.client.from("leads").update({ first_name: "Not theirs (TEST)" }).eq("id", lead).select("id");
    expect(nameChange.data ?? []).toEqual([]);
    expect(await flagsOf(lead)).toEqual({
      first_name: NAME_TO_COME,
      address_line: ADDRESS_TO_COME,
      name_to_come: true,
      address_to_come: true,
    });

    // A, the lead's setter, can.
    const own = await users.a.client.from("leads").update({ name_to_come: false }).eq("id", lead).select("name_to_come").single();
    expect(own.data).toEqual({ name_to_come: false });

    // An account with no profile and a signed-out visitor read nothing.
    for (const client of [users.nobody.client, anon]) {
      const { data } = await client.from("leads").select("id, name_to_come, address_to_come").eq("id", lead);
      expect(data ?? []).toEqual([]);
    }
  });
});
