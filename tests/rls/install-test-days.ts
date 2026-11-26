import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Round 23: install days for tests. The database only lets a lead hold a
// day Keenan opened, so tests open their own: a run of days years ahead
// (2031 to 2039, nowhere near his real calendar), each untouched until now,
// opened with room for every test that uses it, and removed at the end.

type Client = SupabaseClient<Database>;

const FIRST = Date.UTC(2031, 0, 1);
const SPAN_DAYS = 9 * 365;
const dayAt = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export async function openTestDays(admin: Client, count: number, jobLimit = 20): Promise<string[]> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const start = FIRST + Math.floor(Math.random() * (SPAN_DAYS - count)) * 86_400_000;
    const days = Array.from({ length: count }, (_, at) => dayAt(start + at * 86_400_000));
    const { data: taken } = await admin.from("install_days").select("day").in("day", days);
    if ((taken ?? []).length > 0) continue;
    const { count: held } = await admin.from("leads").select("id", { count: "exact", head: true }).in("install_on", days);
    if ((held ?? 0) > 0) continue;
    const { error } = await admin.from("install_days").insert(days.map((day) => ({ day, open: true, job_limit: jobLimit })));
    if (error) throw new Error(`test install days: ${error.message}`);
    return days;
  }
  throw new Error("could not find free test install days");
}

// Takes the test days off: the leads that hold them first (they're test
// leads, removed by each test's own cleanup), then the days.
export async function closeTestDays(admin: Client, days: string[]): Promise<void> {
  if (days.length === 0) return;
  await admin.from("leads").update({ install_on: null }).in("install_on", days).like("first_name", "TEST LEAD%");
  await admin.from("install_days").delete().in("day", days);
}
