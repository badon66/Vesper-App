import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Database, Json } from "@/types/database";

// lib/leads/purge.ts is server code; outside Next its guard is a no-op.
vi.mock("server-only", () => ({}));

// Round 20 (Keenan, 2026-11-14), deleting a lead, in the database itself:
//   - only Keenan checks, deletes, restores or lists Deleted; setters and
//     signed-out callers are refused;
//   - a deleted lead is out of every read of the table, its customer's link
//     stops working, and its upcoming meeting is cancelled with the time
//     freed up;
//   - restoring brings the lead and its link back, but not the meeting;
//   - a lead with an accepted quote, or booking pay or commission that
//     isn't void, can't be deleted;
//   - 30 days after it was deleted, the app removes it for good with its
//     quote, link, meetings, photos and files (lib/leads/purge.ts).
//
// Two throwaway setters (one hosts the test evenings, so no time on
// Keenan's real evenings is touched) and test leads named "TEST LEAD
// (automated)" are made here and removed at the end. The service role
// stands in for Keenan, because the tests never sign in as him. The link
// is handed to a throwaway setter, so no notice ever reaches Keenan.

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

type User = { email: string; password: string; name: string; id: string; client: Client };
const users: Record<"setter" | "host", User> = {
  setter: { email: `rls-r20-s-${stamp}@example.com`, password: `Rls-r20-s-${stamp}-pass`, name: "RLS Round Twenty Setter", id: "", client: admin },
  host: { email: `rls-r20-h-${stamp}@example.com`, password: `Rls-r20-h-${stamp}-pass`, name: "RLS Round Twenty Host", id: "", client: admin },
};
let ownerId = "";
let lead = "";
let token = "";
let meeting = "";
let meetingAt = "";

