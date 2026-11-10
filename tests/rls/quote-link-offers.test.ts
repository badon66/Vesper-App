import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseOffers } from "@/lib/quotes/offers";
import type { Database, Json } from "@/types/database";

// Proves round 9's offers on the customer's link in the database itself
// (Keenan, 2026-11-10): quote_for_customer hands the page the quote's offers
// cleaned (an id, a name and runs, nothing else), and an empty list as one
// Full wrap; the customer's taps on an offer go through their token only:
// quote_link_select_offer records the offer they are looking at and nothing
// else, and quote_link_book_offer records the offer they booked, its name
// and its runs, puts it on the timeline once per new offer with no amount,
// and never accepts the quote or pays anyone; unknown offers, offers with
// no runs, other quotes' offers and revoked links are refused; a setter and
// a signed-out visitor can't read or write the offers or the link's offer
// columns directly.
//
// One throwaway setter with a test-prefixed email; the leads are named
// "TEST LEAD (automated)". The service role stands in for Keenan where only
// he may act (the quotes and the links): there is one owner account,
// Keenan's, and the tests never sign in as him. The links are handed to the
// throwaway setter as their maker, so nothing here returns Keenan's push
// addresses. Everything made here is removed at the end, links before
// quotes before leads.
//
// Run it (after 20261110101844_round9_offers.sql is applied) with:
//   NODE_USE_ENV_PROXY=1 npm run test:rls -- tests/rls/quote-link-offers.test.ts

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  throw new Error(
    "RLS tests need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY. See .env.example.",
  );
}

type Client = SupabaseClient<Database>;
type LinkRow = Database["public"]["Tables"]["quote_links"]["Row"];
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin: Client = createClient<Database>(url, serviceKey, noSession);
const anon: Client = createClient<Database>(url, anonKey, noSession);
const stamp = Date.now().toString(36);
const TEST_LEAD = "TEST LEAD (automated)";
const INTERNAL = `INTERNAL offer note ${stamp}, never shown to a customer`;

type TestUser = { email: string; password: string; id: string; client: Client };
const setter: TestUser = {
  email: `rls-offers-${stamp}@example.com`,
  password: `Rls-offers-${stamp}-pass`,
  id: "",
  client: admin,
};

let ownerId = "";
let leadA = "";
let leadB = "";
let quoteA = "";
let quoteB = "";
let tokenA = "";
let tokenB = "";

const RUNS = [
  { name: "Front", feet: 60, level: "lower", part: "eave" },
  { name: "Garage", feet: 30, level: "lower", part: "garage" },
  { name: "Upper front", feet: 40, level: "upper", part: "eave" },
];

// Quote A's offers as stored, with what the database must clean away: a
// price and a note on an offer, padded ids and names, runs that repeat,
// come as text, aren't whole numbers or aren't on the quote, an offer with
// no runs yet, and items that aren't offers at all.
const OFFERS_A = [
  { id: "full", name: "Full wrap", runs: [0, 1, 2], price: 4321, cost: 1234, note: INTERNAL },
  { id: " lower ", name: "  Lower level  ", runs: [1, 0, 0, "1", 9, -1, 1.5] },
  { id: "front", name: "", runs: [] },
  "not an offer",
  { id: "", name: "No id", runs: [0] },
  { name: "Missing id", runs: [0] },
];
const CLEAN_A = [
  { id: "full", name: "Full wrap", runs: [0, 1, 2] },
  { id: "lower", name: "Lower level", runs: [0, 1] },
  { id: "front", name: "Offer", runs: [] },
];
const FULL_WRAP = { id: "full", name: "Full wrap", runs: [0, 1, 2] };

// What an offer may carry to the page: its id, name and runs, and (with
// the meeting's box counts, round 9 part 2) its own box count. Never a
// price, a cost or a note.
const OFFER_KEYS = ["boxes", "id", "name", "runs"];

// An offer as compared here: id, name and runs, with a box count only when
// it has one, so the checks hold before and after the box counts arrive.
type PageOffer = { id: string; name: string; runs: number[]; boxes?: number | null };
const plain = (offers: readonly PageOffer[]) =>
  offers.map(({ id, name, runs, boxes }) => ({ id, name, runs, ...(boxes != null ? { boxes } : {}) }));

