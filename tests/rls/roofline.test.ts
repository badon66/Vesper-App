import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";

// Round 7, Branch B (light_picker.tracing and rehearsal_and_references):
// the roofline Keenan traces in prep, his own deck photos and the researched
// example shots are his alone. A setter (even on their own lead) and anyone
// signed out read nothing and write nothing in roofline_traces, deck_photos
// or presentation_references. One throwaway setter, a lead of theirs with a
// trace on it, and one deck photo row (no file); everything removed at the
// end. The seeded references are only read, never changed.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  throw new Error("RLS tests need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY. See .env.example.");
}

type Client = SupabaseClient<Database>;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin: Client = createClient<Database>(url, serviceKey, noSession);
const anon: Client = createClient<Database>(url, anonKey, noSession);
const stamp = Date.now().toString(36);
const setter = { email: `rls-r7b-${stamp}@example.com`, password: `Rls-r7b-${stamp}-pass`, id: "", client: admin };
let leadId = "";
let otherLeadId = "";
let deckPhotoId = "";
let referenceId = "";
const fakePhotoId = crypto.randomUUID();

const traceRow = (lead: string) => ({
  lead_id: lead,
  photo_id: fakePhotoId,
  photo_slot: "front" as const,
  lines: [
    [
      [0.1, 0.3],
      [0.7, 0.3],
    ],
  ],
  line_feet: [null],
  scale: { a: [0.4, 0.8], b: [0.65, 0.8], feet: 16, kind: "double" },
  dusk_brightness: 0.7,
  luminance: 0.4,
  light_count: 60,
});

beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({
    email: setter.email,
    password: setter.password,
    email_confirm: true,
    user_metadata: { full_name: "RLS R7B" },
    app_metadata: { role: "sales" },
  });
  if (error || !data.user) throw new Error(`could not create ${setter.email}: ${error?.message}`);
  setter.id = data.user.id;
  const client = createClient<Database>(url!, anonKey!, noSession);
  const signedIn = await client.auth.signInWithPassword({ email: setter.email, password: setter.password });
  if (signedIn.error) throw new Error(`sign in failed: ${signedIn.error.message}`);
  setter.client = client;

  const leads = await admin
    .from("leads")
    .insert([
      { created_by: setter.id, first_name: `TEST R7B ${stamp}`, address_line: `1 Roofline Test Way NW (TEST ${stamp})` },
      { created_by: setter.id, first_name: `TEST R7B other ${stamp}`, address_line: `2 Roofline Test Way NW (TEST ${stamp})` },
    ])
    .select("id");
  if (leads.error || !leads.data || leads.data.length !== 2) throw new Error(`could not create the leads: ${leads.error?.message}`);
  leadId = leads.data[0].id;
  otherLeadId = leads.data[1].id;

  const trace = await admin.from("roofline_traces").insert(traceRow(leadId));
  if (trace.error) throw new Error(`could not create the trace: ${trace.error.message}`);

  const deck = await admin
    .from("deck_photos")
    .insert({ slot: "gallery.test_rls", path: `deck/${crypto.randomUUID()}.jpg`, caption: "Warm white" })
    .select("id")
    .single();
  if (deck.error || !deck.data) throw new Error(`could not create the deck photo row: ${deck.error?.message}`);
  deckPhotoId = deck.data.id;

  const reference = await admin.from("presentation_references").select("id").limit(1).single();
  if (reference.error || !reference.data) throw new Error(`no seeded reference to test against: ${reference.error?.message}`);
  referenceId = reference.data.id;
});

afterAll(async () => {
  if (deckPhotoId) await admin.from("deck_photos").delete().eq("id", deckPhotoId);
  for (const id of [leadId, otherLeadId].filter(Boolean)) {
    await admin.from("roofline_traces").delete().eq("lead_id", id);
    await admin.from("lead_events").delete().eq("lead_id", id);
    await admin.from("leads").delete().eq("id", id);
  }
  if (setter.id) await admin.auth.admin.deleteUser(setter.id);
});

async function traceCount(lead: string): Promise<number> {
  const { count } = await admin.from("roofline_traces").select("lead_id", { count: "exact", head: true }).eq("lead_id", lead);
  return count ?? 0;
}

async function storedTrace() {
  const { data } = await admin.from("roofline_traces").select("light_count, dusk_brightness").eq("lead_id", leadId).single();
  return data;
}

