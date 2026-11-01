import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";

// Proves M3 in the database itself (Keenan, 2026-11-01). No double booking
// is a hard rule: a time is claimed the moment someone starts booking it,
// two people can never take the same time, and the race tests below run
// many times per run, not once.
//
// Everything books against a throwaway test host, so these races never
// touch Keenan's real evenings. Two throwaway setters, an account with no
// profile and the host are created here; their leads are named "TEST LEAD
// (automated)". Everything they make is removed at the end. The service
// role stands in for Keenan where only he may act (outcomes, pay, blocks),
// because the tests never sign in as him.

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
const BUCKET = "lead-photos";
const RACE_ROUNDS = 25;

type TestUser = { email: string; password: string; name: string; id: string; client: Client };
const users: Record<"a" | "b" | "host" | "nobody", TestUser> = {
  a: { email: `rls-m3-a-${stamp}@example.com`, password: `Rls-m3-a-${stamp}-pass`, name: "RLS Booker A", id: "", client: admin },
  b: { email: `rls-m3-b-${stamp}@example.com`, password: `Rls-m3-b-${stamp}-pass`, name: "RLS Booker B", id: "", client: admin },
  host: { email: `rls-m3-host-${stamp}@example.com`, password: `Rls-m3-h-${stamp}-pass`, name: "RLS Test Host", id: "", client: admin },
  nobody: { email: `rls-m3-none-${stamp}@example.com`, password: `Rls-m3-n-${stamp}-pass`, name: "RLS Nobody", id: "", client: admin },
};

type Settings = {
  meeting_days: number[];
  meeting_start: string;
  meeting_slot_minutes: number;
  meeting_slot_count: number;
  booking_cutoff_minutes: number;
  hold_grace_minutes: number;
  booking_window_days: number;
  booking_pay: number;
};
let settings: Settings;
let ownerId = "";
let jpeg: Buffer;
// Open times on the test host, at least a few hours away, handed out once each.
let pool: string[] = [];
const take = () => {
  const slot = pool.shift();
  if (!slot) throw new Error("ran out of test times; widen the booking window or add fewer tests");
  return slot;
};

