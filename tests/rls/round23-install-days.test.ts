import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database, Json } from "@/types/database";
import { closeTestDays, openTestDays } from "./install-test-days";

// Round 23 (Keenan, 2026-11-17): install days the customer picks from
// Keenan's calendar, in the database itself.
//   - Two customers grabbing the last spot on a day: exactly one gets it,
//     every time; a day that takes two never takes three; the meeting's
//     yes and a customer on their link race the same way.
//   - Only open days, never before the earliest day for their track, only
//     once they've booked; no change in the last 2 days before it.
//   - Lost gives the day back; a day's limit can't drop below what's booked.
//   - Accepted with no day keeps the day picked, Undo keeps it, Cancelled
//     gives it back.
//   - The timeline says who picked or changed it; nobody but Keenan sees or
//     changes his calendar.
//
// A throwaway setter and test leads named "TEST LEAD (automated)" are made
// here and removed at the end. The days are the tests' own, years ahead
// (tests/rls/install-test-days.ts). The service role stands in for
// Keenan. The links are handed to the throwaway setter, so no notice ever
// reaches Keenan.

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
const setter = { email: `rls-r23-${stamp}@example.com`, password: `Rls-r23-${stamp}-pass`, id: "", client: admin };
let ownerId = "";
let whiteId = "";
let days: string[] = [];
let near: string | null = null;
const RUNS = [{ name: "Front", feet: 60, level: "lower", part: "eave", area: "front", gable: false }];

const calgaryDay = (offsetDays: number) => new Date(Date.now() - 6 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);
const hintOf = (error: { hint?: string | null } | null) => error?.hint ?? null;
type Pick = { ok: boolean; state?: string; changed?: boolean; day?: string; targets?: unknown[] };