describe("The roofline trace is Keenan's alone", () => {
  it("exists for the test (the owner side can read it)", async () => {
    expect(await traceCount(leadId)).toBe(1);
  });

  it("is never read by a setter, even on their own lead", async () => {
    const { data } = await setter.client.from("roofline_traces").select("*").eq("lead_id", leadId);
    expect(data ?? []).toEqual([]);
    const all = await setter.client.from("roofline_traces").select("lead_id").limit(5);
    expect(all.data ?? []).toEqual([]);
  });

  it("can't be written, changed or removed by a setter", async () => {
    const insert = await setter.client.from("roofline_traces").insert(traceRow(otherLeadId));
    expect(insert.error).not.toBeNull();
    expect(await traceCount(otherLeadId)).toBe(0);

    const update = await setter.client.from("roofline_traces").update({ light_count: 1, dusk_brightness: 1 }).eq("lead_id", leadId).select("lead_id");
    expect(update.data ?? []).toEqual([]);
    expect(await storedTrace()).toEqual({ light_count: 60, dusk_brightness: 0.7 });

    const upsert = await setter.client.from("roofline_traces").upsert({ ...traceRow(leadId), light_count: 2 }, { onConflict: "lead_id" });
    expect(upsert.error).not.toBeNull();
    expect((await storedTrace())?.light_count).toBe(60);

    await setter.client.from("roofline_traces").delete().eq("lead_id", leadId);
    expect(await traceCount(leadId)).toBe(1);
  });

  it("is closed to anyone signed out", async () => {
    const read = await anon.from("roofline_traces").select("lead_id").eq("lead_id", leadId);
    expect(read.data ?? []).toEqual([]);
    const insert = await anon.from("roofline_traces").insert(traceRow(otherLeadId));
    expect(insert.error).not.toBeNull();
    await anon.from("roofline_traces").update({ light_count: 1 }).eq("lead_id", leadId);
    await anon.from("roofline_traces").delete().eq("lead_id", leadId);
    expect(await traceCount(otherLeadId)).toBe(0);
    expect(await storedTrace()).toEqual({ light_count: 60, dusk_brightness: 0.7 });
  });
});

describe("Keenan's deck photos are his alone", () => {
  async function deckPhoto() {
    const { data } = await admin.from("deck_photos").select("id, caption").eq("id", deckPhotoId).maybeSingle();
    return data;
  }

  it("are never read by a setter or anyone signed out", async () => {
    expect((await setter.client.from("deck_photos").select("id").eq("id", deckPhotoId)).data ?? []).toEqual([]);
    expect((await setter.client.from("deck_photos").select("id").limit(5)).data ?? []).toEqual([]);
    expect((await anon.from("deck_photos").select("id").limit(5)).data ?? []).toEqual([]);
  });

  it("can't be added, changed or removed by a setter or anyone signed out", async () => {
    for (const client of [setter.client, anon]) {
      const insert = await client.from("deck_photos").insert({ slot: "gallery.test_rls", path: `deck/${crypto.randomUUID()}.jpg` });
      expect(insert.error).not.toBeNull();
      await client.from("deck_photos").update({ caption: "Changed" }).eq("id", deckPhotoId);
      await client.from("deck_photos").delete().eq("id", deckPhotoId);
    }
    expect(await deckPhoto()).toEqual({ id: deckPhotoId, caption: "Warm white" });
    const { count } = await admin.from("deck_photos").select("id", { count: "exact", head: true }).eq("slot", "gallery.test_rls");
    expect(count).toBe(1);
  });
});

describe("The researched example shots are Keenan's alone", () => {
  async function reference() {
    const { data } = await admin.from("presentation_references").select("id, why, page_url").eq("id", referenceId).maybeSingle();
    return data;
  }

  it("are never read by a setter or anyone signed out", async () => {
    expect((await setter.client.from("presentation_references").select("id").limit(5)).data ?? []).toEqual([]);
    expect((await anon.from("presentation_references").select("id").limit(5)).data ?? []).toEqual([]);
  });

  it("can't be added, changed or removed by a setter or anyone signed out", async () => {
    const before = await reference();
    const { count: countBefore } = await admin.from("presentation_references").select("id", { count: "exact", head: true });
    for (const client of [setter.client, anon]) {
      const insert = await client.from("presentation_references").insert({
        slot: "gallery.test_rls",
        rank: 99,
        page_url: "https://example.com/",
        site: "example.com",
        why: "Test",
        shot: "Test",
      });
      expect(insert.error).not.toBeNull();
      await client.from("presentation_references").update({ why: "Changed by a test" }).eq("id", referenceId);
      await client.from("presentation_references").delete().eq("id", referenceId);
    }
    expect(await reference()).toEqual(before);
    const { count: countAfter } = await admin.from("presentation_references").select("id", { count: "exact", head: true });
    expect(countAfter).toBe(countBefore);
  });
});
