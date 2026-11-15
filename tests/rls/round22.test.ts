import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";

// Round 22 (Keenan, 2026-11-15): Supabase's own advice. The five views that
// show people only what they may see now run as the reader and read through
// functions in a private schema the API doesn't serve; lead_contacts and
// lead_notes leave out deleted leads. The owner's catch-all policies are
// folded into one policy per action. Two throwaway setters; their leads are
// named "TEST LEAD (automated)" and everything made here is removed at the
// end.

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
type Person = { email: string; password: string; name: string; id: string; client: Client };
const people: Record<"a" | "b", Person> = {
  a: { email: `rls-r22-a-${stamp}@example.com`, password: `Rls-r22-a-${stamp}-pass`, name: "RLS Round22 A", id: "", client: admin },
  b: { email: `rls-r22-b-${stamp}@example.com`, password: `Rls-r22-b-${stamp}-pass`, name: "RLS Round22 B", id: "", client: admin },
};
let mine = "";
let theirs = "";

async function makePerson(p: Person) {
  const { data, error } = await admin.auth.admin.createUser({
    email: p.email,
    password: p.password,
    email_confirm: true,
    user_metadata: { full_name: p.name },
    app_metadata: { role: "sales" },
  });
  if (error || !data.user) throw new Error(`could not create ${p.email}: ${error?.message}`);
  p.id = data.user.id;
  const client = createClient<Database>(url!, anonKey!, noSession);
  const signedIn = await client.auth.signInWithPassword({ email: p.email, password: p.password });
  if (signedIn.error) throw new Error(`sign in failed: ${signedIn.error.message}`);
  p.client = client;
}

async function makeLead(p: Person, n: number) {
  const { data, error } = await p.client
    .from("leads")
    .insert({ first_name: "TEST LEAD (automated)", address_line: `${n} Advisor Way NW (TEST)`, phone: `+1403555017${n}`, notes: `Round 22 note ${n}`, created_by: p.id })
    .select("id")
    .single();
  if (error || !data) throw new Error(`lead: ${error?.message}`);
  return data.id;
}

beforeAll(async () => {
  await makePerson(people.a);
  await makePerson(people.b);
  mine = await makeLead(people.a, 1);
  theirs = await makeLead(people.b, 2);
});

afterAll(async () => {
  const ids = [people.a.id, people.b.id].filter(Boolean);
  if (ids.length === 0) return;
  const { data: leads } = await admin.from("leads").select("id").in("created_by", ids);
  const leadIds = (leads ?? []).map((row) => row.id);
  if (leadIds.length > 0) {
    await admin.from("lead_events").delete().in("lead_id", leadIds);
    await admin.from("leads").delete().in("id", leadIds);
  }
  await admin.from("knock_sessions").delete().in("user_id", ids);
  for (const id of ids) await admin.auth.admin.deleteUser(id);
});

