import { LEAD_FIELDS } from "@/lib/leads/fields";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";

// Proves the door process rules in the database itself (Keenan,
// 2026-10-31 and 2026-11-01): the Door guide, the Find out answers, photo
// slots and the owner-only track colour. Signed in as two throwaway setters
// and an account with no profile. Their leads are named "TEST LEAD
// (automated)" and are deleted at the end with their photo files and
// accounts, along with the one test-prefixed track colour made here to
// prove the retired-colour rule. Keenan's own colours are only read.
//
// The service role stands in where the owner would act: there is one owner
// account, Keenan's, and the tests never sign in as him.

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
const TEST_COLOUR = `rls-door-${stamp}`;
const BUCKET = "lead-photos";

type TestUser = { email: string; password: string; id: string; client: Client };
const users: Record<"a" | "b" | "nobody", TestUser> = {
  a: { email: `rls-door-a-${stamp}@example.com`, password: `Rls-door-a-${stamp}-pass`, id: "", client: admin },
  b: { email: `rls-door-b-${stamp}@example.com`, password: `Rls-door-b-${stamp}-pass`, id: "", client: admin },
  nobody: { email: `rls-door-none-${stamp}@example.com`, password: `Rls-door-n-${stamp}-pass`, id: "", client: admin },
};

let jpeg: Buffer;
let leadA = "";
let firstFront = "";
let testColourId = "";

