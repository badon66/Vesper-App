import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { commissionAmountCents, commissionFor, commissionQuoteFromRow } from "@/lib/pay/commission";
import type { Database, Json } from "@/types/database";

// Proves round 8 in the database itself (Keenan, 2026-11-09): only Keenan
// marks a quote Accepted, Declined or Cancelled, undoes an acceptance or
// marks a sold job Installed, and only through the outcome functions; an
// accepted quote's numbers are locked; the lead's setter earns the
// commission rate of the lights and control boxes after discounts, worked
// out from the stored quote (rush colour, upper access, every extra work
// line and the minimum top-up left out); it is coming on acceptance,
// payable once installed, paid in Pay, and voided with its reason when the
// sale is undone, cancelled or the lead leaves Sold, unless it was already
// paid. Timeline events never carry an amount or a typed note, and the
// install and sale dates are Keenan's to set.
//
// Two throwaway setters and an account with no profile, with test-prefixed
// emails; their leads are named "TEST LEAD (automated)". Everything made
// here is removed at the end, earnings before quotes before leads. The
// service role stands in for Keenan where only he may act: there is one
// owner account, Keenan's, and the tests never sign in as him.
//
// Run it (after the round 8 migrations are applied) with:
//   NODE_USE_ENV_PROXY=1 npm run test:rls -- tests/rls/quote-outcomes.test.ts

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  throw new Error(
    "RLS tests need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY. See .env.example.",
  );
}

type Client = SupabaseClient<Database>;
type QuoteInsert = Database["public"]["Tables"]["quotes"]["Insert"];
type LeadStatus = Database["public"]["Enums"]["lead_status"];
type EventType = Database["public"]["Enums"]["event_type"];
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin: Client = createClient<Database>(url, serviceKey, noSession);
const anon: Client = createClient<Database>(url, anonKey, noSession);
const stamp = Date.now().toString(36);
const TEST_LEAD = "TEST LEAD (automated)";
// Keenan's typed note for Other. It may live only on the quote.
const PRIVATE_NOTE = `Private outcome note ${stamp}`;

type TestUser = { email: string; password: string; id: string; client: Client };
const users: Record<"a" | "b" | "nobody", TestUser> = {
  a: { email: `rls-r8-a-${stamp}@example.com`, password: `Rls-r8-a-${stamp}-pass`, id: "", client: admin },
  b: { email: `rls-r8-b-${stamp}@example.com`, password: `Rls-r8-b-${stamp}-pass`, id: "", client: admin },
  nobody: { email: `rls-r8-none-${stamp}@example.com`, password: `Rls-r8-n-${stamp}-pass`, id: "", client: admin },
};

let ownerId = "";
let rate = 0;
let colour = { id: "", name: "" };
// Whether the quote-link rework's fee columns are on this project (they are
// on Keenan's; a fresh project built from main alone has none).
let reworkFees = false;
const leadsMade: string[] = [];

