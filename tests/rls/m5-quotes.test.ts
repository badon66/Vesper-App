import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";

// Proves the M5 rules in the database itself: dollar amounts live in
// quotes and sales users can never read one; the customer's colour
// initials are the owner's to record; the new meeting-mode settings stay
// out of settings_public; and the presentation bucket is the owner's.
// Signed in as throwaway setters and an account with no profile; their
// leads are named "TEST LEAD (automated)" and everything made here is
// deleted at the end. The service role stands in where the owner would
// act: there is one owner account, Keenan's, and the tests never sign in
// as him.

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

type TestUser = { email: string; password: string; id: string; client: Client };
const users: Record<"a" | "b" | "nobody", TestUser> = {
  a: { email: `rls-m5-a-${stamp}@example.com`, password: `Rls-m5-a-${stamp}-pass`, id: "", client: admin },
  b: { email: `rls-m5-b-${stamp}@example.com`, password: `Rls-m5-b-${stamp}-pass`, id: "", client: admin },
  nobody: { email: `rls-m5-none-${stamp}@example.com`, password: `Rls-m5-n-${stamp}-pass`, id: "", client: admin },
};

let leadA = "";
let quoteId = "";
let presentationFile = "";

async function signedIn(email: string, password: string): Promise<Client> {
  const client = createClient<Database>(url!, anonKey!, noSession);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in failed for ${email}: ${error.message}`);
  return client;
}

beforeAll(async () => {
  for (const key of ["a", "b", "nobody"] as const) {
    const u = users[key];
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { full_name: `RLS M5 ${key.toUpperCase()}` },
      app_metadata: key === "nobody" ? {} : { role: "sales" },
    });
    if (error || !data.user) throw new Error(`could not create ${u.email}: ${error?.message}`);
    u.id = data.user.id;
    u.client = await signedIn(u.email, u.password);
  }
  const { data: lead, error } = await users.a.client
    .from("leads")
    .insert({ first_name: TEST_LEAD, address_line: "1 Test Street NW", created_by: users.a.id })
    .select("id")
    .single();
  if (error || !lead) throw new Error(`could not add the test lead: ${error?.message}`);
  leadA = lead.id;
});

afterAll(async () => {
  if (presentationFile) await admin.storage.from("presentation").remove([presentationFile]);
  if (leadA) await admin.from("quotes").delete().eq("lead_id", leadA);
  for (const u of Object.values(users)) {
    if (!u.id) continue;
    await admin.from("leads").delete().eq("created_by", u.id);
    await admin.auth.admin.deleteUser(u.id);
  }
});

describe("quotes are the owner's only", () => {
  it("a setter cannot write a quote, even on their own lead", async () => {
    const { error } = await users.a.client.from("quotes").insert({
      lead_id: leadA,
      created_by: users.a.id,
      price_per_ft: 23,
      box_price: 500,
      gst_rate: 0.05,
    });
    expect(error?.code).toBe("42501");
  });

  it("a setter cannot read, change or delete a quote on their own lead", async () => {
    const { data: quote, error } = await admin
      .from("quotes")
      .insert({
        lead_id: leadA,
        created_by: users.a.id,
        price_per_ft: 23,
        box_price: 500,
        gst_rate: 0.05,
        subtotal: 3450,
        total: 3450,
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    quoteId = quote!.id;

    for (const user of [users.a, users.b, users.nobody]) {
      const read = await user.client.from("quotes").select("id, total").eq("lead_id", leadA);
      expect(read.data ?? []).toEqual([]);
    }
    const change = await users.a.client.from("quotes").update({ total: 1 }).eq("id", quoteId).select("id");
    expect(change.data ?? []).toEqual([]);
    const remove = await users.a.client.from("quotes").delete().eq("id", quoteId).select("id");
    expect(remove.data ?? []).toEqual([]);
    const { data: still } = await admin.from("quotes").select("total").eq("id", quoteId).single();
    expect(Number(still?.total)).toBe(3450);
  });

  it("a signed-out visitor sees no quotes", async () => {
    const { data, error } = await anon.from("quotes").select("id");
    expect(data ?? []).toEqual([]);
    expect(error?.code ?? null).not.toBe(null);
  });
});

describe("the customer's colour initials", () => {
  it("a setter cannot record them, on insert or update", async () => {
    const onInsert = await users.a.client
      .from("leads")
      .insert({ first_name: TEST_LEAD, address_line: "2 Test Street NW", created_by: users.a.id, track_colour_initials: "KH" });
    expect(onInsert.error?.code).toBe("42501");
    expect(onInsert.error?.message).toMatch(/only the admin records the colour initials/i);

    const onUpdate = await users.a.client.from("leads").update({ track_colour_initials: "KH" }).eq("id", leadA);
    expect(onUpdate.error?.code).toBe("42501");
  });

  it("the owner records them once the colour is set, and the setter sees but cannot clear them", async () => {
    const colour = await admin.from("leads").update({ track_ral_code: "7016" }).eq("id", leadA);
    expect(colour.error).toBeNull();
    const confirm = await admin
      .from("leads")
      .update({ track_colour_initials: "MB", track_colour_initialled_at: new Date().toISOString() })
      .eq("id", leadA);
    expect(confirm.error).toBeNull();

    const { data } = await users.a.client.from("leads").select("track_colour_initials").eq("id", leadA).single();
    expect(data?.track_colour_initials).toBe("MB");

    const clear = await users.a.client.from("leads").update({ track_colour_initials: null }).eq("id", leadA);
    expect(clear.error?.code).toBe("42501");
  });

  it("the database refuses empty or overlong initials", async () => {
    const empty = await admin.from("leads").update({ track_colour_initials: "" }).eq("id", leadA);
    expect(empty.error?.code).toBe("23514");
    const long = await admin.from("leads").update({ track_colour_initials: "ABCDEFGHIJKLM" }).eq("id", leadA);
    expect(long.error?.code).toBe("23514");
  });
});

describe("meeting mode's timeline events come from the database", () => {
  it("adding a quote writes quote_created with its id and nothing else", async () => {
    const { data } = await admin.from("lead_events").select("type, payload").eq("lead_id", leadA).eq("type", "quote_created");
    expect(data).toEqual([{ type: "quote_created", payload: { quote_id: quoteId } }]);
  });

  it("each confirmation writes colour_confirmed with the initials and the colour by name", async () => {
    const first = await admin.from("lead_events").select("payload").eq("lead_id", leadA).eq("type", "colour_confirmed");
    expect(first.data).toEqual([{ payload: { initials: "MB", colour: "RAL 7016 Anthracite grey" } }]);
    const again = await admin
      .from("leads")
      .update({ track_colour_initials: "MB", track_colour_initialled_at: new Date(Date.now() + 1000).toISOString() })
      .eq("id", leadA);
    expect(again.error).toBeNull();
    const { count } = await admin
      .from("lead_events")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", leadA)
      .eq("type", "colour_confirmed");
    expect(count).toBe(2);
  });

  it("an edit that leaves the initials alone writes no confirmation", async () => {
    const edit = await users.a.client.from("leads").update({ notes: "No new initials here." }).eq("id", leadA);
    expect(edit.error).toBeNull();
    const { count } = await admin
      .from("lead_events")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", leadA)
      .eq("type", "colour_confirmed");
    expect(count).toBe(2);
  });

  it("a setter reads the confirmations but cannot write either event", async () => {
    const { data } = await users.a.client.from("lead_events").select("type").eq("lead_id", leadA).eq("type", "colour_confirmed");
    expect(data).toHaveLength(2);
    for (const type of ["colour_confirmed", "quote_created"] as const) {
      const { error } = await users.a.client
        .from("lead_events")
        .insert({ lead_id: leadA, actor_id: users.a.id, type, payload: { initials: "ZZ" } });
      expect(error?.code, type).toBe("42501");
    }
  });
});

describe("the new settings stay the owner's", () => {
  it("settings_public does not carry the meeting-mode columns", async () => {
    for (const column of ["rush_colour_fee_per_ft", "service_call_fee", "faq_text", "warranty_text", "presentation"]) {
      const { error } = await users.a.client.from("settings_public").select(column);
      expect(error?.code, column).toBe("42703");
    }
  });

  it("a setter reads nothing from settings directly", async () => {
    const { data } = await users.a.client.from("settings").select("rush_colour_fee_per_ft, service_call_fee");
    expect(data ?? []).toEqual([]);
  });

  it("a setter cannot change the meeting-mode settings", async () => {
    const attempt = await users.a.client.from("settings").update({ quote_valid_days: 1 }).eq("id", 1).select("id");
    expect(attempt.data ?? []).toEqual([]);
    const { data } = await admin.from("settings").select("quote_valid_days").eq("id", 1).single();
    expect(data?.quote_valid_days).not.toBe(1);
  });
});

describe("the presentation bucket is the owner's", () => {
  it("a setter can neither add to it nor read from it", async () => {
    const jpeg = await sharp({ create: { width: 32, height: 24, channels: 3, background: "#132e3f" } })
      .jpeg()
      .toBuffer();
    presentationFile = `pages/gallery/rls-m5-${stamp}.jpg`;
    const seeded = await admin.storage.from("presentation").upload(presentationFile, jpeg, { contentType: "image/jpeg" });
    expect(seeded.error).toBeNull();

    const upload = await users.a.client.storage
      .from("presentation")
      .upload(`pages/gallery/rls-m5-setter-${stamp}.jpg`, jpeg, { contentType: "image/jpeg" });
    expect(upload.error).not.toBeNull();

    const list = await users.a.client.storage.from("presentation").list("pages/gallery");
    expect(list.data ?? []).toEqual([]);

    const download = await users.a.client.storage.from("presentation").download(presentationFile);
    expect(download.error).not.toBeNull();

    const signed = await users.a.client.storage.from("presentation").createSignedUrl(presentationFile, 60);
    expect(signed.error).not.toBeNull();
  });
});
