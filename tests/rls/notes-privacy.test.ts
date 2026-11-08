import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/types/database";

// Round 6 (Keenan, 2026-11-07): notes on a lead (the setter's notes, a note
// on each answer, and note entries on the timeline) are for the lead's own
// setter and Keenan only, enforced in the database like the phone and email.
// Also the split soffit's rules. Two throwaway setters; everything removed
// at the end.

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
const people = {
  a: { email: `rls-r6-a-${stamp}@example.com`, password: `Rls-r6-a-${stamp}-pass`, id: "", client: admin },
  b: { email: `rls-r6-b-${stamp}@example.com`, password: `Rls-r6-b-${stamp}-pass`, id: "", client: admin },
};
let leadId = "";

beforeAll(async () => {
  for (const person of Object.values(people)) {
    const { data, error } = await admin.auth.admin.createUser({
      email: person.email,
      password: person.password,
      email_confirm: true,
      user_metadata: { full_name: "RLS R6" },
      app_metadata: { role: "sales" },
    });
    if (error || !data.user) throw new Error(`could not create ${person.email}: ${error?.message}`);
    person.id = data.user.id;
    const client = createClient<Database>(url!, anonKey!, noSession);
    const signedIn = await client.auth.signInWithPassword({ email: person.email, password: person.password });
    if (signedIn.error) throw new Error(`sign in failed: ${signedIn.error.message}`);
    person.client = client;
  }
  const { data, error } = await people.a.client
    .from("leads")
    .insert({
      created_by: people.a.id,
      first_name: `TEST R6 ${stamp}`,
      address_line: `1 Notes Test Way NW (TEST ${stamp})`,
      notes: "Setter's own notes",
      answer_notes: { owns_home: "Wife's name on title" },
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`could not create the lead: ${error?.message}`);
  leadId = data.id;
  const note = await people.a.client.from("lead_events").insert({ lead_id: leadId, type: "note", actor_id: people.a.id, payload: { text: "Call after six" } });
  if (note.error) throw new Error(`could not add the note: ${note.error.message}`);
});

afterAll(async () => {
  if (leadId) {
    await admin.from("lead_events").delete().eq("lead_id", leadId);
    await admin.from("leads").delete().eq("id", leadId);
  }
  for (const person of Object.values(people)) if (person.id) await admin.auth.admin.deleteUser(person.id);
});

describe("Notes on a lead", () => {
  it("are read by the lead's own setter through lead_notes", async () => {
    const { data, error } = await people.a.client.from("lead_notes").select("notes, answer_notes").eq("lead_id", leadId).single();
    expect(error).toBeNull();
    expect(data).toEqual({ notes: "Setter's own notes", answer_notes: { owns_home: "Wife's name on title" } });
  });

  it("never reach another setter: no row in lead_notes", async () => {
    const { data, error } = await people.b.client.from("lead_notes").select("notes, answer_notes").eq("lead_id", leadId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("can't be read from the table itself, the answer notes by anyone signed in", async () => {
    for (const person of [people.a, people.b]) {
      const { error } = await person.client.from("leads").select("answer_notes").eq("id", leadId);
      expect(error).not.toBeNull();
    }
  });

  it("on the timeline reach the lead's setter, while other setters see the rest of it", async () => {
    const own = await people.a.client.from("lead_events").select("type").eq("lead_id", leadId);
    expect((own.data ?? []).map((row) => row.type)).toContain("note");
    const other = await people.b.client.from("lead_events").select("type").eq("lead_id", leadId);
    expect(other.error).toBeNull();
    expect((other.data ?? []).map((row) => row.type)).not.toContain("note");
    expect((other.data ?? []).length).toBeGreaterThan(0);
  });

  it("lead_notes is read only", async () => {
    const { error } = await people.a.client.from("lead_notes").update({ notes: "changed" }).eq("lead_id", leadId);
    expect(error).not.toBeNull();
    const { data } = await admin.from("leads").select("notes").eq("id", leadId).single();
    expect(data?.notes).toBe("Setter's own notes");
  });

  it("are written by the lead's own setter, never by another", async () => {
    const own = await people.a.client.from("leads").update({ answer_notes: { owns_home: "Both on title" } }).eq("id", leadId).select("id");
    expect(own.error).toBeNull();
    expect(own.data?.length).toBe(1);
    const other = await people.b.client.from("leads").update({ answer_notes: { owns_home: "nope" } }).eq("id", leadId).select("id");
    expect((other.data ?? []).length).toBe(0);
    const { data } = await admin.from("leads").select("answer_notes").eq("id", leadId).single();
    expect(data?.answer_notes).toEqual({ owns_home: "Both on title" });
  });
});

describe("A split soffit", () => {
  it("takes a second colour only beside a different first one, never Not sure, and always with a note", async () => {
    const noNote = await people.a.client.from("leads").update({ soffit_colour: "white", soffit_colour_2: "off_white", soffit_note: null }).eq("id", leadId);
    expect(noNote.error).not.toBeNull();
    const notSure = await people.a.client.from("leads").update({ soffit_colour: "not_sure", soffit_colour_2: "white", soffit_note: "x" }).eq("id", leadId);
    expect(notSure.error).not.toBeNull();
    const same = await people.a.client.from("leads").update({ soffit_colour: "white", soffit_colour_2: "white", soffit_note: "x" }).eq("id", leadId);
    expect(same.error).not.toBeNull();
    const good = await people.a.client
      .from("leads")
      .update({ soffit_colour: "white", soffit_colour_2: "off_white", soffit_note: "White at the front, cream at the back" })
      .eq("id", leadId)
      .select("soffit_colour, soffit_colour_2");
    expect(good.error).toBeNull();
    expect(good.data).toEqual([{ soffit_colour: "white", soffit_colour_2: "off_white" }]);
  });

  it("and the answers given together are stored as one", async () => {
    const { data, error } = await people.a.client
      .from("leads")
      .update({ christmas_lights_now: "hires_and_diy", looked_into_before: "quotes_and_thought", source: "phone_call" })
      .eq("id", leadId)
      .select("christmas_lights_now, looked_into_before, source");
    expect(error).toBeNull();
    expect(data).toEqual([{ christmas_lights_now: "hires_and_diy", looked_into_before: "quotes_and_thought", source: "phone_call" }]);
  });
});
