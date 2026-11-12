// Quoting by area (round 11, Keenan, 2026-11-11). Keenan doesn't quote run
// by run: he measures the areas of the house on two views, front and back,
// with gables as something he can include or leave out, and the sides as
// one number each for both sides together. Each area is still stored as a
// run in quotes.runs, so every quote made before this round keeps its
// exact prices and still opens: an old run is tagged on the way in by what
// its name and part make obvious (garage and porch are the front; "back"
// and "rear" the back; "side" the sides) and the rest stay as Other.
//
// A run carries, beside its name, feet, level and part:
//   area   "front" | "back" | "sides" | "other": which view it is on
//   gable  true for a gable, which an offer can tick on or off
//   rate   Keenan's own price a foot for that area, or null for the quote's
//   flat   a flat price for that area instead of a price a foot, or null
// An area with no feet isn't on the house: it is never stored.

import { cleanFeet, guessRunPart, type QuoteRun } from "@/lib/pricing";

export const AREA_KINDS = ["front", "back", "sides", "other"] as const;
export type AreaKind = (typeof AREA_KINDS)[number];

// The standard areas, in the order the editor shows them.
export const AREA_KEYS = [
  "front_lower",
  "front_lower_gable",
  "front_upper",
  "front_upper_gable",
  "back_lower",
  "back_lower_gable",
  "back_upper",
  "back_upper_gable",
  "sides_lower",
  "sides_upper",
] as const;
export type AreaKey = (typeof AREA_KEYS)[number];

export const AREA_LABELS: Record<AreaKey, string> = {
  front_lower: "Front lower",
  front_lower_gable: "Front lower gable",
  front_upper: "Front upper",
  front_upper_gable: "Front upper gable",
  back_lower: "Back lower",
  back_lower_gable: "Back lower gable",
  back_upper: "Back upper",
  back_upper_gable: "Back upper gable",
  sides_lower: "Sides lower",
  sides_upper: "Sides upper",
};

// The three views and what each holds.
export const AREA_VIEWS: readonly { kind: Exclude<AreaKind, "other">; title: string; keys: readonly AreaKey[] }[] = [
  { kind: "front", title: "Front", keys: ["front_lower", "front_lower_gable", "front_upper", "front_upper_gable"] },
  { kind: "back", title: "Back", keys: ["back_lower", "back_lower_gable", "back_upper", "back_upper_gable"] },
  { kind: "sides", title: "Sides", keys: ["sides_lower", "sides_upper"] },
];

// A run's own price a foot when Keenan set one (more than 0), else null.
export function runRate(run: Pick<QuoteRun, "rate">): number | null {
  const rate = run.rate;
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? rate : null;
}

// A run's flat price when Keenan set one (0 or more), else null.
export function runFlat(run: Pick<QuoteRun, "flat">): number | null {
  const flat = run.flat;
  return typeof flat === "number" && Number.isFinite(flat) && flat >= 0 ? flat : null;
}

// Whether a run is a gable: tagged so, or (a run from before this round)
// its part says so, or its name does when it has no part.
export function isGable(run: Pick<QuoteRun, "name" | "part" | "gable">): boolean {
  if (typeof run.gable === "boolean") return run.gable;
  return (run.part ?? guessRunPart(run.name)) === "gable";
}

// The view a run is on: its tag, else what its part and name make obvious.
export function areaOf(run: Pick<QuoteRun, "name" | "part" | "area">): AreaKind {
  if (run.area && (AREA_KINDS as readonly string[]).includes(run.area)) return run.area;
  const part = run.part ?? guessRunPart(run.name);
  if (part === "garage" || part === "porch") return "front";
  if (part === "sides") return "sides";
  const name = run.name.toLowerCase();
  if (/\b(back|rear)\b/.test(name)) return "back";
  if (/\bsides?\b/.test(name)) return "sides";
  if (/\bfront\b/.test(name)) return "front";
  return "other";
}

