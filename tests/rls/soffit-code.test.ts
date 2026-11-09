import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LEAD_FIELDS } from "@/lib/leads/fields";
import type { Database } from "@/types/database";

// Soffit colour code (Keenan, 2026-11-09): each lead can carry the soffit's
// own RAL code, one per soffit colour when it is split, and a photo of the
// colour book held up to each. The lead's own setter sets them, every other
// setter reads them, nobody signed out sees anything, the code must be on
// the RAL Classic list, a second code goes when the soffit stops being
// split, and the track colour stays Keenan's alone. Two throwaway setters
// with test-prefixed emails; their leads are named "TEST LEAD (automated)"
// and are removed at the end with their photo files and accounts.
//
// The service role stands in where the owner would act: there is one owner
// account, Keenan's, and the tests never sign in as him.

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
const TEST_LEAD = "TEST LEAD (automated)";
const BUCKET = "lead-photos";

type TestUser = { email: string; password: string; id: string; client: Client };
const users: Record<"a" | "b", TestUser> = {
  a: { email: `rls-soffit-a-${stamp}@example.com`, password: `Rls-soffit-a-${stamp}-pass`, id: "", client: admin },
  b: { email: `rls-soffit-b-${stamp}@example.com`, password: `Rls-soffit-b-${stamp}-pass`, id: "", client: admin },
};

let jpeg: Buffer;
let leadA = "";

async function uploadPhoto(user: TestUser): Promise<string> {
  const path = `${user.id}/${crypto.randomUUID()}.jpg`;
  const { error } = await user.client.storage.from(BUCKET).upload(path, jpeg, { contentType: "image/jpeg" });
  if (error) throw new Error(`upload failed: ${error.message}`);
  return path;
}

async function codes(leadId: string) {
  const { data } = await admin.from("leads").select("soffit_ral_code, soffit_ral_code_2").eq("id", leadId).single();
  return data;
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
  const { data: files } = await admin.storage.from(BUCKET).list(id, { limit: 1000 });
  if (files && files.length > 0) {
    await admin.storage.from(BUCKET).remove(files.map((file) => `${id}/${file.name}`));
  }
  await admin.auth.admin.deleteUser(id);
}

beforeAll(async () => {
  jpeg = await sharp({ create: { width: 64, height: 48, channels: 3, background: "#f4f1eb" } })
    .jpeg()
    .toBuffer();
  for (const key of ["a", "b"] as const) {
    const u = users[key];
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { full_name: `RLS Soffit ${key.toUpperCase()}` },
      app_metadata: { role: "sales" },
    });
    if (error || !data.user) throw new Error(`could not create ${u.email}: ${error?.message}`);
    u.id = data.user.id;
    const client = createClient<Database>(url!, anonKey!, noSession);
    const signedIn = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (signedIn.error) throw new Error(`sign in failed for ${u.email}: ${signedIn.error.message}`);
    u.client = client;
  }
  const { data, error } = await users.a.client
    .from("leads")
    .insert({ first_name: TEST_LEAD, address_line: `1 Soffit Test Way NW (TEST ${stamp})`, created_by: users.a.id, soffit_colour: "off_white" })
    .select("id")
    .single();
  if (error || !data) throw new Error(`could not add the test lead: ${error?.message}`);
  leadA = data.id;
});

afterAll(async () => {
  for (const u of Object.values(users)) {
    if (u.id) await removeEverythingOf(u.id);
  }
});