const calgaryDay = (offsetDays: number) => new Date(Date.now() - 6 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
const hintOf = (error: { hint?: string | null } | null) => error?.hint ?? null;
const RUNS = [{ name: "Front", feet: 60, level: "lower", part: "eave", area: "front", gable: false }];

async function makeLead(label: string): Promise<string> {
  const made = await users.setter.client
    .from("leads")
    .insert({ first_name: TEST_LEAD, last_name: label, address_line: `20 Twenty Street NW ${stamp} (TEST)`, neighbourhood: "TEST (automated)", created_by: users.setter.id })
    .select("id")
    .single();
  if (made.error || !made.data) throw new Error(`lead: ${made.error?.message}`);
  return made.data.id;
}

async function makeQuote(leadId: string): Promise<string> {
  const q = await admin
    .from("quotes")
    .insert({
      lead_id: leadId,
      created_by: ownerId,
      price_per_ft: 24,
      box_price: 500,
      box_count: 1,
      runs: RUNS as unknown as Json,
      offers: [{ id: "front", name: "Front", runs: [0] }] as unknown as Json,
      total_feet: 60,
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
  return q.data.id;
}

const leadSeenBy = async (client: Client, leadId: string) => ((await client.from("leads").select("id").eq("id", leadId)).data ?? []).length;
const linkState = async () => {
  const { data } = await anon.rpc("quote_for_customer", { p_token: token });
  return (data as { state?: string } | null)?.state ?? null;
};
const boardState = async (at: string) => {
  const { data } = await users.setter.client.rpc("schedule_board", { p_host: users.host.id });
  return (data ?? []).find((row) => Date.parse(row.starts_at) === Date.parse(at))?.state ?? null;
};

beforeAll(async () => {
  const { data: owner } = await admin.from("profiles").select("id").eq("role", "owner").single();
  if (!owner) throw new Error("no owner profile");
  ownerId = owner.id;
  for (const key of ["setter", "host"] as const) {
    const u = users[key];
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { full_name: u.name },
      app_metadata: { role: "sales" },
    });
    if (error || !data.user) throw new Error(`could not create ${u.email}: ${error?.message}`);
    u.id = data.user.id;
    const client = createClient<Database>(url!, anonKey!, noSession);
    const signedIn = await client.auth.signInWithPassword({ email: u.email, password: u.password });
    if (signedIn.error) throw new Error(`sign in: ${signedIn.error.message}`);
    u.client = client;
  }
  const hosting = await admin.from("profiles").update({ hosts_meetings: true }).eq("id", users.host.id);
  if (hosting.error) throw new Error(`host: ${hosting.error.message}`);

  lead = await makeLead("Deleted and back");
  await makeQuote(lead);
  const issued = await admin.rpc("issue_quote_link", { p_lead_id: lead });
  if (issued.error || !issued.data) throw new Error(`link: ${issued.error?.message}`);
  token = issued.data as string;
  await admin.from("quote_links").update({ created_by: users.setter.id }).eq("token", token);

  // An upcoming meeting on the test host's evening, at one of its open times.
  const soon = Date.now() + 3 * 3600_000;
  const { data: board, error } = await users.setter.client.rpc("schedule_board", { p_host: users.host.id });
  if (error) throw new Error(`board: ${error.message}`);
  const open = (board ?? []).find((row) => row.state === "open" && new Date(row.starts_at).getTime() > soon);
  if (!open) throw new Error("no open test time on the test host's evenings");
  meetingAt = open.starts_at;
  const m = await admin
    .from("meetings")
    .insert({
      lead_id: lead,
      host_id: users.host.id,
      setter_id: users.setter.id,
      booked_by: users.setter.id,
      starts_at: open.starts_at,
      ends_at: open.ends_at,
      everyone_deciding_present: true,
      status: "booked",
    })
    .select("id")
    .single();
  if (m.error || !m.data) throw new Error(`meeting: ${m.error?.message}`);
  meeting = m.data.id;
  await admin.from("leads").update({ status: "meeting_booked" }).eq("id", lead);
});

afterAll(async () => {
  const ids = Object.values(users).map((u) => u.id).filter(Boolean);
  if (ids.length > 0) {
    const { data: rows } = await admin.from("leads").select("id").in("created_by", ids);
    const leadIds = (rows ?? []).map((row) => row.id);
    if (leadIds.length > 0) {
      await admin.from("quote_revisions").delete().in("lead_id", leadIds);
      await admin.from("earnings").delete().in("lead_id", leadIds);
      await admin.from("slot_holds").delete().in("lead_id", leadIds);
      await admin.from("meetings").update({ rebooked_as: null }).in("lead_id", leadIds);
      await admin.from("meetings").delete().in("lead_id", leadIds);
      await admin.from("quote_links").delete().in("lead_id", leadIds);
      await admin.from("quotes").delete().in("lead_id", leadIds);
      await admin.from("lead_events").delete().in("lead_id", leadIds);
      await admin.from("leads").delete().in("id", leadIds);
    }
    for (const u of Object.values(users)) {
      if (!u.id) continue;
      const { data: files } = await admin.storage.from("lead-photos").list(u.id, { limit: 100 });
      if (files && files.length > 0) await admin.storage.from("lead-photos").remove(files.map((file) => `${u.id}/${file.name}`));
      await u.client.auth.signOut({ scope: "local" });
      await admin.auth.admin.deleteUser(u.id);
    }
  }
});

describe("only Keenan deletes a lead", () => {
  it("a setter can't check, delete, restore or list Deleted, even on their own lead", async () => {
    const client = users.setter.client;
    expect(hintOf((await client.rpc("lead_delete_check", { p_lead: lead })).error)).toBe("not_allowed");
    expect(hintOf((await client.rpc("lead_soft_delete", { p_lead: lead })).error)).toBe("not_allowed");
    expect(hintOf((await client.rpc("lead_restore", { p_lead: lead })).error)).toBe("not_allowed");
    expect(hintOf((await client.rpc("deleted_leads")).error)).toBe("not_allowed");
    // Nor by writing the column.
    await client.from("leads").update({ deleted_at: new Date().toISOString() }).eq("id", lead);
    expect((await admin.from("leads").select("deleted_at").eq("id", lead).single()).data?.deleted_at ?? null).toBeNull();
  });

  it("a signed-out caller can't either", async () => {
    expect((await anon.rpc("lead_soft_delete", { p_lead: lead })).error).not.toBeNull();
    expect((await anon.rpc("deleted_leads")).error).not.toBeNull();
  });
});

describe("deleting and restoring", () => {
  it("the check names the upcoming meeting it would cancel", async () => {
    const { data, error } = await admin.rpc("lead_delete_check", { p_lead: lead });
    expect(error).toBeNull();
    const answer = data as { ok: boolean; meetings: string[] };
    expect(answer.ok).toBe(true);
    expect(answer.meetings.map((at) => Date.parse(at))).toEqual([Date.parse(meetingAt)]);
    expect(await linkState()).toBe("live");
    expect(await boardState(meetingAt)).toBe("booked");
  });

  it("a deleted lead is out of every list, its link stops working and its meeting is cancelled", async () => {
    const { data, error } = await admin.rpc("lead_soft_delete", { p_lead: lead });
    expect(error).toBeNull();
    expect((data as { cancelled: string[] }).cancelled).toEqual([meeting]);

    expect(await leadSeenBy(users.setter.client, lead)).toBe(0);
    expect(await leadSeenBy(users.host.client, lead)).toBe(0);
    expect(await linkState()).not.toBe("live");

    const m = (await admin.from("meetings").select("status, outcome_note").eq("id", meeting).single()).data;
    expect(m).toEqual({ status: "cancelled", outcome_note: "The lead was deleted." });
    // The time is free again.
    expect(await boardState(meetingAt)).toBe("open");
    const row = (await admin.from("leads").select("status, follow_up_on, deleted_at").eq("id", lead).single()).data;
    expect(row?.status).toBe("follow_up");
    expect(row?.follow_up_on).not.toBeNull();
    expect(row?.deleted_at).not.toBeNull();

    const listed = ((await admin.rpc("deleted_leads")).data ?? []) as { id: string; deleted_at: string; gone_after: string }[];
    const mine = listed.find((entry) => entry.id === lead);
    expect(mine).toBeTruthy();
    expect(Date.parse(mine!.gone_after) - Date.parse(mine!.deleted_at)).toBe(30 * 86_400_000);
    // Deleting twice says so.
    expect(hintOf((await admin.rpc("lead_soft_delete", { p_lead: lead })).error)).toBe("not_found");
  });

  it("restoring brings the lead and its link back, but not the cancelled meeting", async () => {
    const { error } = await admin.rpc("lead_restore", { p_lead: lead });
    expect(error).toBeNull();
    expect(await leadSeenBy(users.setter.client, lead)).toBe(1);
    expect(await linkState()).toBe("live");
    expect((await admin.from("meetings").select("status").eq("id", meeting).single()).data?.status).toBe("cancelled");
    const types = ((await admin.from("lead_events").select("type").eq("lead_id", lead)).data ?? []).map((event) => event.type);
    expect(types).toEqual(expect.arrayContaining(["lead_deleted", "lead_restored", "meeting_cancelled"]));
    expect(hintOf((await admin.rpc("lead_restore", { p_lead: lead })).error)).toBe("not_deleted");
  });
});

describe("after 30 days", () => {
  it("the lead goes for good with its quote, link, meeting, photo and file; a newer one stays", async () => {
    const { purgeExpiredLeads } = await import("@/lib/leads/purge");
    const old = await makeLead("Gone for good");
    await makeQuote(old);
    expect((await admin.rpc("issue_quote_link", { p_lead_id: old })).error).toBeNull();
    await admin.from("quote_links").update({ created_by: users.setter.id }).eq("lead_id", old);
    const fileId = crypto.randomUUID();
    const path = `${users.setter.id}/${fileId}.jpg`;
    const uploaded = await admin.storage.from("lead-photos").upload(path, new Blob([new Uint8Array([255, 216, 255, 217])], { type: "image/jpeg" }));
    expect(uploaded.error).toBeNull();
    expect((await admin.from("lead_photos").insert({ lead_id: old, storage_path: path, created_by: users.setter.id, slot: "front" })).error).toBeNull();
    expect((await admin.rpc("lead_soft_delete", { p_lead: old })).error).toBeNull();

    // One deleted 31 days ago, the restored lead deleted again just now.
    expect((await admin.from("leads").update({ deleted_at: new Date(Date.now() - 31 * 86_400_000).toISOString() }).eq("id", old)).error).toBeNull();
    expect((await admin.rpc("lead_soft_delete", { p_lead: lead })).error).toBeNull();

    expect(await purgeExpiredLeads()).toBeGreaterThanOrEqual(1);
    expect((await admin.from("leads").select("id").eq("id", old)).data ?? []).toEqual([]);
    expect((await admin.from("quotes").select("id").eq("lead_id", old)).data ?? []).toEqual([]);
    expect((await admin.from("quote_links").select("id").eq("lead_id", old)).data ?? []).toEqual([]);
    expect((await admin.from("lead_photos").select("id").eq("lead_id", old)).data ?? []).toEqual([]);
    expect((await admin.from("lead_events").select("id").eq("lead_id", old)).data ?? []).toEqual([]);
    const left = await admin.storage.from("lead-photos").list(users.setter.id, { search: fileId });
    expect((left.data ?? []).length).toBe(0);

    // The one deleted just now is still in Deleted.
    expect((await admin.from("leads").select("id").eq("id", lead)).data?.length).toBe(1);
    expect((await admin.rpc("lead_restore", { p_lead: lead })).error).toBeNull();
  });
});

describe("what can't be deleted", () => {
  it("a lead with booking pay that isn't void, until the pay is voided", async () => {
    const paid = await makeLead("Has pay");
    // A meeting two days ago on the test host, marked Qualified, and its fee.
    const past = new Date(Date.now() - 2 * 86_400_000);
    const met = await admin
      .from("meetings")
      .insert({
        lead_id: paid,
        host_id: users.host.id,
        setter_id: users.setter.id,
        booked_by: users.setter.id,
        starts_at: past.toISOString(),
        ends_at: new Date(past.getTime() + 45 * 60_000).toISOString(),
        everyone_deciding_present: true,
        status: "qualified",
      })
      .select("id")
      .single();
    expect(met.error).toBeNull();
    const fee = await admin
      .from("earnings")
      .insert({ profile_id: users.setter.id, lead_id: paid, meeting_id: met.data!.id, type: "booking", rate: 20, amount: 20, status: "pending" })
      .select("id")
      .single();
    expect(fee.error).toBeNull();
    expect(((await admin.rpc("lead_delete_check", { p_lead: paid })).data as { state?: string }).state).toBe("pay");
    expect(hintOf((await admin.rpc("lead_soft_delete", { p_lead: paid })).error)).toBe("has_pay");
    expect(await leadSeenBy(users.setter.client, paid)).toBe(1);

    await admin.from("earnings").update({ status: "void", note: "Test" }).eq("id", fee.data!.id);
    expect(((await admin.rpc("lead_delete_check", { p_lead: paid })).data as { ok?: boolean }).ok).toBe(true);
  });

  it("a lead with an accepted quote", async () => {
    const sold = await makeLead("Accepted");
    const { data: colour } = await admin.from("track_colours").select("id").eq("active", true).order("sort_order").limit(1).single();
    if (colour) await admin.from("leads").update({ track_colour_id: colour.id }).eq("id", sold);
    const quote = await makeQuote(sold);
    const accepted = await admin.rpc("quote_accept_offer", { p_quote: quote, p_offer: "front" });
    expect(accepted.error).toBeNull();
    expect(((await admin.rpc("lead_delete_check", { p_lead: sold })).data as { state?: string }).state).toBe("accepted");
    expect(hintOf((await admin.rpc("lead_soft_delete", { p_lead: sold })).error)).toBe("accepted_quote");
    expect(await leadSeenBy(users.setter.client, sold)).toBe(1);
  });
});
