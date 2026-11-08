import { z } from "zod";

import { DECK_PAGES, SLOT_BY_KEY, type DeckPageKey, type DeckSlot } from "@/lib/deck";
import { leadName } from "@/lib/leads/status";
import type { DeckPayload, MeetingPayload } from "@/lib/meeting/state";
import { REHEARSAL_PAGE } from "@/lib/offline";
import { addDays, calgaryDateOf, formatDay, formatTime } from "@/lib/time";

// The rehearsal view (round 7, the settled spec's rehearsal_and_references):
// Keenan walks through the deck as a customer would see it, with an example
// to copy in every empty slot. Owner only, opened only from Settings, and it
// writes nothing. These are its pure rules, unit tested; the page, its own
// server function (data.ts) and its client parts read them.
//
// NEVER IN A MEETING: the examples travel only in RehearsalData.examples,
// beside the meeting's payload, never inside it. MeetingPayload has no field
// that could hold one, and nothing under components/meeting, lib/meeting or
// app/(app)/meeting imports this folder.
//
// CONTRACT
//   REHEARSAL_WORDS                 the view's own words (Keenan's only)
//   requestedLead(param)            ?lead= as a lead id, or null
//   rehearsalHref(leadId)           the view's address for that lead
//   rehearsalChoices(rows, when)    "Rehearse with": upcoming meetings by evening
//   chosenLead(requested, groups)   the lead to rehearse with, only if offered
//   firstExamples(rows)             each slot's first example, links made safe
//   landingPage(keys, wanted)       the page to open on after a switch
//   exampleLayout(size)             how much an example's box can hold
//   scenarioLines(height)           how many lines of the scenario fit
//   exampleSide(slot)               which part of its box an example uses
//   looksLoaded(width, height)      whether a hotlinked image really loaded
//   RehearsalData                   what the view's server function hands the page

// ---------------------------------------------------------------- words

export const REHEARSAL_WORDS = {
  bar: "Rehearsal. Customers never see this view.",
  tag: "Example to copy",
  from: (site: string) => `From ${site}`,
  open: "Open the example",
  noLead: "No lead",
  noMeetings: "No lead (no upcoming meetings)",
  rehearseWith: "Rehearse with",
  customerView: "Customer view",
  done: "Done",
  opening: "Opening",
} as const;

// Where Done and the deck's exit go: the page where every word and photo
// the rehearsal shows is changed.
export const PRESENTATION_SETTINGS = "/app/admin/settings/presentation";

// ---------------------------------------------------------------- the lead

const LEAD_ID = z.uuid();

// ?lead= as the page receives it: one well-formed id, or null.
export function requestedLead(param: string | string[] | undefined): string | null {
  const value = Array.isArray(param) ? param[0] : param;
  return typeof value === "string" && LEAD_ID.safeParse(value).success ? value : null;
}

export function rehearsalHref(leadId: string | null): string {
  return leadId ? `${REHEARSAL_PAGE}?lead=${encodeURIComponent(leadId)}` : REHEARSAL_PAGE;
}

// ---------------------------------------------------------------- "Rehearse with"

// A meeting as the view's own query reads it: only what the picker shows.
export type UpcomingRow = {
  lead_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  lead:
    | { first_name: string; last_name: string | null; address_line: string | null; neighbourhood: string | null }
    | { first_name: string; last_name: string | null; address_line: string | null; neighbourhood: string | null }[]
    | null;
};

export type RehearsalChoice = { leadId: string; label: string };
export type RehearsalChoiceGroup = { label: string; options: RehearsalChoice[] };

// Only meetings still on: a booked or confirmed time that hasn't ended.
export const LIVE_STATUSES = ["booked", "confirmed"] as const;
const LIVE = new Set<string>(LIVE_STATUSES);

function dayLabel(day: string, today: string): string {
  if (day === today) return "Tonight";
  if (day === addDays(today, 1)) return "Tomorrow";
  return formatDay(day);
}

// The upcoming meetings, by evening ("Tonight", "Tomorrow", "Tue, Nov 10"),
// each "6:00 p.m. Jane Smith, Aspen Woods", in time order. A lead is offered
// once, at its first meeting.
export function rehearsalChoices(rows: UpcomingRow[], { today, now }: { today: string; now: number }): RehearsalChoiceGroup[] {
  const live = rows
    .filter((row) => LIVE.has(row.status) && Date.parse(row.ends_at) > now)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const seen = new Set<string>();
  const groups: RehearsalChoiceGroup[] = [];
  for (const row of live) {
    const lead = Array.isArray(row.lead) ? row.lead[0] : row.lead;
    if (!lead || seen.has(row.lead_id)) continue;
    seen.add(row.lead_id);
    const label = dayLabel(calgaryDateOf(row.starts_at), today);
    const place = lead.neighbourhood?.trim() || lead.address_line?.trim() || "";
    const name = leadName(lead).trim() || "No name";
    const option = { leadId: row.lead_id, label: `${formatTime(row.starts_at)} ${name}${place ? `, ${place}` : ""}` };
    const last = groups.at(-1);
    if (last && last.label === label) last.options.push(option);
    else groups.push({ label, options: [option] });
  }
  return groups;
}

