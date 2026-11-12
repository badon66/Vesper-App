import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database, Json } from "@/types/database";

// Round 17 (Keenan, 2026-11-12), in the database itself:
//   - the site visit (lead_site_visits) is Keenan's alone: the lead's own
//     setter and an anonymous caller read and write nothing; the customer's
//     link reads it, through quote_for_customer, as Where you're at;
//   - the polish count (ai_polishes) is Keenan's alone, and ai_polish_take
//     refuses everyone else without counting;
//   - quote_for_customer hands the link the Christmas dates and words from
//     Settings, each offer's description (tidied, at most 400 characters)
//     and the "Lead with this one" star on the first shown offer only.
//
// A throwaway setter, one test lead named "TEST LEAD (automated)", its
// quote and link are made here and removed at the end. The service role
// stands in for Keenan, because the tests never sign in as him.

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

const setter = { email: `rls-r17-${stamp}@example.com`, password: `Rls-r17-${stamp}-pass`, id: "", client: admin as Client };
let ownerId = "";
let lead = "";
let token = "";

const LONG = `${"A long description. ".repeat(30)}`;
const OFFERS = [
  { id: "full", name: "Full wrap", runs: [0, 1], description: "  Lights the   whole house,\n\nfront and back.  " },
  // Hidden offers never lead, even starred.
  { id: "pocket", name: `Pocket ${stamp}`, runs: [0], hidden: true, lead: true },
  { id: "front", name: "Front only", runs: [0], lead: true, description: LONG },
  // A second star never counts: one per quote.
  { id: "back", name: "Back only", runs: [1], lead: true, description: "   " },
];

const calgaryDay = (offsetDays: number) => new Date(Date.now() - 6 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);

type CustomerAnswer = {
  state?: string;
  christmas?: { book_by_white?: string; book_by_colour?: string; season_end?: string; words?: Record<string, string> } | null;
  progress?: { site_visit_on: string | null; site_visit_done: boolean; installed: boolean } | null;
  quote?: { offers?: { id: string; lead?: boolean; description?: string }[] };
};
const customerView = async (): Promise<CustomerAnswer> => {
  const { data, error } = await anon.rpc("quote_for_customer", { p_token: token });
  if (error) throw new Error(`quote_for_customer: ${error.message}`);
  return (data ?? {}) as CustomerAnswer;
};

