import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";

// Proves what the database lets a sales user do, independent of the UI.
// Two throwaway sales users are created through the admin API and removed
// again at the end. The owner is never touched except to prove the owner
// row cannot be changed.

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

type TestUser = { email: string; password: string; id: string; client: Client };
const users: Record<"a" | "b", TestUser> = {
  a: { email: `rls-a-${stamp}@example.com`, password: `Rls-A-${stamp}-pass1`, id: "", client: admin },
  b: { email: `rls-b-${stamp}@example.com`, password: `Rls-B-${stamp}-pass2`, id: "", client: admin },
};

async function signedInClient(email: string, password: string): Promise<Client> {
  const client = createClient<Database>(url!, anonKey!, noSession);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in failed for ${email}: ${error.message}`);
  return client;
}

beforeAll(async () => {
  for (const key of ["a", "b"] as const) {
    const u = users[key];
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { full_name: `RLS Test ${key.toUpperCase()}` },
    });
    if (error || !data.user) throw new Error(`could not create ${u.email}: ${error?.message}`);
    u.id = data.user.id;
    u.client = await signedInClient(u.email, u.password);
  }
});

afterAll(async () => {
  for (const u of Object.values(users)) {
    if (u.id) await admin.auth.admin.deleteUser(u.id);
  }
});

describe("profiles", () => {
  it("the trigger made sales profiles for both test users", async () => {
    const { data } = await admin.from("profiles").select("id, role, active, full_name").in("id", [users.a.id, users.b.id]);
    expect(data).toHaveLength(2);
    expect(data?.every((p) => p.role === "sales" && p.active)).toBe(true);
    expect(data?.map((p) => p.full_name).sort()).toEqual(["RLS Test A", "RLS Test B"]);
  });

  it("a sales user sees only their own profile row", async () => {
    const { data, error } = await users.a.client.from("profiles").select("id");
    expect(error).toBeNull();
    expect(data).toEqual([{ id: users.a.id }]);
  });

  it("a sales user reads names of active people through profiles_public, nothing more", async () => {
    const { data, error } = await users.a.client.from("profiles_public").select("*");
    expect(error).toBeNull();
    const b = data?.find((p) => p.id === users.b.id);
    expect(b).toBeDefined();
    expect(Object.keys(b!).sort()).toEqual(["full_name", "id", "role"]);
  });

  it("a sales user cannot promote themselves or deactivate someone else", async () => {
    const promote = await users.a.client.from("profiles").update({ role: "owner" }).eq("id", users.a.id).select("id");
    expect(promote.data).toEqual([]);
    const deactivate = await users.a.client.from("profiles").update({ active: false }).eq("id", users.b.id).select("id");
    expect(deactivate.data).toEqual([]);
    const { data: after } = await admin.from("profiles").select("role, active").in("id", [users.a.id, users.b.id]);
    expect(after?.every((p) => p.role === "sales" && p.active)).toBe(true);
  });

  it("a sales user cannot insert a profile", async () => {
    const { error } = await users.a.client.from("profiles").insert({ id: users.a.id, email: "x@example.com", full_name: "x" });
    expect(error).not.toBeNull();
  });

  it("there can only ever be one owner, even for the service role", async () => {
    const { error } = await admin.from("profiles").update({ role: "owner" }).eq("id", users.b.id);
    expect(error?.message ?? "").toMatch(/profiles_single_owner/);
  });

  it("the owner row cannot be deactivated or demoted, even for the service role", async () => {
    const deactivate = await admin.from("profiles").update({ active: false }).eq("role", "owner");
    expect(deactivate.error?.message ?? "").toMatch(/owner profile/i);
    const demote = await admin.from("profiles").update({ role: "sales" }).eq("role", "owner");
    expect(demote.error?.message ?? "").toMatch(/owner profile/i);
  });
});

describe("settings", () => {
  it("a sales user cannot read settings", async () => {
    const { data, error } = await users.a.client.from("settings").select("*");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("a sales user reads the slot template through settings_public, nothing more", async () => {
    const { data, error } = await users.a.client.from("settings_public").select("*");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(Object.keys(data![0]).sort()).toEqual(
      ["distance_warning_km", "meeting_days", "meeting_slot_count", "meeting_slot_minutes", "meeting_start"],
    );
  });

  it("a sales user cannot change settings", async () => {
    const before = await admin.from("settings").select("price_per_ft").eq("id", 1).single();
    const attempt = await users.a.client.from("settings").update({ price_per_ft: 1 }).eq("id", 1).select("id");
    expect(attempt.data).toEqual([]);
    const after = await admin.from("settings").select("price_per_ft").eq("id", 1).single();
    expect(after.data?.price_per_ft).toBe(before.data?.price_per_ft);
  });

  it("nobody can add a second settings row", async () => {
    const asSales = await users.a.client.from("settings").insert({ id: 2, warranty_text: "x", presentation: [], company: {} });
    expect(asSales.error).not.toBeNull();
    const asAdmin = await admin.from("settings").insert({ id: 2, warranty_text: "x", presentation: [], company: {} });
    expect(asAdmin.error?.message ?? "").toMatch(/check|settings_id_check/i);
  });
});

describe("anonymous", () => {
  it("cannot read profiles, settings or the public views", async () => {
    const anon = createClient<Database>(url!, anonKey!, noSession);
    const reads = {
      profiles: () => anon.from("profiles").select("*"),
      settings: () => anon.from("settings").select("*"),
      profiles_public: () => anon.from("profiles_public").select("*"),
      settings_public: () => anon.from("settings_public").select("*"),
    };
    for (const [name, read] of Object.entries(reads)) {
      const { data, error } = await read();
      expect(error !== null || data?.length === 0, `anon read ${name}`).toBe(true);
    }
  });
});

describe("deactivation", () => {
  it("a banned user cannot sign in, and lifting the ban restores it", async () => {
    const { error: banError } = await admin.auth.admin.updateUserById(users.b.id, { ban_duration: "876600h" });
    expect(banError).toBeNull();
    const banned = createClient<Database>(url!, anonKey!, noSession);
    const { error: signInError } = await banned.auth.signInWithPassword({ email: users.b.email, password: users.b.password });
    expect(signInError?.code).toBe("user_banned");
    const { error: unbanError } = await admin.auth.admin.updateUserById(users.b.id, { ban_duration: "none" });
    expect(unbanError).toBeNull();
    const again = createClient<Database>(url!, anonKey!, noSession);
    const { error: okError } = await again.auth.signInWithPassword({ email: users.b.email, password: users.b.password });
    expect(okError).toBeNull();
  });
});

describe("sign-up trigger and roles", () => {
  it("honours a non-owner role in user metadata and never grants owner that way", async () => {
    const made: string[] = [];
    try {
      for (const [role, expected] of [["crew", "crew"], ["owner", "sales"], ["nonsense", "sales"]] as const) {
        const { data, error } = await admin.auth.admin.createUser({
          email: `rls-role-${role}-${stamp}@example.com`,
          password: `Rls-role-${stamp}-pass`,
          email_confirm: true,
          user_metadata: { full_name: `Role ${role}`, role },
        });
        if (error || !data.user) throw new Error(error?.message);
        made.push(data.user.id);
        const { data: profile } = await admin.from("profiles").select("role").eq("id", data.user.id).single();
        expect(profile?.role, `metadata role ${role}`).toBe(expected);
      }
    } finally {
      for (const id of made) await admin.auth.admin.deleteUser(id);
    }
  });
});

describe("ending sessions", () => {
  it("a signed-in user cannot call end_user_sessions", async () => {
    const { error } = await users.a.client.rpc("end_user_sessions", { target_user: users.b.id });
    expect(error).not.toBeNull();
  });

  it("the service role ends every session for a user, and the Auth server then rejects that user", async () => {
    const before = await users.b.client.auth.getUser();
    expect(before.error).toBeNull();
    const { data: ended, error } = await admin.rpc("end_user_sessions", { target_user: users.b.id });
    expect(error).toBeNull();
    expect(ended).toBeGreaterThanOrEqual(1);
    const after = await users.b.client.auth.getUser();
    expect(after.error).not.toBeNull();
    const refreshed = await users.b.client.auth.refreshSession();
    expect(refreshed.error).not.toBeNull();
  });

  it("refuses to end the owner's sessions", async () => {
    const { data: owner } = await admin.from("profiles").select("id").eq("role", "owner").single();
    if (!owner) return;
    const { error } = await admin.rpc("end_user_sessions", { target_user: owner.id });
    expect(error?.message ?? "").toMatch(/owner/i);
  });
});
