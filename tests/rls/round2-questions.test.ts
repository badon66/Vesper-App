import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";

// Round 2 (Keenan, 2026-11-03): Not collected is stored as such and never
// mistaken for an answer; an answer always wins over it; the "everyone who
// decides" question is stored on the lead; and the timeline notes changes
// to both. Signed in as a throwaway setter; leads are named
// "TEST LEAD (automated)" and everything made here is removed at the end.

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
const setter = { email: `rls-r2-a-${stamp}@example.com`, password: `Rls-r2-a-${stamp}-pass`, id: "", client: admin };

beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({
    email: setter.email,
    password: setter.password,
    email_confirm: true,
    user_metadata: { full_name: "RLS R2 A" },
    app_metadata: { role: "sales" },
  });
  if (error || !data.user) throw new Error(`could not create ${setter.email}: ${error?.message}`);
  setter.id = data.user.id;
  const client = createClient<Database>(url!, anonKey!, noSession);
  const signedIn = await client.auth.signInWithPassword({ email: setter.email, password: setter.password });
  if (signedIn.error) throw new Error(`sign in failed: ${signedIn.error.message}`);
  setter.client = client;
});

afterAll(async () => {
  if (!setter.id) return;
  await admin.from("leads").delete().eq("created_by", setter.id);
  await admin.auth.admin.deleteUser(setter.id);
});

describe("Not collected", () => {
  let leadId = "";

  it("is stored as such, once each, and anything unknown is left out", async () => {
    const { data, error } = await setter.client
      .from("leads")
      .insert({
        first_name: TEST_LEAD,
        address_line: "1 Notcollected Way NW (TEST)",
        created_by: setter.id,
        not_collected: ["phone", "owns_home", "owns_home", "install_timing", "nonsense"],
      })
      .select("id, not_collected, phone_saved, owns_home")
      .single();
    expect(error).toBeNull();
    leadId = data!.id;
    expect(data!.not_collected).toEqual(["install_timing", "owns_home", "phone"]);
    expect(data!.phone_saved).toBe(false);
    expect(data!.owns_home).toBeNull();
  });

  it("gives way to an answer, and the answer is kept", async () => {
    const { data, error } = await setter.client
      .from("leads")
      .update({ owns_home: true, phone: "+14035550142", not_collected: ["phone", "owns_home", "install_timing"] })
      .eq("id", leadId)
      .select("not_collected, owns_home, phone_saved")
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({ not_collected: ["install_timing"], owns_home: true, phone_saved: true });
    // The number itself, on their own lead, through lead_contacts (contact privacy).
    const { data: contact } = await setter.client.from("lead_contacts").select("phone").eq("lead_id", leadId).single();
    expect(contact?.phone).toBe("+14035550142");
  });

  it("stores the everyone-who-decides answer on the lead, and the timeline notes both changes", async () => {
    const { error } = await setter.client
      .from("leads")
      .update({ both_decision_makers: false, not_collected: [] })
      .eq("id", leadId);
    expect(error).toBeNull();
    const { data: lead } = await admin.from("leads").select("both_decision_makers, not_collected").eq("id", leadId).single();
    expect(lead).toEqual({ both_decision_makers: false, not_collected: [] });
    const { data: events } = await admin
      .from("lead_events")
      .select("type, payload")
      .eq("lead_id", leadId)
      .eq("type", "edited")
      .order("created_at", { ascending: false })
      .limit(1);
    const fields = (events?.[0]?.payload as { fields?: string[] } | null)?.fields ?? [];
    expect(fields).toEqual(expect.arrayContaining(["both_decision_makers", "not_collected"]));
  });

  // Book now, finish later (Keenan, 2026-11-10): Not collected stays Not
  // collected on the lead, and it is finished later rather than ruling a
  // booking out. Only a No on owns the home does that.
  it("is kept as Not collected, and never rules a booking out; a No on owns the home does", async () => {
    await admin.from("leads").update({ phone: null, owns_home: null, not_collected: ["phone", "owns_home"] }).eq("id", leadId);
    const { data: lead } = await admin.from("leads").select("not_collected, phone_saved, owns_home").eq("id", leadId).single();
    expect(lead).toEqual({ not_collected: ["owns_home", "phone"], phone_saved: false, owns_home: null });
    const problems = () =>
      admin.rpc("booking_problems", {
        p_lead_id: leadId,
        p_everyone_deciding_present: false,
        p_photos_skipped: null as unknown as string,
        p_photos_skip_note: "",
      });
    expect((await problems()).data).toEqual([]);
    await admin.from("leads").update({ owns_home: false }).eq("id", leadId);
    expect((await problems()).data).toEqual(["owns_home"]);
  });
});