beforeAll(async () => {
  const { data: owner } = await admin.from("profiles").select("id").eq("role", "owner").single();
  if (!owner) throw new Error("no owner profile");
  ownerId = owner.id;
  const { data, error } = await admin.auth.admin.createUser({
    email: setter.email,
    password: setter.password,
    email_confirm: true,
    user_metadata: { full_name: "RLS Round Seventeen Setter" },
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
    .insert({ first_name: TEST_LEAD, last_name: "Round seventeen", address_line: `1 Seventeen Street NW ${stamp} (TEST)`, neighbourhood: "TEST (automated)", created_by: setter.id })
    .select("id")
    .single();
  if (made.error || !made.data) throw new Error(`lead: ${made.error?.message}`);
  lead = made.data.id;

  const q = await admin
    .from("quotes")
    .insert({
      lead_id: lead,
      created_by: ownerId,
      price_per_ft: 24,
      box_price: 500,
      box_count: 1,
      runs: [
        { name: "Front", feet: 60, level: "lower", part: "eave" },
        { name: "Back", feet: 50, level: "lower", part: "eave" },
      ] as unknown as Json,
      offers: OFFERS as unknown as Json,
      total_feet: 110,
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
  // Handed to the throwaway setter, so nothing here ever reaches Keenan.
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

describe("the site visit (round 17)", () => {
  it("is Keenan's alone: the lead's own setter and an anonymous caller read and write nothing", async () => {
    const set = await admin.from("lead_site_visits").upsert({ lead_id: lead, visit_on: calgaryDay(3) }, { onConflict: "lead_id" });
    expect(set.error).toBeNull();

    const read = await setter.client.from("lead_site_visits").select("lead_id").eq("lead_id", lead);
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);
    const anonRead = await anon.from("lead_site_visits").select("lead_id").eq("lead_id", lead);
    expect(anonRead.data ?? []).toEqual([]);

    const insert = await setter.client.from("lead_site_visits").insert({ lead_id: lead, visit_on: calgaryDay(1) });
    expect(insert.error).not.toBeNull();
    const update = await setter.client.from("lead_site_visits").update({ done_at: new Date().toISOString() }).eq("lead_id", lead).select("lead_id");
    expect(update.data ?? []).toEqual([]);
    const anonInsert = await anon.from("lead_site_visits").insert({ lead_id: lead, visit_on: calgaryDay(1) });
    expect(anonInsert.error).not.toBeNull();

    const { data: stored } = await admin.from("lead_site_visits").select("visit_on, done_at").eq("lead_id", lead).single();
    expect(stored).toEqual({ visit_on: calgaryDay(3), done_at: null });
  });

  it("reaches the customer's link as where they're at: the day while it's ahead, then Done", async () => {
    expect((await customerView()).progress).toEqual({ site_visit_on: calgaryDay(3), site_visit_done: false, installed: false });
    await admin.from("lead_site_visits").update({ done_at: new Date().toISOString() }).eq("lead_id", lead);
    expect((await customerView()).progress).toEqual({ site_visit_on: calgaryDay(3), site_visit_done: true, installed: false });
  });
});

describe("the polish count (round 17)", () => {
  it("is Keenan's alone, and a polish is refused to everyone else without being counted", async () => {
    const { count: before } = await admin.from("ai_polishes").select("id", { count: "exact", head: true });
    const asSetter = await setter.client.rpc("ai_polish_take");
    expect(asSetter.data).toEqual({ ok: false, state: "not_owner" });
    const asAnon = await anon.rpc("ai_polish_take");
    expect(asAnon.data ?? null).toBeNull();
    expect(asAnon.error).not.toBeNull();
    const { count: after } = await admin.from("ai_polishes").select("id", { count: "exact", head: true });
    expect(after).toBe(before);

    const read = await setter.client.from("ai_polishes").select("id").limit(1);
    expect(read.data ?? []).toEqual([]);
    const write = await setter.client.from("ai_polishes").insert({});
    expect(write.error).not.toBeNull();
  });
});

describe("what the customer's link is handed (round 17)", () => {
  it("the Christmas dates and words from Settings, while the banner is on", async () => {
    const { data: settings } = await admin
      .from("settings")
      .select(
        "christmas_banner_on, christmas_book_by_white, christmas_book_by_colour, christmas_season_end, christmas_banner_book_by, christmas_banner_white, christmas_banner_colour, christmas_banner_no_colour, christmas_banner_after",
      )
      .eq("id", 1)
      .single();
    const view = await customerView();
    if (!settings?.christmas_banner_on || !settings.christmas_book_by_white || !settings.christmas_season_end) {
      expect(view.christmas ?? null).toBeNull();
      return;
    }
    expect(view.christmas).toMatchObject({
      book_by_white: settings.christmas_book_by_white,
      book_by_colour: settings.christmas_book_by_colour ?? settings.christmas_book_by_white,
      season_end: settings.christmas_season_end,
      words: {
        book_by: settings.christmas_banner_book_by,
        white: settings.christmas_banner_white,
        colour: settings.christmas_banner_colour,
        no_colour: settings.christmas_banner_no_colour,
        after: settings.christmas_banner_after,
      },
    });
  });

  it("each shown offer's description, tidied and capped; the star on the first shown starred offer only", async () => {
    const offers = (await customerView()).quote?.offers ?? [];
    expect(offers.map((offer) => offer.id)).toEqual(["full", "front", "back"]);
    const byId = new Map(offers.map((offer) => [offer.id, offer]));
    expect(byId.get("full")?.description).toBe("Lights the whole house, front and back.");
    expect(byId.get("front")?.description?.length).toBe(400);
    expect(byId.get("back")?.description).toBeUndefined();
    expect(offers.filter((offer) => offer.lead).map((offer) => offer.id)).toEqual(["front"]);
  });
});
