import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database, Json } from "@/types/database";

// Proves round 10's mockups per house in the database itself (Keenan,
// 2026-11-10): lead_mockups is Keenan's alone (a setter and a signed-out
// visitor read nothing and can't add or change one), one Main, one Day and
// one Night per house among the pictures not removed, and the customer's
// link gets only the Main and the pictures marked for offers, Main first,
// for a live token; a bad or revoked token gets []. Storage signs those
// pictures for a request carrying a live token, and nothing else.
// Round 13 (Keenan, 2026-11-11): the link also gets the house's phone
// scenes, each by name, for "See it on your house" (until then a scene was
// never listed or signed for a link), and an offer's picture only while
// Keenan shows that offer to the customer.
//
// One throwaway setter with a test-prefixed email; the leads are named
// "TEST LEAD (automated)". The service role stands in for Keenan, who is
// the only one the policies let in: there is one owner account, Keenan's,
// and the tests never sign in as him. Everything made here is removed at
// the end: the pictures, the mockup rows, links before quotes before leads.
//
// Run it (after 20261110231426_round10_mockups.sql is applied) with:
//   NODE_USE_ENV_PROXY=1 npm run test:rls -- tests/rls/lead-mockups.test.ts

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
  createClient<Database>(url, anonKey, { ...noSession, global: { headers: { "x-quote-token": token } } });
const stamp = Date.now().toString(36);
const TEST_LEAD = "TEST LEAD (automated)";
const BUCKET = "lead-photos";
// A 1 x 1 JPEG.
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=",
  "base64",
);

type TestUser = { email: string; password: string; id: string; client: Client };
const setter: TestUser = {
  email: `rls-mockups-${stamp}@example.com`,
  password: `Rls-mockups-${stamp}-pass`,
  id: "",
  client: admin,
};

let ownerId = "";
let leadA = "";
let leadB = "";
let tokenA = "";
let tokenB = "";
const paths: Record<"main" | "front" | "pocket" | "scene" | "day" | "removed" | "other" | "legacy", string> = {
  main: "",
  front: "",
  // The picture of an offer Keenan hides from the customer (round 13).
  pocket: "",
  scene: "",
  day: "",
  removed: "",
  other: "",
  // A mockup made before round 10: a lead_photos row in the old mockup slot.
  legacy: "",
};
// An ordinary photo the setter took on their own lead, in their own folder.
let setterPhoto = "";

const RUNS = [
  { name: "Front", feet: 60, level: "lower", part: "eave" },
  { name: "Upper front", feet: 40, level: "upper", part: "eave" },
];
const OFFERS = [
  { id: "full", name: "Full wrap", runs: [0, 1] },
  { id: "front_lower", name: "Front lower", runs: [0] },
  // Round 13: hidden from the customer, so its picture never reaches the link.
  { id: "pocket", name: "Pocket offer", runs: [1], hidden: true },
];

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
    .insert({ first_name: TEST_LEAD, last_name: "Mockups", address_line: street, neighbourhood: "TEST (automated)", created_by: setter.id })
    .select("id")
    .single();
  if (error || !data) throw new Error(`lead: ${error?.message}`);
  return data.id;
}

async function newQuote(leadId: string): Promise<void> {
  const { error } = await admin.from("quotes").insert({
    lead_id: leadId,
    created_by: ownerId,
    price_per_ft: 23,
    box_price: 500,
    box_count: 1,
    runs: RUNS as unknown as Json,
    offers: OFFERS as unknown as Json,
    total_feet: 100,
    adders: [],
    discounts: [],
    gst_rate: 0.05,
    gst_enabled: false,
    subtotal: 2800,
    total: 2800,
    valid_until: calgaryDay(14),
  });
  if (error) throw new Error(`quote: ${error.message}`);
}

async function liveLink(leadId: string): Promise<string> {
  const { data: token, error } = await admin.rpc("issue_quote_link", { p_lead_id: leadId });
  if (error || !token) throw new Error(`link: ${error?.message}`);
  const handed = await admin.from("quote_links").update({ created_by: setter.id }).eq("token", token);
  if (handed.error) throw new Error(`link maker: ${handed.error.message}`);
  return token;
}

// A picture in Keenan's folder, uploaded for real so storage can sign it.
async function picture(): Promise<string> {
  const path = `${ownerId}/${crypto.randomUUID()}.jpg`;
  const { error } = await admin.storage.from(BUCKET).upload(path, JPEG, { contentType: "image/jpeg" });
  if (error) throw new Error(`upload: ${error.message}`);
  return path;
}

