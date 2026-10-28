import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";

// Proves the M2 rules in the database itself, signed in as two throwaway
// setters. Every lead they make is named "TEST LEAD (automated)" and is
// deleted at the end with their sessions, photo files and accounts.

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
const BUCKET = "lead-photos";

type TestUser = { email: string; password: string; id: string; client: Client };
const users: Record<"a" | "b" | "nobody", TestUser> = {
  a: { email: `rls-m2-a-${stamp}@example.com`, password: `Rls-m2-a-${stamp}-pass`, id: "", client: admin },
  b: { email: `rls-m2-b-${stamp}@example.com`, password: `Rls-m2-b-${stamp}-pass`, id: "", client: admin },
  nobody: { email: `rls-m2-none-${stamp}@example.com`, password: `Rls-m2-n-${stamp}-pass`, id: "", client: admin },
};

let jpeg: Buffer;
let sessionA = "";
let leadA = "";

async function signedIn(email: string, password: string): Promise<Client> {
  const client = createClient<Database>(url!, anonKey!, noSession);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in failed for ${email}: ${error.message}`);
  return client;
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
      user_metadata: { full_name: `RLS M2 ${key.toUpperCase()}` },
      app_metadata: key === "nobody" ? {} : { role: "sales" },
    });
    if (error || !data.user) throw new Error(`could not create ${u.email}: ${error?.message}`);
    u.id = data.user.id;
    u.client = await signedIn(u.email, u.password);
  }
});

afterAll(async () => {
  for (const u of Object.values(users)) {
    if (u.id) await removeEverythingOf(u.id);
  }
});

describe("knock sessions", () => {
  it("a setter starts their own session, whatever user_id says, and only one at a time", async () => {
    const { data, error } = await users.a.client
      .from("knock_sessions")
      .insert({ neighbourhood: "TEST (automated)", user_id: users.b.id })
      .select("id, user_id, doors_knocked, conversations")
      .single();
    expect(error).toBeNull();
    expect(data?.user_id).toBe(users.a.id);
    expect([data?.doors_knocked, data?.conversations]).toEqual([0, 0]);
    sessionA = data!.id;

    const second = await users.a.client
      .from("knock_sessions")
      .insert({ neighbourhood: "TEST (automated)", user_id: users.a.id });
    expect(second.error?.code).toBe("23505");
  });

  it("counts taps atomically, so ten at once all land, and never goes below zero", async () => {
    const first = await users.a.client.rpc("bump_knock_session", { p_session: sessionA, p_doors: 3, p_conversations: 1 });
    expect(first.data?.[0]).toMatchObject({ doors_knocked: 3, conversations: 1 });
    await Promise.all(
      Array.from({ length: 10 }, () =>
        users.a.client.rpc("bump_knock_session", { p_session: sessionA, p_doors: 1, p_conversations: 0 }),
      ),
    );
    const { data: after } = await admin.from("knock_sessions").select("doors_knocked").eq("id", sessionA).single();
    expect(after?.doors_knocked).toBe(13);
    const floored = await users.a.client.rpc("bump_knock_session", { p_session: sessionA, p_doors: -50, p_conversations: -50 });
    expect(floored.data?.[0]).toMatchObject({ doors_knocked: 0, conversations: 0 });
  });

  it("another setter can see the session but cannot bump, change or end it", async () => {
    const seen = await users.b.client.from("knock_sessions").select("id").eq("id", sessionA);
    expect(seen.data).toHaveLength(1);
    const bump = await users.b.client.rpc("bump_knock_session", { p_session: sessionA, p_doors: 5, p_conversations: 0 });
    expect(bump.data).toEqual([]);
    const end = await users.b.client
      .from("knock_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", sessionA)
      .select("id");
    expect(end.data).toEqual([]);
    const { data: row } = await admin.from("knock_sessions").select("doors_knocked, ended_at").eq("id", sessionA).single();
    expect(row).toEqual({ doors_knocked: 0, ended_at: null });
  });

  it("a session left open on an earlier day closes on the next visit; today's stays open", async () => {
    await users.a.client.from("knock_sessions").update({ ended_at: new Date().toISOString() }).eq("id", sessionA);
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
    const { data: stale } = await admin
      .from("knock_sessions")
      .insert({ user_id: users.a.id, neighbourhood: "TEST (automated)", started_at: twoDaysAgo })
      .select("id")
      .single();
    const closed = await users.a.client.rpc("close_my_stale_knock_sessions");
    expect(closed.data).toBe(1);
    const { data: staleRow } = await admin.from("knock_sessions").select("ended_at").eq("id", stale!.id).single();
    expect(staleRow?.ended_at).not.toBeNull();

    const { data: today } = await users.a.client
      .from("knock_sessions")
      .insert({ neighbourhood: "TEST (automated)", user_id: users.a.id })
      .select("id")
      .single();
    sessionA = today!.id;
    const again = await users.a.client.rpc("close_my_stale_knock_sessions");
    expect(again.data).toBe(0);
  });
});

describe("leads", () => {
  it("a setter adds a lead as themselves, linked to their own session, and the timeline records it", async () => {
    const { data, error } = await users.a.client
      .from("leads")
      .insert({
        first_name: TEST_LEAD,
        address_line: "1 Test Street NW",
        created_by: users.b.id,
        assigned_to: users.b.id,
        knock_session_id: sessionA,
      })
      .select("id, created_by, assigned_to, status, knock_session_id")
      .single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ created_by: users.a.id, assigned_to: users.a.id, status: "new", knock_session_id: sessionA });
    leadA = data!.id;
    const { data: events } = await admin.from("lead_events").select("type, actor_id, to_status").eq("lead_id", leadA);
    expect(events).toEqual([{ type: "created", actor_id: users.a.id, to_status: "new" }]);
  });

  it("a lead cannot link to another setter's knock session", async () => {
    const { error } = await users.b.client
      .from("leads")
      .insert({ first_name: TEST_LEAD, address_line: "2 Test Street NW", created_by: users.b.id, knock_session_id: sessionA });
    expect(error?.code).toBe("42501");
  });

  it("a setter cannot add a lead as Meeting booked or any later status", async () => {
    for (const status of ["meeting_booked", "met", "sold"] as const) {
      const { error } = await users.a.client
        .from("leads")
        .insert({ first_name: TEST_LEAD, address_line: "3 Test Street NW", created_by: users.a.id, status });
      expect(error?.code, status).toBe("42501");
    }
  });

  it("another setter can read the lead and its timeline but cannot change it, note it or add photos", async () => {
    const lead = await users.b.client.from("leads").select("id, first_name").eq("id", leadA);
    expect(lead.data).toEqual([{ id: leadA, first_name: TEST_LEAD }]);
    const timeline = await users.b.client.from("lead_events").select("id").eq("lead_id", leadA);
    expect(timeline.data?.length).toBeGreaterThan(0);

    const update = await users.b.client.from("leads").update({ first_name: "Changed" }).eq("id", leadA).select("id");
    expect(update.data).toEqual([]);
    const note = await users.b.client.from("lead_events").insert({ lead_id: leadA, type: "note", payload: { text: "TEST note (automated)" } });
    expect(note.error?.code).toBe("42501");
    const photo = await users.b.client
      .from("lead_photos")
      .insert({ lead_id: leadA, storage_path: `${users.b.id}/${crypto.randomUUID()}.jpg` });
    expect(photo.error?.code).toBe("42501");
    const remove = await users.b.client.from("leads").delete().eq("id", leadA).select("id");
    expect(remove.data ?? []).toEqual([]);

    const { data: still } = await admin.from("leads").select("first_name").eq("id", leadA).single();
    expect(still?.first_name).toBe(TEST_LEAD);
  });

  it("setters move their own lead between New, Follow up and Lost, and Lost needs a reason", async () => {
    const toFollowUp = await users.a.client.from("leads").update({ status: "follow_up" }).eq("id", leadA).select("status");
    expect(toFollowUp.data).toEqual([{ status: "follow_up" }]);

    const noReason = await users.a.client.from("leads").update({ status: "lost" }).eq("id", leadA);
    expect(noReason.error?.code).toBe("23514");

    const lost = await users.a.client
      .from("leads")
      .update({ status: "lost", lost_reason: "price" })
      .eq("id", leadA)
      .select("status, lost_reason, lost_at");
    expect(lost.data?.[0]).toMatchObject({ status: "lost", lost_reason: "price" });
    expect(lost.data?.[0].lost_at).not.toBeNull();

    const reopened = await users.a.client
      .from("leads")
      .update({ status: "new" })
      .eq("id", leadA)
      .select("status, lost_reason, lost_at");
    expect(reopened.data).toEqual([{ status: "new", lost_reason: null, lost_at: null }]);

    const { data: events } = await admin
      .from("lead_events")
      .select("type, actor_id, from_status, to_status, payload")
      .eq("lead_id", leadA)
      .eq("type", "status_change")
      .order("created_at");
    expect(events?.map((e) => [e.from_status, e.to_status])).toEqual([
      ["new", "follow_up"],
      ["follow_up", "lost"],
      ["lost", "new"],
    ]);
    expect(events?.every((e) => e.actor_id === users.a.id)).toBe(true);
    expect(events?.[1].payload).toEqual({ reason: "price" });
  });

  it("a setter cannot set Meeting booked, or any status after it, on their own lead", async () => {
    for (const status of ["meeting_booked", "met", "quoted", "sold", "installed"] as const) {
      const { error } = await users.a.client.from("leads").update({ status }).eq("id", leadA);
      expect(error?.code, status).toBe("42501");
    }
    const { data } = await admin.from("leads").select("status").eq("id", leadA).single();
    expect(data?.status).toBe("new");
  });

  it("once the owner moves a lead on, the setter cannot move it back but can still fix details", async () => {
    await admin.from("leads").update({ status: "met" }).eq("id", leadA);
    const back = await users.a.client.from("leads").update({ status: "follow_up" }).eq("id", leadA);
    expect(back.error?.code).toBe("42501");
    const details = await users.a.client.from("leads").update({ notes: "TEST notes (automated)" }).eq("id", leadA).select("id");
    expect(details.data).toHaveLength(1);
    await admin.from("leads").update({ status: "new" }).eq("id", leadA);
  });

  it("a setter cannot hand a lead to someone else", async () => {
    const { error } = await users.a.client.from("leads").update({ assigned_to: users.b.id }).eq("id", leadA);
    expect(error?.code).toBe("42501");
  });

  it("edits are logged by field name, never by value", async () => {
    await users.a.client.from("leads").update({ phone: "+14035550199", neighbourhood: "TEST (automated)" }).eq("id", leadA);
    const { data } = await admin
      .from("lead_events")
      .select("payload")
      .eq("lead_id", leadA)
      .eq("type", "edited")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(data?.payload).toEqual({ fields: ["neighbourhood", "phone"] });
  });

  it("the database refuses a phone that is not in E.164", async () => {
    const { error } = await users.a.client.from("leads").update({ phone: "403-555-0199" }).eq("id", leadA);
    expect(error?.code).toBe("23514");
  });
});

describe("the timeline", () => {
  it("setters write notes by hand on their own leads, signed with their name, and nothing else", async () => {
    const note = await users.a.client
      .from("lead_events")
      .insert({ lead_id: leadA, type: "note", payload: { text: "TEST note (automated)" }, actor_id: users.b.id })
      .select("id, actor_id")
      .single();
    expect(note.error).toBeNull();
    expect(note.data?.actor_id).toBe(users.a.id);
    const forged = await users.a.client
      .from("lead_events")
      .insert({ lead_id: leadA, type: "status_change", from_status: "new", to_status: "sold" });
    expect(forged.error?.code).toBe("42501");
    const empty = await users.a.client.from("lead_events").insert({ lead_id: leadA, type: "note", payload: { text: "" } });
    expect(empty.error).not.toBeNull();
  });

  it("nobody can edit or delete the timeline, not even the author", async () => {
    const { data: note } = await admin
      .from("lead_events")
      .select("id, payload")
      .eq("lead_id", leadA)
      .eq("type", "note")
      .limit(1)
      .single();
    const edit = await users.a.client.from("lead_events").update({ payload: { text: "rewritten" } }).eq("id", note!.id);
    expect(edit.error).not.toBeNull();
    const remove = await users.a.client.from("lead_events").delete().eq("id", note!.id);
    expect(remove.error).not.toBeNull();
    const { data: after } = await admin.from("lead_events").select("payload").eq("id", note!.id).single();
    expect(after?.payload).toEqual(note!.payload);
  });
});

describe("photos", () => {
  const photoA = crypto.randomUUID();

  it("a setter uploads only into their own folder, and only images", async () => {
    const own = await users.a.client.storage
      .from(BUCKET)
      .upload(`${users.a.id}/${photoA}.jpg`, jpeg, { contentType: "image/jpeg", upsert: false });
    expect(own.error).toBeNull();
    const theirs = await users.a.client.storage
      .from(BUCKET)
      .upload(`${users.b.id}/${crypto.randomUUID()}.jpg`, jpeg, { contentType: "image/jpeg", upsert: false });
    expect(theirs.error).not.toBeNull();
    const text = await users.a.client.storage
      .from(BUCKET)
      .upload(`${users.a.id}/${crypto.randomUUID()}.jpg`, Buffer.from("hello"), { contentType: "text/plain", upsert: false });
    expect(text.error).not.toBeNull();
  });

  it("linking a photo to a lead logs it; a path in someone else's folder is refused", async () => {
    const linked = await users.a.client
      .from("lead_photos")
      .insert({ lead_id: leadA, storage_path: `${users.a.id}/${photoA}.jpg`, created_by: users.b.id })
      .select("created_by")
      .single();
    expect(linked.error).toBeNull();
    expect(linked.data?.created_by).toBe(users.a.id);
    const { data: events } = await admin.from("lead_events").select("type").eq("lead_id", leadA).eq("type", "photo_added");
    expect(events).toHaveLength(1);
    const foreign = await users.a.client
      .from("lead_photos")
      .insert({ lead_id: leadA, storage_path: `${users.b.id}/${crypto.randomUUID()}.jpg` });
    expect(foreign.error?.code).toBe("42501");
  });

  it("other setters can view the photo, signed-out visitors cannot, and only the owner can delete files", async () => {
    const path = `${users.a.id}/${photoA}.jpg`;
    const teammate = await users.b.client.storage.from(BUCKET).createSignedUrl(path, 60);
    expect(teammate.error).toBeNull();
    const anon = createClient<Database>(url!, anonKey!, noSession);
    const stranger = await anon.storage.from(BUCKET).createSignedUrl(path, 60);
    expect(stranger.error).not.toBeNull();
    await users.a.client.storage.from(BUCKET).remove([path]);
    const { data: files } = await admin.storage.from(BUCKET).list(users.a.id);
    expect(files?.some((file) => file.name === `${photoA}.jpg`)).toBe(true);
  });
});

describe("views and outsiders", () => {
  it("profile_names keeps deactivated people's names while profiles_public hides them", async () => {
    await admin.from("profiles").update({ active: false }).eq("id", users.b.id);
    try {
      const names = await users.a.client.from("profile_names").select("id, full_name").eq("id", users.b.id);
      expect(names.data).toEqual([{ id: users.b.id, full_name: "RLS M2 B" }]);
      const pickers = await users.a.client.from("profiles_public").select("id").eq("id", users.b.id);
      expect(pickers.data).toEqual([]);
    } finally {
      await admin.from("profiles").update({ active: true }).eq("id", users.b.id);
    }
  });

  it("an account without a profile, and a signed-out visitor, see nothing", async () => {
    const anon = createClient<Database>(url!, anonKey!, noSession);
    for (const client of [users.nobody.client, anon]) {
      for (const read of [
        () => client.from("leads").select("id"),
        () => client.from("knock_sessions").select("id"),
        () => client.from("lead_events").select("id"),
        () => client.from("lead_photos").select("id"),
        () => client.from("profile_names").select("id"),
      ]) {
        const { data, error } = await read();
        expect(error !== null || data?.length === 0).toBe(true);
      }
    }
    const insert = await users.nobody.client
      .from("leads")
      .insert({ first_name: TEST_LEAD, address_line: "4 Test Street NW", created_by: users.nobody.id });
    expect(insert.error).not.toBeNull();
  });
});
