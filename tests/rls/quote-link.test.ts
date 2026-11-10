import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";

// Proves the customer quote link's rules in the database itself (Keenan,
// 2026-11-02): an anonymous caller reads no table; a token returns its own
// quote and nothing else, with customer-safe fields only; unknown and
// revoked links come back closed with no name and no prices, while a link
// past its price-held-until date stays live (2026-11-04); the
// page's writes change only their own link; Book my install never accepts
// the quote or pays anyone; push addresses come back sealed, only for the
// link's maker; and Storage lets a request carrying a live token sign that
// quote's mockup and nothing else, and the presentation gallery's photos
// and nothing else there. Signed in as a throwaway setter and an
// account with no profile; leads are named "TEST LEAD (automated)" and
// everything made here is removed at the end. The service role stands in
// for the owner, as in the other suites: the tests never sign in as Keenan.

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
const withToken = (token: string): Client =>
  createClient<Database>(url!, anonKey!, { ...noSession, global: { headers: { "x-quote-token": token } } });
const stamp = Date.now().toString(36);
const TEST_LEAD = "TEST LEAD (automated)";
const BUCKET = "lead-photos";
const INTERNAL = "INTERNAL NOTE never shown to a customer";

type TestUser = { email: string; password: string; id: string; client: Client };
const users: Record<"a" | "b" | "nobody", TestUser> = {
  a: { email: `rls-ql-a-${stamp}@example.com`, password: `Rls-ql-a-${stamp}-pass`, id: "", client: admin },
  b: { email: `rls-ql-b-${stamp}@example.com`, password: `Rls-ql-b-${stamp}-pass`, id: "", client: admin },
  nobody: { email: `rls-ql-none-${stamp}@example.com`, password: `Rls-ql-n-${stamp}-pass`, id: "", client: admin },
};

let leadA = "";
let leadB = "";
let quoteB = "";
let tokenA = "";
let tokenB = "";
let mockupPath = "";
let frontPath = "";

const calgaryDay = (offset: number) => {
  const now = new Date(Date.now() - 6 * 3600 * 1000);
  now.setUTCDate(now.getUTCDate() + offset);
  return now.toISOString().slice(0, 10);
};

const RUNS = [
  { name: "Front", feet: 60, level: "lower" },
  { name: "Upper front", feet: 40, level: "upper" },
  { name: "Garage", feet: 30, level: "lower" },
];

// A closed answer: the state and Vesper's public contact, nothing about
// the customer and no prices.
function expectClosed(data: unknown) {
  const view = data as { state?: string; company?: Record<string, unknown> };
  expect(view.state).toBe("closed");
  expect(Object.keys(view).sort()).toEqual(["company", "state"]);
  expect(Object.keys(view.company ?? {}).sort()).toEqual(["email", "name", "phone"]);
  expect(JSON.stringify(view)).not.toContain("Linktest");
}