type LinkMockup = { path: string; main: boolean; scene: boolean; name: string; offers: string[] };
const linkMockups = async (client: Client, token: string) =>
  (await client.rpc("quote_link_mockups", { p_token: token })).data as LinkMockup[] | null;

beforeAll(async () => {
  const { data: owner } = await admin.from("profiles").select("id").eq("role", "owner").single();
  if (!owner) throw new Error("no owner profile");
  ownerId = owner.id;

  const { data, error } = await admin.auth.admin.createUser({
    email: setter.email,
    password: setter.password,
    email_confirm: true,
    user_metadata: { full_name: "RLS Mockups Setter" },
    app_metadata: { role: "sales" },
  });
  if (error || !data.user) throw new Error(`could not create ${setter.email}: ${error?.message}`);
  setter.id = data.user.id;
  setter.client = await signedIn(setter.email, setter.password);

  leadA = await newLead(`1 Mockuptest Street NW ${stamp}`);
  leadB = await newLead(`2 Mockuptest Street NW ${stamp}`);
  await newQuote(leadA);
  await newQuote(leadB);
  tokenA = await liveLink(leadA);
  tokenB = await liveLink(leadB);

  for (const key of Object.keys(paths) as (keyof typeof paths)[]) paths[key] = await picture();
  const { error: rowsError } = await admin.from("lead_mockups").insert([
    { lead_id: leadA, storage_path: paths.scene, name: "Christmas", is_scene: true, position: 0, created_by: ownerId },
    { lead_id: leadA, storage_path: paths.main, name: "Main", is_main: true, position: 1, created_by: ownerId },
    { lead_id: leadA, storage_path: paths.front, name: "Front lower", offer_ids: ["front_lower", "pocket"], position: 2, created_by: ownerId },
    { lead_id: leadA, storage_path: paths.pocket, name: "Pocket only", offer_ids: ["pocket"], position: 5, created_by: ownerId },
    { lead_id: leadA, storage_path: paths.day, name: "Day", is_day: true, position: 3, created_by: ownerId },
    {
      lead_id: leadA,
      storage_path: paths.removed,
      name: "Old",
      offer_ids: ["full"],
      position: 4,
      created_by: ownerId,
      removed_at: new Date().toISOString(),
    },
    { lead_id: leadB, storage_path: paths.other, name: "Main", is_main: true, created_by: ownerId },
  ], { defaultToNull: false });
  if (rowsError) throw new Error(`mockups: ${rowsError.message}`);

  // The old mockup slot on lead A (the service role, like the carry-over),
  // and a front photo the setter took on their own lead.
  const legacy = await admin.from("lead_photos").insert({ lead_id: leadA, storage_path: paths.legacy, slot: "mockup", created_by: ownerId });
  if (legacy.error) throw new Error(`legacy mockup: ${legacy.error.message}`);
  setterPhoto = `${setter.id}/${crypto.randomUUID()}.jpg`;
  const uploaded = await setter.client.storage.from(BUCKET).upload(setterPhoto, JPEG, { contentType: "image/jpeg" });
  if (uploaded.error) throw new Error(`setter photo: ${uploaded.error.message}`);
  const front = await setter.client.from("lead_photos").insert({ lead_id: leadA, storage_path: setterPhoto, slot: "front" });
  if (front.error) throw new Error(`front photo: ${front.error.message}`);
});

afterAll(async () => {
  const leads = new Set([leadA, leadB].filter(Boolean));
  if (setter.id) {
    const { data } = await admin.from("leads").select("id").eq("created_by", setter.id);
    for (const lead of data ?? []) leads.add(lead.id);
  }
  const all = [...leads];
  if (all.length > 0) {
    const { data: rows } = await admin.from("lead_mockups").select("storage_path").in("lead_id", all);
    const stored = [...new Set([...(rows ?? []).map((row) => row.storage_path), ...Object.values(paths).filter(Boolean), ...(setterPhoto ? [setterPhoto] : [])])];
    if (stored.length > 0) await admin.storage.from(BUCKET).remove(stored);
    await admin.from("lead_mockups").delete().in("lead_id", all);
    await admin.from("quote_links").delete().in("lead_id", all);
    await admin.from("quotes").delete().in("lead_id", all);
  }
  if (setter.id) {
    await admin.from("leads").delete().eq("created_by", setter.id);
    await admin.auth.admin.deleteUser(setter.id);
  }
});

