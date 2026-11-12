import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database, Json } from "@/types/database";

// Round 18 (Keenan, 2026-11-12), in the database itself:
//   - each offer keeps its own rush fee and extra charges, cleaned the way
//     the app cleans them, and the customer's link reads them;
//   - Build your own carries the rush fee of the option it started from,
//     never that option's own extra charges;
//   - an accepted quote's numbers change only through quote_revise, which
//     is Keenan's alone, keeps the option they said yes to on the quote,
//     records each change in quote_revisions (Keenan's alone), moves a
//     pending commission with the new numbers and leaves a paid one alone;
//   - the customer's link says when Keenan changed it and what changed.
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

const setter = { email: `rls-r18-${stamp}@example.com`, password: `Rls-r18-${stamp}-pass`, id: "", client: admin as Client };
let ownerId = "";
let lead = "";
let quote = "";
let token = "";

const RUNS = [
  { name: "Front", feet: 60, level: "lower", part: "eave", area: "front", gable: false },
  { name: "Back", feet: 50, level: "lower", part: "eave", area: "back", gable: false },
];
const OFFERS = [
  {
    id: "full",
    name: "Full wrap",
    runs: [0, 1],
    rush_fee: 350.555,
    charges: [
      { label: "  Extra $ outlet ", amount: 150 },
      { label: "", amount: 0 },
      { label: "Ladder", amount: -20 },
    ],
  },
  { id: "front", name: "Front only", runs: [0], rush_fee: -5, charges: "junk" },
];

