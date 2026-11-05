import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";

// Booking sheet round 3 (Keenan, 2026-11-05): three optional answers on a
// lead, the setter's read, the hot buttons and call or text to confirm. A
// setter writes them on their own leads and reads them on everyone's (the
// team rule; they aren't contact details), Not sure never sits beside a hot
// button, and the timeline names them when they change, never their values.
// Two throwaway setters; leads are named "TEST LEAD (automated)" and
// everything made here is removed at the end.

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
const people = {
  a: { email: `rls-r3-a-${stamp}@example.com`, password: `Rls-r3-a-${stamp}-pass`, id: "", client: admin },
  b: { email: `rls-r3-b-${stamp}@example.com`, password: `Rls-r3-b-${stamp}-pass`, id: "", client: admin },
};
let leadId = "";

beforeAll(async () => {
  for (const person of Object.values(people)) {
    const { data, error } = await admin.auth.admin.createUser({
      email: person.email,
      password: person.password,
      email_confirm: true,
      user_metadata: { full_name: "RLS R3" },
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
    await admin.from("leads").delete().eq("created_by", person.id);
    await admin.auth.admin.deleteUser(person.id);
  }
});

describe("The optional answers on a lead", () => {
  it("start empty, and a setter saves them on their own lead", async () => {
    const { data, error } = await people.a.client
      .from("leads")
      .insert({ first_name: TEST_LEAD, address_line: "1 Round Three Way NW (TEST)", created_by: people.a.id })
      .select("id, setter_read, hot_buttons, confirm_by")
      .single();
    expect(error).toBeNull();
    leadId = data!.id;
    expect(data).toMatchObject({ setter_read: null, hot_buttons: [], confirm_by: null });
    const { data: changed, error: changeError } = await people.a.client
      .from("leads")
      .update({ setter_read: "hot", hot_buttons: ["no_ladders", "up_for_christmas"], confirm_by: "text" })
      .eq("id", leadId)
      .select("setter_read, hot_buttons, confirm_by")
      .single();
    expect(changeError).toBeNull();
    expect(changed).toEqual({ setter_read: "hot", hot_buttons: ["no_ladders", "up_for_christmas"], confirm_by: "text" });
  });

  it("are read by the rest of the team, who can't change them", async () => {
    const { data, error } = await people.b.client.from("leads").select("setter_read, hot_buttons, confirm_by").eq("id", leadId).single();
    expect(error).toBeNull();
    expect(data).toEqual({ setter_read: "hot", hot_buttons: ["no_ladders", "up_for_christmas"], confirm_by: "text" });
    const { data: refused } = await people.b.client.from("leads").update({ setter_read: "just_curious" }).eq("id", leadId).select("id");
    expect(refused ?? []).toEqual([]);
    const { data: still } = await admin.from("leads").select("setter_read").eq("id", leadId).single();
    expect(still!.setter_read).toBe("hot");
  });

  it("never take Not sure beside a hot button, or more than four", async () => {
    const mixed = await people.a.client.from("leads").update({ hot_buttons: ["not_sure", "curb_appeal"] }).eq("id", leadId);
    expect(mixed.error?.code).toBe("23514");
    const alone = await people.a.client.from("leads").update({ hot_buttons: ["not_sure"] }).eq("id", leadId).select("hot_buttons").single();
    expect(alone.error).toBeNull();
    expect(alone.data!.hot_buttons).toEqual(["not_sure"]);
    const five = await people.a.client
      .from("leads")
      .update({ hot_buttons: ["no_ladders", "up_for_christmas", "curb_appeal", "safety_security", "no_ladders"] })
      .eq("id", leadId);
    expect(five.error?.code).toBe("23514");
    const unknown = await people.a.client.from("leads").update({ setter_read: "lukewarm" as never }).eq("id", leadId);
    expect(unknown.error).not.toBeNull();
  });

  it("show on the timeline by name when they change, never by value", async () => {
    const { data: events } = await admin.from("lead_events").select("type, payload").eq("lead_id", leadId).eq("type", "edited");
    const fields = (events ?? []).flatMap((event) => ((event.payload as { fields?: string[] } | null)?.fields ?? []));
    expect(fields).toEqual(expect.arrayContaining(["setter_read", "hot_buttons", "confirm_by"]));
    expect(JSON.stringify(events)).not.toMatch(/no_ladders|up_for_christmas|"hot"/);
  });
});
