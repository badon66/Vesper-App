import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { insertLeadOnce } from "@/lib/leads/save-key";
import type { Database } from "@/types/database";

// A new lead saves once (Keenan, 2026-11-04). The unique index on
// leads.save_key lets one lead have a key, and the save actions' helper gets
// that lead back for the person who made it: on a retry, and when tries race.
// Signed in as two throwaway setters; leads are named "TEST LEAD (automated)"
// and everything made here is removed at the end.

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
const stamp = Date.now().toString(36);
const TEST_LEAD = "TEST LEAD (automated)";
const setters = ["a", "b"].map((letter) => ({
  email: `rls-key-${letter}-${stamp}@example.com`,
  password: `Rls-key-${letter}-${stamp}-pass`,
  id: "",
  client: admin,
}));
const [a, b] = setters;

const row = (by: string, street: number) => ({
  first_name: TEST_LEAD,
  address_line: `${street} Savekey Way NW (TEST)`,
  created_by: by,
  status: "new" as const,
});

async function leadsWithKey(key: string) {
  const { data } = await admin.from("leads").select("id, created_by").eq("save_key", key);
  return data ?? [];
}

beforeAll(async () => {
  for (const setter of setters) {
    const { data, error } = await admin.auth.admin.createUser({
      email: setter.email,
      password: setter.password,
      email_confirm: true,
      user_metadata: { full_name: `RLS Key ${setter.email.slice(8, 9).toUpperCase()}` },
      app_metadata: { role: "sales" },
    });
    if (error || !data.user) throw new Error(`could not create ${setter.email}: ${error?.message}`);
    setter.id = data.user.id;
    const client = createClient<Database>(url!, anonKey!, noSession);
    const signedIn = await client.auth.signInWithPassword({ email: setter.email, password: setter.password });
    if (signedIn.error) throw new Error(`sign in failed: ${signedIn.error.message}`);
    setter.client = client;
  }
});

afterAll(async () => {
  for (const setter of setters) {
    if (!setter.id) continue;
    await admin.from("leads").delete().eq("created_by", setter.id);
    await admin.auth.admin.deleteUser(setter.id);
  }
});

describe("the save key in the database", () => {
  it("lets one lead have a key: a second insert with it is refused, for the same setter and anyone else", async () => {
    const key = crypto.randomUUID();
    const first = await a.client.from("leads").insert({ ...row(a.id, 1), save_key: key }).select("id, save_key").single();
    expect(first.error).toBeNull();
    expect(first.data!.save_key).toBe(key);
    const again = await a.client.from("leads").insert({ ...row(a.id, 2), save_key: key });
    expect(again.error?.code).toBe("23505");
    const other = await b.client.from("leads").insert({ ...row(b.id, 3), save_key: key });
    expect(other.error?.code).toBe("23505");
    expect(await leadsWithKey(key)).toHaveLength(1);
  });

  it("leaves leads without a key free, as before", async () => {
    const one = await a.client.from("leads").insert(row(a.id, 4)).select("id").single();
    const two = await a.client.from("leads").insert(row(a.id, 4)).select("id").single();
    expect(one.error).toBeNull();
    expect(two.error).toBeNull();
    expect(one.data!.id).not.toBe(two.data!.id);
  });
});

describe("a first save tried again", () => {
  it("gets back the lead the first try made, never a copy", async () => {
    const key = crypto.randomUUID();
    const first = await insertLeadOnce(a.client, a.id, key, row(a.id, 5));
    expect(first).toMatchObject({ ok: true, again: false });
    const retry = await insertLeadOnce(a.client, a.id, key, row(a.id, 5));
    expect(retry).toEqual({ ok: true, leadId: first.ok ? first.leadId : "", again: true });
    expect(await leadsWithKey(key)).toHaveLength(1);
  });

  it("doesn't hand a setter someone else's lead through its key", async () => {
    const key = crypto.randomUUID();
    const mine = await insertLeadOnce(a.client, a.id, key, row(a.id, 6));
    expect(mine.ok).toBe(true);
    const theirs = await insertLeadOnce(b.client, b.id, key, row(b.id, 6));
    expect(theirs.ok).toBe(false);
    const found = await leadsWithKey(key);
    expect(found).toHaveLength(1);
    expect(found[0].created_by).toBe(a.id);
  });

  it("makes one lead when tries arrive at the same instant, repeated", async () => {
    for (let round = 0; round < 5; round += 1) {
      const key = crypto.randomUUID();
      const tries = await Promise.all(Array.from({ length: 4 }, () => insertLeadOnce(a.client, a.id, key, row(a.id, 7))));
      expect(tries.every((result) => result.ok)).toBe(true);
      const ids = new Set(tries.map((result) => (result.ok ? result.leadId : "")));
      expect(ids.size).toBe(1);
      expect(tries.filter((result) => result.ok && !result.again)).toHaveLength(1);
      expect(await leadsWithKey(key)).toHaveLength(1);
    }
  });

  it("saves as before when no key is sent", async () => {
    const one = await insertLeadOnce(a.client, a.id, null, row(a.id, 8));
    const two = await insertLeadOnce(a.client, a.id, null, row(a.id, 8));
    expect(one.ok && two.ok && one.leadId !== two.leadId && !one.again && !two.again).toBe(true);
  });
});
