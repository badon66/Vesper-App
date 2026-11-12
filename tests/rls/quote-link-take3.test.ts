import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database, Json } from "@/types/database";

// Quote link take 3 (Keenan, 2026-11-11), in the database itself:
//   - the new tables (documents, link options, signed agreements) are
//     Keenan's alone: a setter and an anonymous caller read and write nothing;
//   - a live link's token signs only the documents that link shows;
//   - Build your own: quote_link_book_custom takes only measured areas from
//     the offers Keenan shows, saves one offer for the customer (replacing
//     their last, never his), and books it;
//   - the agreement: shown only when ticked and written, signed once per
//     link, saved with a copy of the quote, with no price on the timeline;
//   - an area on J track counts toward the commission at J track's price,
//     and the customer's own offer is accepted like any other.
//
// A throwaway setter, one test lead named "TEST LEAD (automated)", its
// quote, link, two small test files and one test document row are made here
// and removed at the end. The service role stands in for Keenan, because
// the tests never sign in as him. Settings' agreement text is only set
// (to a marked test text) when it is empty and no other lead is waiting on
// it, and is put back exactly as it was.

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
const DOCS = "link-documents";
const CUSTOM_NAME = "Custom quote (from the customer)";
const TEST_AGREEMENT = `TEST agreement ${stamp} (automated check, removed right after).\n\nBy signing you agree to the install in your quote.`;
const SIGNATURE = `data:image/png;base64,${"A".repeat(300)}`;

const setter = { email: `rls-take3-${stamp}@example.com`, password: `Rls-take3-${stamp}-pass`, id: "", client: admin as Client };
let ownerId = "";
let lead = "";
let quote = "";
let token = "";
let linkId = "";
let libraryId = "";
const libraryPath = `library/${randomUUID()}.pdf`;
const strayPath = `library/${randomUUID()}.pdf`;
let ownPath = "";
// undefined: Settings' agreement text was never touched.
let agreementBefore: string | null | undefined;
let agreementReady = false;

const RUNS = [
  { name: "Front", feet: 60, level: "lower", part: "eave", area: "front" },
  { name: "Garage", feet: 30, level: "lower", part: "garage", area: "front" },
  { name: "Upper gables", feet: 20, level: "upper", part: "gable", area: "front", gable: true, track: "j", trackRate: 30 },
  { name: "Back", feet: 50, level: "lower", part: "eave", area: "back" },
  { name: "Shed", feet: 0, level: "lower", part: "other", area: "other" },
];
// Keenan's own: one with its own boxes and upper access, one hidden (the
// only one covering Back), one reaching an area with no feet yet.
const KEENANS = [
  { id: "full", name: "Full front", runs: [0, 1, 2], boxes: 2, upper_access: 150 },
  { id: "lower", name: "Front lower", runs: [0, 1] },
  { id: "pocket", name: `Pocket ${stamp}`, runs: [0, 3], hidden: true },
  { id: "shed", name: "With the shed", runs: [0, 4] },
];