async function signedIn(email: string, password: string): Promise<Client> {
  const client = createClient<Database>(url!, anonKey!, noSession);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in failed for ${email}: ${error.message}`);
  return client;
}

const hintOf = (error: PostgrestError | null) => error?.hint ?? null;

// Calgary's date the way the app works it out: UTC-6 for good since
// Alberta stopped changing clocks on 2026-11-01 (see lib/time.ts).
function calgaryDay(offsetDays: number): string {
  const now = new Date();
  const zone = now.getTime() >= Date.UTC(2026, 10, 1, 8) ? "Etc/GMT+6" : "America/Edmonton";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(now);
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + offsetDays)).toISOString().slice(0, 10);
}

// A lead added by a setter at the door, with Keenan's track colour on it
// unless `withColour` is false.
async function newLead(user: TestUser, withColour = true): Promise<string> {
  const { data, error } = await user.client
    .from("leads")
    .insert({
      first_name: TEST_LEAD,
      address_line: `${Math.floor(Math.random() * 900) + 100} Test Street NW`,
      neighbourhood: "TEST (automated)",
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`lead: ${error?.message}`);
  leadsMade.push(data.id);
  if (withColour) {
    const set = await admin.from("leads").update({ track_colour_id: colour.id }).eq("id", data.id);
    if (set.error) throw new Error(`track colour: ${set.error.message}`);
  }
  return data.id;
}

async function setStatus(leadId: string, status: LeadStatus, extra: Database["public"]["Tables"]["leads"]["Update"] = {}) {
  const { error } = await admin.from("leads").update({ status, ...extra }).eq("id", leadId);
  if (error) throw new Error(`status ${status}: ${error.message}`);
}

// The quote every commission test prices. Hand-worked, at any rate:
//   feet      = 60 (60.4) + 25 (24.5) + 30 = 115; the run typed as text counts nothing
//   lights    = 2,350 cents x 115 = 270,250 cents
//   boxes     = 50,000 cents x 2 = 100,000 cents
//   discounts = 15,000 + 15,026 (150.255) = 30,026 cents; text and negative amounts count nothing
//   base      = 340,224 cents = $3,402.24
// Every part that is left out is on it: an extra work line, an upper-only
// line, rush colour (per foot, and the rework's flat fee), upper access and
// a minimum job total far above the total. The stored totals are nonsense
// on purpose: the commission never reads them.
const RUNS = [
  { name: "Front", feet: 60.4, level: "lower" },
  { name: "Garage", feet: 24.5, level: "lower" },
  { name: "Upper gable", feet: 30, level: "upper" },
  { name: "Typed by hand", feet: "12", level: "lower" },
];
const FULL_BASE_CENTS = 340_224;
// Start smaller with Front and Upper gable: 90 feet.
//   2,350 x 90 + 100,000 - 30,026 = 281,474 cents
const SMALLER_BASE_CENTS = 281_474;
// The full quote again at $25 a foot: 2,500 x 115 + 100,000 - 30,026.
const REPRICED_BASE_CENTS = 357_474;

async function newQuote(leadId: string, extra: Partial<QuoteInsert> = {}): Promise<string> {
  const row: Record<string, unknown> = {
    lead_id: leadId,
    created_by: ownerId,
    price_per_ft: 23.5,
    box_price: 500,
    box_count: 2,
    runs: RUNS as unknown as Json,
    total_feet: 115,
    adders: [
      { label: "Extra outlet", amount: 400 },
      { label: "Ladder work on the upper roof", amount: 250, upper_only: true },
    ],
    discounts: [
      { label: "Neighbour discount", amount: 150 },
      { label: "Referral credit", amount: 150.255 },
      { label: "Typed as text", amount: "75" },
      { label: "Below zero", amount: -50 },
    ],
    colour_timing: "rush",
    rush_fee_per_ft: 6,
    min_job_total: 99_999,
    gst_enabled: false,
    gst_rate: 0.05,
    subtotal: 88_888,
    total: 88_888,
    ...(reworkFees ? { rush_fee: 350, upper_access_fee: 200, upper_gable_access_fee: 400 } : {}),
    ...extra,
  };
  const { data, error } = await admin
    .from("quotes")
    .insert(row as QuoteInsert)
    .select("id")
    .single();
  if (error || !data) throw new Error(`quote: ${error?.message}`);
  return data.id;
}

const accept = (quote: string, args: { runs?: number[]; installOn?: string } = {}) =>
  admin.rpc("quote_accept", { p_quote: quote, p_runs: args.runs, p_install_on: args.installOn });
const decline = (quote: string, reason: string, note?: string) =>
  admin.rpc("quote_decline", { p_quote: quote, p_reason: reason, p_note: note });
const cancel = (quote: string, reason: string, note?: string) =>
  admin.rpc("quote_cancel", { p_quote: quote, p_reason: reason, p_note: note });
const undo = (quote: string) => admin.rpc("quote_undo_acceptance", { p_quote: quote });
const markInstalled = (lead: string, on: string | null) =>
  admin.rpc("lead_mark_installed", { p_lead: lead, p_on: on as string });

async function commissions(leadId: string) {
  const { data, error } = await admin
    .from("earnings")
    .select("id, profile_id, quote_id, source_quote_id, type, rate, base_amount, amount, status, payable_at, paid_at, note")
    .eq("lead_id", leadId)
    .eq("type", "commission")
    .order("created_at");
  if (error) throw new Error(`earnings: ${error.message}`);
  return data ?? [];
}

async function quoteRow(quoteId: string) {
  const { data, error } = await admin.from("quotes").select("*").eq("id", quoteId).single();
  if (error || !data) throw new Error(`quote row: ${error?.message}`);
  return data;
}

async function leadRow(leadId: string) {
  const { data, error } = await admin
    .from("leads")
    .select("status, lost_reason, install_on, sold_at, installed_at, follow_up_on")
    .eq("id", leadId)
    .single();
  if (error || !data) throw new Error(`lead row: ${error?.message}`);
  return data;
}

async function lastEvent(leadId: string, type: EventType) {
  const { data } = await admin
    .from("lead_events")
    .select("payload")
    .eq("lead_id", leadId)
    .eq("type", type)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  return data?.payload ?? null;
}

// What the database should have worked out, in dollars.
const dollars = (cents: number) => cents / 100;
const amountFor = (baseCents: number) => dollars(commissionAmountCents(baseCents, rate));

async function removeEverything() {
  const ids = Object.values(users).map((u) => u.id).filter(Boolean);
  const leadIds = new Set(leadsMade);
  if (ids.length > 0) {
    const { data: leads } = await admin.from("leads").select("id").in("created_by", ids);
    for (const lead of leads ?? []) leadIds.add(lead.id);
  }
  const allLeads = [...leadIds];
  if (allLeads.length > 0) await admin.from("earnings").delete().in("lead_id", allLeads);
  if (ids.length > 0) await admin.from("earnings").delete().in("profile_id", ids);
  if (allLeads.length > 0) await admin.from("quote_links").delete().in("lead_id", allLeads);
  if (allLeads.length > 0) await admin.from("quotes").delete().in("lead_id", allLeads);
  for (const id of ids) {
    await admin.from("leads").delete().eq("created_by", id);
    await admin.auth.admin.deleteUser(id);
  }
}

beforeAll(async () => {
  const { data: settings, error: settingsError } = await admin.from("settings").select("commission_rate").eq("id", 1).single();
  if (settingsError || !settings) throw new Error(`settings: ${settingsError?.message}`);
  rate = Number(settings.commission_rate);
  const { data: owner } = await admin.from("profiles").select("id").eq("role", "owner").single();
  if (!owner) throw new Error("no owner profile");
  ownerId = owner.id;
  const { data: stock } = await admin
    .from("track_colours")
    .select("id, name")
    .eq("active", true)
    .order("sort_order")
    .limit(1)
    .single();
  if (!stock) throw new Error("no active track colour");
  colour = stock;
  reworkFees = !(await admin.from("quotes").select("rush_fee, upper_access_fee, upper_gable_access_fee").limit(1)).error;

  for (const key of ["a", "b", "nobody"] as const) {
    const u = users[key];
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { full_name: `RLS Round8 ${key.toUpperCase()}` },
      app_metadata: key === "nobody" ? {} : { role: "sales" },
    });
    if (error || !data.user) throw new Error(`could not create ${u.email}: ${error?.message}`);
    u.id = data.user.id;
    u.client = await signedIn(u.email, u.password);
  }
});

afterAll(async () => {
  await removeEverything();
});

describe("only Keenan marks a quote's outcome", () => {
  it("a setter, an account with no profile and a signed-out visitor are refused every outcome function", async () => {
    const lead = await newLead(users.a);
    const quote = await newQuote(lead);
    for (const client of [users.a.client, users.nobody.client]) {
      const calls = [
        client.rpc("quote_accept", { p_quote: quote }),
        client.rpc("quote_decline", { p_quote: quote, p_reason: "price" }),
        client.rpc("quote_cancel", { p_quote: quote, p_reason: "price" }),
        client.rpc("quote_undo_acceptance", { p_quote: quote }),
        client.rpc("lead_mark_installed", { p_lead: lead, p_on: calgaryDay(0) }),
      ];
      for (const { error } of await Promise.all(calls)) {
        expect(error?.code).toBe("42501");
        expect(hintOf(error)).toBe("not_allowed");
      }
    }
    const anonCalls = await Promise.all([
      anon.rpc("quote_accept", { p_quote: quote }),
      anon.rpc("quote_decline", { p_quote: quote, p_reason: "price" }),
      anon.rpc("quote_cancel", { p_quote: quote, p_reason: "price" }),
      anon.rpc("quote_undo_acceptance", { p_quote: quote }),
      anon.rpc("lead_mark_installed", { p_lead: lead, p_on: calgaryDay(0) }),
    ]);
    for (const { error } of anonCalls) expect(error).not.toBeNull();

    // The base is an internal helper: nobody calls it from the app.
    for (const client of [users.a.client, anon]) {
      const { error } = await client.rpc("quote_commission_base", { p_quote: quote, p_runs: null as unknown as number[] });
      expect(error).not.toBeNull();
    }

    expect((await quoteRow(quote)).status).toBe("draft");
    expect((await leadRow(lead)).status).toBe("new");
    expect(await commissions(lead)).toEqual([]);
  });

  it("nobody sets an outcome on a quote directly, not even Keenan's own session; only the functions do", async () => {
    const lead = await newLead(users.a);
    const quote = await newQuote(lead);
    for (const status of ["accepted", "declined", "cancelled"] as const) {
      const { error } = await admin.from("quotes").update({ status }).eq("id", quote);
      expect(error?.code).toBe("42501");
      expect(hintOf(error)).toBe("outcome_only");
    }
    const inserted = await admin
      .from("quotes")
      .insert({ lead_id: lead, created_by: ownerId, price_per_ft: 23, box_price: 500, gst_rate: 0.05, status: "accepted" });
    expect(hintOf(inserted.error)).toBe("outcome_only");
    // Presented is not an outcome.
    expect((await admin.from("quotes").update({ status: "presented" }).eq("id", quote)).error).toBeNull();
    expect((await admin.from("quotes").update({ status: "draft" }).eq("id", quote)).error).toBeNull();
  });
});

describe("Accepted", () => {
  it("needs a track colour on the lead first", async () => {
    const lead = await newLead(users.a, false);
    const quote = await newQuote(lead);
    const { error } = await accept(quote);
    expect(error?.code).toBe("P0001");
    expect(hintOf(error)).toBe("track_colour_needed");
    expect((await quoteRow(quote)).status).toBe("draft");
    expect((await leadRow(lead)).status).toBe("new");
    expect(await commissions(lead)).toEqual([]);
  });

  it("moves the lead to Sold and makes one pending commission for the lead's setter, at exactly the formula's amount", async () => {
    const lead = await newLead(users.a);
    const quote = await newQuote(lead);
    const installOn = calgaryDay(12);
    const { data, error } = await accept(quote, { installOn });
    expect(error).toBeNull();
    const amount = amountFor(FULL_BASE_CENTS);
    expect(data).toEqual({ commission: { profile_id: users.a.id, amount }, reason: null });

    const rows = await commissions(lead);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      profile_id: users.a.id,
      quote_id: quote,
      source_quote_id: quote,
      type: "commission",
      rate,
      base_amount: dollars(FULL_BASE_CENTS),
      amount,
      status: "pending",
      payable_at: null,
      paid_at: null,
    });

    // The TypeScript mirror gives exactly the database's numbers.
    const stored = await quoteRow(quote);
    expect(commissionFor(commissionQuoteFromRow(stored, null), rate)).toEqual({ base: dollars(FULL_BASE_CENTS), amount });

    expect(stored).toMatchObject({
      status: "accepted",
      accepted_runs: null,
      accepted_by: null, // the service role stood in for Keenan
      lead_status_before: "new",
      decline_reason: null,
      cancel_reason: null,
      cancelled_at: null,
      declined_at: null,
      outcome_note: null,
      track_colour_name: colour.name,
      track_ral_code: null,
      track_custom: false,
    });
    expect(stored.accepted_at).not.toBeNull();

    const after = await leadRow(lead);
    expect(after).toMatchObject({ status: "sold", install_on: installOn, installed_at: null });
    expect(after.sold_at).not.toBeNull();
    expect(await lastEvent(lead, "quote_accepted")).toEqual({ quote_id: quote, install_on: installOn });

    // An unpaid commission lets go of its quote only when it is voided.
    const letGo = await admin.from("earnings").update({ quote_id: null }).eq("id", rows[0].id);
    expect(letGo.error?.code).toBe("42501");
  });

  it("pays the lead's assigned setter, and nothing on a lead assigned to Keenan", async () => {
    const handed = await newLead(users.a);
    expect((await admin.from("leads").update({ assigned_to: users.b.id }).eq("id", handed)).error).toBeNull();
    const handedQuote = await newQuote(handed);
    const toB = await accept(handedQuote);
    expect(toB.error).toBeNull();
    expect((await commissions(handed)).map((row) => row.profile_id)).toEqual([users.b.id]);

    const keenans = await newLead(users.a);
    expect((await admin.from("leads").update({ assigned_to: ownerId }).eq("id", keenans)).error).toBeNull();
    const quote = await newQuote(keenans);
    const { data, error } = await accept(quote);
    expect(error).toBeNull();
    expect(data).toEqual({ commission: null, reason: "owner_lead" });
    expect(await commissions(keenans)).toEqual([]);
    expect((await leadRow(keenans)).status).toBe("sold");
  });

  it("a Start smaller acceptance counts only its own runs; every run is the full quote; other positions are refused", async () => {
    const lead = await newLead(users.a);
    const quote = await newQuote(lead);
    for (const runs of [[], [4], [0, 0], [-1]]) {
      const { error } = await accept(quote, { runs });
      expect(hintOf(error)).toBe("bad_runs");
    }
    expect((await quoteRow(quote)).status).toBe("draft");

    const { data, error } = await accept(quote, { runs: [2, 0] });
    expect(error).toBeNull();
    const amount = amountFor(SMALLER_BASE_CENTS);
    expect(data).toEqual({ commission: { profile_id: users.a.id, amount }, reason: null });
    const stored = await quoteRow(quote);
    expect(stored.accepted_runs).toEqual([0, 2]);
    expect(await commissions(lead)).toMatchObject([{ base_amount: dollars(SMALLER_BASE_CENTS), amount }]);
    expect(commissionFor(commissionQuoteFromRow(stored, stored.accepted_runs), rate)).toEqual({
      base: dollars(SMALLER_BASE_CENTS),
      amount,
    });

    const whole = await newLead(users.a);
    const wholeQuote = await newQuote(whole);
    expect((await accept(wholeQuote, { runs: [3, 2, 1, 0] })).error).toBeNull();
    expect((await quoteRow(wholeQuote)).accepted_runs).toBeNull();
    expect(await commissions(whole)).toMatchObject([{ base_amount: dollars(FULL_BASE_CENTS) }]);
  });

  it("locks the accepted quote's numbers and keeps one accepted quote per lead", async () => {
    const lead = await newLead(users.a);
    const quote = await newQuote(lead);
    const other = await newQuote(lead);
    expect((await accept(quote)).error).toBeNull();

    for (const change of [{ price_per_ft: 30 }, { box_count: 3 }, { runs: [] as Json }, { discounts: [] as Json }, { valid_until: "2030-01-01" }]) {
      const { error } = await admin.from("quotes").update(change).eq("id", quote);
      expect(error?.code).toBe("42501");
      expect(hintOf(error)).toBe("quote_locked");
    }
    // Notes are not numbers.
    expect((await admin.from("quotes").update({ notes: "Bring the long ladder" }).eq("id", quote)).error).toBeNull();
    // Nor can it be taken out of accepted except by Undo or Cancel.
    expect(hintOf((await admin.from("quotes").update({ status: "draft" }).eq("id", quote)).error)).toBe("outcome_only");

    expect(Number((await quoteRow(quote)).price_per_ft)).toBe(23.5);
    expect(hintOf((await accept(quote)).error)).toBe("not_open");
    expect(hintOf((await accept(other)).error)).toBe("already_accepted");
    // Declining another quote must not send a sold lead to Lost.
    expect(hintOf((await decline(other, "price")).error)).toBe("already_accepted");
    expect((await leadRow(lead)).status).toBe("sold");
    expect(await commissions(lead)).toHaveLength(1);
  });
});

describe("Declined", () => {
  it("makes the lead Lost: price with no commission; the note for Other stays on the quote", async () => {
    const lead = await newLead(users.a);
    const quote = await newQuote(lead);
    expect(hintOf((await decline(quote, "too expensive")).error)).toBe("bad_reason");
    expect(hintOf((await decline(quote, "price", "A note")).error)).toBe("bad_note");
    expect(hintOf((await decline(quote, "other", "x".repeat(301))).error)).toBe("bad_note");
    expect((await quoteRow(quote)).status).toBe("draft");

    expect((await decline(quote, "price")).error).toBeNull();
    const stored = await quoteRow(quote);
    expect(stored).toMatchObject({ status: "declined", decline_reason: "price", outcome_note: null });
    expect(stored.declined_at).not.toBeNull();
    expect(await leadRow(lead)).toMatchObject({ status: "lost", lost_reason: "price" });
    expect(await commissions(lead)).toEqual([]);
    expect(await lastEvent(lead, "quote_declined")).toEqual({ quote_id: quote, reason: "price" });

    expect(hintOf((await decline(quote, "price")).error)).toBe("not_open");
    expect(hintOf((await cancel(quote, "price")).error)).toBe("not_accepted");
    expect(hintOf((await undo(quote)).error)).toBe("not_undoable");

    const other = await newLead(users.a);
    const otherQuote = await newQuote(other);
    expect((await decline(otherQuote, "other", `  ${PRIVATE_NOTE}  `)).error).toBeNull();
    expect(await quoteRow(otherQuote)).toMatchObject({ decline_reason: "other", outcome_note: PRIVATE_NOTE });
    expect(await leadRow(other)).toMatchObject({ status: "lost", lost_reason: "other" });
  });

  it("a customer who comes back: a declined quote can be accepted, and the decline is cleared", async () => {
    const lead = await newLead(users.a);
    const quote = await newQuote(lead);
    expect((await decline(quote, "timing")).error).toBeNull();
    expect((await accept(quote)).error).toBeNull();
    expect(await quoteRow(quote)).toMatchObject({
      status: "accepted",
      decline_reason: null,
      declined_at: null,
      lead_status_before: "met", // it was Lost, which Undo never goes back to
    });
    expect(await leadRow(lead)).toMatchObject({ status: "sold", lost_reason: null });
    expect(await commissions(lead)).toMatchObject([{ status: "pending", amount: amountFor(FULL_BASE_CENTS) }]);
  });
});

describe("Cancelled", () => {
  it("voids the unpaid commission with the reason and lets go of the quote; accepting again makes a new one", async () => {
    const lead = await newLead(users.a);
    const quote = await newQuote(lead);
    expect(hintOf((await cancel(quote, "timing")).error)).toBe("not_accepted");
    expect((await accept(quote, { installOn: calgaryDay(20) })).error).toBeNull();
    expect(hintOf((await cancel(quote, "changed their mind")).error)).toBe("bad_reason");
    expect(hintOf((await cancel(quote, "timing", "A note")).error)).toBe("bad_note");

    expect((await cancel(quote, "timing")).error).toBeNull();
    const [voided] = await commissions(lead);
    expect(voided).toMatchObject({ status: "void", note: "Cancelled: timing", quote_id: null, source_quote_id: quote });
    const stored = await quoteRow(quote);
    expect(stored).toMatchObject({ status: "cancelled", cancel_reason: "timing", outcome_note: null });
    expect(stored.cancelled_at).not.toBeNull();
    expect(stored.accepted_at).not.toBeNull(); // kept, so the screen can say when it was accepted
    expect(await leadRow(lead)).toMatchObject({ status: "lost", lost_reason: "cancelled, timing", install_on: null, sold_at: null });
    expect(await lastEvent(lead, "quote_cancelled")).toEqual({ quote_id: quote, reason: "timing", inside_window: true });

    expect((await accept(quote)).error).toBeNull();
    const rows = await commissions(lead);
    expect(rows.map((row) => row.status)).toEqual(["void", "pending"]);
    expect(rows[1]).toMatchObject({ quote_id: quote, source_quote_id: quote, amount: amountFor(FULL_BASE_CENTS) });
    expect(await quoteRow(quote)).toMatchObject({ status: "accepted", cancel_reason: null, cancelled_at: null });

    // Other, with Keenan's note on the quote only.
    expect((await cancel(quote, "other", PRIVATE_NOTE)).error).toBeNull();
    expect(await quoteRow(quote)).toMatchObject({ cancel_reason: "other", outcome_note: PRIVATE_NOTE });
    expect(await leadRow(lead)).toMatchObject({ lost_reason: "cancelled, other" });
    expect((await commissions(lead)).map((row) => row.note)).toEqual(["Cancelled: timing", "Cancelled: other"]);
  });
});

describe("Undo acceptance", () => {
  it("voids the unpaid commission, puts the quote back to a draft and the lead back where it was", async () => {
    const lead = await newLead(users.a);
    await setStatus(lead, "met");
    const quote = await newQuote(lead);
    expect((await accept(quote, { installOn: calgaryDay(15) })).error).toBeNull();

    expect((await undo(quote)).error).toBeNull();
    expect(await commissions(lead)).toMatchObject([
      { status: "void", note: "Acceptance undone", quote_id: null, source_quote_id: quote },
    ]);
    expect(await quoteRow(quote)).toMatchObject({
      status: "draft",
      accepted_at: null,
      accepted_by: null,
      accepted_runs: null,
      lead_status_before: null,
    });
    expect(await leadRow(lead)).toMatchObject({ status: "met", install_on: null, sold_at: null });
    expect(await lastEvent(lead, "quote_acceptance_undone")).toEqual({ quote_id: quote });
    expect(hintOf((await undo(quote)).error)).toBe("not_undoable");

    // Changed numbers, accepted again: a new commission at the new amount.
    expect((await admin.from("quotes").update({ price_per_ft: 25 }).eq("id", quote)).error).toBeNull();
    const again = await accept(quote);
    expect(again.error).toBeNull();
    const amount = amountFor(REPRICED_BASE_CENTS);
    expect(again.data).toEqual({ commission: { profile_id: users.a.id, amount }, reason: null });
    const rows = await commissions(lead);
    expect(rows.map((row) => row.status)).toEqual(["void", "pending"]);
    expect(rows[1]).toMatchObject({ quote_id: quote, base_amount: dollars(REPRICED_BASE_CENTS), amount });
  });

  it("a lead that was in Follow up goes back to Follow up, due tomorrow", async () => {
    const lead = await newLead(users.a);
    await setStatus(lead, "follow_up", { follow_up_on: calgaryDay(3) });
    const quote = await newQuote(lead);
    expect((await accept(quote)).error).toBeNull();
    expect((await quoteRow(quote)).lead_status_before).toBe("follow_up");
    expect((await undo(quote)).error).toBeNull();
    expect(await leadRow(lead)).toMatchObject({ status: "follow_up", follow_up_on: calgaryDay(1) });
  });
});

describe("Installed and paid", () => {
  it("installed makes the commission payable and Pay pays it; a paid commission survives Undo and Cancel and blocks a second", async () => {
    const lead = await newLead(users.a);
    const quote = await newQuote(lead);
    expect(hintOf((await markInstalled(lead, calgaryDay(-1))).error)).toBe("not_sold");
    expect((await accept(quote)).error).toBeNull();
    expect(hintOf((await markInstalled(lead, calgaryDay(1))).error)).toBe("bad_date");
    expect(hintOf((await markInstalled(lead, null)).error)).toBe("bad_date");

    const day = calgaryDay(-1);
    expect((await markInstalled(lead, day)).error).toBeNull();
    const installed = await leadRow(lead);
    expect(installed.status).toBe("installed");
    // Noon in Calgary, UTC-6 since November 1, 2026.
    expect(new Date(installed.installed_at!).toISOString()).toBe(`${day}T18:00:00.000Z`);
    expect(installed.sold_at).not.toBeNull();
    // The status change logs itself on the timeline, like every other.
    const { data: logged } = await admin
      .from("lead_events")
      .select("from_status, to_status")
      .eq("lead_id", lead)
      .eq("type", "status_change")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(logged).toEqual({ from_status: "sold", to_status: "installed" });
    const [payable] = await commissions(lead);
    expect(payable.status).toBe("pending");
    expect(payable.payable_at).not.toBeNull();

    expect(hintOf((await undo(quote)).error)).toBe("not_undoable");
    expect(hintOf((await markInstalled(lead, day)).error)).toBe("not_sold");

    expect(hintOf((await users.a.client.rpc("mark_earnings_paid", { p_ids: [payable.id] })).error)).toBe("not_allowed");
    expect((await admin.rpc("mark_earnings_paid", { p_ids: [payable.id] })).data).toBe(1);
    const paid = (await commissions(lead))[0];
    expect(paid.status).toBe("paid");
    expect(paid.paid_at).not.toBeNull();
    expect((await admin.from("earnings").update({ quote_id: null, status: "void" }).eq("id", paid.id)).error?.code).toBe("42501");

    // Cancelled after it was paid: the commission stays paid.
    expect((await cancel(quote, "price")).error).toBeNull();
    expect(await commissions(lead)).toMatchObject([{ id: paid.id, status: "paid", quote_id: quote }]);
    expect(await leadRow(lead)).toMatchObject({ status: "lost", lost_reason: "cancelled, price" });

    // Accepted again: no second commission while one is paid.
    const again = await accept(quote);
    expect(again.error).toBeNull();
    expect(again.data).toEqual({ commission: null, reason: "already_paid" });
    expect(await commissions(lead)).toHaveLength(1);

    // Undone: still paid; accepted again: still one.
    expect((await undo(quote)).error).toBeNull();
    expect(await commissions(lead)).toMatchObject([{ id: paid.id, status: "paid" }]);
    expect((await accept(quote)).data).toEqual({ commission: null, reason: "already_paid" });
    expect(await commissions(lead)).toHaveLength(1);
  });
});

describe("the safety net on a lead's status", () => {
  it("keeps the commission in step when the status changes by any other path", async () => {
    const lead = await newLead(users.a);
    const quote = await newQuote(lead);
    expect((await accept(quote)).error).toBeNull();

    await setStatus(lead, "installed");
    expect((await commissions(lead))[0].payable_at).not.toBeNull();
    await setStatus(lead, "sold");
    expect((await commissions(lead))[0]).toMatchObject({ status: "pending", payable_at: null });
    await setStatus(lead, "met");
    expect(await commissions(lead)).toMatchObject([
      { status: "void", note: "The lead left Sold", quote_id: null, source_quote_id: quote },
    ]);
  });
});

// The review's fixes (2026-11-10): a way back from Installed, the customer's
// link closing with a no or a cancel, no second quote while one stands for
// the sale, Undo after the meeting has happened, and the planned install
// day on the timeline.
const TOKEN_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
async function liveLink(leadId: string): Promise<string> {
  const token = Array.from({ length: 24 }, () => TOKEN_CHARS[Math.floor(Math.random() * TOKEN_CHARS.length)]).join("");
  const { data, error } = await admin
    .from("quote_links")
    .insert({ lead_id: leadId, token, created_by: users.a.id })
    .select("id")
    .single();
  if (error || !data) throw new Error(`link: ${error?.message}`);
  return data.id;
}
async function linkRevoked(linkId: string): Promise<boolean> {
  const { data } = await admin.from("quote_links").select("revoked_at").eq("id", linkId).single();
  return Boolean(data?.revoked_at);
}

describe("after the review", () => {
  it("Not installed yet puts an Installed lead back to Sold, for Keenan only; an owed commission waits for the install again", async () => {
    const lead = await newLead(users.a);
    const quote = await newQuote(lead);
    expect((await accept(quote)).error).toBeNull();
    expect(hintOf((await admin.rpc("lead_undo_installed", { p_lead: lead })).error)).toBe("not_installed");
    expect((await markInstalled(lead, calgaryDay(-1))).error).toBeNull();
    expect((await commissions(lead))[0].payable_at).not.toBeNull();

    expect(hintOf((await users.a.client.rpc("lead_undo_installed", { p_lead: lead })).error)).toBe("not_allowed");
    expect(hintOf((await users.b.client.rpc("lead_undo_installed", { p_lead: lead })).error)).toBe("not_allowed");
    expect((await anon.rpc("lead_undo_installed", { p_lead: lead })).error).not.toBeNull();
    expect((await leadRow(lead)).status).toBe("installed");

    expect((await admin.rpc("lead_undo_installed", { p_lead: lead })).error).toBeNull();
    const back = await leadRow(lead);
    expect(back.status).toBe("sold");
    expect(back.installed_at).toBeNull();
    expect(back.sold_at).not.toBeNull();
    expect(await commissions(lead)).toMatchObject([{ status: "pending", payable_at: null }]);
    const { data: logged } = await admin
      .from("lead_events")
      .select("from_status, to_status")
      .eq("lead_id", lead)
      .eq("type", "status_change")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(logged).toEqual({ from_status: "installed", to_status: "sold" });

    // Installed again on the right day: owed again.
    expect((await markInstalled(lead, calgaryDay(0))).error).toBeNull();
    expect((await commissions(lead))[0].payable_at).not.toBeNull();
  });

  it("a cancel after Installed voids the owed commission, and the customer's link closes", async () => {
    const lead = await newLead(users.a);
    const quote = await newQuote(lead);
    const link = await liveLink(lead);
    expect((await accept(quote)).error).toBeNull();
    expect(await linkRevoked(link)).toBe(false);
    expect((await markInstalled(lead, calgaryDay(-1))).error).toBeNull();

    expect((await cancel(quote, "timing")).error).toBeNull();
    expect(await commissions(lead)).toMatchObject([{ status: "void", note: "Cancelled: timing", quote_id: null }]);
    expect(await leadRow(lead)).toMatchObject({ status: "lost", lost_reason: "cancelled, timing", installed_at: null });
    expect(await linkRevoked(link)).toBe(true);
    expect(await lastEvent(lead, "quote_link_revoked")).toEqual({ link_id: link });
  });

  it("a decline closes the customer's link too", async () => {
    const lead = await newLead(users.a);
    const quote = await newQuote(lead);
    const link = await liveLink(lead);
    expect((await decline(quote, "price")).error).toBeNull();
    expect(await linkRevoked(link)).toBe(true);
  });

  it("no new quote starts on a lead whose quote is accepted, until the acceptance is undone", async () => {
    const lead = await newLead(users.a);
    const quote = await newQuote(lead);
    expect((await accept(quote)).error).toBeNull();
    const { error } = await admin
      .from("quotes")
      .insert({ lead_id: lead, created_by: ownerId, price_per_ft: 23, box_price: 500, box_count: 1, total_feet: 10, subtotal: 730, total: 730 } as QuoteInsert);
    expect(error?.code).toBe("42501");
    expect(hintOf(error)).toBe("quote_locked");
    expect((await undo(quote)).error).toBeNull();
    await expect(newQuote(lead)).resolves.toBeTruthy();
  });

  it("Undo sends a lead whose meeting has passed back to Met, not Meeting booked", async () => {
    const lead = await newLead(users.a);
    await setStatus(lead, "meeting_booked");
    const quote = await newQuote(lead);
    expect((await accept(quote)).error).toBeNull();
    expect((await quoteRow(quote)).lead_status_before).toBe("meeting_booked");
    expect((await undo(quote)).error).toBeNull();
    expect((await leadRow(lead)).status).toBe("met");
  });

  it("a change to the planned install day goes on the timeline; the day set with Accepted does not add a second line", async () => {
    const lead = await newLead(users.a);
    const quote = await newQuote(lead);
    const edits = async () => {
      const { data } = await admin.from("lead_events").select("payload").eq("lead_id", lead).eq("type", "edited");
      return (data ?? []).filter((row) => JSON.stringify(row.payload).includes("install_on"));
    };
    expect((await accept(quote, { installOn: calgaryDay(7) })).error).toBeNull();
    expect(await edits()).toHaveLength(0);
    expect((await admin.from("leads").update({ install_on: calgaryDay(9) }).eq("id", lead)).error).toBeNull();
    const after = await edits();
    expect(after).toHaveLength(1);
    expect(after[0].payload).toEqual({ fields: ["install_on"] });
  });
});

// Round 9 (2026-11-10): Accepted chooses an option by its id. The option's
// own runs and boxes decide the commission; the quote records which option
// it was, and Undo clears it.
describe("accepting an option", () => {
  // Start smaller's runs (Front and Upper gable, 90 ft) as an option with
  // two boxes: 2,350 x 90 + 50,000 x 2 - 30,026 = 281,474 cents, the same
  // base as SMALLER_BASE_CENTS because the quote has two boxes too; with
  // three boxes it is 331,474.
  const OPTION_THREE_BOXES_CENTS = 331_474;
  const offers = [
    { id: "full", name: "Full wrap", runs: [0, 1, 2, 3] },
    { id: "smaller", name: "Front and gable", runs: [0, 2], boxes: 3 },
    { id: "empty", name: "Front only", runs: [] },
  ];

  it("records the option, its runs and boxes, and pays commission on that option's lights and boxes", async () => {
    const lead = await newLead(users.a);
    const quote = await newQuote(lead, { offers: offers as unknown as Json, meeting_offer: "smaller", meeting_install_on: calgaryDay(9) });
    expect(hintOf((await users.a.client.rpc("quote_accept_offer", { p_quote: quote, p_offer: "smaller" })).error)).toBe("not_allowed");
    expect((await anon.rpc("quote_accept_offer", { p_quote: quote, p_offer: "smaller" })).error).not.toBeNull();
    expect(hintOf((await admin.rpc("quote_accept_offer", { p_quote: quote, p_offer: "nope" })).error)).toBe("bad_offer");
    expect(hintOf((await admin.rpc("quote_accept_offer", { p_quote: quote, p_offer: "empty" })).error)).toBe("bad_runs");

    const { data, error } = await admin.rpc("quote_accept_offer", { p_quote: quote, p_offer: "smaller", p_install_on: calgaryDay(9) });
    expect(error).toBeNull();
    const amount = amountFor(OPTION_THREE_BOXES_CENTS);
    expect(data).toEqual({ commission: { profile_id: users.a.id, amount }, reason: null });
    expect(await quoteRow(quote)).toMatchObject({ status: "accepted", accepted_offer: "smaller", accepted_boxes: 3, accepted_runs: [0, 2] });
    expect(await commissions(lead)).toMatchObject([{ base_amount: dollars(OPTION_THREE_BOXES_CENTS), amount, status: "pending" }]);
    expect(await leadRow(lead)).toMatchObject({ status: "sold", install_on: calgaryDay(9) });
    // The timeline names the option, never an amount.
    const event = await lastEvent(lead, "quote_accepted");
    expect(event).toMatchObject({ quote_id: quote, option: "Front and gable" });
    expect(Object.keys(event as object).sort()).toEqual(["install_on", "option", "quote_id"]);
    expect(JSON.stringify(event)).not.toContain("$");

    // Undo clears what was accepted.
    expect((await undo(quote)).error).toBeNull();
    expect(await quoteRow(quote)).toMatchObject({ status: "draft", accepted_offer: null, accepted_boxes: null, accepted_runs: null });
  });

  it("the full wrap is every run, and a quote made before offers accepts its implicit full wrap", async () => {
    const lead = await newLead(users.a);
    const quote = await newQuote(lead);
    expect((await admin.rpc("quote_accept_offer", { p_quote: quote, p_offer: "full" })).error).toBeNull();
    expect(await quoteRow(quote)).toMatchObject({ accepted_offer: "full", accepted_runs: null, accepted_boxes: 2 });
    expect(await commissions(lead)).toMatchObject([{ base_amount: dollars(FULL_BASE_CENTS), amount: amountFor(FULL_BASE_CENTS) }]);
  });

  it("the table's pick and day save on a draft, and lock with the accepted quote", async () => {
    const lead = await newLead(users.a);
    const quote = await newQuote(lead, { offers: offers as unknown as Json });
    expect((await admin.from("quotes").update({ meeting_offer: "smaller", meeting_install_on: calgaryDay(5) }).eq("id", quote)).error).toBeNull();
    // A setter reads no quote at all.
    expect((await users.a.client.from("quotes").select("meeting_offer").eq("id", quote)).data ?? []).toEqual([]);
    expect((await admin.rpc("quote_accept_offer", { p_quote: quote, p_offer: "full" })).error).toBeNull();
    expect(hintOf((await admin.from("quotes").update({ meeting_offer: "full" }).eq("id", quote)).error)).toBe("quote_locked");
  });
});

describe("who reads what", () => {
  it("each setter reads only their own earnings; another setter, an account with no profile and anon read none", async () => {
    const mine = await users.a.client.from("earnings").select("profile_id, type").eq("type", "commission");
    expect(mine.error).toBeNull();
    expect((mine.data ?? []).length).toBeGreaterThan(0);
    expect((mine.data ?? []).every((row) => row.profile_id === users.a.id)).toBe(true);

    const bOwn = await users.b.client.from("earnings").select("profile_id").eq("type", "commission");
    expect((bOwn.data ?? []).length).toBe(1);
    expect((bOwn.data ?? []).every((row) => row.profile_id === users.b.id)).toBe(true);
    expect((await users.b.client.from("earnings").select("id").eq("profile_id", users.a.id)).data ?? []).toEqual([]);

    for (const client of [users.nobody.client, anon]) {
      expect((await client.from("earnings").select("id")).data ?? []).toEqual([]);
    }
    // The quote, its outcome and its note stay Keenan's.
    expect((await users.a.client.from("quotes").select("id, outcome_note").in("lead_id", leadsMade)).data ?? []).toEqual([]);
  });

  it("every setter reads the planned install date; nobody but Keenan sets it, the sale date or the install date", async () => {
    const lead = await newLead(users.a);
    const quote = await newQuote(lead);
    const installOn = calgaryDay(30);
    expect((await accept(quote, { installOn })).error).toBeNull();
    for (const user of [users.a, users.b]) {
      const { data, error } = await user.client.from("leads").select("id, install_on").eq("id", lead).single();
      expect(error).toBeNull();
      expect(data?.install_on).toBe(installOn);
    }

    const own = await newLead(users.a, false);
    for (const change of [
      { install_on: calgaryDay(5) },
      { sold_at: new Date().toISOString() },
      { installed_at: new Date().toISOString() },
    ]) {
      const { error } = await users.a.client.from("leads").update(change).eq("id", own);
      expect(error?.code).toBe("42501");
    }
    const onInsert = await users.a.client
      .from("leads")
      .insert({ first_name: TEST_LEAD, address_line: "8 Test Street NW", created_by: users.a.id, install_on: calgaryDay(5) });
    expect(onInsert.error?.code).toBe("42501");

    // A setter's own moves between New, Follow up and Lost still work.
    expect((await users.a.client.from("leads").update({ status: "lost", lost_reason: "price" }).eq("id", own)).error).toBeNull();
    expect((await users.a.client.from("leads").update({ status: "new" }).eq("id", own)).error).toBeNull();
    expect(await leadRow(own)).toMatchObject({ status: "new", install_on: null, sold_at: null, installed_at: null });
  });

  it("timeline events and commission notes carry no amount and no typed note", async () => {
    const { data: events, error } = await admin
      .from("lead_events")
      .select("type, payload")
      .in("lead_id", leadsMade)
      .in("type", ["quote_accepted", "quote_declined", "quote_cancelled", "quote_acceptance_undone", "status_change"]);
    expect(error).toBeNull();
    const outcomeEvents = (events ?? []).filter((event) => event.type !== "status_change");
    expect(outcomeEvents.length).toBeGreaterThan(5);
    // option: the accepted option's name (round 9), a name Keenan gave it, never an amount.
    const allowed = new Set(["quote_id", "install_on", "reason", "inside_window", "follow_up_on", "option"]);
    for (const event of events ?? []) {
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      expect(Object.keys(payload).filter((key) => !allowed.has(key))).toEqual([]);
      expect(JSON.stringify(payload)).not.toContain(PRIVATE_NOTE);
    }

    const { data: notes } = await admin.from("earnings").select("note").in("lead_id", leadsMade);
    expect((notes ?? []).some((row) => (row.note ?? "").includes(PRIVATE_NOTE))).toBe(false);
    const { data: reasons } = await admin.from("leads").select("lost_reason").in("id", leadsMade);
    expect((reasons ?? []).some((row) => (row.lost_reason ?? "").includes(PRIVATE_NOTE))).toBe(false);
  });
});