async function signedIn(email: string, password: string): Promise<Client> {
  const client = createClient<Database>(url!, anonKey!, noSession);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in failed for ${email}: ${error.message}`);
  return client;
}

async function addQuote(leadId: string, validUntil: string) {
  const { data, error } = await admin
    .from("quotes")
    .insert({
      lead_id: leadId,
      created_by: users.a.id,
      price_per_ft: 23,
      box_price: 500,
      box_count: 1,
      runs: RUNS,
      total_feet: 130,
      adders: [{ label: "Extra height", amount: 150, upper_only: true }],
      discounts: [{ label: "Neighbour discount", amount: 150 }],
      gst_rate: 0.05,
      gst_enabled: false,
      subtotal: 3490,
      total: 3490,
      notes: INTERNAL,
      valid_until: validUntil,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`could not add a quote: ${error?.message}`);
  return data.id;
}

beforeAll(async () => {
  for (const key of ["a", "b", "nobody"] as const) {
    const u = users[key];
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { full_name: `RLS QL ${key.toUpperCase()}` },
      app_metadata: key === "nobody" ? {} : { role: "sales" },
    });
    if (error || !data.user) throw new Error(`could not create ${u.email}: ${error?.message}`);
    u.id = data.user.id;
    u.client = await signedIn(u.email, u.password);
  }
  for (const [street, assign] of [
    ["1 Linktest Street NW", (id: string) => (leadA = id)],
    ["2 Linktest Street NW", (id: string) => (leadB = id)],
  ] as const) {
    const { data, error } = await users.a.client
      .from("leads")
      .insert({ first_name: TEST_LEAD, last_name: "Link", address_line: street, created_by: users.a.id })
      .select("id")
      .single();
    if (error || !data) throw new Error(`could not add a test lead: ${error?.message}`);
    assign(data.id);
  }
  await addQuote(leadA, calgaryDay(14));
  quoteB = await addQuote(leadB, calgaryDay(14));

  const jpeg = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#132e3f" } }).jpeg().toBuffer();
  mockupPath = `${users.a.id}/${crypto.randomUUID()}.jpg`;
  frontPath = `${users.a.id}/${crypto.randomUUID()}.jpg`;
  for (const path of [mockupPath, frontPath]) {
    const { error } = await users.a.client.storage.from(BUCKET).upload(path, jpeg, { contentType: "image/jpeg", upsert: false });
    if (error) throw new Error(`could not upload ${path}: ${error.message}`);
  }
  const photos = await admin.from("lead_photos").insert([
    { lead_id: leadA, storage_path: mockupPath, slot: "mockup", created_by: users.a.id },
    { lead_id: leadA, storage_path: frontPath, slot: "front", created_by: users.a.id },
  ]);
  if (photos.error) throw new Error(`could not add the photos: ${photos.error.message}`);

  const a = await admin.rpc("issue_quote_link", { p_lead_id: leadA });
  const b = await admin.rpc("issue_quote_link", { p_lead_id: leadB });
  if (a.error || b.error || !a.data || !b.data) throw new Error(`could not make the links: ${a.error?.message ?? b.error?.message}`);
  tokenA = a.data;
  tokenB = b.data;
});

afterAll(async () => {
  await admin.storage.from(BUCKET).remove([mockupPath, frontPath].filter(Boolean));
  const leads = [leadA, leadB].filter(Boolean);
  if (leads.length > 0) {
    await admin.from("quote_links").delete().in("lead_id", leads);
    await admin.from("quotes").delete().in("lead_id", leads);
  }
  for (const u of Object.values(users)) {
    if (!u.id) continue;
    await admin.from("push_subscriptions").delete().eq("profile_id", u.id);
    await admin.from("leads").delete().eq("created_by", u.id);
    await admin.auth.admin.deleteUser(u.id);
  }
});

describe("nobody outside reads a table", () => {
  it("an anonymous caller and an account with no profile read nothing", async () => {
    for (const client of [anon, users.nobody.client]) {
      for (const read of [
        () => client.from("quotes").select("id"),
        () => client.from("quote_links").select("id"),
        () => client.from("push_subscriptions").select("id"),
        () => client.from("leads").select("id"),
        () => client.from("lead_events").select("id"),
        () => client.from("lead_photos").select("id"),
        () => client.from("settings").select("id"),
        () => client.from("earnings").select("id"),
      ]) {
        const { data, error } = await read();
        expect(error !== null || data?.length === 0).toBe(true);
      }
    }
  });

  it("a setter can't read the links, make one or turn one off", async () => {
    const read = await users.a.client.from("quote_links").select("id, token");
    expect(read.data ?? []).toEqual([]);
    const make = await users.a.client.rpc("issue_quote_link", { p_lead_id: leadA });
    expect(make.error?.code).toBe("42501");
    const off = await users.a.client.rpc("revoke_quote_link", { p_lead_id: leadA });
    expect(off.error?.code).toBe("42501");
    const write = await users.a.client.from("quote_links").update({ view_count: 99 }).eq("lead_id", leadA).select("id");
    expect(write.data ?? []).toEqual([]);
  });

  it("an anonymous caller can't make or turn off a link", async () => {
    const make = await anon.rpc("issue_quote_link", { p_lead_id: leadA });
    expect(make.error).not.toBeNull();
    const off = await anon.rpc("revoke_quote_link", { p_lead_id: leadA });
    expect(off.error).not.toBeNull();
  });
});

describe("the link", () => {
  it("has at least 128 bits of randomness and one live link per lead", async () => {
    expect(tokenA).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(tokenA).not.toBe(tokenB);
    const again = await admin.rpc("issue_quote_link", { p_lead_id: leadA });
    expect(again.data).toBe(tokenA);
    const { data: live } = await admin.from("quote_links").select("id").eq("lead_id", leadA).is("revoked_at", null);
    expect(live).toHaveLength(1);
    const { data: made } = await admin.from("lead_events").select("type").eq("lead_id", leadA).eq("type", "quote_link_created");
    expect(made).toHaveLength(1);
  });

  it("needs a quote first", async () => {
    const { data: bare } = await users.a.client
      .from("leads")
      .insert({ first_name: TEST_LEAD, address_line: "3 Linktest Street NW", created_by: users.a.id })
      .select("id")
      .single();
    const made = await admin.rpc("issue_quote_link", { p_lead_id: bare!.id });
    expect(made.error?.message).toMatch(/Save a quote/);
  });
});

describe("what a token shows", () => {
  it("returns its own quote, with customer-safe fields only", async () => {
    const { data, error } = await anon.rpc("quote_for_customer", { p_token: tokenA });
    expect(error).toBeNull();
    const view = data as Record<string, unknown>;
    expect(view.state).toBe("live");
    expect(view.address).toBe("1 Linktest Street NW");
    expect(Object.keys(view).sort()).toEqual(
      [
        "address",
        "booked_at",
        "booked_offer",
        "booked_option",
        "city",
        "company",
        "first_name",
        "last_name",
        "mockup_path",
        "quote",
        "selection",
        "selection_offer",
        "state",
        "valid_until",
        "warranty",
        "today",
        "service_call_fee",
        "christmas",
        "product_points",
        "install_day",
        "install_day_deck",
        "lines",
        "next_steps",
        "gallery",
      ].sort(),
    );
    expect(Object.keys(view.quote as object).sort()).toEqual(
      [
        "adders",
        "box_count",
        "box_price",
        "colour_timing",
        "discounts",
        "gst_enabled",
        "gst_rate",
        "min_job_total",
        "price_per_ft",
        "runs",
        "runs_fingerprint",
        "rush_fee",
        "upper_access_fee",
        "upper_gable_access_fee",
        "track_colour_name",
        "track_custom",
        "offers",
        "financing_offered",
        "meeting_offer",
        "accepted",
        "accepted_offer",
      ].sort(),
    );
    // What happens next: the initials, the planned day and What we'll need,
    // nothing else about the lead.
    expect(Object.keys(view.next_steps as object).sort()).toEqual(["colour_confirmed", "install_on", "what_we_need"]);
    expect((view.next_steps as { colour_confirmed: boolean; install_on: string | null }).colour_confirmed).toBe(false);
    expect((view.next_steps as { install_on: string | null }).install_on).toBeNull();
    // Not accepted, so no agreed option is named.
    expect((view.quote as { accepted: boolean; accepted_offer: string | null }).accepted).toBe(false);
    expect((view.quote as { accepted_offer: string | null }).accepted_offer).toBeNull();
    const text = JSON.stringify(view);
    expect(text).not.toContain(INTERNAL);
    expect(text).not.toContain(users.a.email);
    expect(text).not.toContain("RLS QL A");
    expect(text).not.toContain("2 Linktest Street NW");
    expect(view.mockup_path).toBe(mockupPath);

    const other = await anon.rpc("quote_for_customer", { p_token: tokenB });
    expect((other.data as { address: string }).address).toBe("2 Linktest Street NW");
  });

  it("hands the page Settings' banner, points, install day and service call, and Calgary's date", async () => {
    const { data } = await anon.rpc("quote_for_customer", { p_token: tokenA });
    const view = data as {
      today: string;
      christmas: { title: string; text: string } | null;
      product_points: unknown;
      install_day: { title: string; body: string } | null;
      service_call_fee: number | string | null;
      gallery: unknown;
    };
    const { data: settings } = await admin
      .from("settings")
      .select("christmas_banner_on, christmas_banner_title, christmas_banner_text, product_points, service_call_fee")
      .eq("id", 1)
      .single();
    expect(view.today).toBe(calgaryDay(0));
    // The banner shows from September 1 to November 30 (Calgary), while on.
    const [, month] = calgaryDay(0).split("-").map(Number);
    const inSeason = month >= 9 && month <= 11;
    expect(view.christmas).toEqual(
      settings!.christmas_banner_on && inSeason ? { title: settings!.christmas_banner_title, text: settings!.christmas_banner_text } : null,
    );
    expect(view.product_points).toEqual(settings!.product_points);
    expect(Number(view.service_call_fee ?? 0)).toBe(Number(settings!.service_call_fee ?? 0));
    expect(Array.isArray(view.gallery)).toBe(true);
    expect(view.install_day === null || typeof view.install_day.title === "string").toBe(true);
  });

  it("keeps the banner and points in owner-only Settings: a setter and an anonymous caller read nothing there", async () => {
    const setter = await users.a.client.from("settings").select("christmas_banner_title, product_points");
    expect(setter.data ?? []).toEqual([]);
    const stranger = await anon.from("settings").select("christmas_banner_title, product_points");
    expect(stranger.error !== null || (stranger.data ?? []).length === 0).toBe(true);
    const change = await users.a.client.from("settings").update({ christmas_banner_title: "Changed" }).eq("id", 1).select("id");
    expect(change.data ?? []).toEqual([]);
  });

  it("shows unknown and malformed links as closed, with nothing else", async () => {
    // The last one is a real token with its last character changed. Tokens
    // are 24 random base64url characters, so a fixed replacement ("_") was
    // the real token itself once in 64 runs; this always picks another.
    const changedLast = tokenA.slice(0, -1) + (tokenA.endsWith("_") ? "-" : "_");
    for (const token of ["AAAAAAAAAAAAAAAAAAAAAAAA", "short", "' or 1=1 --", changedLast]) {
      const { data } = await anon.rpc("quote_for_customer", { p_token: token });
      expectClosed(data);
    }
  });
});

describe("the page's writes", () => {
  it("count visits without anything about the visitor, and put the first on the timeline", async () => {
    expect((await anon.rpc("quote_link_visit", { p_token: tokenA })).data).toBe(true);
    expect((await anon.rpc("quote_link_visit", { p_token: tokenA })).data).toBe(true);
    const { data: link } = await admin
      .from("quote_links")
      .select("view_count, first_viewed_at, last_viewed_at")
      .eq("token", tokenA)
      .single();
    expect(link!.view_count).toBe(2);
    expect(link!.first_viewed_at).not.toBeNull();
    const { data: opened } = await admin
      .from("lead_events")
      .select("actor_id")
      .eq("lead_id", leadA)
      .eq("type", "quote_link_opened");
    expect(opened).toEqual([{ actor_id: null }]);
    const { data: other } = await admin.from("quote_links").select("view_count").eq("token", tokenB).single();
    expect(other!.view_count).toBe(0);
  });

  it("save a selection on their own link only, and refuse runs that aren't on the quote", async () => {
    expect((await anon.rpc("quote_link_select", { p_token: tokenA, p_positions: [2, 0] })).data).toBe(true);
    const { data: a } = await admin.from("quote_links").select("selection").eq("token", tokenA).single();
    expect(a!.selection).toEqual([0, 2]);
    const { data: b } = await admin.from("quote_links").select("selection").eq("token", tokenB).single();
    expect(b!.selection).toBeNull();
    const view = await anon.rpc("quote_for_customer", { p_token: tokenA });
    expect((view.data as { selection: number[] }).selection).toEqual([0, 2]);
    const bad = await anon.rpc("quote_link_select", { p_token: tokenA, p_positions: [0, 7] });
    expect(bad.error).not.toBeNull();
  });

  it("book my install saves the option in words, never accepts the quote and never pays anyone", async () => {
    const first = await anon.rpc("quote_link_book", { p_token: tokenA, p_positions: [0, 2] });
    expect(first.error).toBeNull();
    const booked = first.data as { ok: boolean; option: string; notify: boolean; name: string };
    expect(booked.ok).toBe(true);
    expect(booked.option).toBe("Start smaller: Front, Garage");
    expect(booked.notify).toBe(true);
    expect(booked.name).toBe(`${TEST_LEAD} Link`);

    const again = await anon.rpc("quote_link_book", { p_token: tokenA, p_positions: [0, 2] });
    expect((again.data as { notify: boolean }).notify).toBe(false);
    const whole = await anon.rpc("quote_link_book", { p_token: tokenA, p_positions: [] });
    expect((whole.data as { option: string; notify: boolean }).option).toBe("Recommended package");
    expect((whole.data as { notify: boolean }).notify).toBe(true);

    const { data: events } = await admin
      .from("lead_events")
      .select("payload, actor_id")
      .eq("lead_id", leadA)
      .eq("type", "install_requested")
      .order("created_at");
    expect(events).toHaveLength(2);
    expect(events![0].payload).toEqual({ option: "Start smaller: Front, Garage", runs: ["Front", "Garage"] });
    expect(JSON.stringify(events)).not.toMatch(/\$|\d{3,}/);

    const { data: quote } = await admin.from("quotes").select("status, accepted_at").eq("lead_id", leadA).single();
    expect(quote).toEqual({ status: "draft", accepted_at: null });
    const { data: earnings } = await admin.from("earnings").select("id").eq("lead_id", leadA);
    expect(earnings).toEqual([]);
    const { data: lead } = await admin.from("leads").select("status").eq("id", leadA).single();
    expect(lead!.status).toBe("new");
  });

  it("hands back sealed push addresses only for the link's maker", async () => {
    // A link made by the throwaway setter, so nothing here reaches Keenan.
    const { data: link } = await admin
      .from("quote_links")
      .select("id")
      .eq("token", tokenB)
      .single();
    await admin.from("quote_links").update({ created_by: users.a.id }).eq("id", link!.id);
    const sealed = "SEALED-test-value-for-rls";
    const row = await users.a.client
      .from("push_subscriptions")
      .insert({ profile_id: users.a.id, endpoint_hash: "a".repeat(64), sealed, label: "Test phone" })
      .select("id")
      .single();
    expect(row.error).toBeNull();
    const off = await users.a.client
      .from("push_subscriptions")
      .insert({ profile_id: users.a.id, endpoint_hash: "b".repeat(64), sealed: "SEALED-switched-off-row", label: "Old phone" })
      .select("id")
      .single();
    await users.a.client.from("push_subscriptions").update({ removed_at: new Date().toISOString() }).eq("id", off.data!.id);

    const booked = await anon.rpc("quote_link_book", { p_token: tokenB, p_positions: [1] });
    const result = booked.data as { notify: boolean; targets: { id: string; sealed: string }[]; option: string };
    expect(result.option).toBe("Start smaller: Upper front");
    expect(result.targets).toEqual([{ id: row.data!.id, sealed }]);

    const stranger = await anon.from("push_subscriptions").select("sealed");
    expect(stranger.error !== null || stranger.data?.length === 0).toBe(true);
    const nobody = await users.nobody.client.from("push_subscriptions").select("sealed");
    expect(nobody.data ?? []).toEqual([]);
  });
});

describe("notification devices", () => {
  it("each member sees and changes only their own", async () => {
    const mine = await users.b.client
      .from("push_subscriptions")
      .insert({ profile_id: users.b.id, endpoint_hash: "c".repeat(64), sealed: "SEALED-b-device-for-rls", label: "B's phone" })
      .select("id")
      .single();
    expect(mine.error).toBeNull();
    const aSees = await users.a.client.from("push_subscriptions").select("id, profile_id");
    expect((aSees.data ?? []).every((row) => row.profile_id === users.a.id)).toBe(true);
    const aChanges = await users.a.client.from("push_subscriptions").update({ label: "taken" }).eq("id", mine.data!.id).select("id");
    expect(aChanges.data ?? []).toEqual([]);
    const forSomeoneElse = await users.a.client
      .from("push_subscriptions")
      .insert({ profile_id: users.b.id, endpoint_hash: "d".repeat(64), sealed: "SEALED-not-yours", label: "Not yours" });
    expect(forSomeoneElse.error?.code).toBe("42501");
    const { data: still } = await admin.from("push_subscriptions").select("label").eq("id", mine.data!.id).single();
    expect(still!.label).toBe("B's phone");
  });
});

describe("the mockup", () => {
  it("can't be signed or listed without a live token", async () => {
    const signed = await anon.storage.from(BUCKET).createSignedUrl(mockupPath, 600);
    expect(signed.error).not.toBeNull();
    const listed = await anon.storage.from(BUCKET).list(users.a.id);
    expect(listed.data ?? []).toEqual([]);
  });

  it("is signed for a request carrying its own live token, and nothing else is", async () => {
    const mine = withToken(tokenA);
    const signed = await mine.storage.from(BUCKET).createSignedUrl(mockupPath, 600);
    expect(signed.error).toBeNull();
    const image = await fetch(signed.data!.signedUrl);
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toContain("image/jpeg");

    const front = await mine.storage.from(BUCKET).createSignedUrl(frontPath, 600);
    expect(front.error).not.toBeNull();
    const listed = await mine.storage.from(BUCKET).list(users.a.id);
    expect((listed.data ?? []).map((file) => `${users.a.id}/${file.name}`).filter((p) => p !== mockupPath)).toEqual([]);

    const someoneElse = await withToken(tokenB).storage.from(BUCKET).createSignedUrl(mockupPath, 600);
    expect(someoneElse.error).not.toBeNull();
    const madeUp = await withToken("AAAAAAAAAAAAAAAAAAAAAAAA").storage.from(BUCKET).createSignedUrl(mockupPath, 600);
    expect(madeUp.error).not.toBeNull();
  });
});

describe("the gallery photos", () => {
  // Settings' gallery is Keenan's own and shows on every live link, a real
  // customer's included, so these tests never add a photo to it: they prove
  // nothing else in the bucket can be signed. A gallery photo that can't be
  // signed is left off the page, so the section hides rather than breaks
  // (decisions.md, 2026-11-04).
  it("can't be signed without a live token, and a live token signs nothing outside the gallery", async () => {
    const path = `pages/not-in-the-gallery-${stamp}.jpg`;
    const noToken = await anon.storage.from("presentation").createSignedUrl(path, 600);
    expect(noToken.error).not.toBeNull();
    const live = await withToken(tokenA).storage.from("presentation").createSignedUrl(path, 600);
    expect(live.error).not.toBeNull();
    const listed = await withToken(tokenA).storage.from("presentation").list("");
    expect(listed.data ?? []).toEqual([]);
    const madeUp = await withToken("AAAAAAAAAAAAAAAAAAAAAAAA").storage.from("presentation").createSignedUrl(path, 600);
    expect(madeUp.error).not.toBeNull();
  });
});

describe("turning a link off, and dates", () => {
  it("a past price-held-until date keeps the link live: the page, its writes and Book my install all still work", async () => {
    await admin.from("quotes").update({ valid_until: calgaryDay(-1) }).eq("id", quoteB);
    const view = (await anon.rpc("quote_for_customer", { p_token: tokenB })).data as { state: string; valid_until: string; today: string };
    expect(view.state).toBe("live");
    expect(view.valid_until < view.today).toBe(true);
    expect((await anon.rpc("quote_link_visit", { p_token: tokenB })).data).toBe(true);
    expect((await anon.rpc("quote_link_select", { p_token: tokenB, p_positions: [1] })).data).toBe(true);
    const book = await anon.rpc("quote_link_book", { p_token: tokenB, p_positions: [1] });
    expect((book.data as { ok: boolean; option: string }).ok).toBe(true);
    expect((book.data as { option: string }).option).toBe("Start smaller: Upper front");
    const signed = await withToken(tokenB).storage.from(BUCKET).createSignedUrl(mockupPath, 600);
    // Link B's lead has no mockup; A's mockup stays A's alone.
    expect(signed.error).not.toBeNull();
    await admin.from("quotes").update({ valid_until: calgaryDay(14) }).eq("id", quoteB);
  });

  it("revoking kills the link and its mockup, and sending again makes a new one", async () => {
    const off = await admin.rpc("revoke_quote_link", { p_lead_id: leadA });
    expect(off.data).toBe(true);
    const view = await anon.rpc("quote_for_customer", { p_token: tokenA });
    expectClosed(view.data);
    const signed = await withToken(tokenA).storage.from(BUCKET).createSignedUrl(mockupPath, 600);
    expect(signed.error).not.toBeNull();
    const { data: revokedEvent } = await admin.from("lead_events").select("type").eq("lead_id", leadA).eq("type", "quote_link_revoked");
    expect(revokedEvent).toHaveLength(1);

    const fresh = await admin.rpc("issue_quote_link", { p_lead_id: leadA });
    expect(fresh.data).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(fresh.data).not.toBe(tokenA);
    expect(((await anon.rpc("quote_for_customer", { p_token: fresh.data! })).data as { state: string }).state).toBe("live");
    expectClosed((await anon.rpc("quote_for_customer", { p_token: tokenA })).data);
  });

  it("updating the quote changes what the same link shows, and an old selection no longer applies", async () => {
    const before = await anon.rpc("quote_for_customer", { p_token: tokenB });
    expect((before.data as { selection: number[] | null }).selection).toEqual([1]);
    await admin
      .from("quotes")
      .update({ runs: [...RUNS, { name: "Back", feet: 50, level: "lower" }], total_feet: 180 })
      .eq("id", quoteB);
    const after = await anon.rpc("quote_for_customer", { p_token: tokenB });
    const view = after.data as { quote: { runs: unknown[] }; selection: number[] | null };
    expect(view.quote.runs).toHaveLength(4);
    expect(view.selection).toBeNull();
  });
});
