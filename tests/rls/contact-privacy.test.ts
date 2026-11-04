import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";

// Contact privacy (Keenan, 2026-11-04): a setter reads a lead's phone and
// email only on their own leads, through lead_contacts, and phone_saved says
// a number is saved on anyone's lead without the number. The app's public
// views are read only: a write through one would reach the table behind it
// around its policies. Every write tried here aims at no row at all, so it
// could change nothing even if it were let through. Signed in as two
// throwaway setters; leads are named "TEST LEAD (automated)" and everything
// made here is removed at the end.

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
const NOBODY = "00000000-0000-0000-0000-000000000000";
const setters = ["a", "b"].map((letter) => ({
  email: `rls-contact-${letter}-${stamp}@example.com`,
  password: `Rls-contact-${letter}-${stamp}-pass`,
  id: "",
  client: admin,
}));
const [a, b] = setters;
let leadA = "";
let leadB = "";

beforeAll(async () => {
  for (const setter of setters) {
    const { data, error } = await admin.auth.admin.createUser({
      email: setter.email,
      password: setter.password,
      email_confirm: true,
      user_metadata: { full_name: `RLS Contact ${setter.email.slice(12, 13).toUpperCase()}` },
      app_metadata: { role: "sales" },
    });
    if (error || !data.user) throw new Error(`could not create ${setter.email}: ${error?.message}`);
    setter.id = data.user.id;
    const client = createClient<Database>(url!, anonKey!, noSession);
    const signedIn = await client.auth.signInWithPassword({ email: setter.email, password: setter.password });
    if (signedIn.error) throw new Error(`sign in failed: ${signedIn.error.message}`);
    setter.client = client;
  }
  const made = await Promise.all(
    [
      [a, "+14035550161", "a.contact.test@example.com", "1 Contact Way NW (TEST)"],
      [b, "+14035550162", "b.contact.test@example.com", "2 Contact Way NW (TEST)"],
    ].map(async ([setter, phone, email, address]) => {
      const who = setter as (typeof setters)[number];
      const { data, error } = await who.client
        .from("leads")
        .insert({ first_name: TEST_LEAD, address_line: address as string, phone: phone as string, email: email as string, created_by: who.id })
        .select("id")
        .single();
      if (error || !data) throw new Error(`lead: ${error?.message}`);
      return data.id;
    }),
  );
  [leadA, leadB] = made;
});

afterAll(async () => {
  for (const setter of setters) {
    if (!setter.id) continue;
    await admin.from("leads").delete().eq("created_by", setter.id);
    await admin.auth.admin.deleteUser(setter.id);
  }
});

describe("lead_contacts", () => {
  it("gives a setter their own lead's phone and email", async () => {
    const { data, error } = await a.client.from("lead_contacts").select("lead_id, phone, email").eq("lead_id", leadA).single();
    expect(error).toBeNull();
    expect(data).toEqual({ lead_id: leadA, phone: "+14035550161", email: "a.contact.test@example.com" });
  });

  it("never gives a setter another setter's lead's phone or email, even when asked by id or by digits", async () => {
    const byId = await a.client.from("lead_contacts").select("lead_id, phone, email").eq("lead_id", leadB);
    expect(byId.error).toBeNull();
    expect(byId.data).toEqual([]);
    const byDigits = await a.client.from("lead_contacts").select("lead_id").ilike("phone", "%5550162%");
    expect(byDigits.data).toEqual([]);
    const all = await a.client.from("lead_contacts").select("lead_id").in("lead_id", [leadA, leadB]);
    expect((all.data ?? []).map((row) => row.lead_id)).toEqual([leadA]);
  });

  it("still lets a setter read another setter's lead, without the number, and says one is saved", async () => {
    const { data, error } = await a.client.from("leads").select("id, first_name, address_line, status, phone_saved").eq("id", leadB).single();
    expect(error).toBeNull();
    expect(data).toEqual({ id: leadB, first_name: TEST_LEAD, address_line: "2 Contact Way NW (TEST)", status: "new", phone_saved: true });
  });

  it("follows the phone as it is saved and cleared", async () => {
    const cleared = await a.client.from("leads").update({ phone: null }).eq("id", leadA).select("phone_saved").single();
    expect(cleared.error).toBeNull();
    expect(cleared.data?.phone_saved).toBe(false);
    const saved = await a.client.from("leads").update({ phone: "+14035550161" }).eq("id", leadA).select("phone_saved").single();
    expect(saved.data?.phone_saved).toBe(true);
  });
});

describe("the public views are read only", () => {
  const refused = (error: { code?: string } | null) => error?.code === "42501";

  it("refuses inserts, updates and deletes through lead_contacts", async () => {
    const insert = await a.client.from("lead_contacts").insert({ lead_id: NOBODY, phone: "+14035550199" } as never);
    const update = await a.client.from("lead_contacts").update({ phone: "+14035550199" } as never).eq("lead_id", NOBODY);
    const remove = await a.client.from("lead_contacts").delete().eq("lead_id", NOBODY);
    expect([refused(insert.error), refused(update.error), refused(remove.error)]).toEqual([true, true, true]);
  });

  it("refuses updates and deletes through profiles_public, profile_names and settings_public", async () => {
    const results = await Promise.all([
      a.client.from("profiles_public").update({ full_name: "Changed" } as never).eq("id", NOBODY),
      a.client.from("profiles_public").delete().eq("id", NOBODY),
      a.client.from("profile_names").update({ full_name: "Changed" } as never).eq("id", NOBODY),
      a.client.from("profile_names").delete().eq("id", NOBODY),
      a.client.from("settings_public").update({ booking_window_days: 1 } as never).eq("booking_window_days", -1),
      a.client.from("settings_public").delete().eq("booking_window_days", -1),
    ]);
    expect(results.map((result) => refused(result.error))).toEqual([true, true, true, true, true, true]);
  });
});