// The lead asked for, only while it is one of the upcoming meetings offered;
// anything else rehearses with no lead.
export function chosenLead(requested: string | null, groups: RehearsalChoiceGroup[]): string | null {
  if (!requested) return null;
  return groups.some((group) => group.options.some((option) => option.leadId === requested)) ? requested : null;
}

// ---------------------------------------------------------------- the examples

// What an empty slot shows in the rehearsal: the first researched example
// for it, as links only (loaded in the browser from where it lives, with no
// referrer; never downloaded, proxied or stored).
export type RehearsalExample = {
  // The photo itself, when the site allows showing it (https only).
  imageUrl: string | null;
  // The page it lives on, for "Open the example".
  pageUrl: string | null;
  // "From [site]".
  site: string | null;
};
export type RehearsalExamples = Record<string, RehearsalExample>;

export type ReferenceLinkRow = {
  slot: string;
  rank: number;
  image_url: string | null;
  page_url: string | null;
  site: string | null;
};

// A link the view may load or open: a web address, never javascript: or
// data:. Pictures must be https, or the browser would block them on an
// https page.
export function safeLink(value: string | null | undefined, { picture = false } = {}): string | null {
  const text = value?.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol === "https:") return url.href;
    return url.protocol === "http:" && !picture ? url.href : null;
  } catch {
    return null;
  }
}

// Each slot's first example (the lowest rank), for the deck's slots only.
export function firstExamples(rows: ReferenceLinkRow[]): RehearsalExamples {
  const out: RehearsalExamples = {};
  const ranked = [...rows].sort((a, b) => a.rank - b.rank);
  for (const row of ranked) {
    if (!SLOT_BY_KEY.has(row.slot) || Object.hasOwn(out, row.slot)) continue;
    out[row.slot] = {
      imageUrl: safeLink(row.image_url, { picture: true }),
      pageUrl: safeLink(row.page_url),
      site: row.site?.trim() || null,
    };
  }
  return out;
}

// ---------------------------------------------------------------- what the page gets

// What the rehearsal's own server function (data.ts) hands its page. The
// examples sit beside the meeting's payload, never inside it.
export type RehearsalData = {
  // The deck: the lead's own (meeting.deck), or with no lead the deck alone.
  deck: DeckPayload;
  // The lead's whole meeting payload, exactly as meeting mode loads it;
  // null with no lead.
  meeting: MeetingPayload | null;
  // Each slot's first example to copy. Rehearsal only.
  examples: RehearsalExamples;
  // "Rehearse with": the upcoming meetings, by evening.
  choices: RehearsalChoiceGroup[];
  // The lead being rehearsed with, or null.
  leadId: string | null;
};

// ---------------------------------------------------------------- switching

// After the lead or the Customer view changes, the deck reopens on the page
// Keenan was on; when that page no longer shows (no lead skips the picker,
// mockup, colour and price), on the next page that does, else the last.
export function landingPage(keys: DeckPageKey[], wanted: DeckPageKey | null): DeckPageKey | null {
  if (keys.length === 0) return null;
  if (!wanted || keys.includes(wanted)) return wanted ?? keys[0];
  const order = DECK_PAGES.indexOf(wanted);
  return keys.find((key) => DECK_PAGES.indexOf(key) > order) ?? keys[keys.length - 1];
}

// ---------------------------------------------------------------- an example's box

// What a box can hold, measured in CSS px: "full" (tags, the slot's name,
// its scenario and "Open the example": a band page's photo, a split page's
// left side, a More's picture, even half of the warm and cool pair, which is
// narrow but tall), "compact" (tags and the name: a contact-sheet tile) or
// "tiny" (the tag and the name). Unmeasured, it shows the least.
export type ExampleLayout = "tiny" | "compact" | "full";

export function exampleLayout(size: { width: number; height: number } | null): ExampleLayout {
  if (!size || size.width < 260 || size.height < 180) return "tiny";
  if ((size.width >= 480 && size.height >= 340) || (size.width >= 300 && size.height >= 480)) return "full";
  return "compact";
}

// A full box under 480 px wide gets the narrower side margins.
export const NARROW_PX = 480;

// The scenario reads at 20 px on 27 px lines, under the tags (96 px) and the
// name, above "Open the example": as many whole lines as the box's height
// leaves, at most 12, never a line cut through.
export const SCENARIO_LINE_PX = 27;
const SCENARIO_RESERVED_PX = 300;
const SCENARIO_MAX_LINES = 12;

export function scenarioLines(height: number): number {
  if (!Number.isFinite(height)) return 0;
  const lines = Math.floor((height - SCENARIO_RESERVED_PX) / SCENARIO_LINE_PX);
  return Math.min(SCENARIO_MAX_LINES, Math.max(0, lines));
}

// On Hidden by day the night picture shows left of the line and the day
// picture right of it (the line starts in the middle), so each of those
// examples keeps its tags and words on the half that shows. Every other
// example has its box to itself.
export type ExampleSide = "whole" | "left" | "right";

export function exampleSide(slot: Pick<DeckSlot, "role">): ExampleSide {
  if (slot.role === "day") return "right";
  if (slot.role === "night") return "left";
  return "whole";
}

// Some sites answer a hotlinked picture with a tiny placeholder instead of
// an error: anything under 48 px either way counts as not loaded.
export function looksLoaded(naturalWidth: number, naturalHeight: number): boolean {
  return naturalWidth >= 48 && naturalHeight >= 48;
}
