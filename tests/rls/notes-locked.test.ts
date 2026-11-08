import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";

// Round 6, part two (applied once the app reads notes only through
// lead_notes): nobody signed in reads leads.notes from the table itself.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  throw new Error("RLS tests need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SERVICE_ROLE_KEY. See .env.example.");
}

type Client = SupabaseClient<Database>;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin: Client = createClient<Database>(url, serviceKey, noSession);
const stamp = Date.now().toString(36);
const email = `rls-r6-lock-${stamp}@example.com`;
const password = `Rls-r6-lock-${stamp}-pass`;
let userId = "";
let client: Client = admin;

beforeAll(async () => {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "RLS R6 lock" }, app_metadata: { role: "sales" } });
  if (error || !data.user) throw new Error(`could not create ${email}: ${error?.message}`);
  userId = data.user.id;
  client = createClient<Database>(url!, anonKey!, noSession);
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw new Error(`sign in failed: ${signedIn.error.message}`);
});

afterAll(async () => {
  if (userId) {
    await admin.from("leads").delete().eq("created_by", userId);
    await admin.auth.admin.deleteUser(userId);
  }
});

describe("leads.notes", () => {
  it("can't be read from the table, even on the setter's own lead; lead_notes has it", async () => {
    const { data: lead } = await client
      .from("leads")
      .insert({ created_by: userId, first_name: `TEST R6 lock ${stamp}`, address_line: `2 Lock Test Way NW (TEST ${stamp})`, notes: "Mine" })
      .select("id")
      .single();
    const direct = await client.from("leads").select("notes").eq("id", lead!.id);
    expect(direct.error).not.toBeNull();
    const viaView = await client.from("lead_notes").select("notes").eq("lead_id", lead!.id).single();
    expect(viaView.data?.notes).toBe("Mine");
  });
});
