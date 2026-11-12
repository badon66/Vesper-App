// The AI polish for an offer's description (round 17, Keenan, 2026-11-12),
// kept pure so it can be tested without the API.
//
// Keenan types or dictates rough notes on an offer card ("does the whole
// front, both gables, garage too, best value") and taps Polish. The server
// sends only those notes and the offer's own facts (its name, its areas
// with their feet and track type, the total feet) to Claude Haiku; never
// the customer's name, address or phone, which the polish never even
// receives. The answer comes back as a suggestion he can use, edit or
// dismiss; nothing saves on its own.
//
// Rules for the suggestion: one to three short, friendly sentences in
// Keenan's voice, Canadian spelling, no em dashes, and nothing invented: no
// prices, dates, warranty terms or promises he didn't write. The prompt asks
// for that, and checkSuggestion() enforces it after, so a suggestion that
// adds a number, a dollar sign, a date or a promise is never shown.

import { cleanFeet, runTrack, TRACK_NAMES, type QuoteRun } from "@/lib/pricing";
import { areaDisplayName } from "@/lib/quotes/areas";
import { cleanOfferName, type QuoteOffer } from "@/lib/quotes/offers";

export const POLISH_NOTES_MAX = 1000;
export const POLISH_DAILY_CAP = 100;
export const POLISH_MODEL = "claude-haiku-5-5";

// What a polish may know about an offer: nothing about the customer.
export type PolishFacts = {
  name: string;
  areas: { name: string; feet: number; track: string | null }[];
  totalFeet: number;
};

export function polishFacts(offer: Pick<QuoteOffer, "name" | "runs">, runs: readonly QuoteRun[]): PolishFacts {
  const areas = offer.runs.flatMap((at) => {
    const run = runs[at];
    const feet = run ? cleanFeet(run.feet) : 0;
    if (!run || feet <= 0) return [];
    const track = runTrack(run);
    return [{ name: areaDisplayName(run), feet, track: track === "hat" ? null : TRACK_NAMES[track] }];
  });
  const totalFeet = Math.round(areas.reduce((sum, area) => sum + area.feet, 0) * 10) / 10;
  return { name: cleanOfferName(offer.name), areas, totalFeet };
}

export const POLISH_SYSTEM = [
  "You polish short descriptions of lighting packages for Vesper Lighting, a Calgary company that installs permanent exterior roofline lights: a slim aluminum track under the edge of the roof with the lights built in, controlled from a phone.",
  "The owner, Keenan, writes rough notes about one package (an offer) on a homeowner's quote. Rewrite his notes as one to three short, friendly sentences in his voice, written to the homeowner.",
  "Rules:",
  "- Use only what the notes and the offer's facts say. Never add prices, dollar amounts, discounts, dates, timelines, warranty terms, guarantees or promises that are not in the notes.",
  "- You may name the areas and the feet listed in the facts, and nothing else about the house.",
  "- Canadian spelling: colour, neighbour, centre, favourite.",
  "- Plain words, calm and confident. No em dashes, no exclamation marks, no buzzwords, no emoji.",
  "- Speak to the homeowner as you and your house.",
  "- Reply with the description only: no quotation marks, no heading, no preamble.",
].join("\n");

// The one user message: the facts, then his notes.
export function polishMessage(notes: string, facts: PolishFacts): string {
  const areas = facts.areas.length
    ? facts.areas.map((area) => `${area.name}, ${area.feet} ft${area.track ? `, ${area.track}` : ""}`).join("; ")
    : "not measured yet";
  return [
    `Offer: ${facts.name}`,
    `Areas: ${areas}`,
    facts.totalFeet > 0 ? `Total: ${facts.totalFeet} ft of lights` : null,
    `Keenan's notes: ${notes.trim()}`,
  ]
    .filter(Boolean)
    .join("\n");
}

const CANADIAN: [RegExp, string][] = [
  [/\bcolor/gi, "colour"],
  [/\bneighbor/gi, "neighbour"],
  [/\bfavorite/gi, "favourite"],
  [/\bcenter(s?)\b/gi, "centre$1"],
  [/\bhonor/gi, "honour"],
  [/\bgray\b/gi, "grey"],
];

const keepCase = (from: string, to: string) => (from[0] === from[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to);

// Words that make a promise or a price; allowed only when Keenan wrote them.
const PROMISE_WORDS = /\b(warrant(?:y|ies|ied)|guarantee[ds]?|promis(?:e|es|ed)|lifetime|free|discounts?|deals?|savings?|sale|cheapest|lowest|financing)\b/gi;
const DATE_WORDS =
  /\b(january|february|march|april|may|june|july|august|september|october|november|december|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|tonight|weekend|christmas|spring|summer|fall|autumn|winter)\b/gi;

export type PolishCheck = { ok: true; text: string } | { ok: false; reason: "empty" | "invented" };

// The suggestion as shown, or why it isn't: tidied (quotes and headings
// off, dashes and exclamation marks out, Canadian spelling, at most three
// sentences, 400 characters), and refused when it adds a number, a dollar
// amount, a date or a promise that isn't in his notes or the facts.
export function checkSuggestion(raw: string, notes: string, facts: PolishFacts): PolishCheck {
  let text = raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(description|here(?:'|’)?s[^:]*):\s*/i, "")
    .replace(/^["“”'‘’]+|["“”'‘’]+$/g, "")
    .trim();
  text = text.replace(/\s*[—–]\s*/g, ", ").replace(/!/g, ".").replace(/\.{2,}/g, ".").replace(/,\s*,/g, ",");
  for (const [pattern, word] of CANADIAN) text = text.replace(pattern, (found) => keepCase(found, word));
  const sentences = text.match(/[^.?]+[.?]+|[^.?]+$/g)?.map((part) => part.trim()).filter(Boolean) ?? [];
  text = sentences.slice(0, 3).join(" ").slice(0, 400).trim();
  if (!text) return { ok: false, reason: "empty" };

  const allowed = `${notes} ${facts.name} ${facts.areas.map((area) => `${area.name} ${area.feet} ${area.track ?? ""}`).join(" ")} ${facts.totalFeet}`.toLowerCase();
  if (text.includes("$") && !allowed.includes("$")) return { ok: false, reason: "invented" };
  if (text.includes("%") && !allowed.includes("%")) return { ok: false, reason: "invented" };
  for (const number of text.match(/\d[\d,.]*/g) ?? []) {
    const bare = number.replace(/[,.]+$/, "").replace(/,/g, "");
    if (!allowed.replace(/,/g, "").includes(bare)) return { ok: false, reason: "invented" };
  }
  for (const pattern of [PROMISE_WORDS, DATE_WORDS]) {
    for (const word of text.match(pattern) ?? []) {
      if (!new RegExp(`\\b${word.toLowerCase()}`, "i").test(allowed)) return { ok: false, reason: "invented" };
    }
  }
  return { ok: true, text };
}

// What Keenan reads when a polish can't give him a suggestion.
export const POLISH_WORDS = {
  noKey: "Add the AI key to switch this on",
  noNotes: "Type a few words about this offer first.",
  cap: "That's 100 polishes today. It switches back on tomorrow.",
  invented: "The suggestion added something you didn't write, so it isn't shown. Polish again or write it yourself.",
  failed: "The polish didn't come back. Try again in a moment, or write it yourself.",
  refused: "No suggestion for these notes. Write it yourself, or try different words.",
} as const;