async function makeLead(label: string, colour: "white" | "custom" = "white"): Promise<string> {
  const made = await admin
    .from("leads")
    .insert({
      first_name: TEST_LEAD,
      last_name: label,
      address_line: `23 Install Way NW ${stamp} (TEST)`,
      neighbourhood: "TEST (automated)",
      created_by: setter.id,
      ...(colour === "white" ? { track_colour_id: whiteId } : { track_ral_code: "7016" }),
    })
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

// A lead with a quote and a link, booked (Book my install) unless asked not to.
async function customer(label: string, options: { booked?: boolean; colour?: "white" | "custom" } = {}) {
  const lead = await makeLead(label, options.colour);
  const quote = await makeQuote(lead);
  const issued = await admin.rpc("issue_quote_link", { p_lead_id: lead });
  if (issued.error || !issued.data) throw new Error(`link: ${issued.error?.message}`);
  const token = issued.data as string;
  await admin
    .from("quote_links")
    .update({ created_by: setter.id, ...(options.booked === false ? {} : { booked_at: new Date().toISOString(), booked_offer: "front", booked_option: "Front" }) })
    .eq("token", token);
  return { lead, quote, token };
}

const pick = async (token: string, day: string): Promise<Pick> => {
  const { data, error } = await anon.rpc("quote_link_pick_install_day", { p_token: token, p_day: day });
  if (error) throw new Error(`pick: ${error.message}`);
  return data as unknown as Pick;
};
const dayOf = async (lead: string) => (await admin.from("leads").select("install_on").eq("id", lead).single()).data?.install_on ?? null;
const heldOn = async (day: string, leads: string[]) =>
  (await admin.from("leads").select("id").eq("install_on", day).in("id", leads)).data?.length ?? 0;
const clear = async (leads: string[]) => {
  const { error } = await admin.from("leads").update({ install_on: null }).in("id", leads);
  if (error) throw new Error(`clear: ${error.message}`);
};

beforeAll(async () => {
  const { data: owner } = await admin.from("profiles").select("id").eq("role", "owner").single();
  if (!owner) throw new Error("no owner profile");
  ownerId = owner.id;
  const { data: colours } = await admin.from("track_colours").select("id, name").eq("active", true);
  const white = (colours ?? []).find((colour) => /^white\b/i.test(colour.name.trim()));
  if (!white) throw new Error("no active White track colour");
  whiteId = white.id;
  const { data, error } = await admin.auth.admin.createUser({
    email: setter.email,
    password: setter.password,
    email_confirm: true,
    user_metadata: { full_name: "RLS Round Twentythree" },
    app_metadata: { role: "sales" },
  });
  if (error || !data.user) throw new Error(`could not create the setter: ${error?.message}`);
  setter.id = data.user.id;
  const client = createClient<Database>(url!, anonKey!, noSession);
  const signedIn = await client.auth.signInWithPassword({ email: setter.email, password: setter.password });
  if (signedIn.error) throw new Error(`sign in: ${signedIn.error.message}`);
  setter.client = client;
  // Six days, one job each to start; the second takes two.
  days = await openTestDays(admin, 6, 1);
  await admin.from("install_days").update({ job_limit: 2 }).eq("day", days[1]);
});

afterAll(async () => {
  await closeTestDays(admin, days);
  if (near) await closeTestDays(admin, [near]);
  if (!setter.id) return;
  const { data: leads } = await admin.from("leads").select("id").eq("created_by", setter.id);
  const ids = (leads ?? []).map((row) => row.id);
  if (ids.length > 0) {
    await admin.from("earnings").delete().in("lead_id", ids);
    await admin.from("quote_links").delete().in("lead_id", ids);
    await admin.from("quotes").delete().in("lead_id", ids);
    await admin.from("lead_events").delete().in("lead_id", ids);
    await admin.from("leads").delete().in("id", ids);
  }
  await admin.auth.admin.deleteUser(setter.id);
});

describe("no day ever goes over its limit", () => {
  it("two customers grabbing the last spot: exactly one gets it, every time", async () => {
    const a = await customer("Race A");
    const b = await customer("Race B");
    for (let round = 0; round < 12; round += 1) {
      await clear([a.lead, b.lead]);
      const results = await Promise.all([pick(a.token, days[0]), pick(b.token, days[0])]);
      const won = results.filter((result) => result.ok);
      const lost = results.filter((result) => !result.ok);
      expect(won.length).toBe(1);
      expect(lost.map((result) => result.state)).toEqual(["day_full"]);
      expect(await heldOn(days[0], [a.lead, b.lead])).toBe(1);
    }
    await clear([a.lead, b.lead]);
  });

  it("three customers for a day that takes two: two get it, never three", async () => {
    const racers = await Promise.all([customer("Two A"), customer("Two B"), customer("Two C")]);
    const leads = racers.map((racer) => racer.lead);
    for (let round = 0; round < 6; round += 1) {
      await clear(leads);
      const results = await Promise.all(racers.map((racer) => pick(racer.token, days[1])));
      expect(results.filter((result) => result.ok).length).toBe(2);
      expect(results.filter((result) => !result.ok).map((result) => result.state)).toEqual(["day_full"]);
      expect(await heldOn(days[1], leads)).toBe(2);
    }
    await clear(leads);
  });

  it("Keenan's yes at the meeting and a customer on their link, for the last spot", async () => {
    const meeting = await customer("Meeting side");
    const link = await customer("Link side");
    for (let round = 0; round < 6; round += 1) {
      await clear([meeting.lead, link.lead]);
      const [keenan, theirs] = await Promise.all([
        admin.rpc("install_day_set", { p_lead: meeting.lead, p_day: days[2], p_by: "meeting" }),
        pick(link.token, days[2]),
      ]);
      const keenanWon = keenan.error === null;
      if (!keenanWon) expect(hintOf(keenan.error)).toBe("day_full");
      expect(keenanWon !== theirs.ok).toBe(true);
      if (!theirs.ok) expect(theirs.state).toBe("day_full");
      expect(await heldOn(days[2], [meeting.lead, link.lead])).toBe(1);
    }
    await clear([meeting.lead, link.lead]);
  });
});

describe("what the customer can pick", () => {
  it("only an open day, never before the earliest for their track, and only once they've booked", async () => {
    const booked = await customer("Picks");
    const notYet = await customer("Not booked", { booked: false });
    await admin.from("install_days").update({ open: false }).eq("day", days[5]);
    expect((await pick(booked.token, days[5])).state).toBe("day_closed");
    expect((await pick(booked.token, calgaryDay(1))).state).toBe("too_soon");
    expect((await pick(notYet.token, days[3])).state).toBe("not_booked");
    expect(await dayOf(booked.lead)).toBeNull();
    await admin.from("install_days").update({ open: true }).eq("day", days[5]);
  });

  it("the earliest day is 3 days out for white track and 7 for a colour-matched one", async () => {
    const white = await customer("White track");
    const custom = await customer("Custom colour", { colour: "custom" });
    const { data: settings } = await admin.from("settings").select("install_lead_days_white, install_lead_days_colour").eq("id", 1).single();
    const read = async (token: string) => (await anon.rpc("quote_link_install", { p_token: token })).data as { earliest: string; kind: string; ready: boolean };
    const w = await read(white.token);
    const c = await read(custom.token);
    expect([w.kind, c.kind]).toEqual(["white", "colour"]);
    expect(w.earliest).toBe(calgaryDay(settings!.install_lead_days_white));
    expect(c.earliest).toBe(calgaryDay(settings!.install_lead_days_colour));
    expect(w.ready).toBe(true);
    expect((await pick(custom.token, calgaryDay(settings!.install_lead_days_colour - 1))).state).toBe("too_soon");
  });

  it("they can change it until 2 days before; after that only Keenan can", async () => {
    const { data: row } = await admin.from("install_days").select("day").eq("day", calgaryDay(1)).maybeSingle();
    if (row) {
      // Keenan has his own plans for tomorrow: leave it alone.
      console.warn("tomorrow is on Keenan's calendar; the 2-day rule is checked on the test days only");
    } else {
      near = calgaryDay(1);
      await admin.from("install_days").insert({ day: near, open: true, job_limit: 20 });
    }
    const late = await customer("Too late");
    if (near) {
      expect((await admin.rpc("install_day_set", { p_lead: late.lead, p_day: near })).error).toBeNull();
      const view = (await anon.rpc("quote_link_install", { p_token: late.token })).data as { can_change: boolean; day: string };
      expect(view).toMatchObject({ can_change: false, day: near });
      expect((await pick(late.token, days[3])).state).toBe("too_late");
      expect(await dayOf(late.lead)).toBe(near);
      // Keenan still can.
      expect((await admin.rpc("install_day_set", { p_lead: late.lead, p_day: days[3] })).error).toBeNull();
      expect(await dayOf(late.lead)).toBe(days[3]);
      await clear([late.lead]);
    }
    // Far enough ahead, they change it themselves.
    expect((await pick(late.token, days[3])).ok).toBe(true);
    const moved = await pick(late.token, days[4]);
    expect(moved).toMatchObject({ ok: true, changed: true, day: days[4] });
    expect(await dayOf(late.lead)).toBe(days[4]);
    await clear([late.lead]);
  });
});

describe("giving a day back", () => {
  it("Lost gives the day back, and a day's limit can't drop below what's booked", async () => {
    const holder = await customer("Holder");
    const waiting = await customer("Waiting");
    expect((await pick(holder.token, days[3])).ok).toBe(true);
    expect((await pick(waiting.token, days[3])).state).toBe("day_full");
    expect((await admin.from("leads").update({ status: "lost", lost_reason: "price" }).eq("id", holder.lead)).error).toBeNull();
    expect(await dayOf(holder.lead)).toBeNull();
    // Lost turns nothing else off here; the waiting customer gets the spot.
    expect((await pick(waiting.token, days[3])).ok).toBe(true);

    const pair = await Promise.all([customer("Pair A"), customer("Pair B")]);
    for (const one of pair) expect((await pick(one.token, days[1])).ok).toBe(true);
    const lower = await admin.from("install_days").update({ job_limit: 1 }).eq("day", days[1]);
    expect(hintOf(lower.error)).toBe("below_booked");
    // Closing it never moves anyone.
    expect((await admin.from("install_days").update({ open: false }).eq("day", days[1])).error).toBeNull();
    expect(await heldOn(days[1], pair.map((one) => one.lead))).toBe(2);
    expect((await admin.from("install_days").update({ open: true }).eq("day", days[1])).error).toBeNull();
    await clear(pair.map((one) => one.lead));
    await clear([waiting.lead]);
  });

  it("Accepted with no day keeps the day picked, Undo keeps it, Cancelled gives it back", async () => {
    const sale = await customer("Sale");
    expect((await pick(sale.token, days[4])).ok).toBe(true);
    expect((await admin.rpc("quote_accept_offer", { p_quote: sale.quote, p_offer: "front" })).error).toBeNull();
    expect(await dayOf(sale.lead)).toBe(days[4]);
    expect((await admin.rpc("quote_undo_acceptance", { p_quote: sale.quote })).error).toBeNull();
    expect(await dayOf(sale.lead)).toBe(days[4]);
    expect((await admin.rpc("quote_accept_offer", { p_quote: sale.quote, p_offer: "front" })).error).toBeNull();
    expect((await admin.rpc("quote_cancel", { p_quote: sale.quote, p_reason: "timing" })).error).toBeNull();
    const { data: lead } = await admin.from("leads").select("status, install_on").eq("id", sale.lead).single();
    expect(lead).toMatchObject({ status: "lost", install_on: null });
  });
});

describe("the timeline and who may touch the calendar", () => {
  it("the timeline says who picked the day and who changed it, never twice", async () => {
    const told = await customer("Told");
    expect((await pick(told.token, days[5])).ok).toBe(true);
    expect((await admin.rpc("install_day_set", { p_lead: told.lead, p_day: days[0] })).error).toBeNull();
    const { data: events } = await admin
      .from("lead_events")
      .select("type, payload")
      .eq("lead_id", told.lead)
      .in("type", ["install_day_picked", "install_day_changed", "install_day_cleared", "edited"])
      .order("created_at");
    expect(events?.map((event) => event.type)).toEqual(["install_day_picked", "install_day_changed"]);
    expect(events?.[0].payload).toEqual({ day: days[5], by: "customer" });
    expect(events?.[1].payload).toEqual({ day: days[0], from: days[5], by: "keenan" });
    await clear([told.lead]);
  });

  it("the pick hands the server only the push addresses of the person who made the link", async () => {
    const pushed = await customer("Pushed");
    const result = await pick(pushed.token, days[5]);
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.targets)).toBe(true);
    expect(result.targets).toEqual([]);
    await clear([pushed.lead]);
  });

  it("nobody but Keenan sees or changes the calendar or sets a day", async () => {
    const own = await makeLead("Setter's own");
    expect((await setter.client.from("install_days").select("day").in("day", days)).data ?? []).toEqual([]);
    expect((await setter.client.from("install_days").insert({ day: days[0], open: true })).error).not.toBeNull();
    const update = await setter.client.from("install_days").update({ job_limit: 9 }).eq("day", days[0]).select("day");
    expect(update.data ?? []).toEqual([]);
    const fromAnon = await anon.from("install_days").select("day").in("day", days);
    expect(fromAnon.error !== null || (fromAnon.data ?? []).length === 0).toBe(true);
    expect(hintOf((await setter.client.rpc("install_day_set", { p_lead: own, p_day: days[0] })).error)).toBe("not_allowed");
    expect((await setter.client.from("leads").update({ install_on: days[0] }).eq("id", own)).error).not.toBeNull();
    expect(await dayOf(own)).toBeNull();
    const { data: limit } = await admin.from("install_days").select("job_limit").eq("day", days[0]).single();
    expect(limit?.job_limit).toBe(1);
  });
});