describe("the soffit colour code", () => {
  it("starts empty, and the app's own column list reads it", async () => {
    const { data, error } = await users.a.client.from("leads").select(LEAD_FIELDS).eq("id", leadA).single();
    expect(error).toBeNull();
    expect(data?.soffit_ral_code).toBeNull();
    expect(data?.soffit_ral_code_2).toBeNull();
  });

  it("the lead's own setter sets it, and the timeline names the field, never the code", async () => {
    const { data, error } = await users.a.client.from("leads").update({ soffit_ral_code: "9001" }).eq("id", leadA).select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(await codes(leadA)).toEqual({ soffit_ral_code: "9001", soffit_ral_code_2: null });
    const event = await lastEvent(leadA, "edited");
    expect(event?.actor_id).toBe(users.a.id);
    expect(event?.payload).toEqual({ fields: ["soffit_ral_code"] });
  });

  it("and clears it", async () => {
    const cleared = await users.a.client.from("leads").update({ soffit_ral_code: null }).eq("id", leadA).select("id");
    expect(cleared.error).toBeNull();
    expect(await codes(leadA)).toEqual({ soffit_ral_code: null, soffit_ral_code_2: null });
    const again = await users.a.client.from("leads").update({ soffit_ral_code: "9010" }).eq("id", leadA);
    expect(again.error).toBeNull();
  });

  it("another setter reads it, through the app's own column list too, but cannot change or clear it", async () => {
    const { data, error } = await users.b.client.from("leads").select(LEAD_FIELDS).eq("id", leadA).single();
    expect(error).toBeNull();
    expect(data?.soffit_ral_code).toBe("9010");
    const change = await users.b.client.from("leads").update({ soffit_ral_code: "9016" }).eq("id", leadA).select("id");
    expect(change.data ?? []).toEqual([]);
    const clear = await users.b.client.from("leads").update({ soffit_ral_code: null }).eq("id", leadA).select("id");
    expect(clear.data ?? []).toEqual([]);
    expect((await codes(leadA))?.soffit_ral_code).toBe("9010");
  });

  it("nobody signed out reads it or changes it", async () => {
    const read = await anon.from("leads").select("soffit_ral_code, soffit_ral_code_2").eq("id", leadA);
    expect(read.data ?? []).toEqual([]);
    const write = await anon.from("leads").update({ soffit_ral_code: "9016" }).eq("id", leadA).select("id");
    expect(write.data ?? []).toEqual([]);
    expect((await codes(leadA))?.soffit_ral_code).toBe("9010");
  });

  it("refuses a code that isn't on the RAL Classic list, even from the service role", async () => {
    for (const client of [users.a.client, admin]) {
      const { error } = await client.from("leads").update({ soffit_ral_code: "0000" }).eq("id", leadA);
      expect(error?.code).toBe("23503");
    }
    const notDigits = await users.a.client.from("leads").update({ soffit_ral_code: "RAL 9010" }).eq("id", leadA);
    expect(notDigits.error).not.toBeNull();
    expect((await codes(leadA))?.soffit_ral_code).toBe("9010");
  });
});

describe("a split soffit's second code", () => {
  it("is set beside the second colour, and named on the timeline", async () => {
    const split = await users.a.client
      .from("leads")
      .update({ soffit_colour_2: "white", soffit_note: "Front is cream, garage is white (automated)" })
      .eq("id", leadA);
    expect(split.error).toBeNull();
    const second = await users.a.client.from("leads").update({ soffit_ral_code_2: "9016" }).eq("id", leadA);
    expect(second.error).toBeNull();
    expect(await codes(leadA)).toEqual({ soffit_ral_code: "9010", soffit_ral_code_2: "9016" });
    expect((await lastEvent(leadA, "edited"))?.payload).toEqual({ fields: ["soffit_ral_code_2"] });
  });

  it("goes when the soffit stops being split", async () => {
    const single = await users.a.client.from("leads").update({ soffit_colour_2: null }).eq("id", leadA);
    expect(single.error).toBeNull();
    expect(await codes(leadA)).toEqual({ soffit_ral_code: "9010", soffit_ral_code_2: null });
    expect((await lastEvent(leadA, "edited"))?.payload).toEqual({ fields: ["soffit_colour_2", "soffit_ral_code_2"] });
  });

  it("can't be set while the soffit has one colour: it stays empty", async () => {
    const { error } = await users.a.client.from("leads").update({ soffit_ral_code_2: "9016" }).eq("id", leadA);
    expect(error).toBeNull();
    expect((await codes(leadA))?.soffit_ral_code_2).toBeNull();
  });
});