describe("the views that show people only what they may see", () => {
  it("still give a setter their own lead's phone and notes, and nobody else's", async () => {
    const contacts = await people.a.client.from("lead_contacts").select("lead_id, phone").in("lead_id", [mine, theirs]);
    const notes = await people.a.client.from("lead_notes").select("lead_id, notes").in("lead_id", [mine, theirs]);
    expect(contacts.error).toBeNull();
    expect(notes.error).toBeNull();
    expect((contacts.data ?? []).map((row) => row.lead_id)).toEqual([mine]);
    expect(contacts.data?.[0]?.phone).toBe("+14035550171");
    expect((notes.data ?? []).map((row) => row.lead_id)).toEqual([mine]);
    expect(notes.data?.[0]?.notes).toBe("Round 22 note 1");
  });

  it("leave out a deleted lead, even for its own setter", async () => {
    const { error } = await admin.from("leads").update({ deleted_at: new Date().toISOString() }).eq("id", mine);
    expect(error).toBeNull();
    const contacts = await people.a.client.from("lead_contacts").select("lead_id").eq("lead_id", mine);
    const notes = await people.a.client.from("lead_notes").select("lead_id").eq("lead_id", mine);
    expect([contacts.data?.length, notes.data?.length]).toEqual([0, 0]);
    await admin.from("leads").update({ deleted_at: null, deleted_by: null }).eq("id", mine);
    const back = await people.a.client.from("lead_contacts").select("lead_id").eq("lead_id", mine);
    expect(back.data?.length).toBe(1);
  });

  it("still give a signed-in setter the team's names and the booking settings", async () => {
    const names = await people.a.client.from("profile_names").select("id, full_name").in("id", [people.a.id, people.b.id]);
    const team = await people.a.client.from("profiles_public").select("id, role").in("id", [people.a.id, people.b.id]);
    const settings = await people.a.client.from("settings_public").select("booking_window_days, distance_warning_km").maybeSingle();
    expect(names.error).toBeNull();
    expect((names.data ?? []).length).toBe(2);
    expect((team.data ?? []).every((row) => row.role === "sales")).toBe(true);
    expect(settings.error).toBeNull();
    expect(typeof settings.data?.booking_window_days).toBe("number");
  });

  it("give someone who isn't signed in nothing", async () => {
    const views = ["lead_contacts", "lead_notes", "profile_names", "profiles_public", "settings_public"] as const;
    for (const view of views) {
      const { data, error } = await anon.from(view).select("*").limit(1);
      expect(error !== null || (data ?? []).length === 0, view).toBe(true);
    }
  });

  it("read through functions the API doesn't serve", async () => {
    const asSetter = await people.a.client.rpc("lead_contacts_visible" as never);
    const asAnon = await anon.rpc("settings_public_visible" as never);
    expect(asSetter.error).not.toBeNull();
    expect(asAnon.error).not.toBeNull();
  });
});

describe("one policy per action", () => {
  it("a setter still adds, reads and changes their own lead, and can't change another's", async () => {
    const own = await people.a.client.from("leads").update({ last_name: "Changed" }).eq("id", mine).select("id");
    const other = await people.a.client.from("leads").update({ last_name: "Not mine" }).eq("id", theirs).select("id");
    expect(own.error).toBeNull();
    expect(own.data?.length).toBe(1);
    expect(other.data?.length ?? 0).toBe(0);
    const { data } = await admin.from("leads").select("last_name").eq("id", theirs).single();
    expect(data?.last_name).toBeNull();
  });

  it("a lead a setter adds as someone else is saved as their own", async () => {
    const { data, error } = await people.a.client
      .from("leads")
      .insert({ first_name: "TEST LEAD (automated)", address_line: "9 Advisor Way NW (TEST)", created_by: people.b.id })
      .select("id")
      .single();
    expect(error).toBeNull();
    const saved = await admin.from("leads").select("created_by, assigned_to").eq("id", data!.id).single();
    expect([saved.data?.created_by, saved.data?.assigned_to]).toEqual([people.a.id, people.a.id]);
  });

  it("a setter reads their own profile only, and can't change it", async () => {
    const read = await people.a.client.from("profiles").select("id").in("id", [people.a.id, people.b.id]);
    expect((read.data ?? []).map((row) => row.id)).toEqual([people.a.id]);
    const change = await people.a.client.from("profiles").update({ full_name: "Renamed" }).eq("id", people.a.id).select("id");
    expect(change.data?.length ?? 0).toBe(0);
  });

  it("a setter starts and changes only their own knock session", async () => {
    const own = await people.a.client.from("knock_sessions").insert({ user_id: people.a.id, neighbourhood: "TEST (automated)" }).select("id").single();
    expect(own.error).toBeNull();
    const asOther = await people.a.client.from("knock_sessions").insert({ user_id: people.b.id, neighbourhood: "TEST (automated)" });
    expect(asOther.error).not.toBeNull();
    const fromB = await people.b.client.from("knock_sessions").update({ ended_at: new Date().toISOString() }).eq("id", own.data!.id).select("id");
    expect(fromB.data?.length ?? 0).toBe(0);
  });

  it("a setter reads only their own earnings", async () => {
    const { data, error } = await people.a.client.from("earnings").select("profile_id");
    expect(error).toBeNull();
    expect((data ?? []).every((row) => row.profile_id === people.a.id)).toBe(true);
  });
});