// The standard area a run stands on, or null for Other.
export function areaKeyOf(run: Pick<QuoteRun, "name" | "part" | "area" | "gable" | "level">): AreaKey | null {
  const kind = areaOf(run);
  if (kind === "other") return null;
  if (kind === "sides") return run.level === "upper" ? "sides_upper" : "sides_lower";
  const gable = isGable(run) ? "_gable" : "";
  return `${kind}_${run.level}${gable}` as AreaKey;
}

const STANDARD_NAMES: Record<AreaKey, string> = {
  front_lower: "Front",
  front_lower_gable: "Front gable",
  front_upper: "Front",
  front_upper_gable: "Front gable",
  back_lower: "Back",
  back_lower_gable: "Back gable",
  back_upper: "Back",
  back_upper_gable: "Back gable",
  sides_lower: "Sides",
  sides_upper: "Sides",
};

// A new run for a standard area, with these feet. Its name is what the
// customer reads in "what it covers" (the level comes from the level, so
// the name never says lower or upper, and never "level").
export function newAreaRun(key: AreaKey, feet: number): QuoteRun {
  const kind = key.startsWith("front") ? "front" : key.startsWith("back") ? "back" : "sides";
  const gable = key.endsWith("_gable");
  return {
    name: STANDARD_NAMES[key],
    feet: cleanFeet(feet),
    level: key.includes("_upper") ? "upper" : "lower",
    part: gable ? "gable" : kind === "sides" ? "sides" : "eave",
    area: kind,
    gable,
    rate: null,
    flat: null,
  };
}

// A new Other run: a shed, a detached garage, anything off the two views.
export function newOtherRun(name: string, feet: number, level: "lower" | "upper"): QuoteRun {
  return { name: name.trim().slice(0, 60), feet: cleanFeet(feet), level, part: "other", area: "other", gable: false, rate: null, flat: null };
}

// The run's name for the editor: its standard label, with the run's own
// name after it when an old run was mapped onto an area ("Front lower:
// Garage"), or the name alone for Other.
export function areaDisplayName(run: QuoteRun): string {
  const key = areaKeyOf(run);
  if (!key) return run.name.trim() || "Other";
  const name = run.name.trim();
  return name && name.toLowerCase() !== STANDARD_NAMES[key].toLowerCase() ? `${AREA_LABELS[key]}: ${name}` : AREA_LABELS[key];
}

// An area's name on the customer's link (round 17): an area measured on the
// drawing under its standard name reads as the editor labels it ("Front
// lower", "Front upper gable"), so the front's two storeys never both read
// "Front"; a name Keenan gave it ("Garage", "Shed"), or any run from an
// older quote, reads as he typed it.
export function customerAreaName(run: QuoteRun): string {
  const name = run.name.trim();
  if (!run.area) return name;
  const key = areaKeyOf(run);
  if (!key) return name;
  return name === "" || name.toLowerCase() === STANDARD_NAMES[key].toLowerCase() ? AREA_LABELS[key] : name;
}

// The runs on a standard area (several, when an old quote had two runs on
// it, say Front and Garage), by position.
export function runsOnArea(runs: readonly QuoteRun[], key: AreaKey): number[] {
  return runs.flatMap((run, at) => (areaKeyOf(run) === key ? [at] : []));
}

// The positions of the Other runs.
export function otherRuns(runs: readonly QuoteRun[]): number[] {
  return runs.flatMap((run, at) => (areaKeyOf(run) === null ? [at] : []));
}

// Whether the house has any measured run on a view, at a level.
export function hasArea(runs: readonly QuoteRun[], kind: AreaKind, level?: "lower" | "upper"): boolean {
  return runs.some((run) => cleanFeet(run.feet) > 0 && areaOf(run) === kind && (level === undefined || run.level === level));
}

// A run tagged for the editor: an old run gets its area and gable from what
// is obvious, so the views can place it; nothing else about it changes.
export function tagRun(run: QuoteRun): QuoteRun {
  return { ...run, area: areaOf(run), gable: isGable(run), rate: runRate(run), flat: runFlat(run) };
}
