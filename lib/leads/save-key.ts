import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/database";

// A new lead saves once (Keenan, 2026-11-04). The phone makes a save key for
// a new person the first time it saves them, on the booking sheet and on New
// lead, and sends the same key with every try. The unique index on
// leads.save_key lets only one lead have it, so a try after a lost answer
// gets back the lead the first try made instead of making a copy. No
// server-only imports, so the database tests can drive it with a setter's
// own session; the save actions are its only callers in the app.

type Client = SupabaseClient<Database>;
type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];

export const NOT_SAVED = "The lead could not be saved. Check your signal and try again.";

const keySchema = z.uuid();

// The key a save sent: none (yesterday's app, or a path without one), a key,
// or something that isn't one.
export function readSaveKey(value: unknown): { ok: true; key: string | null } | { ok: false } {
  if (value === undefined || value === null || value === "") return { ok: true, key: null };
  const parsed = keySchema.safeParse(value);
  return parsed.success ? { ok: true, key: parsed.data } : { ok: false };
}

export type FirstSave = { ok: true; leadId: string; again: boolean } | { ok: false; error: string };

// Inserts a new lead under its save key, or finds the lead an earlier try of
// the same save already made. `again` says which: the caller then brings
// that lead up to date with what this try sent, as any later save would.
export async function insertLeadOnce(
  supabase: Client,
  by: string,
  key: string | null,
  row: LeadInsert,
): Promise<FirstSave> {
  if (key) {
    const earlier = await madeUnder(supabase, by, key);
    if (earlier) return earlier;
  }
  const { data, error } = await supabase.from("leads").insert({ ...row, save_key: key }).select("id").single();
  if (data) return { ok: true, leadId: data.id, again: false };
  // Two tries at the same instant: the index let the other one in first.
  if (key && error?.code === "23505") {
    const earlier = await madeUnder(supabase, by, key);
    if (earlier) return earlier;
  }
  return { ok: false, error: NOT_SAVED };
}

// The lead saved under a key, if any. Only the person who made it gets it
// back; a key on someone else's lead can only have been copied on purpose.
async function madeUnder(supabase: Client, by: string, key: string): Promise<FirstSave | null> {
  const { data, error } = await supabase.from("leads").select("id, created_by").eq("save_key", key).maybeSingle();
  if (error) return { ok: false, error: NOT_SAVED };
  if (!data) return null;
  if (data.created_by !== by) return { ok: false, error: NOT_SAVED };
  return { ok: true, leadId: data.id, again: true };
}
