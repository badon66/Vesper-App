import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";

// Round 4 (Keenan, 2026-11-05): a session still open at midnight Calgary
// time ends itself, at its last tap if it has one, otherwise at its start,
// marked as ended automatically; a tap records when it happened; nobody
// signed in can end everyone's sessions; and a neighbourhood keeps the
// spelling of the first session that used it. Two throwaway setters, a
// test-only neighbourhood name, everything removed at the end.

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
const HOOD = `TEST Hood ${stamp}`;
const people = {
  a: { email: `rls-r4-a-${stamp}@example.com`, password: `Rls-r4-a-${stamp}-pass`, id: "", client: admin },
  b: { email: `rls-r4-b-${stamp}@example.com`, password: `Rls-r4-b-${stamp}-pass`, id: "", client: admin },
};
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

beforeAll(async () => {
  for (const person of Object.values(people)) {
    const { data, error } = await admin.auth.admin.createUser({
      email: person.email,
      password: person.password,
      email_confirm: true,
      user_metadata: { full_name: "RLS R4" },
      app_metadata: { role: "sales" },
    });
    if (error || !data.user) throw new Error(`could not create ${person.email}: ${error?.message}`);
    person.id = data.user.id;
    const client = createClient<Database>(url!, anonKey!, noSession);
    const signedIn = await client.auth.signInWithPassword({ email: person.email, password: person.password });
    if (signedIn.error) throw new Error(`sign in failed: ${signedIn.error.message}`);
    person.client = client;
  }
});

afterAll(async () => {
  for (const person of Object.values(people)) {
    if (!person.id) continue;
    await admin.from("knock_sessions").delete().eq("user_id", person.id);
    await admin.auth.admin.deleteUser(person.id);
  }
});

describe("A session left open past midnight", () => {
  it("records when a counter is tapped", async () => {
    const { data: started, error } = await people.a.client
      .from("knock_sessions")
      .insert({ neighbourhood: HOOD, user_id: people.a.id })
      .select("id, last_tap_at, ended_automatically")
      .single();
    expect(error).toBeNull();
    expect(started).toMatchObject({ last_tap_at: null, ended_automatically: false });
    const before = Date.now();
    const { data: bumped } = await people.a.client.rpc("bump_knock_session", { p_session: started!.id, p_doors: 1 });
    const row = (bumped ?? [])[0];
    expect(row?.doors_knocked).toBe(1);
    expect(new Date(row!.last_tap_at!).getTime()).toBeGreaterThanOrEqual(before - 60_000);
    await people.a.client.from("knock_sessions").update({ ended_at: new Date().toISOString() }).eq("id", started!.id);
  });

  it("ends at its last tap, or at its start with no taps, marked automatic; today's stay open", async () => {
    const yesterday = Date.now() - 30 * HOUR;
    const { data: rows, error } = await admin
      .from("knock_sessions")
      .insert([
        {
          user_id: people.a.id,
          neighbourhood: HOOD,
          started_at: iso(yesterday),
          doors_knocked: 12,
          conversations: 4,
          last_tap_at: iso(yesterday + 2 * HOUR),
        },
        { user_id: people.b.id, neighbourhood: HOOD, started_at: iso(yesterday + 3 * HOUR) },
      ], { defaultToNull: false })
      .select("id, user_id");
    expect(error).toBeNull();

    const { error: runError } = await admin.rpc("end_open_knock_sessions");
    expect(runError).toBeNull();

    const { data: after } = await admin
      .from("knock_sessions")
      .select("user_id, started_at, ended_at, last_tap_at, ended_automatically")
      .in("id", (rows ?? []).map((row) => row.id));
    const a = after!.find((row) => row.user_id === people.a.id)!;
    const b = after!.find((row) => row.user_id === people.b.id)!;
    expect(new Date(a.ended_at!).getTime()).toBe(new Date(a.last_tap_at!).getTime());
    expect(a.ended_automatically).toBe(true);
    expect(new Date(b.ended_at!).getTime()).toBe(new Date(b.started_at).getTime());
    expect(b.ended_automatically).toBe(true);

    // A session started today is left alone.
    const { data: todays } = await people.a.client.from("knock_sessions").insert({ neighbourhood: HOOD, user_id: people.a.id }).select("id").single();
    await admin.rpc("end_open_knock_sessions");
    const { data: still } = await admin.from("knock_sessions").select("ended_at, ended_automatically").eq("id", todays!.id).single();
    expect(still).toEqual({ ended_at: null, ended_automatically: false });
    await people.a.client.from("knock_sessions").update({ ended_at: new Date().toISOString() }).eq("id", todays!.id);
  });

  it("can't be ended for everyone by anyone signed in", async () => {
    const { error } = await people.a.client.rpc("end_open_knock_sessions");
    expect(error).not.toBeNull();
  });

  it("closes the same way when its owner opens Session or starts again", async () => {
    const yesterday = Date.now() - 26 * HOUR;
    await admin.from("knock_sessions").update({ ended_at: new Date().toISOString() }).eq("user_id", people.b.id).is("ended_at", null);
    const { data: stale } = await admin
      .from("knock_sessions")
      .insert({ user_id: people.b.id, neighbourhood: HOOD, started_at: iso(yesterday), doors_knocked: 3, last_tap_at: iso(yesterday + HOUR) })
      .select("id")
      .single();
    const { data: closed, error } = await people.b.client.rpc("close_my_stale_knock_sessions");
    expect(error).toBeNull();
    // 1, or 0 when the five-minute job (live on this database) got there
    // first: either way the row must have ended the same way.
    expect([0, 1]).toContain(closed);
    const { data: row } = await admin.from("knock_sessions").select("ended_at, last_tap_at, ended_automatically").eq("id", stale!.id).single();
    expect(new Date(row!.ended_at!).getTime()).toBe(new Date(row!.last_tap_at!).getTime());
    expect(row!.ended_automatically).toBe(true);
  });

  it("isn't marked automatic when the person ends it", async () => {
    const { data: started } = await people.b.client.from("knock_sessions").insert({ neighbourhood: HOOD, user_id: people.b.id }).select("id").single();
    const { data: ended } = await people.b.client
      .from("knock_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", started!.id)
      .select("ended_automatically")
      .single();
    expect(ended!.ended_automatically).toBe(false);
  });
});

describe("A neighbourhood's spelling", () => {
  it("is the first one entered, whatever the capitals or spaces", async () => {
    const typed = `  test   hood ${stamp.toUpperCase()} `;
    const { data, error } = await people.b.client.from("knock_sessions").insert({ neighbourhood: typed, user_id: people.b.id }).select("id, neighbourhood").single();
    expect(error).toBeNull();
    expect(data!.neighbourhood).toBe(HOOD);
    await people.b.client.from("knock_sessions").update({ ended_at: new Date().toISOString() }).eq("id", data!.id);
  });

  it("is kept as typed for a new place, tidied", async () => {
    const fresh = `TEST  New ${stamp} `;
    const { data } = await people.a.client.from("knock_sessions").insert({ neighbourhood: fresh, user_id: people.a.id }).select("id, neighbourhood").single();
    expect(data!.neighbourhood).toBe(`TEST New ${stamp}`);
    await people.a.client.from("knock_sessions").update({ ended_at: new Date().toISOString() }).eq("id", data!.id);
  });
});
