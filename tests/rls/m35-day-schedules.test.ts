import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";

// Proves M3.5's day schedules in the database (Keenan, 2026-11-02): an
// evening can have its own start, meeting length and number of meetings;
// open times, holds and booking follow it; a day change never moves or
// cancels a booking; and no double booking still holds, raced many times
// per run on an evening with its own schedule.
//
// Everything runs on a throwaway test host, so Keenan's real evenings are
// never touched, and everything is removed at the end. The service role
// stands in for Keenan, because the tests never sign in as him. "All days"
// is run with the template Settings already has, so Keenan's defaults never
// change.

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
const RACE_ROUNDS = 25;

type TestUser = { email: string; password: string; name: string; id: string; client: Client };
const users: Record<"a" | "b" | "host", TestUser> = {
  a: { email: `rls-m35-a-${stamp}@example.com`, password: `Rls-m35-a-${stamp}-pass`, name: "RLS Day Booker A", id: "", client: admin },
  b: { email: `rls-m35-b-${stamp}@example.com`, password: `Rls-m35-b-${stamp}-pass`, name: "RLS Day Booker B", id: "", client: admin },
  host: { email: `rls-m35-host-${stamp}@example.com`, password: `Rls-m35-h-${stamp}-pass`, name: "RLS Day Host", id: "", client: admin },
};

type Template = { meeting_days: number[]; meeting_start: string; meeting_slot_minutes: number; meeting_slot_count: number; booking_window_days: number; booking_cutoff_minutes: number };
let settings: Template;
let today = "";

const hintOf = (error: PostgrestError | null) => error?.hint ?? null;
const addDays = (day: string, days: number) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
// A Calgary wall time on a test day. Every test day is after 2026-11-01,
// when Alberta stopped changing clocks, so Calgary is UTC-6 (lib/time.ts).
const at = (day: string, hhmm: string) => {
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh + 6, mm)).toISOString();
};
const iso = (value: string) => new Date(value).toISOString();

