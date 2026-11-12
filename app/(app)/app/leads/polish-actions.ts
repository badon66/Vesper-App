"use server";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { NotOwnerError, ReadOnlyError, requireOwnerForAction } from "@/lib/auth/profile";
import { checkSuggestion, POLISH_MODEL, POLISH_NOTES_MAX, POLISH_SYSTEM, POLISH_WORDS, polishMessage, type PolishFacts } from "@/lib/quotes/polish";
import { createClient } from "@/lib/supabase/server";
import { VIEW_AS_READ_ONLY } from "@/lib/view-as";

// The Polish button on an offer's description (round 17, Keenan,
// 2026-11-12). Keenan's alone (refused under View as and for everyone
// else). It sends only his notes and the offer's own facts to Claude Haiku,
// from the server with ANTHROPIC_API_KEY; the customer's name, address and
// phone are never part of what this action receives. At most 100 a day
// (ai_polish_take counts and holds the cap in the database). It writes
// nothing to the quote: the suggestion goes back to the card, where he can
// use it, edit it or dismiss it.

export type PolishResult = { ok: true; suggestion: string; left: number } | { ok: false; message: string };

const factsSchema = z.object({
  name: z.string().max(60),
  areas: z
    .array(z.object({ name: z.string().max(60), feet: z.number().min(0).max(10_000), track: z.string().max(20).nullable() }))
    .max(30),
  totalFeet: z.number().min(0).max(100_000),
});
const inputSchema = z.object({ notes: z.string().max(POLISH_NOTES_MAX), facts: factsSchema });

export async function polishOfferDescription(input: { notes: string; facts: PolishFacts }): Promise<PolishResult> {
  try {
    await requireOwnerForAction();
  } catch (e) {
    if (e instanceof ReadOnlyError) return { ok: false, message: VIEW_AS_READ_ONLY };
    if (e instanceof NotOwnerError) return { ok: false, message: "Only Keenan polishes offer descriptions." };
    throw e;
  }
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return { ok: false, message: POLISH_WORDS.noKey };
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: POLISH_WORDS.failed };
  const notes = parsed.data.notes.trim();
  if (!notes) return { ok: false, message: POLISH_WORDS.noNotes };
  const facts = parsed.data.facts;

  // Count it first, under the database's lock: 100 a day, Calgary's day.
  const supabase = await createClient();
  const { data: taken, error: takeError } = await supabase.rpc("ai_polish_take");
  const take = (taken ?? {}) as { ok?: boolean; state?: string; used?: number; cap?: number };
  if (takeError) return { ok: false, message: POLISH_WORDS.failed };
  if (take.ok !== true) return { ok: false, message: take.state === "cap" ? POLISH_WORDS.cap : POLISH_WORDS.failed };
  const left = Math.max(0, (take.cap ?? 100) - (take.used ?? 0));

  const client = new Anthropic({ apiKey, timeout: 20_000, maxRetries: 1 });
  try {
    const response = await client.messages.create({
      model: POLISH_MODEL,
      max_tokens: 2000,
      // A short rewrite: little thinking needed, so it comes back quickly.
      output_config: { effort: "low" },
      system: POLISH_SYSTEM,
      messages: [{ role: "user", content: polishMessage(notes, facts) }],
    });
    if (response.stop_reason === "refusal") return { ok: false, message: POLISH_WORDS.refused };
    // Anything but a finished reply (cut off at max_tokens, say) is no
    // suggestion: a fragment is never shown.
    if (response.stop_reason !== "end_turn") return { ok: false, message: POLISH_WORDS.failed };
    const text = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join(" ")
      .trim();
    const checked = checkSuggestion(text, notes, facts);
    if (!checked.ok) return { ok: false, message: checked.reason === "invented" ? POLISH_WORDS.invented : POLISH_WORDS.failed };
    return { ok: true, suggestion: checked.text, left };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) {
      console.error("Polish: the AI key was refused");
      return { ok: false, message: "The AI key was refused. Check it in Vercel." };
    }
    if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.APIConnectionError || e instanceof Anthropic.InternalServerError) {
      return { ok: false, message: POLISH_WORDS.failed };
    }
    if (e instanceof Anthropic.APIError) {
      console.error(`Polish: API error ${e.status}`);
      return { ok: false, message: POLISH_WORDS.failed };
    }
    throw e;
  }
}