const calgaryDay = (offsetDays: number) => new Date(Date.now() - 6 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
const hintOf = (error: { hint?: string | null } | null) => error?.hint ?? null;

type Offer = { id: string; runs: number[]; rush_fee?: number; charges?: { label: string; amount: number }[]; from_customer?: boolean };
type Answer = { quote?: { offers?: Offer[] }; revised?: { at: string; changes: string[] } | null };
const customerView = async (): Promise<Answer> => {
  const { data, error } = await anon.rpc("quote_for_customer", { p_token: token });
  if (error) throw new Error(`quote_for_customer: ${error.message}`);
  return (data ?? {}) as Answer;
};
const quoteRow = async () => (await admin.from("quotes").select("*").eq("id", quote).single()).data!;
const commission = async () =>
  (await admin.from("earnings").select("id, status, amount, base_amount, rate").eq("lead_id", lead).eq("type", "commission").order("created_at")).data ?? [];
const revise = (client: Client, fields: Record<string, unknown>, changes: string[] = [], before = 0, after = 0) =>
  client.rpc("quote_revise", { p_quote: quote, p_fields: fields as Json, p_changes: changes as unknown as Json, p_total_before: before, p_total_after: after });

beforeAll(async () => {
  const { data: owner } = await admin.from("profiles").select("id").eq("role", "owner").single();
  if (!owner) throw new Error("no owner profile");
  ownerId = owner.id;
  const { data, error } = await admin.auth.admin.createUser({
    email: setter.email,
    password: setter.password,
    email_confirm: true,
    user_metadata: { full_name: "RLS Round Eighteen Setter" },
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
    .insert({ first_name: TEST_LEAD, last_name: "Round eighteen", address_line: `1 Eighteen Street NW ${stamp} (TEST)`, neighbourhood: "TEST (automated)", created_by: setter.id })
    .select("id")
    .single();
  if (made.error || !made.data) throw new Error(`lead: ${made.error?.message}`);
  lead = made.data.id;
  // A quote is accepted only once the track colour is set.
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
  quote = q.data.id;

  const issued = await admin.rpc("issue_quote_link", { p_lead_id: lead });
  if (issued.error || !issued.data) throw new Error(`link: ${issued.error?.message}`);
  token = issued.data as string;
  await admin.from("quote_links").update({ created_by: setter.id }).eq("token", token);
});

afterAll(async () => {
  if (lead) {
    await admin.from("quote_revisions").delete().eq("lead_id", lead);
    await admin.from("earnings").delete().eq("lead_id", lead);
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

describe("each offer's own rush fee and extra charges", () => {
  it("are kept cleaned: a fee over 0 to the cent, charges with a name or an amount, no dollar signs", async () => {
    const offers = (await customerView()).quote?.offers ?? [];
    expect(offers.map((offer) => [offer.id, offer.rush_fee ?? null, offer.charges ?? null])).toEqual([
      [
        "full",
        350.56,
        [
          { label: "Extra outlet", amount: 150 },
          { label: "Ladder", amount: 0 },
        ],
      ],
      ["front", null, null],
    ]);
    // Nothing changed yet after a yes: the link has no Updated line.
    expect((await customerView()).revised ?? null).toBeNull();
  });

  it("Build your own takes the starting option's rush fee, never its extra charges", async () => {
    const booked = await anon.rpc("quote_link_book_custom", { p_token: token, p_runs: [0], p_from: "full" });
    expect(booked.error).toBeNull();
    const own = ((await customerView()).quote?.offers ?? []).find((offer) => offer.from_customer);
    expect(own).toMatchObject({ runs: [0], rush_fee: 350.56 });
    expect(own?.charges).toBeUndefined();
    // From an option with no fee: none.
    await anon.rpc("quote_link_book_custom", { p_token: token, p_runs: [0], p_from: "front" });
    const plain = ((await customerView()).quote?.offers ?? []).find((offer) => offer.from_customer);
    expect(plain?.rush_fee).toBeUndefined();
  });
});

describe("changing a quote after the yes", () => {
  it("an accepted quote's numbers can't be changed directly, by anyone", async () => {
    // A commission goes to the lead's own setter.
    expect((await admin.from("leads").update({ assigned_to: setter.id }).eq("id", lead)).error).toBeNull();
    const accepted = await admin.rpc("quote_accept_offer", { p_quote: quote, p_offer: "full" });
    expect(accepted.error).toBeNull();
    expect((await quoteRow()).status).toBe("accepted");
    const direct = await admin.from("quotes").update({ price_per_ft: 30 }).eq("id", quote);
    expect(hintOf(direct.error)).toBe("quote_locked");
    expect((await quoteRow()).price_per_ft).toBe(24);
  });

  it("quote_revise is Keenan's alone", async () => {
    expect(hintOf((await revise(setter.client, { price_per_ft: 30 })).error)).toBe("not_allowed");
    expect((await revise(anon, { price_per_ft: 30 })).error).not.toBeNull();
    expect((await quoteRow()).price_per_ft).toBe(24);
  });

  it("keeps the option they said yes to on the quote and shown, or changes nothing", async () => {
    const hidden = OFFERS.map((offer) => (offer.id === "full" ? { ...offer, hidden: true } : offer));
    expect(hintOf((await revise(admin, { offers: hidden })).error)).toBe("bad_offer");
    const gone = OFFERS.filter((offer) => offer.id !== "full");
    expect(hintOf((await revise(admin, { offers: gone })).error)).toBe("bad_offer");
    expect(((await quoteRow()).offers as unknown as Offer[]).map((offer) => offer.id)).toContain("full");
  });

  it("saves the new numbers, moves a pending commission with them, and records what changed", async () => {
    const [before] = await commission();
    expect(before).toMatchObject({ status: "pending" });
    // 110 ft at $24 + the controller = $3,140 base; 5%.
    expect(before.base_amount).toBe(3140);
    const runs = [{ ...RUNS[0], feet: 70 }, RUNS[1]];
    const offers = OFFERS.map((offer) => (offer.id === "full" ? { ...offer, charges: [...offer.charges, { label: "Timer", amount: 80 }] } : offer));
    const changes = ["Front lower: $1,440 to $1,680 (70 ft)", "Added: Timer, $80"];
    const saved = await revise(admin, { runs, offers, total_feet: 120, subtotal: 3800, total: 3800 }, changes, 3640.56, 3960.56);
    expect(saved.error).toBeNull();
    expect(saved.data).toMatchObject({ ok: true, paid: false, commission: { before: before.amount } });
    const row = await quoteRow();
    expect([row.status, (row.runs as unknown as { feet: number }[])[0].feet, row.total_feet]).toEqual(["accepted", 70, 120]);
    // Charges and rush fees never count: 120 ft at $24 + the controller.
    const [after] = await commission();
    expect([after.id, after.status, after.base_amount, after.amount]).toEqual([before.id, "pending", 3380, Math.round(3380 * after.rate * 100) / 100]);

    const { data: revisions } = await admin.from("quote_revisions").select("total_before, total_after, changes, lead_id").eq("quote_id", quote);
    expect(revisions).toEqual([{ total_before: 3640.56, total_after: 3960.56, changes, lead_id: lead }]);
  });

  it("tells the customer's link when and what changed", async () => {
    const revised = (await customerView()).revised;
    expect(revised?.changes).toEqual(["Front lower: $1,440 to $1,680 (70 ft)", "Added: Timer, $80"]);
    expect(Number.isNaN(Date.parse(revised?.at ?? ""))).toBe(false);
  });

  it("keeps the changes Keenan's alone: no one else reads or writes them", async () => {
    expect((await setter.client.from("quote_revisions").select("id").eq("lead_id", lead)).data ?? []).toEqual([]);
    expect((await anon.from("quote_revisions").select("id").eq("lead_id", lead)).data ?? []).toEqual([]);
    const insert = await setter.client
      .from("quote_revisions")
      .insert({ quote_id: quote, lead_id: lead, total_before: 1, total_after: 2, changes: [] as unknown as Json });
    expect(insert.error).not.toBeNull();
    // Nothing about the change, and no amount, goes on the timeline setters read.
    const { data: events } = await admin.from("lead_events").select("payload").eq("lead_id", lead);
    expect(JSON.stringify(events ?? [])).not.toMatch(/Timer|3,960|3960/);
  });

  it("leaves a paid commission alone and says so", async () => {
    expect((await admin.rpc("lead_mark_installed", { p_lead: lead, p_on: calgaryDay(-1) })).error).toBeNull();
    const [payable] = await commission();
    expect((await admin.rpc("mark_earnings_paid", { p_ids: [payable.id] })).data).toBe(1);
    const saved = await revise(admin, { runs: [{ ...RUNS[0], feet: 80 }, RUNS[1]], total_feet: 130 }, ["Front lower: $1,680 to $1,920 (80 ft)"], 3960.56, 4200.56);
    expect(saved.error).toBeNull();
    expect(saved.data).toMatchObject({ ok: true, paid: true, commission: null });
    const [paid] = await commission();
    expect([paid.id, paid.status, paid.base_amount, paid.amount]).toEqual([payable.id, "paid", payable.base_amount, payable.amount]);
  });
});
