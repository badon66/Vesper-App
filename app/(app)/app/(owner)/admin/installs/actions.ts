"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NotOwnerError, ReadOnlyError, requireOwnerForAction } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { calgaryToday } from "@/lib/time";
import { VIEW_AS_READ_ONLY } from "@/lib/view-as";

// Round 23 (Keenan, 2026-11-17): Keenan opens and closes install days and
// sets how many jobs a day takes. Owner only; the database refuses anyone
// else, refuses a number below what's booked on the day, and never moves
// a booked job when a day closes.

export type InstallDayResult = { ok: true } | { ok: false; message: string };

async function refusal(): Promise<string | null> {
  try {
    await requireOwnerForAction();
    return null;
  } catch (e) {
    if (e instanceof ReadOnlyError) return VIEW_AS_READ_ONLY;
    if (e instanceof NotOwnerError) return "Not for your role.";
    throw e;
  }
}

const schema = z.object({
  day: z.iso.date(),
  open: z.boolean(),
  // The day's own number of jobs; null: the number in Settings.
  limit: z.number().int().min(1).max(20).nullable(),
});

export async function saveInstallDay(input: z.input<typeof schema>): Promise<InstallDayResult> {
  const refused = await refusal();
  if (refused) return { ok: false, message: refused };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "That day didn't look right. Refresh and try again." };
  const { day, open, limit } = parsed.data;
  if (day < calgaryToday()) return { ok: false, message: "That day has passed." };

  const supabase = await createClient();
  const { error } = await supabase.from("install_days").upsert({ day, open, job_limit: limit }, { onConflict: "day" });
  if (error) {
    if (error.hint === "below_booked") {
      return { ok: false, message: "More jobs are booked on this day than that. Move one to another day first, or keep the number as it is." };
    }
    return { ok: false, message: "That didn't save. Check your signal and try again." };
  }
  revalidatePath("/app/admin/installs");
  return { ok: true };
}
