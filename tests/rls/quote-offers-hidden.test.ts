import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database, Json } from "@/types/database";

// Round 13 (Keenan, 2026-11-11): Keenan chooses which offers the customer
// sees. An offer in quotes.offers with "hidden": true stays on the quote
// for him and is left out of everything the customer's link reads or does:
// the list, the table's choice, the option they last looked at, the option
// they booked, and the two taps (looking at an option, Book my install).
// It can't be accepted while hidden, and a quote can never have every
// offer hidden. All of it in the database itself.
//
// A throwaway setter, one test lead named "TEST LEAD (automated)", its
// quote and its link are made here and removed at the end. The service
// role stands in for Keenan, because the tests never sign in as him.

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
const POCKET = `Pocket offer ${stamp}`;

const setter = { email: `rls-hidden-${stamp}@example.com`, password: `Rls-hidden-${stamp}-pass`, id: "", client: admin as Client };
let ownerId = "";
let lead = "";
let quote = "";
let token = "";

const RUNS = [
  { name: "Front", feet: 60, level: "lower", part: "eave" },
  { name: "Garage", feet: 30, level: "lower", part: "garage" },
  { name: "Upper front", feet: 40, level: "upper", part: "eave" },
];
const offers = (pocketHidden: boolean, fullHidden = false) => [
  { id: "full", name: "Full wrap", runs: [0, 1, 2], ...(fullHidden ? { hidden: true } : {}) },
  { id: "pocket", name: POCKET, runs: [0, 1], ...(pocketHidden ? { hidden: true } : {}) },
  { id: "garage", name: "Garage", runs: [1] },
];
const setOffers = (list: unknown[], more: Record<string, unknown> = {}) =>
  admin.from("quotes").update({ offers: list as unknown as Json, ...more }).eq("id", quote);

const hintOf = (error: PostgrestError | null) => error?.hint ?? null;
const calgaryDay = (offsetDays: number) => new Date(Date.now() - 6 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);

type View = {
  state: string;
  quote: { offers: { id: string; name: string; runs: number[] }[]; meeting_offer: string | null } & Record<string, unknown>;
  selection: number[] | null;
  selection_offer: string | null;
  booked_at: string | null;
  booked_option: string | null;
  booked_offer: string | null;
};
async function view(): Promise<View> {
  const { data, error } = await anon.rpc("quote_for_customer", { p_token: token });
  if (error) throw new Error(`quote_for_customer: ${error.message}`);
  return data as unknown as View;
}
async function link() {
  const { data, error } = await admin.from("quote_links").select("*").eq("token", token).single();
  if (error || !data) throw new Error(`link row: ${error?.message}`);
  return data;
}
type Booked = { ok: boolean; state?: string; option?: string };
const book = async (offer: string) => (await anon.rpc("quote_link_book_offer", { p_token: token, p_offer: offer })).data as Booked;
const look = async (offer: string) => (await anon.rpc("quote_link_select_offer", { p_token: token, p_offer: offer })).data;