describe("the colour book photo", () => {
  let firstBook = "";

  it("the setter adds one to their own lead, from their own folder, and the timeline names its slot", async () => {
    firstBook = await uploadPhoto(users.a);
    const { data, error } = await users.a.client
      .from("lead_photos")
      .insert({ lead_id: leadA, storage_path: firstBook, slot: "soffit_book" })
      .select("id, slot")
      .single();
    expect(error).toBeNull();
    expect(data?.slot).toBe("soffit_book");
    const event = await lastEvent(leadA, "photo_added");
    expect(event?.actor_id).toBe(users.a.id);
    expect((event?.payload as { slot?: string } | null)?.slot).toBe("soffit_book");
  });

  it("a new one takes the slot and the earlier one stays as an extra", async () => {
    const retake = await uploadPhoto(users.a);
    const { error } = await users.a.client.from("lead_photos").insert({ lead_id: leadA, storage_path: retake, slot: "soffit_book" });
    expect(error).toBeNull();
    const { data } = await admin.from("lead_photos").select("storage_path, slot").eq("lead_id", leadA);
    expect(data?.filter((photo) => photo.slot === "soffit_book")).toEqual([{ storage_path: retake, slot: "soffit_book" }]);
    expect(data?.find((photo) => photo.storage_path === firstBook)?.slot).toBeNull();
  });

  it("the second colour has its own slot", async () => {
    const second = await uploadPhoto(users.a);
    const { error } = await users.a.client.from("lead_photos").insert({ lead_id: leadA, storage_path: second, slot: "soffit_book_2" });
    expect(error).toBeNull();
  });

  it("another setter sees the photos but can't add one to someone else's lead", async () => {
    const { data: seen } = await users.b.client.from("lead_photos").select("slot").eq("lead_id", leadA).in("slot", ["soffit_book", "soffit_book_2"]);
    expect((seen ?? []).map((photo) => photo.slot).sort()).toEqual(["soffit_book", "soffit_book_2"]);
    const theirs = await uploadPhoto(users.b);
    const { error } = await users.b.client.from("lead_photos").insert({ lead_id: leadA, storage_path: theirs, slot: "soffit_book" });
    expect(error?.code).toBe("42501");
    const { data } = await admin.from("lead_photos").select("storage_path").eq("lead_id", leadA).eq("storage_path", theirs);
    expect(data).toEqual([]);
  });

  it("the setter can't attach a photo from someone else's folder, even to their own lead", async () => {
    const elsewhere = await uploadPhoto(users.b);
    const { error } = await users.a.client.from("lead_photos").insert({ lead_id: leadA, storage_path: elsewhere, slot: "soffit_book_2" });
    expect(error?.code).toBe("42501");
  });

  it("nobody signed out sees them", async () => {
    const { data } = await anon.from("lead_photos").select("slot").eq("lead_id", leadA);
    expect(data ?? []).toEqual([]);
  });
});

// Found by this feature's review (2026-11-09): the setters' photo policy
// never looked at the slot, so a setter could fill the mockup slot of their
// own lead and replace Keenan's in meeting mode and on the quote link.
describe("the customer's mockup stays Keenan's", () => {
  it("a setter can't put a photo in the mockup slot, even on their own lead, from their own folder", async () => {
    const path = await uploadPhoto(users.a);
    const { error } = await users.a.client.from("lead_photos").insert({ lead_id: leadA, storage_path: path, slot: "mockup" });
    expect(error?.code).toBe("42501");
    const { data } = await admin.from("lead_photos").select("id").eq("lead_id", leadA).eq("slot", "mockup");
    expect(data ?? []).toEqual([]);
  });

  it("the owner's path (the service role standing in) still adds one", async () => {
    const path = await uploadPhoto(users.a);
    const { error } = await admin.from("lead_photos").insert({ lead_id: leadA, storage_path: path, slot: "mockup" });
    expect(error).toBeNull();
  });
});

describe("the track colour stays Keenan's", () => {
  it("a setter can't set it from their soffit code, as a list colour or a custom one", async () => {
    const { data: stock } = await admin.from("track_colours").select("id").eq("active", true).limit(1).single();
    const custom = await users.a.client.from("leads").update({ track_ral_code: "9010" }).eq("id", leadA);
    expect(custom.error?.code).toBe("42501");
    const listed = await users.a.client.from("leads").update({ track_colour_id: stock!.id }).eq("id", leadA);
    expect(listed.error?.code).toBe("42501");
    const { data } = await admin.from("leads").select("track_colour_id, track_ral_code").eq("id", leadA).single();
    expect(data).toEqual({ track_colour_id: null, track_ral_code: null });
  });

  it("the owner's path (the service role standing in) sets it to the soffit's code", async () => {
    const { error } = await admin.from("leads").update({ track_ral_code: "9010" }).eq("id", leadA);
    expect(error).toBeNull();
    const { data } = await users.a.client.from("leads").select("track_ral_code, soffit_ral_code").eq("id", leadA).single();
    expect(data).toEqual({ track_ral_code: "9010", soffit_ral_code: "9010" });
  });
});