describe("lead_mockups is Keenan's alone", () => {
  it("Keenan (the service role standing in) reads every picture, removed ones included", async () => {
    const { data, error } = await admin.from("lead_mockups").select("storage_path").eq("lead_id", leadA);
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(6);
  });

  it("a setter reads nothing, even on their own lead", async () => {
    const { data } = await setter.client.from("lead_mockups").select("id").in("lead_id", [leadA, leadB]);
    expect(data ?? []).toEqual([]);
  });

  it("a setter can't add a mockup", async () => {
    const path = `${setter.id}/${crypto.randomUUID()}.jpg`;
    const { error } = await setter.client.from("lead_mockups").insert({ lead_id: leadA, storage_path: path, is_main: true });
    expect(error).not.toBeNull();
    const { data } = await admin.from("lead_mockups").select("id").eq("storage_path", path);
    expect(data ?? []).toEqual([]);
  });

  it("a setter can't change one", async () => {
    await setter.client.from("lead_mockups").update({ name: "Changed", is_main: false }).eq("storage_path", paths.main);
    const { data } = await admin.from("lead_mockups").select("name, is_main").eq("storage_path", paths.main).single();
    expect(data).toEqual({ name: "Main", is_main: true });
  });

  it("a signed-out visitor reads and adds nothing", async () => {
    const read = await anon.from("lead_mockups").select("id").eq("lead_id", leadA);
    expect(read.data ?? []).toEqual([]);
    const path = `${ownerId}/${crypto.randomUUID()}.jpg`;
    const added = await anon.from("lead_mockups").insert({ lead_id: leadA, storage_path: path });
    expect(added.error).not.toBeNull();
  });

  it("keeps one Main, one Day and one Night per house among the pictures not removed", async () => {
    const extra = `${ownerId}/${crypto.randomUUID()}.jpg`;
    const second = await admin.from("lead_mockups").insert({ lead_id: leadA, storage_path: extra, is_main: true });
    expect(second.error?.code).toBe("23505");
    const day = await admin.from("lead_mockups").insert({ lead_id: leadA, storage_path: extra, is_day: true });
    expect(day.error?.code).toBe("23505");
    // A removed picture never holds the place.
    const night = await admin
      .from("lead_mockups")
      .insert({ lead_id: leadA, storage_path: extra, is_night: true, removed_at: new Date().toISOString() });
    expect(night.error).toBeNull();
    await admin.from("lead_mockups").delete().eq("storage_path", extra);
  });
});

// Round 10 catch-up (Keenan, 2026-11-11): a setter can't reach a mockup
// through storage either, nor an old mockup-slot row, while ordinary lead
// photos still work for them.
describe("a setter can't reach a mockup file or row", () => {
  const basename = (path: string) => path.slice(path.indexOf("/") + 1);
  const mockupPaths = () => [paths.main, paths.front, paths.scene, paths.day, paths.legacy];

  it("can't sign or download any mockup, new or old", async () => {
    for (const path of mockupPaths()) {
      const signed = await setter.client.storage.from(BUCKET).createSignedUrl(path, 60);
      expect(signed.data?.signedUrl ?? null).toBeNull();
      const downloaded = await setter.client.storage.from(BUCKET).download(path);
      expect(downloaded.data).toBeNull();
    }
  });

  it("never sees a mockup when listing Keenan's folder, while Keenan does", async () => {
    for (const path of mockupPaths()) {
      const theirs = await setter.client.storage.from(BUCKET).list(ownerId, { search: basename(path) });
      expect((theirs.data ?? []).map((file) => file.name)).toEqual([]);
      const his = await admin.storage.from(BUCKET).list(ownerId, { search: basename(path) });
      expect((his.data ?? []).map((file) => file.name)).toEqual([basename(path)]);
    }
  });

  it("still signs an ordinary lead photo, their own and Keenan's", async () => {
    const own = await setter.client.storage.from(BUCKET).createSignedUrl(setterPhoto, 60);
    expect(own.data?.signedUrl ?? null).not.toBeNull();
  });

  it("reads the front photo's row but never a mockup-slot row", async () => {
    const { data: rows } = await setter.client.from("lead_photos").select("slot, storage_path").eq("lead_id", leadA);
    expect((rows ?? []).map((row) => row.slot)).toEqual(["front"]);
    const { data: anyMockup } = await setter.client.from("lead_photos").select("id").eq("slot", "mockup");
    expect(anyMockup).toEqual([]);
    const { data: his } = await admin.from("lead_photos").select("slot").eq("lead_id", leadA);
    expect((his ?? []).map((row) => row.slot).sort()).toEqual(["front", "mockup"]);
  });

  it("a customer's token lists nothing of another house, and only its own Main, scenes and shown offers' pictures", async () => {
    const other = await withToken(tokenA).storage.from(BUCKET).list(ownerId, { search: basename(paths.other) });
    expect((other.data ?? []).map((file) => file.name)).toEqual([]);
    const day = await withToken(tokenA).storage.from(BUCKET).list(ownerId, { search: basename(paths.day) });
    expect((day.data ?? []).map((file) => file.name)).toEqual([]);
    const pocket = await withToken(tokenA).storage.from(BUCKET).list(ownerId, { search: basename(paths.pocket) });
    expect((pocket.data ?? []).map((file) => file.name)).toEqual([]);
    // Round 13: a scene is the link's now.
    const scene = await withToken(tokenA).storage.from(BUCKET).list(ownerId, { search: basename(paths.scene) });
    expect((scene.data ?? []).map((file) => file.name)).toEqual([basename(paths.scene)]);
    const main = await withToken(tokenA).storage.from(BUCKET).list(ownerId, { search: basename(paths.main) });
    expect((main.data ?? []).map((file) => file.name)).toEqual([basename(paths.main)]);
  });
});