// What the page already got (the quote link and its rework), plus round 9:
// the offers, and the offer the customer looked at or booked. The keys the
// second part of round 9 adds are listed so this test holds either side of
// it; anything else is a new field to review before it reaches a customer.
const QUOTE_KEYS = [
  "adders",
  "box_count",
  "box_price",
  "colour_timing",
  "discounts",
  "gst_enabled",
  "gst_rate",
  "min_job_total",
  "offers",
  "price_per_ft",
  "runs",
  "runs_fingerprint",
  "rush_fee",
  "upper_access_fee",
  "upper_gable_access_fee",
  "track_colour_name",
  "track_custom",
];
const QUOTE_KEYS_PART_TWO = ["accepted", "accepted_offer", "financing_offered", "meeting_offer"];
const PAGE_KEYS = [
  "address",
  "booked_at",
  "booked_offer",
  "booked_option",
  "christmas",
  "city",
  "company",
  "first_name",
  "gallery",
  "install_day",
  "install_day_deck",
  "lines",
  "last_name",
  "mockup_path",
  "product_points",
  "quote",
  "selection",
  "selection_offer",
  "service_call_fee",
  "state",
  "today",
  "valid_until",
  "warranty",
];
const PAGE_KEYS_PART_TWO = ["next_steps"];

// Calgary's date the way the app works it out: UTC-6 for good since
// Alberta stopped changing clocks on 2026-11-01 (see lib/time.ts).
function calgaryDay(offsetDays: number): string {
  const now = new Date();
  const zone = now.getTime() >= Date.UTC(2026, 10, 1, 8) ? "Etc/GMT+6" : "America/Edmonton";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(now);
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + offsetDays)).toISOString().slice(0, 10);
}

