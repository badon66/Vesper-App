import { DECK_PAGES, type DeckPageKey } from "@/lib/deck";

// Keenan's talking points (round 10, 2026-11-10): a private note per deck
// page, written in Settings > Presentation and kept in settings.deck.talking
// as { page key: text }. Meeting mode shows one only while he presses and
// holds the small mark in a page's corner (components/meeting/talking-points.tsx);
// it is never on screen otherwise. Pure, so it is unit tested.

// The most one page's talking points may hold.
export const TALKING_MAX = 1000;

export type TalkingPoints = Partial<Record<DeckPageKey, string>>;

// The pages Settings asks him to write for, in the deck's order, with the
// deck's own page names. The light picker left the meeting on 2026-11-11:
// a light_picker entry already saved still parses, and a Settings save
// keeps it as it is (deckWithTalking), but Settings no longer asks for one.
export const TALKING_PAGES: readonly { key: DeckPageKey; name: string }[] = [
  { key: "cover", name: "Cover" },
  { key: "what_vesper_is", name: "Up once, there all year" },
  { key: "hidden_by_day", name: "Hidden by day" },
  { key: "phone_control", name: "Run it from your phone" },
  { key: "warranty", name: "Our 10-year warranty" },
  { key: "quote", name: "Your price" },
  { key: "next_steps", name: "What happens next" },
];

const PAGE_KEYS = new Set<string>(DECK_PAGES);

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

// One page's text made safe: trimmed, and cut to TALKING_MAX characters
// (the Settings save refuses anything longer, so a cut only ever meets a
// hand-edited row). Empty reads as nothing.
export function cleanTalking(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().slice(0, TALKING_MAX).trim();
  return text ? text : null;
}

// settings.deck.talking as stored, made safe: only the deck's own page keys,
// only non-empty strings. Anything else (a missing deck, a deck without
// talking points, unknown keys, numbers) reads as no talking points.
export function parseTalkingPoints(deck: unknown): TalkingPoints {
  const talking = record(record(deck)?.talking);
  const out: TalkingPoints = {};
  if (!talking) return out;
  for (const [key, value] of Object.entries(talking)) {
    if (!PAGE_KEYS.has(key)) continue;
    const text = cleanTalking(value);
    if (text) out[key as DeckPageKey] = text;
  }
  return out;
}

// ---------------------------------------------------------------- Settings

const TALKING_KEYS = new Set<string>(TALKING_PAGES.map((page) => page.key));

export const talkingLength = (text: string) => Array.from(text.trim()).length;

// What Settings says under a box that is too long; null when it is fine.
export function talkingIssue(text: string): string | null {
  const n = talkingLength(text);
  return n > TALKING_MAX ? `${n} of ${TALKING_MAX} characters. Cut ${n - TALKING_MAX} to save.` : null;
}

// Same talking points, for the editor's unsaved-changes check.
export function sameTalking(a: TalkingPoints, b: TalkingPoints): boolean {
  return TALKING_PAGES.every(({ key }) => (a[key] ?? "").trim() === (b[key] ?? "").trim());
}

export type TalkingInput = { ok: true; talking: TalkingPoints } | { ok: false; error: string; errors: Partial<Record<DeckPageKey, string>> };

// The Settings save's own check (never trusts the browser): an object of the
// pages Settings shows, each a string of at most TALKING_MAX characters once
// trimmed. Empty boxes are dropped. Unknown keys are refused, not dropped,
// since only this editor sends it.
export function parseTalkingInput(input: unknown): TalkingInput {
  const raw = record(input);
  if (!raw) return { ok: false, error: "The talking points could not be read. Reload and try again.", errors: {} };
  const errors: Partial<Record<DeckPageKey, string>> = {};
  const talking: TalkingPoints = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!TALKING_KEYS.has(key)) return { ok: false, error: "The talking points could not be read. Reload and try again.", errors: {} };
    if (value === null || value === undefined) continue;
    if (typeof value !== "string") return { ok: false, error: "The talking points could not be read. Reload and try again.", errors: {} };
    const issue = talkingIssue(value);
    if (issue) {
      errors[key as DeckPageKey] = issue;
      continue;
    }
    const text = value.trim();
    if (text) talking[key as DeckPageKey] = text;
  }
  if (Object.keys(errors).length > 0) return { ok: false, error: "Some talking points are too long. They're marked below.", errors };
  return { ok: true, talking };
}

// settings.deck with its talking points replaced, keeping everything else
// stored as it is. Pages Settings doesn't show keep what they had.
export function deckWithTalking(deck: unknown, talking: TalkingPoints): Record<string, unknown> {
  const before = record(deck) ?? {};
  const kept: Record<string, string> = {};
  for (const [key, value] of Object.entries(record(before.talking) ?? {})) {
    if (!TALKING_KEYS.has(key) && typeof value === "string") kept[key] = value;
  }
  const next: Record<string, string> = { ...kept };
  for (const { key } of TALKING_PAGES) {
    const text = talking[key]?.trim();
    if (text) next[key] = text;
  }
  return { ...before, talking: next };
}