async function signedIn(email: string, password: string): Promise<Client> {
  const client = createClient<Database>(url!, anonKey!, noSession);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in failed for ${email}: ${error.message}`);
  return client;
}

async function newLead(user: TestUser, extra: Partial<Database["public"]["Tables"]["leads"]["Insert"]> = {}) {
  const { data, error } = await user.client
    .from("leads")
    .insert({ first_name: TEST_LEAD, address_line: "1 Test Street NW", created_by: user.id, ...extra })
    // Every column a signed-in person may read: not the phone or email (contact privacy).
    .select(LEAD_FIELDS)
    .single();
  return { lead: data, error };
}

async function uploadPhoto(user: TestUser): Promise<string> {
  const path = `${user.id}/${crypto.randomUUID()}.jpg`;
  const { error } = await user.client.storage.from(BUCKET).upload(path, jpeg, { contentType: "image/jpeg" });
  if (error) throw new Error(`upload failed: ${error.message}`);
  return path;
}

async function lastEvent(leadId: string, type: Database["public"]["Enums"]["event_type"]) {
  const { data } = await admin
    .from("lead_events")
    .select("payload, actor_id")
    .eq("lead_id", leadId)
    .eq("type", type)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  return data;
}

async function removeEverythingOf(id: string) {
  await admin.from("leads").delete().eq("created_by", id);
  await admin.from("knock_sessions").delete().eq("user_id", id);
  const { data: files } = await admin.storage.from(BUCKET).list(id, { limit: 1000 });
  if (files && files.length > 0) {
    await admin.storage.from(BUCKET).remove(files.map((file) => `${id}/${file.name}`));
  }
  await admin.auth.admin.deleteUser(id);
}

beforeAll(async () => {
  jpeg = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#132e3f" } })
    .jpeg()
    .toBuffer();
  for (const key of ["a", "b", "nobody"] as const) {
    const u = users[key];
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { full_name: `RLS Door ${key.toUpperCase()}` },
      app_metadata: key === "nobody" ? {} : { role: "sales" },
    });
    if (error || !data.user) throw new Error(`could not create ${u.email}: ${error?.message}`);
    u.id = data.user.id;
    u.client = await signedIn(u.email, u.password);
  }
  const { lead, error } = await newLead(users.a);
  if (error || !lead) throw new Error(`could not add the test lead: ${error?.message}`);
  leadA = lead.id;
});

afterAll(async () => {
  for (const u of Object.values(users)) {
    if (u.id) await removeEverythingOf(u.id);
  }
  if (testColourId) await admin.from("track_colours").delete().eq("id", testColourId);
});

describe("the Door guide", () => {
  it("an active setter reads it; an account with no profile and a signed-out visitor do not", async () => {
    const { data, error } = await users.a.client.from("settings_public").select("door_guide").single();
    expect(error).toBeNull();
    expect((data?.door_guide ?? "").length).toBeGreaterThan(0);
    const { data: nobody } = await users.nobody.client.from("settings_public").select("door_guide");
    expect(nobody ?? []).toEqual([]);
    const { data: stranger } = await anon.from("settings_public").select("door_guide");
    expect(stranger ?? []).toEqual([]);
  });

  it("a setter cannot change it", async () => {
    const before = await admin.from("settings").select("door_guide").eq("id", 1).single();
    const attempt = await users.a.client.from("settings").update({ door_guide: "Knock louder." }).eq("id", 1).select("id");
    expect(attempt.data ?? []).toEqual([]);
    const after = await admin.from("settings").select("door_guide").eq("id", 1).single();
    expect(after.data?.door_guide).toBe(before.data?.door_guide);
  });
});

describe("Find out answers", () => {
  it("a lead saves with none of them, each one empty until answered", async () => {
    const { data } = await admin
      .from("leads")
      .select("owns_home, wants_price, soffit_colour, christmas_lights_now, areas_wanted, install_timing")
      .eq("id", leadA)
      .single();
    expect(data).toEqual({
      owns_home: null,
      wants_price: null,
      soffit_colour: null,
      christmas_lights_now: null,
      areas_wanted: null,
      install_timing: null,
    });
  });

  it("the setter answers them later, and the timeline names each question, never the answer", async () => {
    const { error } = await users.a.client
      .from("leads")
      .update({
        owns_home: true,
        wants_price: false,
        soffit_colour: "off_white",
        christmas_lights_now: "hires",
        areas_wanted: "full_wrap",
        install_timing: "before_christmas",
      })
      .eq("id", leadA);
    expect(error).toBeNull();
    const event = await lastEvent(leadA, "edited");
    expect(event?.actor_id).toBe(users.a.id);
    expect(event?.payload).toEqual({
      fields: ["areas_wanted", "christmas_lights_now", "install_timing", "owns_home", "soffit_colour", "wants_price"],
    });
  });

  it("the soffit question takes Not sure, and an answer can be cleared", async () => {
    const notSure = await users.a.client.from("leads").update({ soffit_colour: "not_sure" }).eq("id", leadA);
    expect(notSure.error).toBeNull();
    const cleared = await users.a.client.from("leads").update({ install_timing: null }).eq("id", leadA);
    expect(cleared.error).toBeNull();
    const { data } = await admin.from("leads").select("soffit_colour, install_timing").eq("id", leadA).single();
    expect(data).toEqual({ soffit_colour: "not_sure", install_timing: null });
  });

  it("another setter reads the answers but cannot change them", async () => {
    const { data } = await users.b.client.from("leads").select("owns_home, areas_wanted").eq("id", leadA).single();
    expect(data).toEqual({ owns_home: true, areas_wanted: "full_wrap" });
    const attempt = await users.b.client.from("leads").update({ owns_home: false }).eq("id", leadA).select("id");
    expect(attempt.data ?? []).toEqual([]);
  });

  it("the database refuses an answer that is not one of the choices", async () => {
    const { error } = await users.a.client
      .from("leads")
      .update({ christmas_lights_now: "neighbour" as never })
      .eq("id", leadA);
    expect(error?.code).toBe("22P02");
  });
});

describe("photo slots", () => {
  it("a setter puts a photo in a slot on their own lead, and the timeline records the slot", async () => {
    firstFront = await uploadPhoto(users.a);
    const { data, error } = await users.a.client
      .from("lead_photos")
      .insert({ lead_id: leadA, storage_path: firstFront, slot: "front" })
      .select("id, slot")
      .single();
    expect(error).toBeNull();
    expect(data?.slot).toBe("front");
    const event = await lastEvent(leadA, "photo_added");
    expect(event?.payload).toEqual({ photo_id: data!.id, slot: "front" });
  });

  it("an extra photo has no slot, and the timeline says so by leaving it out", async () => {
    const path = await uploadPhoto(users.a);
    const { data, error } = await users.a.client
      .from("lead_photos")
      .insert({ lead_id: leadA, storage_path: path })
      .select("id, slot")
      .single();
    expect(error).toBeNull();
    expect(data?.slot).toBeNull();
    const event = await lastEvent(leadA, "photo_added");
    expect(event?.payload).toEqual({ photo_id: data!.id });
  });

  it("a setter cannot put a photo on someone else's lead, and the slot is left as it was", async () => {
    const path = await uploadPhoto(users.b);
    const { error } = await users.b.client
      .from("lead_photos")
      .insert({ lead_id: leadA, storage_path: path, slot: "front" });
    expect(error).not.toBeNull();
    const { data } = await admin.from("lead_photos").select("storage_path").eq("lead_id", leadA).eq("slot", "front");
    expect(data).toEqual([{ storage_path: firstFront }]);
  });

  it("a retake takes the slot and the earlier photo stays as an extra", async () => {
    const retake = await uploadPhoto(users.a);
    const { error } = await users.a.client
      .from("lead_photos")
      .insert({ lead_id: leadA, storage_path: retake, slot: "front" });
    expect(error).toBeNull();
    const { data } = await admin.from("lead_photos").select("storage_path, slot").eq("lead_id", leadA);
    expect(data?.filter((photo) => photo.slot === "front")).toEqual([{ storage_path: retake, slot: "front" }]);
    expect(data?.find((photo) => photo.storage_path === firstFront)?.slot).toBeNull();
    expect(data).toHaveLength(3);
  });

  it("the database keeps one photo per slot per lead, even for the service role", async () => {
    const { data: photo } = await admin
      .from("lead_photos")
      .select("id")
      .eq("lead_id", leadA)
      .eq("storage_path", firstFront)
      .single();
    const { error } = await admin.from("lead_photos").update({ slot: "front" }).eq("id", photo!.id);
    expect(error?.code).toBe("23505");
  });

  it("a setter cannot move a photo into another slot", async () => {
    const attempt = await users.a.client
      .from("lead_photos")
      .update({ slot: "soffit" })
      .eq("lead_id", leadA)
      .select("id");
    expect(attempt.data ?? []).toEqual([]);
    const { data } = await admin.from("lead_photos").select("id").eq("lead_id", leadA).eq("slot", "soffit");
    expect(data).toEqual([]);
  });
});

describe("the track colour list", () => {
  it("setters read the same list the owner keeps", async () => {
    const { data: theirs, error } = await users.a.client.from("track_colours").select("id, name, active").order("id");
    expect(error).toBeNull();
    const { data: all } = await admin.from("track_colours").select("id, name, active").order("id");
    expect(theirs?.length ?? 0).toBeGreaterThan(0);
    expect(theirs).toEqual(all);
  });

  it("setters cannot add, rename, retire or remove a colour", async () => {
    const { count: before } = await admin.from("track_colours").select("id", { count: "exact", head: true });
    const add = await users.a.client.from("track_colours").insert({ name: `${TEST_COLOUR}-setter`, sort_order: 99 });
    expect(add.error?.code).toBe("42501");
    const { data: one } = await admin.from("track_colours").select("id, name, active").limit(1).single();
    const rename = await users.a.client.from("track_colours").update({ name: "Pink" }).eq("id", one!.id).select("id");
    expect(rename.data ?? []).toEqual([]);
    const retire = await users.a.client.from("track_colours").update({ active: false }).eq("id", one!.id).select("id");
    expect(retire.data ?? []).toEqual([]);
    const remove = await users.a.client.from("track_colours").delete().eq("id", one!.id).select("id");
    expect(remove.data ?? []).toEqual([]);
    const { data: after } = await admin.from("track_colours").select("id, name, active").eq("id", one!.id).single();
    expect(after).toEqual(one);
    const { count } = await admin.from("track_colours").select("id", { count: "exact", head: true });
    expect(count).toBe(before);
  });

  it("setters read the RAL Classic list: 216 colours, named", async () => {
    const { count, error } = await users.a.client.from("ral_classic_colours").select("code", { count: "exact", head: true });
    expect(error).toBeNull();
    expect(count).toBe(216);
    const { data } = await users.a.client.from("ral_classic_colours").select("code, name").in("code", ["7016", "9016"]).order("code");
    expect(data).toEqual([
      { code: "7016", name: "Anthracite grey" },
      { code: "9016", name: "Traffic white" },
    ]);
  });

  it("an account with no profile and a signed-out visitor see neither list", async () => {
    for (const client of [users.nobody.client, anon]) {
      const colours = await client.from("track_colours").select("id");
      expect(colours.data ?? []).toEqual([]);
      const ral = await client.from("ral_classic_colours").select("code");
      expect(ral.data ?? []).toEqual([]);
    }
  });
});

describe("a lead's track colour", () => {
  let activeColour = "";

  beforeAll(async () => {
    const { data } = await admin.from("track_colours").select("id").eq("active", true).limit(1).single();
    activeColour = data!.id;
  });

  it("a setter cannot set it when adding a lead", async () => {
    const withColour = await newLead(users.a, { track_colour_id: activeColour });
    expect(withColour.error?.code).toBe("42501");
    expect(withColour.error?.message).toMatch(/only the admin sets the track colour/i);
    const custom = await newLead(users.a, { track_ral_code: "7016" });
    expect(custom.error?.code).toBe("42501");
  });

  it("a setter cannot set it on their own lead later", async () => {
    const listColour = await users.a.client.from("leads").update({ track_colour_id: activeColour }).eq("id", leadA);
    expect(listColour.error?.code).toBe("42501");
    const custom = await users.a.client.from("leads").update({ track_ral_code: "7016" }).eq("id", leadA);
    expect(custom.error?.code).toBe("42501");
  });

  it("once it is set, the setter still edits the lead's other details but cannot change or clear it, and sees it", async () => {
    const set = await admin.from("leads").update({ track_ral_code: "7016" }).eq("id", leadA);
    expect(set.error).toBeNull();
    const event = await lastEvent(leadA, "edited");
    expect(event?.payload).toEqual({ fields: ["track_ral_code"] });

    const phone = await users.a.client.from("leads").update({ phone: "+14035550123" }).eq("id", leadA);
    expect(phone.error).toBeNull();
    const clear = await users.a.client.from("leads").update({ track_ral_code: null }).eq("id", leadA);
    expect(clear.error?.code).toBe("42501");
    const swap = await users.a.client
      .from("leads")
      .update({ track_ral_code: null, track_colour_id: activeColour })
      .eq("id", leadA);
    expect(swap.error?.code).toBe("42501");

    const { data } = await users.b.client.from("leads").select("track_colour_id, track_ral_code").eq("id", leadA).single();
    expect(data).toEqual({ track_colour_id: null, track_ral_code: "7016" });
  });

  it("a custom colour must be a RAL Classic code, and a lead has a list colour or a custom one, never both", async () => {
    const unknown = await admin.from("leads").update({ track_ral_code: "0000" }).eq("id", leadA);
    expect(unknown.error?.code).toBe("23503");
    const both = await admin.from("leads").update({ track_colour_id: activeColour, track_ral_code: "7016" }).eq("id", leadA);
    expect(both.error?.code).toBe("23514");
  });

  it("a retired colour stays on the leads that have it but cannot be newly chosen", async () => {
    const { data: colour, error } = await admin
      .from("track_colours")
      .insert({ name: TEST_COLOUR, sort_order: 9999 })
      .select("id")
      .single();
    expect(error).toBeNull();
    testColourId = colour!.id;

    const { lead: other } = await newLead(users.a);
    const kept = await admin.from("leads").update({ track_ral_code: null, track_colour_id: testColourId }).eq("id", leadA);
    expect(kept.error).toBeNull();

    const retire = await admin.from("track_colours").update({ active: false }).eq("id", testColourId);
    expect(retire.error).toBeNull();

    const edit = await users.a.client.from("leads").update({ notes: "Still the same colour." }).eq("id", leadA);
    expect(edit.error).toBeNull();
    const { data: still } = await admin.from("leads").select("track_colour_id").eq("id", leadA).single();
    expect(still?.track_colour_id).toBe(testColourId);

    const chooseRetired = await admin.from("leads").update({ track_colour_id: testColourId }).eq("id", other!.id);
    expect(chooseRetired.error?.code).toBe("22023");
  });
});