async function signedIn(email: string, password: string): Promise<Client> {
  const client = createClient<Database>(url!, anonKey!, noSession);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in failed for ${email}: ${error.message}`);
  return client;
}

async function newLead(street: string): Promise<string> {
  const { data, error } = await setter.client
    .from("leads")
    .insert({
      first_name: TEST_LEAD,
      last_name: "Offers",
      address_line: street,
      neighbourhood: "TEST (automated)",
      created_by: setter.id,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`lead: ${error?.message}`);
  return data.id;
}

async function newQuote(leadId: string, offers: unknown[]): Promise<string> {
  const { data, error } = await admin
    .from("quotes")
    .insert({
      lead_id: leadId,
      created_by: ownerId,
      price_per_ft: 23,
      box_price: 500,
      box_count: 1,
      runs: RUNS as unknown as Json,
      offers: offers as unknown as Json,
      total_feet: 130,
      adders: [],
      discounts: [{ label: "Neighbour discount", amount: 150 }],
      gst_rate: 0.05,
      gst_enabled: false,
      subtotal: 3540,
      total: 3540,
      notes: INTERNAL,
      valid_until: calgaryDay(14),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`quote: ${error?.message}`);
  return data.id;
}

// A live link, handed to the throwaway setter as its maker so Book my
// install never returns Keenan's push addresses.
async function liveLink(leadId: string): Promise<string> {
  const { data: token, error } = await admin.rpc("issue_quote_link", { p_lead_id: leadId });
  if (error || !token) throw new Error(`link: ${error?.message}`);
  const handed = await admin.from("quote_links").update({ created_by: setter.id }).eq("token", token);
  if (handed.error) throw new Error(`link maker: ${handed.error.message}`);
  return token;
}

async function linkRow(token: string): Promise<LinkRow> {
  const { data, error } = await admin.from("quote_links").select("*").eq("token", token).single();
  if (error || !data) throw new Error(`link row: ${error?.message}`);
  return data;
}

async function quoteRow(quoteId: string) {
  const { data, error } = await admin.from("quotes").select("*").eq("id", quoteId).single();
  if (error || !data) throw new Error(`quote row: ${error?.message}`);
  return data;
}

async function leadStatus(leadId: string) {
  const { data, error } = await admin.from("leads").select("status").eq("id", leadId).single();
  if (error || !data) throw new Error(`lead row: ${error?.message}`);
  return data.status;
}

async function events(leadId: string) {
  const { data, error } = await admin
    .from("lead_events")
    .select("type, actor_id, payload")
    .eq("lead_id", leadId)
    .order("created_at");
  if (error) throw new Error(`events: ${error.message}`);
  return data ?? [];
}

// The columns that changed between two reads of the same row.
function changed(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  return Object.keys(after)
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .sort();
}

type View = {
  state: string;
  quote: { offers: PageOffer[] } & Record<string, unknown>;
  selection: number[] | null;
  selection_offer: string | null;
  booked_at: string | null;
  booked_option: string | null;
  booked_offer: string | null;
} & Record<string, unknown>;

async function view(token: string): Promise<View> {
  const { data, error } = await anon.rpc("quote_for_customer", { p_token: token });
  if (error) throw new Error(`quote_for_customer: ${error.message}`);
  return data as View;
}

type Booked = { ok: boolean; state?: string; option?: string; notify?: boolean; targets?: unknown[] };
const book = async (token: string, offer: string) =>
  (await anon.rpc("quote_link_book_offer", { p_token: token, p_offer: offer })).data as Booked;
const select = async (token: string, offer: string) =>
  (await anon.rpc("quote_link_select_offer", { p_token: token, p_offer: offer })).data;

beforeAll(async () => {
  const { data: owner } = await admin.from("profiles").select("id").eq("role", "owner").single();
  if (!owner) throw new Error("no owner profile");
  ownerId = owner.id;

  const { data, error } = await admin.auth.admin.createUser({
    email: setter.email,
    password: setter.password,
    email_confirm: true,
    user_metadata: { full_name: "RLS Offers Setter" },
    app_metadata: { role: "sales" },
  });
  if (error || !data.user) throw new Error(`could not create ${setter.email}: ${error?.message}`);
  setter.id = data.user.id;
  setter.client = await signedIn(setter.email, setter.password);

  leadA = await newLead(`1 Offerstest Street NW ${stamp}`);
  leadB = await newLead(`2 Offerstest Street NW ${stamp}`);
  quoteA = await newQuote(leadA, OFFERS_A);
  // Quote B was made before offers: an empty list.
  quoteB = await newQuote(leadB, []);
  tokenA = await liveLink(leadA);
  tokenB = await liveLink(leadB);
});

afterAll(async () => {
  const leads = new Set([leadA, leadB].filter(Boolean));
  if (setter.id) {
    const { data } = await admin.from("leads").select("id").eq("created_by", setter.id);
    for (const lead of data ?? []) leads.add(lead.id);
  }
  const all = [...leads];
  if (all.length > 0) {
    // Book my install never makes an earning; this only makes sure.
    await admin.from("earnings").delete().in("lead_id", all);
    await admin.from("quote_links").delete().in("lead_id", all);
    await admin.from("quotes").delete().in("lead_id", all);
  }
  if (setter.id) {
    await admin.from("leads").delete().eq("created_by", setter.id);
    await admin.auth.admin.deleteUser(setter.id);
  }
});

describe("what the link shows of the offers", () => {
  it("hands the page each offer cleaned to an id, a name and runs on the quote, the way the app cleans them", async () => {
    const v = await view(tokenA);
    expect(v.state).toBe("live");
    expect(plain(v.quote.offers)).toEqual(CLEAN_A);
    for (const offer of v.quote.offers) {
      expect(Object.keys(offer).filter((key) => !OFFER_KEYS.includes(key))).toEqual([]);
      expect(Object.keys(offer)).toEqual(expect.arrayContaining(["id", "name", "runs"]));
    }
    // One shape everywhere: lib/quotes/offers.ts reads the stored list the same way.
    expect(plain(v.quote.offers)).toEqual(plain(parseOffers(OFFERS_A, RUNS.length)));
    const text = JSON.stringify(v);
    expect(text).not.toContain(INTERNAL);
    expect(text).not.toContain('"cost"');
    expect(text).not.toContain('"price"');
    expect(text).not.toContain(setter.email);
    expect(text).not.toContain("RLS Offers Setter");
  });

  it("adds the offers and the customer's offer to what the page already got, and no other price or cost", async () => {
    const v = await view(tokenA);
    const quoteKeys = Object.keys(v.quote);
    expect(quoteKeys.filter((key) => ![...QUOTE_KEYS, ...QUOTE_KEYS_PART_TWO].includes(key))).toEqual([]);
    expect(quoteKeys).toEqual(expect.arrayContaining(QUOTE_KEYS));
    const pageKeys = Object.keys(v);
    expect(pageKeys.filter((key) => ![...PAGE_KEYS, ...PAGE_KEYS_PART_TWO].includes(key))).toEqual([]);
    expect(pageKeys).toEqual(expect.arrayContaining(PAGE_KEYS));
    expect(v.selection_offer).toBeNull();
    expect(v.booked_offer).toBeNull();
  });

  it("reads a quote made before offers as one Full wrap covering every run", async () => {
    const v = await view(tokenB);
    expect(plain(v.quote.offers)).toEqual([FULL_WRAP]);
    const stored = await quoteRow(quoteB);
    expect(stored.offers).toEqual([]);
  });
});

describe("nobody reads or writes the offers except through the link", () => {
  it("the lead's own setter can't read quotes.offers, change them or make a quote with them", async () => {
    const read = await setter.client.from("quotes").select("id, offers").eq("lead_id", leadA);
    expect(read.error !== null || (read.data ?? []).length === 0).toBe(true);
    const write = await setter.client
      .from("quotes")
      .update({ offers: [{ id: "x", name: "Setter's offer", runs: [0] }] })
      .eq("id", quoteA)
      .select("id");
    expect(write.error !== null || (write.data ?? []).length === 0).toBe(true);
    const made = await setter.client.from("quotes").insert({
      lead_id: leadA,
      created_by: setter.id,
      price_per_ft: 1,
      box_price: 1,
      gst_rate: 0.05,
      offers: [{ id: "x", name: "Setter's offer", runs: [0] }],
    });
    expect(made.error).not.toBeNull();
    expect((await quoteRow(quoteA)).offers).toEqual(OFFERS_A);
  });

  it("a signed-out visitor can't either", async () => {
    const read = await anon.from("quotes").select("id, offers");
    expect(read.error !== null || (read.data ?? []).length === 0).toBe(true);
    const write = await anon.from("quotes").update({ offers: [] }).eq("id", quoteA).select("id");
    expect(write.error !== null || (write.data ?? []).length === 0).toBe(true);
    expect((await quoteRow(quoteA)).offers).toEqual(OFFERS_A);
  });

  it("neither can read or set the offer a customer looked at or booked on the link", async () => {
    for (const client of [setter.client, anon]) {
      const read = await client.from("quote_links").select("selection_offer, booked_offer");
      expect(read.error !== null || (read.data ?? []).length === 0).toBe(true);
      const write = await client
        .from("quote_links")
        .update({ booked_offer: "full", selection_offer: "full" })
        .eq("lead_id", leadA)
        .select("id");
      expect(write.error !== null || (write.data ?? []).length === 0).toBe(true);
    }
    const link = await linkRow(tokenA);
    expect(link.booked_offer).toBeNull();
    expect(link.selection_offer).toBeNull();
  });
});

describe("the customer looking at an offer", () => {
  it("records the offer they are looking at on their own link and nothing else", async () => {
    const before = await linkRow(tokenA);
    const otherBefore = await linkRow(tokenB);
    const quoteBefore = await quoteRow(quoteA);
    const eventsBefore = await events(leadA);
    const statusBefore = await leadStatus(leadA);

    expect(await select(tokenA, "lower")).toBe(true);
    const after = await linkRow(tokenA);
    expect(after.selection_offer).toBe("lower");
    expect(after.selection).toEqual([0, 1]);
    for (const key of changed(before, after)) {
      expect(["selection", "selection_at", "selection_offer", "selection_runs", "updated_at"]).toContain(key);
    }
    expect(changed(before, after)).toContain("selection_offer");
    expect(after.booked_at).toBeNull();
    expect(after.booked_offer).toBeNull();

    // Nothing else moves: the other link, the quote, the timeline, the lead.
    expect(changed(otherBefore, await linkRow(tokenB))).toEqual([]);
    expect(await quoteRow(quoteA)).toEqual(quoteBefore);
    expect(await events(leadA)).toEqual(eventsBefore);
    expect(await leadStatus(leadA)).toBe(statusBefore);

    const v = await view(tokenA);
    expect(v.selection_offer).toBe("lower");
    expect(v.selection).toEqual([0, 1]);
  });

  it("an offer covering every run is kept as the offer, with no smaller selection", async () => {
    expect(await select(tokenA, "full")).toBe(true);
    const link = await linkRow(tokenA);
    expect(link.selection_offer).toBe("full");
    expect(link.selection).toBeNull();
    // The Full wrap stand-in on a quote made before offers works the same.
    expect(await select(tokenB, "full")).toBe(true);
    expect((await linkRow(tokenB)).selection_offer).toBe("full");
  });
});

describe("Book my install on an offer", () => {
  it("records the offer, its name and its runs, once on the timeline with no amount, and never accepts the quote or pays anyone", async () => {
    const quoteBefore = await quoteRow(quoteA);
    const statusBefore = await leadStatus(leadA);
    const before = await linkRow(tokenA);

    const first = await book(tokenA, "lower");
    expect(first.ok).toBe(true);
    expect(first.option).toBe("Lower level");
    expect(first.notify).toBe(true);
    // The link's maker is the throwaway setter, who has no devices.
    expect(first.targets).toEqual([]);

    const after = await linkRow(tokenA);
    expect(after.booked_offer).toBe("lower");
    expect(after.booked_option).toBe("Lower level");
    expect(after.booked_selection).toEqual([0, 1]);
    expect(after.booked_at).not.toBeNull();
    for (const key of changed(before, after)) {
      expect([
        "booked_at",
        "booked_offer",
        "booked_option",
        "booked_selection",
        "notified_option",
        "selection",
        "selection_at",
        "selection_offer",
        "selection_runs",
        "updated_at",
      ]).toContain(key);
    }

    // The same offer again: no second line, no second notice.
    const again = await book(tokenA, "lower");
    expect(again.ok).toBe(true);
    expect(again.notify).toBe(false);

    // A different offer is a new line.
    const whole = await book(tokenA, "full");
    expect(whole.ok).toBe(true);
    expect(whole.option).toBe("Full wrap");
    expect(whole.notify).toBe(true);
    const wholeLink = await linkRow(tokenA);
    expect(wholeLink.booked_offer).toBe("full");
    expect(wholeLink.booked_option).toBe("Full wrap");
    expect(wholeLink.booked_selection).toEqual([0, 1, 2]);
    expect(wholeLink.selection).toBeNull();

    const requested = (await events(leadA)).filter((event) => event.type === "install_requested");
    expect(requested).toEqual([
      { type: "install_requested", actor_id: null, payload: { option: "Lower level", runs: ["Front", "Garage"] } },
      { type: "install_requested", actor_id: null, payload: { option: "Full wrap", runs: ["Front", "Garage", "Upper front"] } },
    ]);
    expect(JSON.stringify(requested.map((event) => event.payload))).not.toMatch(/\$|\d/);

    // Never an acceptance, a commission or a change to the quote or the lead.
    expect(await quoteRow(quoteA)).toEqual(quoteBefore);
    const { data: earnings } = await admin.from("earnings").select("id").eq("lead_id", leadA);
    expect(earnings).toEqual([]);
    expect(await leadStatus(leadA)).toBe(statusBefore);
    expect((await events(leadA)).map((event) => event.type)).not.toContain("quote_accepted");

    const v = await view(tokenA);
    expect(v.booked_offer).toBe("full");
    expect(v.booked_option).toBe("Full wrap");
    expect(v.booked_at).not.toBeNull();
  });
});

describe("what the link refuses", () => {
  it("unknown offers, offers with no runs yet and another quote's offers, changing nothing", async () => {
    const before = await linkRow(tokenA);
    const otherBefore = await linkRow(tokenB);
    const eventsBefore = await events(leadA);

    for (const offer of ["nope", "", "FULL", " lower ", "x".repeat(41)]) {
      expect(await select(tokenA, offer)).toBe(false);
      expect(await book(tokenA, offer)).toMatchObject({ ok: false, state: "no_offer" });
    }
    expect(await select(tokenA, "front")).toBe(false);
    expect(await book(tokenA, "front")).toMatchObject({ ok: false, state: "no_runs" });
    // Quote B has only the Full wrap stand-in: A's offers are A's alone.
    expect(await select(tokenB, "lower")).toBe(false);
    expect(await book(tokenB, "lower")).toMatchObject({ ok: false, state: "no_offer" });

    expect(changed(before, await linkRow(tokenA))).toEqual([]);
    expect(changed(otherBefore, await linkRow(tokenB))).toEqual([]);
    expect(await events(leadA)).toEqual(eventsBefore);
  });

  it("unknown and malformed links", async () => {
    const changedLast = tokenA.slice(0, -1) + (tokenA.endsWith("_") ? "-" : "_");
    for (const token of ["AAAAAAAAAAAAAAAAAAAAAAAA", "short", "' or 1=1 --", changedLast]) {
      expect(await select(token, "full")).toBe(false);
      expect(await book(token, "full")).toMatchObject({ ok: false, state: "expired" });
    }
  });

  it("a revoked link: no offers shown, and its taps change nothing", async () => {
    const off = await admin.rpc("revoke_quote_link", { p_lead_id: leadA });
    expect(off.data).toBe(true);
    const before = await linkRow(tokenA);
    const eventsBefore = await events(leadA);

    const v = await view(tokenA);
    expect(v.state).toBe("closed");
    expect(Object.keys(v).sort()).toEqual(["company", "state"]);
    expect(JSON.stringify(v)).not.toContain("Lower level");

    expect(await select(tokenA, "lower")).toBe(false);
    expect(await book(tokenA, "lower")).toMatchObject({ ok: false, state: "expired" });
    const after = await linkRow(tokenA);
    expect(changed(before, after)).toEqual([]);
    expect(after.booked_offer).toBe("full");
    expect(await events(leadA)).toEqual(eventsBefore);
  });
});