async function signedIn(email: string, password: string): Promise<Client> {
  const client = createClient<Database>(url!, anonKey!, noSession);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in failed for ${email}: ${error.message}`);
  return client;
}

async function readyLead(user: TestUser): Promise<string> {
  const { data, error } = await user.client
    .from("leads")
    .insert({
      first_name: TEST_LEAD,
      address_line: `${Math.floor(Math.random() * 900) + 100} Day Test Street NW`,
      neighbourhood: "TEST (automated)",
      created_by: user.id,
      phone: "+14035550143",
      owns_home: true,
      wants_price: true,
      soffit_colour: "white",
      lat: 51.17,
      lng: -114.1,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`lead: ${error?.message}`);
  return data.id;
}

const hold = (user: TestUser, starts: string) => user.client.rpc("hold_slot", { p_starts_at: starts, p_host: users.host.id });
const book = (user: TestUser, lead: string, starts: string) =>
  user.client.rpc("book_meeting", {
    p_lead_id: lead,
    p_starts_at: starts,
    p_everyone_deciding_present: true,
    p_photos_skipped: "homeowner_said_no",
    p_host: users.host.id,
  });
const setDay = (client: Client, day: string, start: string | null, minutes: number | null, count: number | null, scope: "day" | "all" | "usual") =>
  client.rpc("set_day_schedule", {
    p_day: day,
    p_start: start as string,
    p_minutes: minutes as number,
    p_count: count as number,
    p_scope: scope,
    p_host: users.host.id,
  });
const preview = (day: string, start: string, minutes: number, count: number, scope: "day" | "all" | "usual") =>
  admin.rpc("day_schedule_preview", { p_day: day, p_start: start, p_minutes: minutes, p_count: count, p_scope: scope, p_host: users.host.id });

async function eveningRows(user: TestUser, day: string) {
  const { data, error } = await user.client.rpc("schedule_board", { p_host: users.host.id });
  if (error) throw new Error(`board: ${error.message}`);
  return (data ?? []).filter((row) => row.day === day).map((row) => ({ ...row, starts_at: iso(row.starts_at) }));
}

async function ownSchedules(day: string) {
  const { data } = await admin
    .from("day_schedules")
    .select("id, meeting_start, meeting_slot_minutes, meeting_slot_count, removed_at")
    .eq("host_id", users.host.id)
    .eq("day", day);
  return data ?? [];
}

async function removeEverything() {
  const ids = Object.values(users).map((u) => u.id).filter(Boolean);
  if (ids.length === 0) return;
  const { data: leads } = await admin.from("leads").select("id").in("created_by", ids);
  const leadIds = (leads ?? []).map((lead) => lead.id);
  await admin.from("slot_holds").delete().in("holder_id", ids);
  if (users.host.id) {
    await admin.from("slot_holds").delete().eq("host_id", users.host.id);
    await admin.from("meetings").update({ rebooked_as: null }).eq("host_id", users.host.id);
    await admin.from("meetings").delete().eq("host_id", users.host.id);
    await admin.from("day_schedules").delete().eq("host_id", users.host.id);
  }
  if (leadIds.length > 0) {
    await admin.from("meetings").update({ rebooked_as: null }).in("lead_id", leadIds);
    await admin.from("meetings").delete().in("lead_id", leadIds);
  }
  for (const id of ids) {
    await admin.from("leads").delete().eq("created_by", id);
    await admin.from("knock_sessions").delete().eq("user_id", id);
    await admin.from("day_schedules").delete().eq("created_by", id);
    await admin.auth.admin.deleteUser(id);
  }
}

beforeAll(async () => {
  const { data: s, error } = await admin
    .from("settings")
    .select("meeting_days, meeting_start, meeting_slot_minutes, meeting_slot_count, booking_window_days, booking_cutoff_minutes")
    .eq("id", 1)
    .single();
  if (error || !s) throw new Error(`settings: ${error?.message}`);
  settings = s;
  const now = new Date();
  const zone = now.getTime() >= Date.UTC(2026, 10, 1, 8) ? "Etc/GMT+6" : "America/Edmonton";
  today = new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(now);

  for (const key of ["a", "b", "host"] as const) {
    const u = users[key];
    const { data, error: createError } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { full_name: u.name },
      app_metadata: { role: "sales" },
    });
    if (createError || !data.user) throw new Error(`could not create ${u.email}: ${createError?.message}`);
    u.id = data.user.id;
    u.client = await signedIn(u.email, u.password);
  }
  const hosting = await admin.from("profiles").update({ hosts_meetings: true }).eq("id", users.host.id);
  if (hosting.error) throw new Error(`host: ${hosting.error.message}`);
});

afterAll(async () => {
  await removeEverything();
});

describe("an evening with its own schedule", () => {
  it("only Keenan sets one; setters read them but write nothing", async () => {
    const day = addDays(today, 3);
    const refused = await setDay(users.a.client, day, "16:00", 40, 3, "day");
    expect(refused.error?.code).toBe("42501");
    expect(hintOf(refused.error)).toBe("not_allowed");
    const peek = await users.a.client.rpc("day_schedule_preview", { p_day: day, p_start: "16:00", p_minutes: 40, p_count: 3, p_scope: "day" });
    expect(hintOf(peek.error)).toBe("not_allowed");
    const direct = await users.a.client.from("day_schedules").insert({
      host_id: users.host.id, day, meeting_start: "16:00", meeting_slot_minutes: 40, meeting_slot_count: 3, created_by: users.a.id,
    });
    expect(direct.error).not.toBeNull();

    const set = await setDay(admin, day, "16:00", 40, 3, "day");
    expect(set.error).toBeNull();
    const read = await users.a.client.from("day_schedules").select("day, meeting_start").eq("host_id", users.host.id).eq("day", day).is("removed_at", null);
    expect(read.data).toEqual([{ day, meeting_start: "16:00:00" }]);
  });

  it("gives the board its own times, and holds and booking follow them", async () => {
    const day = addDays(today, 3);
    const rows = await eveningRows(users.a, day);
    expect(rows.map((row) => row.starts_at)).toEqual([at(day, "16:00"), at(day, "16:40"), at(day, "17:20")]);
    expect(rows.every((row) => row.state === "open")).toBe(true);

    // A time from the usual template is no longer one of the evening's times.
    const usual = await hold(users.a, at(day, settings.meeting_start.slice(0, 5)));
    expect(hintOf(usual.error)).toBe("not_a_slot");

    const lead = await readyLead(users.a);
    const held = await hold(users.a, at(day, "16:40"));
    expect(held.error).toBeNull();
    const booked = await book(users.a, lead, at(day, "16:40"));
    expect(booked.error).toBeNull();
    const { data: meeting } = await admin.from("meetings").select("starts_at, ends_at").eq("id", booked.data as string).single();
    expect(new Date(meeting!.ends_at).getTime() - new Date(meeting!.starts_at).getTime()).toBe(40 * 60_000);
  });

  it("can open an evening that isn't one of the usual meeting days", async () => {
    let closed = addDays(today, 1);
    while (settings.meeting_days.includes(weekday(closed))) closed = addDays(closed, 1);
    if (closed > addDays(today, settings.booking_window_days)) return; // every day in the window is a meeting day
    expect(await eveningRows(users.a, closed)).toEqual([]);
    expect((await setDay(admin, closed, "18:00", 60, 2, "day")).error).toBeNull();
    expect((await eveningRows(users.a, closed)).map((row) => row.starts_at)).toEqual([at(closed, "18:00"), at(closed, "19:00")]);
    expect((await setDay(admin, closed, null, null, null, "usual")).error).toBeNull();
    expect(await eveningRows(users.a, closed)).toEqual([]);
  });

  it("refuses evenings outside the window and templates that don't fit", async () => {
    const past = await setDay(admin, addDays(today, -1), "16:00", 40, 3, "day");
    expect(hintOf(past.error)).toBe("outside_window");
    const far = await setDay(admin, addDays(today, settings.booking_window_days + 1), "16:00", 40, 3, "day");
    expect(hintOf(far.error)).toBe("outside_window");
    const day = addDays(today, 4);
    expect(hintOf((await setDay(admin, day, "16:00", 10, 3, "day")).error)).toBe("bad_template");
    expect(hintOf((await setDay(admin, day, "16:00", 40, 13, "day")).error)).toBe("bad_template");
    expect(hintOf((await setDay(admin, day, "22:00", 60, 3, "day")).error)).toBe("bad_template");
  });

  it("keeps the setter cutoff on its own times", async () => {
    // Tonight, with a time 10 minutes away: inside the setter cutoff.
    const now = new Date();
    const soon = new Date(now.getTime() + 10 * 60_000);
    const calgary = new Date(soon.getTime() - 6 * 3600_000);
    if (calgary.toISOString().slice(0, 10) !== today) return; // too close to midnight to place a time tonight
    const hhmm = `${String(calgary.getUTCHours()).padStart(2, "0")}:${String(calgary.getUTCMinutes()).padStart(2, "0")}`;
    expect((await setDay(admin, today, hhmm, 15, 1, "day")).error).toBeNull();
    const closed = await hold(users.a, at(today, hhmm));
    expect(hintOf(closed.error)).toBe("slot_closed");
    expect((await setDay(admin, today, null, null, null, "usual")).error).toBeNull();
  });
});

describe("no double booking on an evening with its own schedule", () => {
  it(`two setters grabbing the same time at the same instant: exactly one gets it, ${RACE_ROUNDS} times over`, async () => {
    const day = addDays(today, 5);
    expect((await setDay(admin, day, "15:00", 15, 12, "day")).error).toBeNull();
    const time = at(day, "15:15");
    for (let round = 0; round < RACE_ROUNDS; round += 1) {
      const [first, second] = await Promise.all([hold(users.a, time), hold(users.b, time)]);
      const winners = [first, second].filter((result) => !result.error);
      const losers = [first, second].filter((result) => result.error);
      expect(winners, `round ${round}`).toHaveLength(1);
      expect(hintOf(losers[0].error), `round ${round}`).toBe("slot_held");
      const { data: rows } = await admin
        .from("slot_holds")
        .select("id")
        .eq("host_id", users.host.id)
        .eq("starts_at", time)
        .is("released_at", null);
      expect(rows, `round ${round}`).toHaveLength(1);
      await (first.error ? users.b : users.a).client.rpc("release_hold");
    }
  });

  it(`two setters booking the same time at the same instant: exactly one books it, ${RACE_ROUNDS} times over`, async () => {
    const day = addDays(today, 5);
    const time = at(day, "15:30");
    const leadA = await readyLead(users.a);
    const leadB = await readyLead(users.b);
    for (let round = 0; round < RACE_ROUNDS; round += 1) {
      const [first, second] = await Promise.all([book(users.a, leadA, time), book(users.b, leadB, time)]);
      const winners = [first, second].filter((result) => !result.error);
      const losers = [first, second].filter((result) => result.error);
      expect(winners, `round ${round}`).toHaveLength(1);
      expect(["slot_taken", "slot_held"], `round ${round}`).toContain(hintOf(losers[0].error));
      const { data: live } = await admin
        .from("meetings")
        .select("id")
        .eq("host_id", users.host.id)
        .eq("starts_at", time)
        .in("status", ["booked", "confirmed", "qualified", "not_qualified"]);
      expect(live, `round ${round}`).toHaveLength(1);
      const cancelled = await (first.error ? users.b : users.a).client.rpc("cancel_meeting", { p_meeting_id: winners[0].data as string });
      expect(cancelled.error, `round ${round}`).toBeNull();
    }
  });

  it("a time someone holds can't be grabbed or booked by anyone else", async () => {
    const day = addDays(today, 5);
    const time = at(day, "16:00");
    expect((await hold(users.a, time)).error).toBeNull();
    expect(hintOf((await hold(users.b, time)).error)).toBe("slot_held");
    const lead = await readyLead(users.b);
    expect(hintOf((await book(users.b, lead, time)).error)).toBe("slot_held");
    await users.a.client.rpc("release_hold");
  });
});

describe("a day change never moves or cancels a booking", () => {
  it("warns first, keeps the booking at its time on the board, and leaves overlapping times off", async () => {
    const day = addDays(today, 6);
    expect((await setDay(admin, day, "16:00", 40, 4, "day")).error).toBeNull();
    const lead = await readyLead(users.a);
    expect((await hold(users.a, at(day, "16:00"))).error).toBeNull();
    const booked = await book(users.a, lead, at(day, "16:00"));
    expect(booked.error).toBeNull();

    // New times: 15:30, 16:15, 17:00, 17:45. The 16:00 to 16:40 booking
    // lines up with none of them and overlaps 15:30 and 16:15.
    const warn = await preview(day, "15:30", 45, 4, "day");
    expect(warn.error).toBeNull();
    const plan = warn.data as { times: string[]; misaligned: { meeting_id: string; starts_at: string }[]; holds: unknown[] };
    expect(plan.times.map(iso)).toEqual([at(day, "15:30"), at(day, "16:15"), at(day, "17:00"), at(day, "17:45")]);
    expect(plan.misaligned.map((m) => [m.meeting_id, iso(m.starts_at)])).toEqual([[booked.data, at(day, "16:00")]]);

    expect((await setDay(admin, day, "15:30", 45, 4, "day")).error).toBeNull();
    const { data: meeting } = await admin.from("meetings").select("status, starts_at").eq("id", booked.data as string).single();
    expect(meeting!.status).toBe("booked");
    expect(iso(meeting!.starts_at)).toBe(at(day, "16:00"));

    const rows = await eveningRows(users.b, day);
    expect(rows.map((row) => [row.starts_at, row.state])).toEqual([
      [at(day, "16:00"), "booked"],
      [at(day, "17:00"), "open"],
      [at(day, "17:45"), "open"],
    ]);
    // An overlapping time is refused even when asked for directly.
    expect(hintOf((await hold(users.b, at(day, "16:15"))).error)).toBe("slot_taken");
    expect(hintOf((await hold(users.b, at(day, "15:30"))).error)).toBe("slot_taken");
  });

  it("keeps every booking on the board when longer meetings make the times overlap them", async () => {
    // Two bookings in a row, then each meeting gets longer (critique, M3.5).
    // The first booking still lines up with the new times; the second no
    // longer does and overlaps the first new time. Both stay on the board at
    // their own times, and only new times clear of both are offered.
    const day = addDays(today, 8);
    expect((await setDay(admin, day, "17:00", 35, 4, "day")).error).toBeNull();
    const first = await readyLead(users.a);
    const second = await readyLead(users.b);
    expect((await hold(users.a, at(day, "17:00"))).error).toBeNull();
    expect((await book(users.a, first, at(day, "17:00"))).error).toBeNull();
    expect((await hold(users.b, at(day, "17:35"))).error).toBeNull();
    expect((await book(users.b, second, at(day, "17:35"))).error).toBeNull();

    // New times: 17:00, 17:45, 18:30, 19:15. The 17:00 time now runs to
    // 17:45 and overlaps the 17:35 booking; 17:45 overlaps it too (to 18:10).
    expect((await setDay(admin, day, "17:00", 45, 4, "day")).error).toBeNull();
    const rows = await eveningRows(users.a, day);
    expect(rows.map((row) => [row.starts_at, row.state])).toEqual([
      [at(day, "17:00"), "booked"],
      [at(day, "17:35"), "booked"],
      [at(day, "18:30"), "open"],
      [at(day, "19:15"), "open"],
    ]);
    // A booked time shows the booking's own end, not the new length.
    const firstRow = rows.find((row) => row.starts_at === at(day, "17:00"));
    expect(iso(firstRow!.ends_at)).toBe(at(day, "17:35"));
    expect(hintOf((await hold(users.b, at(day, "17:45"))).error)).toBe("slot_taken");
  });

  it("lets go of a hold whose time disappears, and its holder's check-in says so", async () => {
    const day = addDays(today, 6);
    expect((await hold(users.b, at(day, "17:45"))).error).toBeNull();
    const warn = await preview(day, "15:30", 45, 3, "day");
    expect((warn.data as { holds: { starts_at: string; holder_name: string }[] }).holds.map((h) => [iso(h.starts_at), h.holder_name])).toEqual([
      [at(day, "17:45"), users.b.name],
    ]);
    const changed = await setDay(admin, day, "15:30", 45, 3, "day");
    expect(changed.error).toBeNull();
    expect((changed.data as { released_holds: number }).released_holds).toBe(1);
    const { data: released } = await admin
      .from("slot_holds")
      .select("release_reason")
      .eq("holder_id", users.b.id)
      .eq("starts_at", at(day, "17:45"))
      .single();
    expect(released!.release_reason).toBe("released");
    const renewed = await users.b.client.rpc("renew_hold");
    // Its holder's next check-in finds no hold, which the screen treats as lost.
    expect(renewed.data).toMatchObject({ status: "none" });
    // The board no longer offers the time, which is how the screen says why.
    expect((await eveningRows(users.b, day)).map((row) => row.starts_at)).not.toContain(at(day, "17:45"));
  });

  it("keeps a hold whose time stays, and never touches another evening", async () => {
    const day = addDays(today, 6);
    expect((await hold(users.b, at(day, "17:00"))).error).toBeNull();
    const before = await eveningRows(users.a, addDays(today, 5));
    expect((await setDay(admin, day, "15:30", 45, 4, "day")).error).toBeNull();
    expect((await users.b.client.rpc("renew_hold")).data).toMatchObject({ status: "held" });
    expect(await eveningRows(users.a, addDays(today, 5))).toEqual(before);
    await users.b.client.rpc("release_hold");
  });
});

describe("going back to the usual times, and All days", () => {
  it("Usual stamps the evening's own schedule and brings back the template", async () => {
    const day = addDays(today, 4);
    expect((await setDay(admin, day, "16:00", 40, 3, "day")).error).toBeNull();
    expect((await setDay(admin, day, null, null, null, "usual")).error).toBeNull();
    const rows = await ownSchedules(day);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.removed_at !== null)).toBe(true);
    const evening = await eveningRows(users.a, day);
    const expected = settings.meeting_days.includes(weekday(day))
      ? Array.from({ length: settings.meeting_slot_count }, (_, k) => {
          const [h, m] = settings.meeting_start.split(":").map(Number);
          const minutes = h * 60 + m + k * settings.meeting_slot_minutes;
          return at(day, `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
        })
      : [];
    expect(evening.map((row) => row.starts_at)).toEqual(expected);
  });

  it("All days drops this evening's own times, keeps other evenings' own times, and names them first", async () => {
    const day = addDays(today, 4);
    const other = addDays(today, 5); // has its own schedule from the race tests
    expect((await setDay(admin, day, "16:00", 40, 3, "day")).error).toBeNull();
    const start = settings.meeting_start.slice(0, 5);
    const warn = await preview(day, start, settings.meeting_slot_minutes, settings.meeting_slot_count, "all");
    expect(warn.error).toBeNull();
    expect((warn.data as { own_days_kept: string[] }).own_days_kept).toContain(other);
    expect((warn.data as { own_days_kept: string[] }).own_days_kept).not.toContain(day);

    const all = await setDay(admin, day, start, settings.meeting_slot_minutes, settings.meeting_slot_count, "all");
    expect(all.error).toBeNull();
    expect((await ownSchedules(day)).every((row) => row.removed_at !== null)).toBe(true);
    expect((await ownSchedules(other)).some((row) => row.removed_at === null)).toBe(true);
    const { data: after } = await admin.from("settings").select("meeting_start, meeting_slot_minutes, meeting_slot_count").eq("id", 1).single();
    expect(after).toEqual({ meeting_start: settings.meeting_start, meeting_slot_minutes: settings.meeting_slot_minutes, meeting_slot_count: settings.meeting_slot_count });
  });
});
