"use server";

import { revalidatePath } from "next/cache";
import { NotAllowedError, ReadOnlyError, requireSalesSideForAction } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { VIEW_AS_READ_ONLY } from "@/lib/view-as";

export type FinishWelcomeResult = { ok: true } | { ok: false; message: string };

// Finishing or skipping the welcome (Keenan, 2026-11-03) stamps the
// setter's own row, once; Home stops showing it. Refused while Keenan is
// viewing as someone.
export async function finishWelcome(): Promise<FinishWelcomeResult> {
  let me;
  try {
    me = await requireSalesSideForAction();
  } catch (e) {
    if (e instanceof ReadOnlyError) return { ok: false, message: VIEW_AS_READ_ONLY };
    if (e instanceof NotAllowedError) return { ok: false, message: "Not for your role." };
    throw e;
  }
  if (me.role !== "sales") return { ok: false, message: "The welcome is for sales associates." };
  const { error } = await (await createClient()).rpc("finish_welcome");
  if (error) return { ok: false, message: "That didn't save. Check your signal and try again." };
  revalidatePath("/app");
  return { ok: true };
}