describe("quote_link_mockups", () => {
  it("returns the Main first, then the scenes by name and the shown offers' pictures, for a live token", async () => {
    // A scene carries its name (the Looks row); no other picture does. The
    // picture for Front lower is also marked for the hidden offer: only the
    // shown offer is named.
    expect(await linkMockups(anon, tokenA)).toEqual([
      { path: paths.main, main: true, scene: false, name: "", offers: [] },
      { path: paths.scene, main: false, scene: true, name: "Christmas", offers: [] },
      { path: paths.front, main: false, scene: false, name: "", offers: ["front_lower"] },
    ]);
  });

  it("never returns a hidden offer's picture, a Day, a removed picture or another house's", async () => {
    const list = (await linkMockups(anon, tokenA)) ?? [];
    const shown = list.map((item) => item.path);
    for (const hidden of [paths.pocket, paths.day, paths.removed, paths.other]) expect(shown).not.toContain(hidden);
    expect(JSON.stringify(list)).not.toContain("pocket");
    expect(JSON.stringify(list)).not.toContain("Pocket");
  });

  it("is empty for a bad token", async () => {
    expect(await linkMockups(anon, "not-a-token")).toEqual([]);
    expect(await linkMockups(anon, "")).toEqual([]);
  });

  it("is empty once the link is turned off", async () => {
    await admin.from("quote_links").update({ revoked_at: new Date().toISOString() }).eq("token", tokenB);
    expect(await linkMockups(anon, tokenB)).toEqual([]);
  });
});

describe("storage signs the link's pictures for a live token only", () => {
  const sign = async (client: Client, path: string) =>
    (await client.storage.from(BUCKET).createSignedUrl(path, 60)).data?.signedUrl ?? null;

  it("signs the Main, a scene and a shown offer's picture", async () => {
    expect(await sign(withToken(tokenA), paths.main)).not.toBeNull();
    expect(await sign(withToken(tokenA), paths.scene)).not.toBeNull();
    expect(await sign(withToken(tokenA), paths.front)).not.toBeNull();
  });

  it("never signs a hidden offer's picture, a Day, a removed picture or another house's", async () => {
    for (const hidden of [paths.pocket, paths.day, paths.removed, paths.other]) {
      expect(await sign(withToken(tokenA), hidden)).toBeNull();
    }
  });

  it("follows the switch: shown, the offer's picture is listed and signed; hidden again, it is neither", async () => {
    const quoteOf = async () => (await admin.from("quotes").select("id").eq("lead_id", leadA).single()).data!.id;
    const id = await quoteOf();
    const shownNow = OFFERS.map((offer) => ({ id: offer.id, name: offer.name, runs: offer.runs }));
    expect((await admin.from("quotes").update({ offers: shownNow as unknown as Json }).eq("id", id)).error).toBeNull();
    expect(((await linkMockups(anon, tokenA)) ?? []).map((item) => item.path)).toContain(paths.pocket);
    expect(await sign(withToken(tokenA), paths.pocket)).not.toBeNull();
    expect((await admin.from("quotes").update({ offers: OFFERS as unknown as Json }).eq("id", id)).error).toBeNull();
    expect(((await linkMockups(anon, tokenA)) ?? []).map((item) => item.path)).not.toContain(paths.pocket);
    expect(await sign(withToken(tokenA), paths.pocket)).toBeNull();
  });

  it("signs nothing without a live token", async () => {
    expect(await sign(anon, paths.main)).toBeNull();
    expect(await sign(withToken("not-a-token"), paths.main)).toBeNull();
    expect(await sign(withToken(tokenB), paths.other)).toBeNull();
  });
});