beforeAll(async () => {
  const { data: owner } = await admin.from("profiles").select("id").eq("role", "owner").single();
  if (!owner) throw new Error("no owner profile");
  ownerId = owner.id;
  const { data, error } = await admin.auth.admin.createUser({
    email: setter.email,
    password: setter.password,
    email_confirm: true,
    user_metadata: { full_name: "RLS Hidden Offers Setter" },
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
    .insert({ first_name: TEST_LEAD, last_name: "Hidden", address_line: `1 Hiddentest Street NW ${stamp} (TEST)`, neighbourhood: "TEST (automated)", created_by: setter.id })
    .select("id")
    .single();
  if (made.error || !made.data) throw new Error(`lead: ${made.error?.message}`);
  lead = made.data.id;
  // White, so the quote could be accepted.
  const { data: colour } = await admin.from("track_colours").select("id").eq("active", true).order("sort_order").limit(1).single();
  if (colour) await admin.from("leads").update({ track_colour_id: colour.id }).eq("id", lead);

  const q = await admin
    .from("quotes")
    .insert({
      lead_id: lead,
      created_by: ownerId,
      price_per_ft: 24,
      box_price: 500,
      box_count: 1,
      runs: RUNS as unknown as Json,
      offers: offers(true) as unknown as Json,
      total_feet: 130,
      adders: [],
      discounts: [],
      gst_rate: 0.05,
      gst_enabled: false,
      subtotal: 3620,
      total: 3620,
      valid_until: calgaryDay(14),
    })
    .select("id")
    .single();
  if (q.error || !q.data) throw new Error(`quote: ${q.error?.message}`);
  quote = q.data.id;

  const issued = await admin.rpc("issue_quote_link", { p_lead_id: lead });
  if (issued.error || !issued.data) throw new Error(`link: ${issued.error?.message}`);
  token = issued.data as string;
  // Handed to the throwaway setter, so Book my install never reaches Keenan.
  await admin.from("quote_links").update({ created_by: setter.id }).eq("token", token);
});

afterAll(async () => {
  if (lead) {
    await admin.from("earnings").delete().eq("lead_id", lead);
    await admin.from("quote_links").delete().eq("lead_id", lead);
    await admin.from("quotes").delete().eq("lead_id", lead);
  }
  if (setter.id) {
    await admin.from("leads").delete().eq("created_by", setter.id);
    await admin.auth.admin.deleteUser(setter.id);
  }
});

describe("a hidden offer on the customer's link", () => {
  it("is left out of the list, by id and by name, anywhere in what the page gets", async () => {
    const page = await view();
    expect(page.state).toBe("live");
    expect(page.quote.offers.map((offer) => offer.id)).toEqual(["full", "garage"]);
    // No offer carries the flag, and the hidden one's name is nowhere.
    expect(page.quote.offers.some((offer) => "hidden" in offer)).toBe(false);
    expect(JSON.stringify(page)).not.toContain(POCKET);
    expect(JSON.stringify(page)).not.toContain("pocket");
  });

  it("can't be looked at or booked, and the taps change nothing", async () => {
    const before = await link();
    expect(await look("pocket")).toBe(false);
    expect(await book("pocket")).toEqual({ ok: false, state: "no_offer" });
    expect(await link()).toEqual(before);
    // A shown one still works.
    expect(await look("garage")).toBe(true);
    expect((await view()).selection_offer).toBe("garage");
  });

  it("is never the table's choice on the page", async () => {
    expect((await setOffers(offers(true), { meeting_offer: "pocket" })).error).toBeNull();
    expect((await view()).quote.meeting_offer).toBeNull();
    expect((await setOffers(offers(true), { meeting_offer: "full" })).error).toBeNull();
    expect((await view()).quote.meeting_offer).toBe("full");
  });

  it("follows Keenan's switch after the link is sent: shown, booked, hidden again", async () => {
    // Shown: on the list, and they book it.
    expect((await setOffers(offers(false))).error).toBeNull();
    expect((await view()).quote.offers.map((offer) => offer.id)).toEqual(["full", "pocket", "garage"]);
    expect(await book("pocket")).toMatchObject({ ok: true, option: POCKET });
    expect(await view()).toMatchObject({ booked_offer: "pocket", booked_option: POCKET, selection_offer: "pocket" });

    // Hidden again: gone from the list, and the page no longer says they
    // booked it or were looking at it. Keenan's own row keeps the booking.
    expect((await setOffers(offers(true))).error).toBeNull();
    const page = await view();
    expect(page.quote.offers.map((offer) => offer.id)).toEqual(["full", "garage"]);
    expect(page).toMatchObject({ booked_at: null, booked_option: null, booked_offer: null, selection_offer: null, selection: null });
    expect(JSON.stringify(page)).not.toContain(POCKET);
    expect(await link()).toMatchObject({ booked_offer: "pocket", booked_option: POCKET });
  });
});

describe("the rules around hiding", () => {
  it("at least one offer is always shown: a quote can't have every offer hidden", async () => {
    const allHidden = offers(true, true).map((offer) => ({ ...offer, hidden: true }));
    const refused = await setOffers(allHidden);
    expect(refused.error?.code).toBe("23514");
    expect(refused.error?.message).toContain("quotes_offers_one_shown");
    // One left shown is fine, and so is a quote from before offers.
    expect((await setOffers(offers(true, true))).error).toBeNull();
    expect((await view()).quote.offers.map((offer) => offer.id)).toEqual(["garage"]);
    expect((await setOffers(offers(true))).error).toBeNull();
  });

  it("a hidden offer can't be accepted; shown, it can, and then the quote is locked so it can't be hidden", async () => {
    expect(hintOf((await admin.rpc("quote_accept_offer", { p_quote: quote, p_offer: "pocket" })).error)).toBe("hidden_offer");
    const { data: still } = await admin.from("quotes").select("status").eq("id", quote).single();
    expect(still?.status).toBe("draft");

    expect((await setOffers(offers(false))).error).toBeNull();
    expect((await admin.rpc("quote_accept_offer", { p_quote: quote, p_offer: "pocket" })).error).toBeNull();
    const { data: accepted } = await admin.from("quotes").select("status, accepted_offer").eq("id", quote).single();
    expect(accepted).toEqual({ status: "accepted", accepted_offer: "pocket" });
    // Accepted: its offers are locked, the switch included.
    expect(hintOf((await setOffers(offers(true))).error)).toBe("quote_locked");
  });

  it("the helper that lists the shown offers isn't callable from outside", async () => {
    const outside = [setter.client, anon] as unknown as SupabaseClient[];
    for (const client of outside) {
      const { error } = await client.rpc("quote_offers_shown", { p_quote: {} });
      expect(error).not.toBeNull();
    }
  });
});