async function signedIn(email: string, password: string): Promise<Client> {
  const client = createClient<Database>(url!, anonKey!, noSession);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in failed for ${email}: ${error.message}`);
  return client;
}

// A lead that passes Before you book except for what `extra` changes.
async function readyLead(user: TestUser, extra: Partial<LeadInsert> = {}): Promise<string> {
  const { data, error } = await user.client
    .from("leads")
    .insert({
      first_name: TEST_LEAD,
      address_line: `${Math.floor(Math.random() * 900) + 100} Test Street NW`,
      neighbourhood: "TEST (automated)",
      created_by: user.id,
      phone: "+14035550142",
      owns_home: true,
      wants_price: true,
      soffit_colour: "white",
      lat: 51.17,
      lng: -114.1,
      ...extra,
    })
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
    p_everyone_deciding_present: args.everyone ?? true,
    p_photos_skipped: (args.skip === undefined ? "homeowner_said_no" : args.skip) as string,
    p_photos_skip_note: (args.note ?? null) as string,
    p_host: users.host.id,
  });
}

function hold(user: TestUser, at: string) {
  return user.client.rpc("hold_slot", { p_starts_at: at, p_host: users.host.id });
}

const hintOf = (error: PostgrestError | null) => error?.hint ?? null;

// Calgary's date the way the app works it out: UTC-6 for good since
// Alberta stopped changing clocks on 2026-11-01 (see lib/time.ts).
function calgaryTomorrow(): string {
  const now = new Date();
  const zone = now.getTime() >= Date.UTC(2026, 10, 1, 8) ? "Etc/GMT+6" : "America/Edmonton";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(now);
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

async function board(user: TestUser) {
  const { data, error } = await user.client.rpc("schedule_board", { p_host: users.host.id });
  if (error) throw new Error(`board: ${error.message}`);
  return data ?? [];
}

async function slotState(user: TestUser, at: string) {
  const rows = await board(user);
  return rows.find((row) => new Date(row.starts_at).getTime() === new Date(at).getTime());
}

async function activeHolds(holder: string) {
  const { data } = await admin
    .from("slot_holds")
    .select("id, starts_at, release_reason")
    .eq("holder_id", holder)
    .is("released_at", null);
  return data ?? [];
}

// Moves a booked meeting into the past, as time passing would. Only the
// service role can, and only on test data.
async function backdate(meetingId: string) {
  const startsAt = new Date(Date.now() - 2 * 3600_000);
  const endsAt = new Date(startsAt.getTime() + settings.meeting_slot_minutes * 60_000);
  const { error } = await admin
    .from("meetings")
    .update({ starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString() })
    .eq("id", meetingId);
  if (error) throw new Error(`backdate: ${error.message}`);
}

async function uploadSlotPhotos(user: TestUser, leadId: string, slots: Array<"front" | "left_corner" | "right_corner">) {
  for (const slot of slots) {
    const path = `${user.id}/${crypto.randomUUID()}.jpg`;
    const up = await user.client.storage.from(BUCKET).upload(path, jpeg, { contentType: "image/jpeg" });
    if (up.error) throw new Error(`upload: ${up.error.message}`);
    const row = await user.client.from("lead_photos").insert({ lead_id: leadId, storage_path: path, slot });
    if (row.error) throw new Error(`photo: ${row.error.message}`);
  }
}

async function removeEverything() {
  const ids = Object.values(users).map((u) => u.id).filter(Boolean);
  if (ids.length === 0) return;
  const { data: leads } = await admin.from("leads").select("id").in("created_by", ids);
  const leadIds = (leads ?? []).map((lead) => lead.id);
  if (leadIds.length > 0) await admin.from("earnings").delete().in("lead_id", leadIds);
  await admin.from("earnings").delete().in("profile_id", ids);
  await admin.from("slot_holds").delete().in("holder_id", ids);
  if (users.host.id) {
    await admin.from("slot_holds").delete().eq("host_id", users.host.id);
    await admin.from("time_blocks").delete().eq("host_id", users.host.id);
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
    const { data: files } = await admin.storage.from(BUCKET).list(id, { limit: 1000 });
    if (files && files.length > 0) {
      await admin.storage.from(BUCKET).remove(files.map((file) => `${id}/${file.name}`));
    }
    await admin.auth.admin.deleteUser(id);
  }
}

beforeAll(async () => {
  jpeg = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#132e3f" } }).jpeg().toBuffer();
  const { data: s, error: settingsError } = await admin
    .from("settings")
    .select("meeting_days, meeting_start, meeting_slot_minutes, meeting_slot_count, booking_cutoff_minutes, hold_grace_minutes, booking_window_days, booking_pay")
    .eq("id", 1)
    .single();
  if (settingsError || !s) throw new Error(`settings: ${settingsError?.message}`);
  settings = s;
  const { data: owner } = await admin.from("profiles").select("id").eq("role", "owner").single();
  ownerId = owner!.id;

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
  if (pool.length < 20) throw new Error(`only ${pool.length} open test times; the test host needs more evenings`);
});

afterAll(async () => {
  await removeEverything();
});

describe("meeting times", () => {
  // Keenan's real template is read, not assumed, so the expected times
  // follow his settings. Offsets: Calgary was UTC-6 in summer and UTC-7 in
  // winter until Alberta stopped changing clocks on November 1, 2026 at
  // 2 am; it has been UTC-6 all year since (time zone data 2026c).
  const expectedStarts = (day: string, offsetHours: number) => {
    const [h, m] = settings.meeting_start.split(":").map(Number);
    const [y, mo, d] = day.split("-").map(Number);
    const weekday = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
    if (!settings.meeting_days.includes(weekday)) return [];
    return Array.from({ length: settings.meeting_slot_count }, (_, k) =>
      new Date(Date.UTC(y, mo - 1, d, h + offsetHours, m + k * settings.meeting_slot_minutes)).toISOString(),
    );
  };
  const startsOn = async (day: string) => {
    const { data, error } = await users.a.client.rpc("slot_starts_on", { p_day: day });
    expect(error).toBeNull();
    return ((data ?? []) as string[]).map((value) => new Date(value).toISOString());
  };

  it("follows the template in Calgary time across November 1, 2026, when the clocks stopped changing", async () => {
    expect(await startsOn("2026-10-31")).toEqual(expectedStarts("2026-10-31", 6));
    expect(await startsOn("2026-11-01")).toEqual(expectedStarts("2026-11-01", 6));
    expect(await startsOn("2026-11-02")).toEqual(expectedStarts("2026-11-02", 6));
    expect(await startsOn("2026-12-15")).toEqual(expectedStarts("2026-12-15", 6));
    expect(await startsOn("2027-03-15")).toEqual(expectedStarts("2027-03-15", 6));
  });

  it("follows the old rules before then, on both sides of the March 2026 change", async () => {
    expect(await startsOn("2026-03-07")).toEqual(expectedStarts("2026-03-07", 7));
    expect(await startsOn("2026-03-08")).toEqual(expectedStarts("2026-03-08", 6));
    expect(await startsOn("2026-03-09")).toEqual(expectedStarts("2026-03-09", 6));
  });

  it("closes a time for setters at the cutoff and for the owner at the start, and stops at the window", async () => {
    const now = new Date("2026-11-03T20:00:00Z");
    const at = (minutes: number) => new Date(now.getTime() + minutes * 60_000).toISOString();
    const problem = async (startsAt: string, owner: boolean) => {
      const { data, error } = await users.a.client.rpc("slot_time_problem", {
        p_starts_at: startsAt,
        p_now: now.toISOString(),
        p_owner: owner,
      });
      expect(error).toBeNull();
      return data;
    };
    const cutoff = settings.booking_cutoff_minutes;
    expect(await problem(at(cutoff - 1), false)).toBe("closed");
    expect(await problem(at(cutoff + 1), false)).toBeNull();
    expect(await problem(at(1), true)).toBeNull();
    expect(await problem(at(0), true)).toBe("closed");
    expect(await problem(at(-60), true)).toBe("closed");
    const lastDay = at((settings.booking_window_days * 24 + 2) * 60);
    expect(await problem(lastDay, false)).toBeNull();
    expect(await problem(at((settings.booking_window_days + 2) * 24 * 60), false)).toBe("too_far");
  });
});

describe("holds: no double booking", () => {
  it(`two setters grabbing the same time at the same instant: exactly one gets it, ${RACE_ROUNDS} times over`, async () => {
    const at = take();
    for (let round = 0; round < RACE_ROUNDS; round += 1) {
      const [first, second] = await Promise.all([hold(users.a, at), hold(users.b, at)]);
      const winners = [first, second].filter((result) => !result.error);
      const losers = [first, second].filter((result) => result.error);
      expect(winners, `round ${round}`).toHaveLength(1);
      expect(hintOf(losers[0].error), `round ${round}`).toBe("slot_held");
      const { data: rows } = await admin
        .from("slot_holds")
        .select("id")
        .eq("host_id", users.host.id)
        .eq("starts_at", at)
        .is("released_at", null);
      expect(rows, `round ${round}`).toHaveLength(1);
      const winner = first.error ? users.b : users.a;
      await winner.client.rpc("release_hold");
    }
  });

  it(`two setters booking the same time at the same instant: exactly one books it, ${RACE_ROUNDS} times over`, async () => {
    const at = take();
    const leadA = await readyLead(users.a);
    const leadB = await readyLead(users.b);
    for (let round = 0; round < RACE_ROUNDS; round += 1) {
      const [first, second] = await Promise.all([book(users.a, { lead: leadA, at }), book(users.b, { lead: leadB, at })]);
      const winners = [first, second].filter((result) => !result.error);
      const losers = [first, second].filter((result) => result.error);
      expect(winners, `round ${round}`).toHaveLength(1);
      expect(["slot_taken", "slot_held"], `round ${round}`).toContain(hintOf(losers[0].error));
      const { data: live } = await admin
        .from("meetings")
        .select("id")
        .eq("host_id", users.host.id)
        .eq("starts_at", at)
        .in("status", ["booked", "confirmed", "qualified", "not_qualified"]);
      expect(live, `round ${round}`).toHaveLength(1);
      const winner = first.error ? users.b : users.a;
      const cancelled = await winner.client.rpc("cancel_meeting", { p_meeting_id: winners[0].data as string });
      expect(cancelled.error, `round ${round}`).toBeNull();
    }
  });

  it("a hold and a booking racing for the same time never both win", async () => {
    const lead = await readyLead(users.b);
    for (let round = 0; round < 10; round += 1) {
      const at = round % 2 === 0 ? pool[0] : pool[1];
      const [held, booked] = await Promise.all([hold(users.a, at), book(users.b, { lead, at })]);
      expect(Boolean(held.error) !== Boolean(booked.error), `round ${round}`).toBe(true);
      if (!booked.error) {
        await users.b.client.rpc("cancel_meeting", { p_meeting_id: booked.data as string });
      } else {
        await users.a.client.rpc("release_hold");
      }
    }
  });

  it("grabbing a time someone else holds is refused with their name", async () => {
    const at = take();
    expect((await hold(users.a, at)).error).toBeNull();
    const refused = await hold(users.b, at);
    expect(hintOf(refused.error)).toBe("slot_held");
    expect(refused.error?.message).toBe(`${users.a.name} is booking this time`);
    const seen = await slotState(users.b, at);
    expect(seen).toMatchObject({ state: "held", holder_name: users.a.name, held_by_viewer: false });
    expect((await slotState(users.a, at))?.held_by_viewer).toBe(true);
    await users.a.client.rpc("release_hold");
    expect((await slotState(users.b, at))?.state).toBe("open");
  });

  it("booking a time someone else holds is refused; the holder books it", async () => {
    const at = take();
    const leadA = await readyLead(users.a);
    const leadB = await readyLead(users.b);
    expect((await hold(users.a, at)).error).toBeNull();
    const refused = await book(users.b, { lead: leadB, at });
    expect(hintOf(refused.error)).toBe("slot_held");
    const booked = await book(users.a, { lead: leadA, at });
    expect(booked.error).toBeNull();
    expect(await activeHolds(users.a.id)).toHaveLength(0);
    const { data: released } = await admin
      .from("slot_holds")
      .select("release_reason")
      .eq("holder_id", users.a.id)
      .eq("starts_at", at)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(released?.release_reason).toBe("booked");
    const seen = await slotState(users.b, at);
    expect(seen).toMatchObject({ state: "booked", neighbourhood: "TEST (automated)", setter_name: users.a.name });
  });

  it("a hold lets go after the grace period, and someone else can then take the time", async () => {
    const at = take();
    expect((await hold(users.a, at)).error).toBeNull();
    const quietFor = `${settings.hold_grace_minutes + 1} minutes`;
    const lapsed = await admin
      .from("slot_holds")
      .update({ renewed_at: new Date(Date.now() - (settings.hold_grace_minutes + 1) * 60_000).toISOString() })
      .eq("holder_id", users.a.id)
      .is("released_at", null);
    expect(lapsed.error, quietFor).toBeNull();
    expect((await slotState(users.b, at))?.state).toBe("open");
    expect((await hold(users.b, at)).error).toBeNull();
    const { data: old } = await admin
      .from("slot_holds")
      .select("release_reason")
      .eq("holder_id", users.a.id)
      .eq("starts_at", at)
      .single();
    expect(old?.release_reason).toBe("lapsed");
    const renewed = await users.a.client.rpc("renew_hold");
    expect(renewed.data).toMatchObject({ status: "none" });
    await users.b.client.rpc("release_hold");
  });

  it("a hold that went quiet comes back to its holder if nobody else took the time", async () => {
    const at = take();
    expect((await hold(users.a, at)).error).toBeNull();
    await admin
      .from("slot_holds")
      .update({ renewed_at: new Date(Date.now() - (settings.hold_grace_minutes + 1) * 60_000).toISOString() })
      .eq("holder_id", users.a.id)
      .is("released_at", null);
    const renewed = await users.a.client.rpc("renew_hold");
    expect(renewed.data).toMatchObject({ status: "held", retaken: true });
    expect((await slotState(users.b, at))?.state).toBe("held");
    const kept = await users.a.client.rpc("renew_hold");
    expect(kept.data).toMatchObject({ status: "held" });
    await users.a.client.rpc("release_hold");
  });

  it("one hold per person: a second time lets the first go, even when both are tapped at once", async () => {
    const first = take();
    const second = take();
    expect((await hold(users.a, first)).error).toBeNull();
    expect((await hold(users.a, second)).error).toBeNull();
    const holds = await activeHolds(users.a.id);
    expect(holds.map((row) => new Date(row.starts_at).getTime())).toEqual([new Date(second).getTime()]);
    expect((await slotState(users.b, first))?.state).toBe("open");
    await users.a.client.rpc("release_hold");
    for (let round = 0; round < 10; round += 1) {
      await Promise.all([hold(users.a, first), hold(users.a, second)]);
      expect(await activeHolds(users.a.id), `round ${round}`).toHaveLength(1);
      await users.a.client.rpc("release_hold");
    }
  });

  it("nobody writes holds, meetings or earnings directly, not even their own", async () => {
    const at = take();
    const lead = await readyLead(users.a);
    const holdRow = await users.a.client
      .from("slot_holds")
      .insert({ host_id: users.host.id, starts_at: at, holder_id: users.a.id });
    expect(holdRow.error?.code).toBe("42501");
    const meetingRow = await users.a.client.from("meetings").insert({
      lead_id: lead,
      host_id: users.host.id,
      setter_id: users.a.id,
      booked_by: users.a.id,
      starts_at: at,
      ends_at: new Date(new Date(at).getTime() + settings.meeting_slot_minutes * 60_000).toISOString(),
      everyone_deciding_present: true,
    });
    expect(meetingRow.error?.code).toBe("42501");
    const earningRow = await users.a.client
      .from("earnings")
      .insert({ profile_id: users.a.id, lead_id: lead, type: "booking", rate: 20, amount: 20 });
    expect(earningRow.error?.code).toBe("42501");
    const booked = await book(users.a, { lead, at });
    expect(booked.error).toBeNull();
    const change = await users.a.client
      .from("meetings")
      .update({ starts_at: take() })
      .eq("id", booked.data as string)
      .select("id");
    expect(change.data ?? []).toEqual([]);
  });

  it("an account with no profile and a signed-out visitor see no holds, meetings or board", async () => {
    for (const client of [users.nobody.client, anon]) {
      expect((await client.from("slot_holds").select("id")).data ?? []).toEqual([]);
      expect((await client.from("meetings").select("id")).data ?? []).toEqual([]);
      const boardRows = await client.rpc("schedule_board", { p_host: users.host.id });
      expect(boardRows.data ?? []).toEqual([]);
    }
    expect(hintOf((await hold(users.nobody, take())).error)).toBe("not_allowed");
  });
});

describe("Before you book", () => {
  it("refuses each missing item, by name", async () => {
    const at = take();
    const lead = await readyLead(users.a, { phone: null, owns_home: false, wants_price: null, soffit_colour: null, lat: null, lng: null });
    const attempt = await book(users.a, { lead, at, everyone: false, skip: null });
    expect(hintOf(attempt.error)).toBe("not_ready");
    expect((attempt.error?.details ?? "").split(",").sort()).toEqual(
      ["everyone_deciding_present", "map_position", "owns_home", "phone", "photos", "soffit_colour", "wants_price"].sort(),
    );
    const other = await book(users.a, { lead, at, skip: "other", note: " " });
    expect((other.error?.details ?? "").split(",")).toContain("photos_skip_note");
    await users.a.client
      .from("leads")
      .update({ phone: "+14035550143", owns_home: true, wants_price: true, soffit_colour: "not_sure", lat: 51.05, lng: -114.07 })
      .eq("id", lead);
    const ok = await book(users.a, { lead, at, skip: "other", note: "Homeowner was in a hurry" });
    expect(ok.error).toBeNull();
    const { data: meeting } = await admin
      .from("meetings")
      .select("photos_skipped, photos_skip_note, everyone_deciding_present, setter_id, booked_by")
      .eq("id", ok.data as string)
      .single();
    expect(meeting).toEqual({
      photos_skipped: "other",
      photos_skip_note: "Homeowner was in a hurry",
      everyone_deciding_present: true,
      setter_id: users.a.id,
      booked_by: users.a.id,
    });
  });

  it("needs no skip reason when the three guided photos exist, and stores none", async () => {
    const lead = await readyLead(users.a);
    await uploadSlotPhotos(users.a, lead, ["front", "left_corner"]);
    expect(hintOf((await book(users.a, { lead, at: pool[0], skip: null })).error)).toBe("not_ready");
    await uploadSlotPhotos(users.a, lead, ["right_corner"]);
    const ok = await book(users.a, { lead, at: take(), skip: "homeowner_said_no" });
    expect(ok.error).toBeNull();
    const { data } = await admin.from("meetings").select("photos_skipped").eq("id", ok.data as string).single();
    expect(data?.photos_skipped).toBeNull();
  });

  it("books only the setter's own New or Follow up lead, once, into a real time inside the window", async () => {
    const leadA = await readyLead(users.a);
    expect(hintOf((await book(users.b, { lead: leadA, at: pool[0] })).error)).toBe("not_your_lead");
    const lostLead = await readyLead(users.a, { status: "lost", lost_reason: "price" });
    expect(hintOf((await book(users.a, { lead: lostLead, at: pool[0] })).error)).toBe("wrong_status");

    const notATime = new Date(new Date(pool[0]).getTime() + 10 * 60_000).toISOString();
    expect(hintOf((await book(users.a, { lead: leadA, at: notATime })).error)).toBe("not_a_slot");

    const { data: past } = await users.a.client.rpc("slot_starts_on", {
      p_day: new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10),
    });
    const lastWeek = ((past ?? []) as string[])[0];
    if (lastWeek) expect(hintOf((await book(users.a, { lead: leadA, at: lastWeek })).error)).toBe("slot_closed");

    for (let extra = 1; extra <= 7; extra += 1) {
      const day = new Date(Date.now() + (settings.booking_window_days + extra) * 86400_000).toISOString().slice(0, 10);
      const { data: far } = await users.a.client.rpc("slot_starts_on", { p_day: day });
      const tooFar = ((far ?? []) as string[])[0];
      if (tooFar) {
        expect(hintOf((await book(users.a, { lead: leadA, at: tooFar })).error)).toBe("too_far");
        break;
      }
    }

    const at = take();
    const ok = await book(users.a, { lead: leadA, at });
    expect(ok.error).toBeNull();
    expect(hintOf((await book(users.a, { lead: leadA, at: take() })).error)).toBe("wrong_status");
    const { data: lead } = await admin.from("leads").select("status").eq("id", leadA).single();
    expect(lead?.status).toBe("meeting_booked");
    const { data: events } = await admin
      .from("lead_events")
      .select("type, payload, actor_id")
      .eq("lead_id", leadA)
      .in("type", ["meeting_booked", "status_change"]);
    const bookedEvent = events?.find((event) => event.type === "meeting_booked");
    expect(bookedEvent?.actor_id).toBe(users.a.id);
    expect(Object.keys((bookedEvent?.payload ?? {}) as object).sort()).toEqual(["meeting_id", "starts_at"]);
    expect(events?.some((event) => event.type === "status_change")).toBe(true);
  });

  it("a setter still cannot set Meeting booked by hand, or leave it while a meeting is booked", async () => {
    const lead = await readyLead(users.a);
    const direct = await users.a.client.from("leads").update({ status: "meeting_booked" }).eq("id", lead);
    expect(direct.error?.code).toBe("42501");
    expect((await book(users.a, { lead, at: take() })).error).toBeNull();
    const away = await users.a.client
      .from("leads")
      .update({ status: "follow_up", follow_up_on: new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10) })
      .eq("id", lead);
    expect(away.error?.code).toBe("42501");
  });

  it("a blocked time cannot be held or booked until the block is removed; only Keenan blocks", async () => {
    const at = take();
    const end = new Date(new Date(at).getTime() + settings.meeting_slot_minutes * 60_000).toISOString();
    expect(hintOf((await users.a.client.rpc("add_time_block", { p_starts_at: at, p_ends_at: end, p_host: users.host.id })).error)).toBe("not_allowed");
    const block = await admin.rpc("add_time_block", { p_starts_at: at, p_ends_at: end, p_reason: "TEST block", p_host: users.host.id });
    expect(block.error).toBeNull();
    expect((await slotState(users.a, at))?.state).toBe("blocked");
    expect(hintOf((await hold(users.a, at)).error)).toBe("slot_blocked");
    const lead = await readyLead(users.a);
    expect(hintOf((await book(users.a, { lead, at })).error)).toBe("slot_blocked");
    expect((await admin.rpc("remove_time_block", { p_block_id: block.data as string })).error).toBeNull();
    expect((await slotState(users.a, at))?.state).toBe("open");
    const { data: row } = await admin.from("time_blocks").select("removed_at").eq("id", block.data as string).single();
    expect(row?.removed_at).not.toBeNull();
  });
});

describe("move and cancel", () => {
  it("a setter moves their own booking: the new time is checked like a booking, the old one frees up", async () => {
    const lead = await readyLead(users.a);
    const from = take();
    const to = take();
    const booked = await book(users.a, { lead, at: from });
    expect(booked.error).toBeNull();
    expect(hintOf((await users.b.client.rpc("move_meeting", { p_meeting_id: booked.data as string, p_new_starts_at: to })).error)).toBe("not_your_lead");
    expect((await hold(users.b, to)).error).toBeNull();
    expect(hintOf((await users.a.client.rpc("move_meeting", { p_meeting_id: booked.data as string, p_new_starts_at: to })).error)).toBe("slot_held");
    await users.b.client.rpc("release_hold");
    expect((await hold(users.a, to)).error).toBeNull();
    const moved = await users.a.client.rpc("move_meeting", { p_meeting_id: booked.data as string, p_new_starts_at: to });
    expect(moved.error).toBeNull();
    const { data: rows } = await admin
      .from("meetings")
      .select("id, status, rebooked_as, starts_at")
      .eq("lead_id", lead)
      .order("created_at");
    expect(rows?.map((row) => row.status)).toEqual(["moved", "booked"]);
    expect(rows?.[0].rebooked_as).toBe(moved.data);
    expect(await activeHolds(users.a.id)).toHaveLength(0);
    expect((await slotState(users.b, from))?.state).toBe("open");
    expect((await slotState(users.b, to))?.state).toBe("booked");
    const { data: event } = await admin
      .from("lead_events")
      .select("payload")
      .eq("lead_id", lead)
      .eq("type", "meeting_moved")
      .single();
    expect(Object.keys((event?.payload ?? {}) as object).sort()).toEqual(["from_meeting_id", "from_starts_at", "meeting_id", "starts_at"]);
  });

  it("a setter cancels their own booking: the lead goes to Follow up for tomorrow and the time frees up", async () => {
    const lead = await readyLead(users.a);
    const at = take();
    const booked = await book(users.a, { lead, at });
    expect(hintOf((await users.b.client.rpc("cancel_meeting", { p_meeting_id: booked.data as string })).error)).toBe("not_your_lead");
    expect((await users.a.client.rpc("cancel_meeting", { p_meeting_id: booked.data as string, p_note: "Customer called" })).error).toBeNull();
    const { data: after } = await admin.from("leads").select("status, follow_up_on").eq("id", lead).single();
    expect(after).toEqual({ status: "follow_up", follow_up_on: calgaryTomorrow() });
    const { data: meeting } = await admin.from("meetings").select("status, outcome_by, outcome_note").eq("id", booked.data as string).single();
    expect(meeting).toEqual({ status: "cancelled", outcome_by: users.a.id, outcome_note: "Customer called" });
    expect((await slotState(users.b, at))?.state).toBe("open");
    expect((await book(users.a, { lead, at: take() })).error).toBeNull();
    const { data: old } = await admin.from("meetings").select("rebooked_as").eq("id", booked.data as string).single();
    expect(old?.rebooked_as).not.toBeNull();
  });

  it("once a meeting has started, setters can neither move nor cancel it", async () => {
    const lead = await readyLead(users.a);
    const booked = await book(users.a, { lead, at: take() });
    await backdate(booked.data as string);
    expect(hintOf((await users.a.client.rpc("cancel_meeting", { p_meeting_id: booked.data as string })).error)).toBe("started");
    expect(hintOf((await users.a.client.rpc("move_meeting", { p_meeting_id: booked.data as string, p_new_starts_at: take() })).error)).toBe("started");
  });
});

describe("outcomes and booking pay", () => {
  async function heldMeeting(user: TestUser, extra: Partial<LeadInsert> = {}) {
    const lead = await readyLead(user, extra);
    const booked = await book(user, { lead, at: take() });
    if (booked.error) throw new Error(`book: ${booked.error.message}`);
    await backdate(booked.data as string);
    return { lead, meeting: booked.data as string };
  }
  const outcome = (meeting: string, value: Database["public"]["Enums"]["meeting_status"], reason?: string) =>
    admin.rpc("set_meeting_outcome", { p_meeting_id: meeting, p_outcome: value, p_reason: reason as string });

  it("only Keenan marks outcomes, and not before the meeting starts (except Cancelled)", async () => {
    const lead = await readyLead(users.a);
    const booked = await book(users.a, { lead, at: take() });
    expect(hintOf((await users.a.client.rpc("set_meeting_outcome", { p_meeting_id: booked.data as string, p_outcome: "qualified" })).error)).toBe("not_allowed");
    expect(hintOf((await outcome(booked.data as string, "qualified")).error)).toBe("not_started");
    expect(hintOf((await outcome(booked.data as string, "not_qualified")).error)).toBe("not_started");
  });

  it("Qualified pays the lead's setter once, at the current booking pay; the lead moves to Met", async () => {
    const { lead, meeting } = await heldMeeting(users.a);
    expect((await outcome(meeting, "qualified")).error).toBeNull();
    const { data: fees } = await admin.from("earnings").select("profile_id, type, rate, amount, status, payable_at, meeting_id").eq("lead_id", lead);
    expect(fees).toHaveLength(1);
    expect(fees?.[0]).toMatchObject({
      profile_id: users.a.id,
      type: "booking",
      rate: settings.booking_pay,
      amount: settings.booking_pay,
      status: "pending",
      meeting_id: meeting,
    });
    expect(fees?.[0].payable_at).not.toBeNull();
    const { data: after } = await admin.from("leads").select("status").eq("id", lead).single();
    expect(after?.status).toBe("met");
    const { data: event } = await admin.from("lead_events").select("payload").eq("lead_id", lead).eq("type", "meeting_outcome").single();
    expect(event?.payload).toEqual({ meeting_id: meeting, outcome: "qualified" });
  });

  it("Not qualified needs a reason and pays nothing; No-show sends the lead to Follow up and pays nothing", async () => {
    const first = await heldMeeting(users.a);
    expect(hintOf((await outcome(first.meeting, "not_qualified", " ")).error)).toBe("reason_needed");
    expect((await outcome(first.meeting, "not_qualified", "Decision maker missing")).error).toBeNull();
    const second = await heldMeeting(users.b);
    expect((await outcome(second.meeting, "no_show")).error).toBeNull();
    const { data: fees } = await admin.from("earnings").select("id").in("lead_id", [first.lead, second.lead]);
    expect(fees).toEqual([]);
    const { data: leads } = await admin.from("leads").select("id, status").in("id", [first.lead, second.lead]);
    expect(Object.fromEntries((leads ?? []).map((row) => [row.id, row.status]))).toEqual({ [first.lead]: "met", [second.lead]: "follow_up" });
    const { data: reasonEvent } = await admin
      .from("lead_events")
      .select("payload")
      .eq("lead_id", first.lead)
      .eq("type", "meeting_outcome")
      .single();
    expect(reasonEvent?.payload).toEqual({ meeting_id: first.meeting, outcome: "not_qualified", reason: "Decision maker missing" });
  });

  it("a corrected outcome voids or restores the fee, until it is paid; paid never changes", async () => {
    const { lead, meeting } = await heldMeeting(users.b);
    expect((await outcome(meeting, "qualified")).error).toBeNull();
    expect((await outcome(meeting, "no_show")).error).toBeNull();
    const voided = await admin.from("earnings").select("id, status, note").eq("lead_id", lead).single();
    expect(voided.data).toMatchObject({ status: "void", note: "Outcome changed to no show" });
    expect((await outcome(meeting, "qualified")).error).toBeNull();
    const restored = await admin.from("earnings").select("id, status").eq("lead_id", lead).single();
    expect(restored.data).toEqual({ id: voided.data!.id, status: "pending" });

    expect(hintOf((await users.b.client.rpc("mark_earnings_paid", { p_ids: [restored.data!.id] })).error)).toBe("not_allowed");
    const paid = await admin.rpc("mark_earnings_paid", { p_ids: [restored.data!.id] });
    expect(paid.data).toBe(1);
    const paidRow = await admin.from("earnings").select("status, paid_at").eq("id", restored.data!.id).single();
    expect(paidRow.data?.status).toBe("paid");
    expect(paidRow.data?.paid_at).not.toBeNull();
    expect(hintOf((await outcome(meeting, "not_qualified", "Other")).error)).toBe("already_paid");
    const tamper = await admin.from("earnings").update({ amount: 999 }).eq("id", restored.data!.id);
    expect(tamper.error?.code).toBe("42501");
  });

  it("never pays a second fee for one lead, even after a no-show and a rebooking", async () => {
    const { lead, meeting } = await heldMeeting(users.a);
    expect((await outcome(meeting, "no_show")).error).toBeNull();
    const again = await book(users.a, { lead, at: take() });
    expect(again.error).toBeNull();
    await backdate(again.data as string);
    expect((await outcome(again.data as string, "qualified")).error).toBeNull();
    expect((await outcome(meeting, "qualified")).error).toBeNull();
    const { data: fees } = await admin.from("earnings").select("id, meeting_id").eq("lead_id", lead);
    expect(fees).toHaveLength(1);
    expect(fees?.[0].meeting_id).toBe(again.data);
  });

  it("a lead assigned to the owner earns nothing when Qualified", async () => {
    const lead = await readyLead(users.a);
    const reassigned = await admin.from("leads").update({ assigned_to: ownerId }).eq("id", lead);
    expect(reassigned.error).toBeNull();
    const booked = await book(users.a, { lead, at: take() });
    expect(booked.error).toBeNull();
    const { data: row } = await admin.from("meetings").select("setter_id").eq("id", booked.data as string).single();
    expect(row?.setter_id).toBe(ownerId);
    await backdate(booked.data as string);
    expect((await outcome(booked.data as string, "qualified")).error).toBeNull();
    const { data: fees } = await admin.from("earnings").select("id").eq("lead_id", lead);
    expect(fees).toEqual([]);
    await admin.from("leads").update({ assigned_to: users.a.id }).eq("id", lead);
  });

  it("each setter reads only their own earnings", async () => {
    const mine = await users.a.client.from("earnings").select("profile_id");
    expect(mine.error).toBeNull();
    expect((mine.data ?? []).length).toBeGreaterThan(0);
    expect((mine.data ?? []).every((row) => row.profile_id === users.a.id)).toBe(true);
    const theirs = await users.b.client.from("earnings").select("profile_id").eq("profile_id", users.a.id);
    expect(theirs.data ?? []).toEqual([]);
    for (const client of [users.nobody.client, anon]) {
      expect((await client.from("earnings").select("id")).data ?? []).toEqual([]);
    }
  });
});

describe("map position source", () => {
  it("a picked position is marked picked; a phone position needs its accuracy, 50 m or better, inside Calgary", async () => {
    const picked = await readyLead(users.a);
    const { data: p } = await admin.from("leads").select("position_source, position_accuracy_m").eq("id", picked).single();
    expect(p).toEqual({ position_source: "picked", position_accuracy_m: null });

    const device = await readyLead(users.a, { position_source: "device", position_accuracy_m: 12 });
    const { data: d } = await admin.from("leads").select("position_source, position_accuracy_m").eq("id", device).single();
    expect(d).toEqual({ position_source: "device", position_accuracy_m: 12 });

    const noAccuracy = await users.a.client.from("leads").update({ position_accuracy_m: null }).eq("id", device);
    expect(noAccuracy.error?.code).toBe("23514");
    const tooVague = await users.a.client.from("leads").update({ position_accuracy_m: 80 }).eq("id", device);
    expect(tooVague.error?.code).toBe("23514");
    const faraway = await users.a.client.from("leads").update({ lat: 49.28, lng: -123.12 }).eq("id", device);
    expect(faraway.error?.code).toBe("23514");

    const cleared = await users.a.client.from("leads").update({ lat: null, lng: null }).eq("id", device);
    expect(cleared.error).toBeNull();
    const { data: c } = await admin.from("leads").select("position_source, position_accuracy_m").eq("id", device).single();
    expect(c).toEqual({ position_source: null, position_accuracy_m: null });
  });
});