const calgaryDay = (offsetDays: number) => new Date(Date.now() - 6 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
const pdf = () => Buffer.from("%PDF-1.4\n% test file for the quote link take 3 checks\n%%EOF\n");
const withToken = (value: string): Client =>
  createClient<Database>(url!, anonKey!, { ...noSession, global: { headers: { "x-quote-token": value } } });
const signs = async (client: Client, path: string) => Boolean((await client.storage.from(DOCS).createSignedUrl(path, 60)).data?.signedUrl);

type Offer = { id: string; name: string; runs: number[]; boxes?: number | null; upper_access?: number | null; hidden?: boolean; from_customer?: boolean };
const storedOffers = async (): Promise<Offer[]> =>
  ((await admin.from("quotes").select("offers").eq("id", quote).single()).data?.offers ?? []) as unknown as Offer[];
type Booked = { ok: boolean; state?: string; option?: string; notify?: boolean };
const build = async (runs: number[], from: string | null = "full") =>
  (await anon.rpc("quote_link_book_custom", { p_token: token, p_runs: runs, ...(from === null ? {} : { p_from: from }) })).data as Booked;
const events = async (type: Database["public"]["Enums"]["event_type"]) =>
  (await admin.from("lead_events").select("payload").eq("lead_id", lead).eq("type", type).order("created_at")).data ?? [];
const linkRow = async () => (await admin.from("quote_links").select("*").eq("token", token).single()).data;

beforeAll(async () => {
  const { data: owner } = await admin.from("profiles").select("id").eq("role", "owner").single();
  if (!owner) throw new Error("no owner profile");
  ownerId = owner.id;
  const { data, error } = await admin.auth.admin.createUser({
    email: setter.email,
    password: setter.password,
    email_confirm: true,
    user_metadata: { full_name: "RLS Take Three Setter" },
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
    .insert({ first_name: TEST_LEAD, last_name: "Take three", address_line: `1 Takethree Street NW ${stamp} (TEST)`, neighbourhood: "TEST (automated)", created_by: setter.id })
    .select("id")
    .single();
  if (made.error || !made.data) throw new Error(`lead: ${made.error?.message}`);
  lead = made.data.id;
  // White, so the quote can be accepted.
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
      offers: KEENANS as unknown as Json,
      total_feet: 160,
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
  // Handed to the throwaway setter, so nothing here ever reaches Keenan.
  await admin.from("quote_links").update({ created_by: setter.id }).eq("token", token);
  linkId = (await linkRow())?.id ?? "";

  // Files: one standard document (ticked for this lead), one of the
  // customer's own, and a stray standard file nobody ticked.
  ownPath = `leads/${lead}/${randomUUID()}.pdf`;
  for (const path of [libraryPath, strayPath, ownPath]) {
    const up = await admin.storage.from(DOCS).upload(path, pdf(), { contentType: "application/pdf" });
    if (up.error) throw new Error(`upload ${path}: ${up.error.message}`);
  }
  const library = await admin
    .from("link_documents")
    .insert({ name: `TEST Warranty ${stamp}`, storage_path: libraryPath, content_type: "application/pdf", size_bytes: 60, position: 999, created_by: ownerId })
    .select("id")
    .single();
  if (library.error || !library.data) throw new Error(`library row: ${library.error?.message}`);
  libraryId = library.data.id;
  const ticked = await admin.from("lead_link_documents").insert([
    { lead_id: lead, document_id: libraryId, created_by: ownerId },
    { lead_id: lead, name: "TEST Site plan", storage_path: ownPath, content_type: "application/pdf", size_bytes: 60, created_by: ownerId },
  ]);
  if (ticked.error) throw new Error(`lead documents: ${ticked.error.message}`);

  // The agreement's text: Keenan's own if he has written it; otherwise a
  // marked test text, but only while no other lead is waiting on it (so no
  // real customer could ever be shown it), put back at the end.
  const { data: settings } = await admin.from("settings").select("agreement_text").eq("id", 1).single();
  if (settings?.agreement_text?.trim()) {
    agreementReady = true;
  } else {
    const { count } = await admin.from("lead_link_options").select("lead_id", { count: "exact", head: true }).eq("agreement_to_sign", true);
    if ((count ?? 0) === 0) {
      agreementBefore = settings?.agreement_text ?? null;
      const set = await admin.from("settings").update({ agreement_text: TEST_AGREEMENT }).eq("id", 1);
      if (set.error) throw new Error(`agreement text: ${set.error.message}`);
      agreementReady = true;
    }
  }
});

afterAll(async () => {
  // Only what this run set, and only if it is still there: never something
  // Keenan saved in the meantime.
  if (agreementBefore !== undefined) await admin.from("settings").update({ agreement_text: agreementBefore }).eq("id", 1).eq("agreement_text", TEST_AGREEMENT);
  if (lead) {
    await admin.from("agreement_signatures").delete().eq("lead_id", lead);
    await admin.from("lead_link_documents").delete().eq("lead_id", lead);
    await admin.from("lead_link_options").delete().eq("lead_id", lead);
    await admin.from("earnings").delete().eq("lead_id", lead);
    await admin.from("quote_links").delete().eq("lead_id", lead);
    await admin.from("quotes").delete().eq("lead_id", lead);
  }
  if (libraryId) await admin.from("link_documents").delete().eq("id", libraryId);
  await admin.storage.from(DOCS).remove([libraryPath, strayPath, ...(ownPath ? [ownPath] : [])]);
  if (setter.id) {
    await admin.from("leads").delete().eq("created_by", setter.id);
    await admin.auth.admin.deleteUser(setter.id);
  }
});

describe("the new tables are Keenan's alone", () => {
  const tables = ["link_documents", "lead_link_documents", "lead_link_options", "agreement_signatures"] as const;

  it("a setter reads none of them, even for their own lead", async () => {
    for (const table of tables) {
      const { data } = await setter.client.from(table).select("*");
      expect(data ?? [], table).toEqual([]);
    }
  });

  it("a setter can't add to them or change them", async () => {
    const tick = await setter.client.from("lead_link_documents").insert({ lead_id: lead, document_id: libraryId });
    expect(tick.error).not.toBeNull();
    const doc = await setter.client.from("link_documents").insert({ name: "Mine", storage_path: `library/${randomUUID()}.pdf`, content_type: "application/pdf" });
    expect(doc.error).not.toBeNull();
    const option = await setter.client.from("lead_link_options").insert({ lead_id: lead, agreement_to_sign: true });
    expect(option.error).not.toBeNull();
    const signature = await (setter.client as unknown as SupabaseClient).from("agreement_signatures").insert({ lead_id: lead, offer_id: "full", offer_name: "x", signer_name: "A Setter", signature_png: SIGNATURE, agreement_text: "x", quote_snapshot: {}, lead_snapshot: {} });
    expect(signature.error).not.toBeNull();
    // Renaming a document changes nothing either.
    await setter.client.from("link_documents").update({ name: "Renamed" }).eq("id", libraryId);
    expect((await admin.from("link_documents").select("name").eq("id", libraryId).single()).data?.name).toBe(`TEST Warranty ${stamp}`);
  });

  it("an anonymous caller reaches none of them", async () => {
    for (const table of tables) {
      const { data, error } = await anon.from(table).select("*");
      expect(error !== null || (data ?? []).length === 0, table).toBe(true);
    }
    expect((await anon.from("lead_link_options").insert({ lead_id: lead, agreement_to_sign: true })).error).not.toBeNull();
  });
});

describe("documents on the link", () => {
  it("the link lists the ticked standard document, then their own file", async () => {
    const { data } = await anon.rpc("quote_link_documents", { p_token: token });
    expect(data).toEqual([
      { id: libraryId, name: `TEST Warranty ${stamp}`, path: libraryPath, content_type: "application/pdf", size: 60 },
      expect.objectContaining({ name: "TEST Site plan", path: ownPath, content_type: "application/pdf" }),
    ]);
    expect((await anon.rpc("quote_link_documents", { p_token: "not-a-real-token-000000000" })).data).toEqual([]);
  });

  it("the token signs exactly those files; nothing else, and nobody without it", async () => {
    const holder = withToken(token);
    expect(await signs(holder, libraryPath)).toBe(true);
    expect(await signs(holder, ownPath)).toBe(true);
    // A standard file Keenan didn't tick for them.
    expect(await signs(holder, strayPath)).toBe(false);
    // No token, a made-up token, and a signed-in setter.
    expect(await signs(anon, libraryPath)).toBe(false);
    expect(await signs(withToken("not-a-real-token-000000000"), libraryPath)).toBe(false);
    expect(await signs(setter.client, libraryPath)).toBe(false);
    expect(await signs(setter.client, ownPath)).toBe(false);
    // A setter can't put a file in the bucket either.
    const put = await setter.client.storage.from(DOCS).upload(`leads/${lead}/${randomUUID()}.pdf`, pdf(), { contentType: "application/pdf" });
    expect(put.error).not.toBeNull();
  });

  it("an unticked document and a retired one stop showing and stop signing", async () => {
    const holder = withToken(token);
    const now = new Date().toISOString();
    await admin.from("lead_link_documents").update({ removed_at: now }).eq("lead_id", lead).eq("document_id", libraryId);
    expect(((await anon.rpc("quote_link_documents", { p_token: token })).data as unknown[]).length).toBe(1);
    expect(await signs(holder, libraryPath)).toBe(false);
    // Ticked again, then retired in Settings.
    await admin.from("lead_link_documents").update({ removed_at: null }).eq("lead_id", lead).eq("document_id", libraryId);
    expect(await signs(holder, libraryPath)).toBe(true);
    await admin.from("link_documents").update({ retired_at: now }).eq("id", libraryId);
    expect(((await anon.rpc("quote_link_documents", { p_token: token })).data as unknown[]).length).toBe(1);
    expect(await signs(holder, libraryPath)).toBe(false);
    await admin.from("link_documents").update({ retired_at: null }).eq("id", libraryId);
    // Their own file, removed from their link.
    await admin.from("lead_link_documents").update({ removed_at: now }).eq("lead_id", lead).eq("storage_path", ownPath);
    expect(await signs(holder, ownPath)).toBe(false);
    await admin.from("lead_link_documents").update({ removed_at: null }).eq("lead_id", lead).eq("storage_path", ownPath);
    expect(await signs(holder, ownPath)).toBe(true);
  });
});

describe("Build your own", () => {
  it("refuses an area Keenan hid, one with no feet, one off the quote, and nothing at all", async () => {
    expect(await build([0, 3])).toEqual({ ok: false, state: "bad_runs" });
    expect(await build([0, 4])).toEqual({ ok: false, state: "bad_runs" });
    expect(await build([0, 99])).toEqual({ ok: false, state: "bad_runs" });
    expect(await build([-1])).toEqual({ ok: false, state: "bad_runs" });
    expect(await build([])).toEqual({ ok: false, state: "no_runs" });
    expect(await storedOffers()).toEqual(KEENANS);
    expect((await linkRow())?.booked_offer).toBeNull();
  });

  it("saves their build as one offer beside Keenan's, untouched, and books it", async () => {
    // Out of order and repeated on purpose: saved sorted, each once.
    expect(await build([2, 0, 2], "full")).toMatchObject({ ok: true, option: CUSTOM_NAME, notify: true });
    const offers = await storedOffers();
    expect(offers.slice(0, 4)).toEqual(KEENANS);
    expect(offers.slice(4)).toEqual([{ id: "customer", name: CUSTOM_NAME, runs: [0, 2], boxes: 2, upper_access: null, from_customer: true }]);
    expect(await linkRow()).toMatchObject({ booked_offer: "customer", booked_option: CUSTOM_NAME, booked_selection: [0, 2] });
    const requested = await events("install_requested");
    expect(requested).toHaveLength(1);
    expect(JSON.stringify(requested)).not.toMatch(/\$|total|price/i);
  });

  it("the page gets it marked as theirs, and never the hidden offer", async () => {
    const { data } = await anon.rpc("quote_for_customer", { p_token: token });
    const page = data as unknown as { quote: { offers: Offer[] }; booked_offer: string | null };
    expect(page.quote.offers.map((offer) => offer.id)).toEqual(["full", "lower", "shed", "customer"]);
    expect(page.quote.offers.at(-1)).toMatchObject({ from_customer: true, runs: [0, 2] });
    expect(page.booked_offer).toBe("customer");
    expect(JSON.stringify(page)).not.toContain(`Pocket ${stamp}`);
  });

  it("the same areas again tells Keenan nothing new; different areas replace their last and tell him once", async () => {
    expect(await build([2, 0, 0], "full")).toMatchObject({ ok: true, option: CUSTOM_NAME, notify: false });
    expect(await events("install_requested")).toHaveLength(1);
    // Different areas, started from an offer with no box count of its own.
    expect(await build([1], "lower")).toMatchObject({ ok: true, notify: true });
    const offers = await storedOffers();
    expect(offers.slice(0, 4)).toEqual(KEENANS);
    expect(offers.filter((offer) => offer.from_customer === true)).toEqual([
      { id: "customer", name: CUSTOM_NAME, runs: [1], boxes: null, upper_access: null, from_customer: true },
    ]);
    expect(await events("install_requested")).toHaveLength(2);
    // Starting from a hidden offer, or from nothing, takes no box count from it.
    expect(await build([0, 1], "pocket")).toMatchObject({ ok: true });
    expect((await storedOffers()).at(-1)).toMatchObject({ runs: [0, 1], boxes: null });
    expect(await build([0, 2], null)).toMatchObject({ ok: true });
    expect((await storedOffers()).at(-1)).toMatchObject({ runs: [0, 2], boxes: null });
  });

  it("a made-up token saves nothing", async () => {
    const { data } = await anon.rpc("quote_link_book_custom", { p_token: "not-a-real-token-000000000", p_runs: [0], p_from: "full" });
    expect(data).toEqual({ ok: false, state: "expired" });
  });
});

describe("the agreement", () => {
  const sign = async (name: string, offer: string, signature = SIGNATURE) =>
    (await anon.rpc("quote_link_sign_agreement", { p_token: token, p_name: name, p_offer: offer, p_signature: signature })).data as { ok: boolean; state?: string; option?: string };

  it("isn't on the link until Keenan ticks it for the lead", async () => {
    expect((await anon.rpc("quote_link_agreement", { p_token: token })).data).toBeNull();
    expect(await sign("Jane Smith", "full")).toEqual({ ok: false, state: "not_offered" });
    expect((await admin.from("lead_link_options").insert({ lead_id: lead, agreement_to_sign: true, updated_by: ownerId })).error).toBeNull();
  });

  it("shows Settings' text once ticked, and takes one signing per link", async () => {
    if (!agreementReady) return; // Settings has no text and a real lead is waiting on it: left alone.
    const shown = (await anon.rpc("quote_link_agreement", { p_token: token })).data as { text: string; signed: unknown };
    expect(shown.text.length).toBeGreaterThan(0);
    expect(shown.signed).toBeNull();

    expect(await sign("J", "full")).toEqual({ ok: false, state: "bad_name" });
    expect(await sign("Jane Smith", "full", "data:image/png;base64,short")).toEqual({ ok: false, state: "bad_signature" });
    expect(await sign("Jane Smith", "full", `data:image/jpeg;base64,${"A".repeat(300)}`)).toEqual({ ok: false, state: "bad_signature" });
    expect(await sign("Jane Smith", "pocket")).toEqual({ ok: false, state: "no_offer" });
    expect(await sign("Jane Smith", "nope")).toEqual({ ok: false, state: "no_offer" });
    expect((await admin.from("agreement_signatures").select("id", { count: "exact", head: true }).eq("lead_id", lead)).count).toBe(0);

    expect(await sign("  Jane   Smith ", "full")).toMatchObject({ ok: true, option: "Full front" });
    const { data: saved } = await admin.from("agreement_signatures").select("*").eq("lead_id", lead).single();
    expect(saved).toMatchObject({ link_id: linkId, quote_id: quote, offer_id: "full", offer_name: "Full front", signer_name: "Jane Smith", signature_png: SIGNATURE, agreement_text: shown.text });
    const snapshot = saved?.quote_snapshot as unknown as { runs: unknown[]; offers: Offer[]; price_per_ft: number };
    expect(snapshot.runs).toHaveLength(RUNS.length);
    expect(snapshot.offers.map((offer) => offer.id)).toEqual(["full", "lower", "shed", "customer"]);
    expect(Number(snapshot.price_per_ft)).toBe(24);
    expect(saved?.lead_snapshot).toMatchObject({ first_name: TEST_LEAD });

    // Signing books that option, and the timeline says who signed, no price.
    expect(await linkRow()).toMatchObject({ booked_offer: "full", booked_option: "Full front" });
    const signedEvents = await events("agreement_signed");
    expect(signedEvents).toEqual([{ payload: { option: "Full front", signer: "Jane Smith" } }]);

    expect(await sign("Someone Else", "lower")).toEqual({ ok: false, state: "already_signed" });
    expect((await admin.from("agreement_signatures").select("id", { count: "exact", head: true }).eq("lead_id", lead)).count).toBe(1);

    // The page says it is signed; their copy comes back through the token only.
    const after = (await anon.rpc("quote_link_agreement", { p_token: token })).data as { signed: { signer_name: string; offer_id: string } };
    expect(after.signed).toMatchObject({ signer_name: "Jane Smith", offer_id: "full" });
    const copy = (await anon.rpc("quote_link_signed_copy", { p_token: token })).data as { signer_name: string; signature_png: string; quote: unknown };
    expect(copy).toMatchObject({ signer_name: "Jane Smith", signature_png: SIGNATURE });
    expect((await anon.rpc("quote_link_signed_copy", { p_token: "not-a-real-token-000000000" })).data).toBeNull();
    // And a setter still reads none of it.
    expect((await setter.client.from("agreement_signatures").select("id")).data ?? []).toEqual([]);
  });

  it("goes away again when Keenan unticks it", async () => {
    await admin.from("lead_link_options").update({ agreement_to_sign: false }).eq("lead_id", lead);
    expect((await anon.rpc("quote_link_agreement", { p_token: token })).data).toBeNull();
  });
});

describe("the customer's offer and a J track area, once Keenan accepts", () => {
  it("is accepted like any other, and the commission counts J track at its own price", async () => {
    // Their build: Front (60 ft at $24) and Upper gables (20 ft of J track at $30), two boxes.
    expect(await build([0, 2], "full")).toMatchObject({ ok: true });
    const accepted = await admin.rpc("quote_accept_offer", { p_quote: quote, p_offer: "customer" });
    expect(accepted.error).toBeNull();
    const { data: row } = await admin.from("quotes").select("status, accepted_offer, accepted_runs, accepted_boxes").eq("id", quote).single();
    expect(row).toEqual({ status: "accepted", accepted_offer: "customer", accepted_runs: [0, 2], accepted_boxes: 2 });

    const { data: rate } = await admin.from("settings").select("commission_rate").eq("id", 1).single();
    const { data: earning } = await admin.from("earnings").select("base_amount, amount, rate, type, profile_id").eq("lead_id", lead).eq("type", "commission").single();
    const base = 60 * 24 + 20 * 30 + 2 * 500;
    expect(Number(earning?.base_amount)).toBe(base);
    expect(Number(earning?.amount)).toBeCloseTo(Math.round(base * Number(rate?.commission_rate) * 100) / 100, 2);
    expect(earning?.profile_id).toBe(setter.id);
  });

  it("an accepted quote takes no new build", async () => {
    expect(await build([0], "full")).toEqual({ ok: false, state: "accepted" });
    expect((await storedOffers()).at(-1)).toMatchObject({ id: "customer", runs: [0, 2] });
  });
});
