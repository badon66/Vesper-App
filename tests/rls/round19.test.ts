import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database, Json } from "@/types/database";

// Round 19 (Keenan, 2026-11-13), in the database itself:
//   - setting a site visit, moving it, clearing it, marking it done and not
//     done yet each add a line to the lead's timeline, with the day only;
//     the lead's own setter reads it there, never the site visit table;
//   - Book my install's timeline entry keeps the booked option's positions
//     (never a price), so the lead page can name its lines.
//
// A throwaway setter, one test lead named "TEST LEAD (automated)", its
// quote and link are made here and removed at the end. The service role
// stands in for Keenan, because the tests never sign in as him. The link is
// handed to the throwaway setter, so no notice ever reaches Keenan.

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
const setter = { email: `rls-r19-${stamp}@example.com`, password: `Rls-r19-${stamp}-pass`, id: "", client: admin as Client };
let lead = "";
let token = "";

const calgaryDay = (offsetDays: number) => new Date(Date.now() - 6 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
const visitLines = async (client: Client) =>
  ((await client.from("lead_events").select("type, payload, created_at").eq("lead_id", lead).eq("type", "site_visit").order("created_at")).data ?? []).map(
    (row) => row.payload as { change?: string; visit_on?: string | null },
  );

beforeAll(async () => {
  const { data: owner } = await admin.from("profiles").select("id").eq("role", "owner").single();
  if (!owner) throw new Error("no owner profile");
  const { data, error } = await admin.auth.admin.createUser({
    email: setter.email,
    password: setter.password,
    email_confirm: true,
    user_metadata: { full_name: "RLS Round Nineteen Setter" },
    app_metadata: { role: "sales" },
  });
  if (error || !data.user) throw new Error(`could not create ${setter.email}: ${error?.message}`);
  setter.id = data.user.id;
  const client = createClient<Database>(url!, anonKey!, noSession);
  const signedIn = await client.auth.signInWithPassword({ email: setter.email, password: setter.password });
  if (signedIn.error) throw new Error(`sign in: ${signedIn.error.message}`);
  setter.client = client;
  const made = await setter.client
    .from("leads")
    .insert({ first_name: TEST_LEAD, last_name: "Round nineteen", address_line: `1 Nineteen Street NW ${stamp} (TEST)`, neighbourhood: "TEST (automated)", created_by: setter.id })
    .select("id")
    .single();
  if (made.error || !made.data) throw new Error(`lead: ${made.error?.message}`);
  lead = made.data.id;
  const q = await admin
    .from("quotes")
    .insert({
      lead_id: lead,
      created_by: owner.id,
      price_per_ft: 24,
      box_price: 500,
      box_count: 1,
      runs: [
        { name: "Front", feet: 60, level: "lower", part: "eave", area: "front", gable: false },
        { name: "Front gable", feet: 18, level: "upper", part: "gable", area: "front", gable: true },
        { name: "Back", feet: 50, level: "lower", part: "eave", area: "back", gable: false },
      ] as unknown as Json,
      offers: [{ id: "front", name: "Full front", runs: [0, 1] }] as unknown as Json,
      total_feet: 128,
      adders: [],
      discounts: [],
      gst_rate: 0.05,
      gst_enabled: false,
      subtotal: 0,
      total: 0,
      valid_until: calgaryDay(14),
    })
    .select("id")
    .single();
  if (q.error || !q.data) throw new Error(`quote: ${q.error?.message}`);
  const issued = await admin.rpc("issue_quote_link", { p_lead_id: lead });
  if (issued.error || !issued.data) throw new Error(`link: ${issued.error?.message}`);
  token = issued.data as string;
  await admin.from("quote_links").update({ created_by: setter.id }).eq("token", token);
});

afterAll(async () => {
  if (lead) {
    await admin.from("lead_site_visits").delete().eq("lead_id", lead);
    await admin.from("quote_links").delete().eq("lead_id", lead);
    await admin.from("quotes").delete().eq("lead_id", lead);
    await admin.from("lead_events").delete().eq("lead_id", lead);
    await admin.from("leads").delete().eq("id", lead);
  }
  if (setter.id) {
    await setter.client.auth.signOut({ scope: "local" });
    await admin.auth.admin.deleteUser(setter.id);
  }
});

describe("the site visit on the timeline", () => {
  it("adds a line for each change: set, moved, done, not done yet, cleared, with the day only", async () => {
    const first = calgaryDay(3);
    const moved = calgaryDay(4);
    expect((await admin.from("lead_site_visits").upsert({ lead_id: lead, visit_on: first }, { onConflict: "lead_id" })).error).toBeNull();
    expect((await admin.from("lead_site_visits").update({ visit_on: moved }).eq("lead_id", lead)).error).toBeNull();
    // A save that changes nothing adds nothing.
    expect((await admin.from("lead_site_visits").update({ visit_on: moved }).eq("lead_id", lead)).error).toBeNull();
    expect((await admin.from("lead_site_visits").update({ done_at: new Date().toISOString() }).eq("lead_id", lead)).error).toBeNull();
    expect((await admin.from("lead_site_visits").update({ done_at: null }).eq("lead_id", lead)).error).toBeNull();
    expect((await admin.from("lead_site_visits").update({ visit_on: null }).eq("lead_id", lead)).error).toBeNull();
    expect(await visitLines(admin)).toEqual([
      { change: "set", visit_on: first },
      { change: "set", visit_on: moved },
      { change: "done", visit_on: moved },
      { change: "not_done", visit_on: moved },
      { change: "cleared", visit_on: null },
    ]);
  });

  it("the lead's own setter reads the lines on the timeline, never the site visit table", async () => {
    expect((await visitLines(setter.client)).length).toBe(5);
    expect((await setter.client.from("lead_site_visits").select("lead_id").eq("lead_id", lead)).data ?? []).toEqual([]);
    expect((await visitLines(anon)).length).toBe(0);
  });
});

describe("Book my install on the timeline", () => {
  it("keeps the booked option's positions, never a price", async () => {
    const booked = await anon.rpc("quote_link_book_offer", { p_token: token, p_offer: "front" });
    expect(booked.error).toBeNull();
    const { data } = await admin.from("lead_events").select("payload").eq("lead_id", lead).eq("type", "install_requested").single();
    expect(data?.payload).toMatchObject({ option: "Full front", positions: [0, 1] });
    expect(JSON.stringify(data?.payload)).not.toMatch(/\$|price|total|amount/i);
  });
});
