import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LEAD_FIELDS } from "@/lib/leads/fields";
import type { Database } from "@/types/database";

// Contact privacy on (Keenan, 2026-11-04): nobody reads leads.phone or
// leads.email straight from the table. A setter asking for either one, for
// *, or filtering or embedding by them is refused; the app's own column list
// still reads; writes to their own lead's phone and email still work.
// Signed in as a throwaway setter; the lead is named "TEST LEAD (automated)"
// and everything made here is removed at the end.

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
const setter = { email: `rls-privon-${stamp}@example.com`, password: `Rls-privon-${stamp}-pass`, id: "", client: admin };
let leadId = "";

beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({
    email: setter.email,
    password: setter.password,
    email_confirm: true,
    user_metadata: { full_name: "RLS Privacy On" },
    app_metadata: { role: "sales" },
  });
  if (error || !data.user) throw new Error(`could not create ${setter.email}: ${error?.message}`);
  setter.id = data.user.id;
  const client = createClient<Database>(url!, anonKey!, noSession);
  const signedIn = await client.auth.signInWithPassword({ email: setter.email, password: setter.password });
  if (signedIn.error) throw new Error(`sign in failed: ${signedIn.error.message}`);
  setter.client = client;
  const made = await client
    .from("leads")
    .insert({ first_name: "TEST LEAD (automated)", address_line: "3 Contact Way NW (TEST)", phone: "+14035550163", email: "c.contact.test@example.com", created_by: setter.id })
    .select("id")
    .single();
  if (made.error || !made.data) throw new Error(`lead: ${made.error?.message}`);
  leadId = made.data.id;
});

afterAll(async () => {
  if (!setter.id) return;
  await admin.from("leads").delete().eq("created_by", setter.id);
  await admin.auth.admin.deleteUser(setter.id);
});

const refused = (error: { code?: string } | null) => error?.code === "42501";

describe("leads' phone and email, from the table itself", () => {
  it("are refused by name, even on the setter's own lead", async () => {
    const phone = await setter.client.from("leads").select("id, phone").eq("id", leadId);
    const email = await setter.client.from("leads").select("id, email").eq("id", leadId);
    expect([refused(phone.error), refused(email.error)]).toEqual([true, true]);
  });

  it("are refused through *, a filter and an embed", async () => {
    const star = await setter.client.from("leads").select("*").eq("id", leadId);
    const filter = await setter.client.from("leads").select("id").ilike("phone", "%5550163%");
    const embed = await setter.client.from("meetings").select("id, lead:leads!meetings_lead_id_fkey(phone)").limit(1);
    expect([refused(star.error), refused(filter.error), refused(embed.error)]).toEqual([true, true, true]);
  });

  it("leave every other column readable, the app's own list included", async () => {
    const { data, error } = await setter.client.from("leads").select(LEAD_FIELDS).eq("id", leadId).single();
    expect(error).toBeNull();
    expect(data?.phone_saved).toBe(true);
  });

  it("can still be written by the setter, and read back through lead_contacts", async () => {
    const update = await setter.client.from("leads").update({ phone: "+14035550164", email: null }).eq("id", leadId).select("id");
    expect(update.error).toBeNull();
    const { data } = await setter.client.from("lead_contacts").select("phone, email").eq("lead_id", leadId).single();
    expect(data).toEqual({ phone: "+14035550164", email: null });
  });
});
