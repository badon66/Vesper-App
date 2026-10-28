"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  NotAllowedError,
  ReadOnlyError,
  requireSalesSideForAction,
  type SessionProfile,
} from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";
import { VIEW_AS_READ_ONLY } from "@/lib/view-as";

export type KnockState = { ok?: boolean; error?: string };
export type KnockBumpResult =
  | { ok: true; doors: number; conversations: number }
  | { ok: false; error: string; fatal: boolean };

// Who is acting, or the message to show instead.
async function salesSide(): Promise<SessionProfile | string> {
  try {
    return await requireSalesSideForAction();
  } catch (e) {
    if (e instanceof ReadOnlyError) return VIEW_AS_READ_ONLY;
    if (e instanceof NotAllowedError) return "Not for your role.";
    throw e;
  }
}

const neighbourhoodSchema = z
  .string()
  .trim()
  .min(1, { error: "Enter the neighbourhood." })
  .max(80, { error: "That neighbourhood name is too long." });

export async function startKnockSession(
  _previous: KnockState,
  formData: FormData,
): Promise<KnockState> {
  const me = await salesSide();
  if (typeof me === "string") return { error: me };
  const parsed = neighbourhoodSchema.safeParse(formData.get("neighbourhood") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter the neighbourhood." };

  const supabase = await createClient();
  await supabase.rpc("close_my_stale_knock_sessions");
  const { error } = await supabase
    .from("knock_sessions")
    .insert({ neighbourhood: parsed.data, user_id: me.id });
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "You already have a session running. End it first."
          : "The session could not start. Check your signal and try again.",
    };
  }
  revalidatePath("/app");
  return { ok: true };
}

const bumpSchema = z.object({
  session: z.uuid(),
  doors: z.number().int().min(-100).max(100),
  conversations: z.number().int().min(-100).max(100),
});

// Adds taps to the counters in one atomic database call. Fast taps are
// batched by the page and never lost.
export async function bumpKnockSession(
  sessionId: string,
  doors: number,
  conversations: number,
): Promise<KnockBumpResult> {
  const me = await salesSide();
  if (typeof me === "string") return { ok: false, error: me, fatal: true };
  const parsed = bumpSchema.safeParse({ session: sessionId, doors, conversations });
  if (!parsed.success) return { ok: false, error: "That tap could not be counted.", fatal: true };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("bump_knock_session", {
    p_session: parsed.data.session,
    p_doors: parsed.data.doors,
    p_conversations: parsed.data.conversations,
  });
  if (error) return { ok: false, error: "Not saved yet. Retrying.", fatal: false };
  const row = data?.[0];
  if (!row) {
    return { ok: false, error: "This session has ended. Reload the page to start a new one.", fatal: true };
  }
  return { ok: true, doors: row.doors_knocked, conversations: row.conversations };
}

export async function endKnockSession(
  _previous: KnockState,
  formData: FormData,
): Promise<KnockState> {
  const me = await salesSide();
  if (typeof me === "string") return { error: me };
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { error: "That session was not found." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("knock_sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", id.data)
    .eq("user_id", me.id)
    .is("ended_at", null);
  if (error) return { error: "The session could not end. Try again." };
  revalidatePath("/app");
  return { ok: true };
}
