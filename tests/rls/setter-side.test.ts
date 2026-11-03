import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";

// Proves the setter side's rules in the database itself (Keenan,
// 2026-11-03): a setter finishes only their own welcome, once; only Keenan
// resets one, and only a setter's; and the functions that hand Keenan's
// server a member's sealed push addresses, or list their devices for View
// as, give nobody else anything. Signed in as two throwaway setters and an
// account with no profile; everything made here is removed at the end. The
// service role stands in for the owner, as in the other suites: the tests
// never sign in as Keenan and never touch a real account.

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

type TestUser = { email: string; password: string; id: string; client: Client };
const users: Record<"a" | "b" | "nobody", TestUser> = {
  a: { email: `rls-ss-a-${stamp}@example.com`, password: `Rls-ss-a-${stamp}-pass`, id: "", client: admin },
  b: { email: `rls-ss-b-${stamp}@example.com`, password: `Rls-ss-b-${stamp}-pass`, id: "", client: admin },
  nobody: { email: `rls-ss-none-${stamp}@example.com`, password: `Rls-ss-n-${stamp}-pass`, id: "", client: admin },
};

async function signedIn(email: string, password: string): Promise<Client> {
  const client = createClient<Database>(url!, anonKey!, noSession);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in failed for ${email}: ${error.message}`);
  return client;
}

const welcomeOf = async (id: string) =>
  (await admin.from("profiles").select("welcome_done_at").eq("id", id).single()).data?.welcome_done_at ?? null;

// A device row for a test setter, as the device action writes it.
const hashFor = (n: number) => `${stamp}${n}`.padEnd(64, "0").replace(/[^0-9a-f]/g, "a").slice(0, 64);

beforeAll(async () => {
  for (const key of ["a", "b", "nobody"] as const) {
    const u = users[key];
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { full_name: `RLS SS ${key.toUpperCase()}` },
      app_metadata: key === "nobody" ? {} : { role: "sales" },
    });
    if (error || !data.user) throw new Error(`could not create ${u.email}: ${error?.message}`);
    u.id = data.user.id;
    u.client = await signedIn(u.email, u.password);
  }
});

afterAll(async () => {
  for (const u of Object.values(users)) {
    if (!u.id) continue;
    await admin.from("push_subscriptions").delete().eq("profile_id", u.id);
    await admin.auth.admin.deleteUser(u.id);
  }
});

describe("the welcome", () => {
  it("starts not done for a new setter", async () => {
    expect(await welcomeOf(users.a.id)).toBeNull();
    expect(await welcomeOf(users.b.id)).toBeNull();
  });

  it("a setter finishes their own, once, and nobody else's", async () => {
    const first = await users.a.client.rpc("finish_welcome");
    expect(first.error).toBeNull();
    expect(first.data).toBeTruthy();
    const stamped = await welcomeOf(users.a.id);
    expect(stamped).not.toBeNull();
    // Finishing again keeps the first time.
    const again = await users.a.client.rpc("finish_welcome");
    expect(again.error).toBeNull();
    expect(new Date((await welcomeOf(users.a.id))!).getTime()).toBe(new Date(stamped!).getTime());
    // The other setter's stays as it was.
    expect(await welcomeOf(users.b.id)).toBeNull();
  });

  it("can't be finished by someone signed out or with no profile", async () => {
    const stranger = await anon.rpc("finish_welcome");
    expect(stranger.error).not.toBeNull();
    const nobody = await users.nobody.client.rpc("finish_welcome");
    expect(nobody.data ?? null).toBeNull();
  });

  it("a setter can't write the column directly, theirs or anyone's", async () => {
    const own = await users.b.client.from("profiles").update({ welcome_done_at: new Date().toISOString() }).eq("id", users.b.id).select("id");
    expect(own.data ?? []).toHaveLength(0);
    const other = await users.b.client.from("profiles").update({ welcome_done_at: null }).eq("id", users.a.id).select("id");
    expect(other.data ?? []).toHaveLength(0);
    expect(await welcomeOf(users.b.id)).toBeNull();
    expect(await welcomeOf(users.a.id)).not.toBeNull();
  });

  it("only Keenan resets it, and only a setter's", async () => {
    const bySetter = await users.b.client.rpc("reset_welcome", { p_profile_id: users.a.id });
    expect(bySetter.error).not.toBeNull();
    expect(await welcomeOf(users.a.id)).not.toBeNull();
    const byStranger = await anon.rpc("reset_welcome", { p_profile_id: users.a.id });
    expect(byStranger.error).not.toBeNull();

    const byOwner = await admin.rpc("reset_welcome", { p_profile_id: users.a.id });
    expect(byOwner.error).toBeNull();
    expect(byOwner.data).toBe(true);
    expect(await welcomeOf(users.a.id)).toBeNull();

    // An account that isn't a setter: nothing to reset.
    const notSetter = await admin.rpc("reset_welcome", { p_profile_id: users.nobody.id });
    expect(notSetter.data).toBe(false);
  });
});

describe("a member's devices, for Keenan's notices and View as", () => {
  let deviceA = "";

  beforeAll(async () => {
    const { data, error } = await users.a.client
      .from("push_subscriptions")
      .insert({ profile_id: users.a.id, endpoint_hash: hashFor(1), sealed: "v1.test-sealed-address-for-a", label: "iPhone" })
      .select("id")
      .single();
    if (error || !data) throw new Error(`could not add a device: ${error?.message}`);
    deviceA = data.id;
  });

  it("hands the sealed addresses only to Keenan's server", async () => {
    const owner = await admin.rpc("push_targets_for_member", { p_profile_id: users.a.id });
    expect(owner.error).toBeNull();
    expect(owner.data).toEqual([{ id: deviceA, sealed: "v1.test-sealed-address-for-a" }]);

    for (const client of [users.a.client, users.b.client, users.nobody.client]) {
      const { data } = await client.rpc("push_targets_for_member", { p_profile_id: users.a.id });
      expect(data ?? []).toHaveLength(0);
    }
    const stranger = await anon.rpc("push_targets_for_member", { p_profile_id: users.a.id });
    expect(stranger.error ?? (stranger.data ?? []).length === 0).toBeTruthy();
  });

  it("lists devices by label for View as, never the address, and only to Keenan", async () => {
    const owner = await admin.rpc("push_devices_for_member", { p_profile_id: users.a.id });
    expect(owner.error).toBeNull();
    expect(owner.data).toHaveLength(1);
    expect(Object.keys(owner.data![0]).sort()).toEqual(["created_at", "id", "label", "last_sent_at"]);
    expect(owner.data![0].label).toBe("iPhone");
    expect(JSON.stringify(owner.data)).not.toContain("sealed");

    for (const client of [users.a.client, users.b.client, users.nobody.client]) {
      const { data } = await client.rpc("push_devices_for_member", { p_profile_id: users.a.id });
      expect(data ?? []).toHaveLength(0);
    }
    const stranger = await anon.rpc("push_devices_for_member", { p_profile_id: users.a.id });
    expect(stranger.error ?? (stranger.data ?? []).length === 0).toBeTruthy();
  });

  it("a setter sees and switches off only their own devices", async () => {
    const bSees = await users.b.client.from("push_subscriptions").select("id").eq("id", deviceA);
    expect(bSees.data ?? []).toHaveLength(0);
    const bSwitches = await users.b.client.from("push_subscriptions").update({ removed_at: new Date().toISOString() }).eq("id", deviceA).select("id");
    expect(bSwitches.data ?? []).toHaveLength(0);
    // Taking another member's push address fails instead of moving it.
    const bTakes = await users.b.client
      .from("push_subscriptions")
      .insert({ profile_id: users.b.id, endpoint_hash: hashFor(1), sealed: "v1.test-sealed-address-for-b", label: "iPhone" });
    expect(bTakes.error?.code).toBe("23505");

    const aSwitches = await users.a.client.from("push_subscriptions").update({ removed_at: new Date().toISOString() }).eq("id", deviceA).select("id");
    expect(aSwitches.data).toHaveLength(1);
  });

  it("gives nothing for a device that is switched off", async () => {
    const targets = await admin.rpc("push_targets_for_member", { p_profile_id: users.a.id });
    expect(targets.data ?? []).toHaveLength(0);
    const devices = await admin.rpc("push_devices_for_member", { p_profile_id: users.a.id });
    expect(devices.data ?? []).toHaveLength(0);
  });
});
