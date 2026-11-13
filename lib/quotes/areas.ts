// Quoting by area (round 11, Keenan, 2026-11-11; round 18). Keenan doesn't quote run
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

// Round 18 (Keenan, 2026-11-12): four views, Front, Back, Left side and
// Right side, each with Lower, Upper, Lower gable and Upper gable. "sides"
// is an old quote's one Sides number, kept as it is until Keenan splits it
// into Left side and Right side.
export const AREA_KINDS = ["front", "back", "left", "right", "sides", "other"] as const;
export type AreaKind = (typeof AREA_KINDS)[number];
export type ViewKind = "front" | "back" | "left" | "right";

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
  "left_lower",
  "left_lower_gable",
  "left_upper",
  "left_upper_gable",
  "right_lower",
  "right_lower_gable",
  "right_upper",
  "right_upper_gable",
  "sides_lower",
  "sides_upper",
] as const;
export type AreaKey = (typeof AREA_KEYS)[number];

// Each view's own name until Keenan renames it on a quote.
export const VIEW_TITLES: Record<Exclude<AreaKind, "other">, string> = {
  front: "Front",
  back: "Back",
  left: "Left side",
  right: "Right side",
  sides: "Sides",
};

const keysOf = (kind: ViewKind): AreaKey[] => [`${kind}_lower`, `${kind}_lower_gable`, `${kind}_upper`, `${kind}_upper_gable`] as AreaKey[];

// The four views and what each holds, then an old quote's Sides.
export const AREA_VIEWS: readonly { kind: ViewKind; title: string; keys: readonly AreaKey[] }[] = (["front", "back", "left", "right"] as const).map((kind) => ({
  kind,
  title: VIEW_TITLES[kind],
  keys: keysOf(kind),
}));
export const SIDES_VIEW = { kind: "sides" as const, title: VIEW_TITLES.sides, keys: ["sides_lower", "sides_upper"] as readonly AreaKey[] };

// The view an area key is on.
export function kindOfKey(key: AreaKey): Exclude<AreaKind, "other"> {
  return key.slice(0, key.indexOf("_")) as Exclude<AreaKind, "other">;
}

// A line's own label inside its view: "Lower", "Upper gable", and with more
// than one gable on the line "Upper gables (2)". An old quote's Sides lines
// are "Lower" and "Upper" under Sides.
export function lineLabel(key: AreaKey, count = 1): string {
  const rest = key.slice(key.indexOf("_") + 1);
  const level = rest.startsWith("upper") ? "Upper" : "Lower";
  if (!rest.endsWith("gable")) return level;
  return count > 1 ? `${level} gables (${count})` : `${level} gable`;
}

// "Front lower", "Left side upper gable", "Sides" for an old Sides lower
// line: an area's standard name with its view's default name.
export const AREA_LABELS: Record<AreaKey, string> = Object.fromEntries(
  AREA_KEYS.map((key) => [key, defaultLineName(key, VIEW_TITLES[kindOfKey(key)])]),
) as Record<AreaKey, string>;

function defaultLineName(key: AreaKey, view: string, count = 1): string {
  if (key === "sides_lower") return view;
  const short = lineLabel(key, count);
  return `${view} ${short.charAt(0).toLowerCase()}${short.slice(1)}`;
}

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
  const name = run.name.toLowerCase();
  if (/\bleft\b/.test(name)) return "left";
  if (/\bright\b/.test(name)) return "right";
  if (part === "sides") return "sides";
  if (/\b(back|rear)\b/.test(name)) return "back";
  if (/\bsides?\b/.test(name)) return "sides";
  if (/\bfront\b/.test(name)) return "front";
  return "other";
}

// The standard area a run stands on, or null for Other. An old Sides run
// keeps its two lines (lower and upper), gable or not.
export function areaKeyOf(run: Pick<QuoteRun, "name" | "part" | "area" | "gable" | "level">): AreaKey | null {
  const kind = areaOf(run);
  if (kind === "other") return null;
  if (kind === "sides") return run.level === "upper" ? "sides_upper" : "sides_lower";
  const gable = isGable(run) ? "_gable" : "";
  return `${kind}_${run.level}${gable}` as AreaKey;
}

// The name a run on a standard area is saved under until Keenan renames
// its line: the view and whether it is a gable, never the level (the level
// comes from the level, and never reads "level").
const STANDARD_NAMES: Record<AreaKey, string> = Object.fromEntries(
  AREA_KEYS.map((key) => [key, `${VIEW_TITLES[kindOfKey(key)]}${key.endsWith("_gable") ? " gable" : ""}`]),
) as Record<AreaKey, string>;

export function standardName(key: AreaKey): string {
  return STANDARD_NAMES[key];
}

const NAME_MAX = 60;
const VIEW_NAME_MAX = 40;
export const GABLE_COUNT_MAX = 20;

// How many gables a line holds: a whole number from 1 to 20 on a gable line,
// else 1.
export function gableCount(run: Pick<QuoteRun, "count" | "name" | "part" | "gable">): number {
  if (!isGable(run)) return 1;
  const n = run.count;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 ? Math.min(GABLE_COUNT_MAX, n) : 1;
}

// A count as saved: 2 to 20 on a gable line, nothing for one.
export function cleanGableCount(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 2 ? Math.min(GABLE_COUNT_MAX, value) : null;
}

// A view's name as saved: trimmed, one line, up to 40 characters; empty, or
// the view's own name, is no rename.
export function cleanViewName(value: unknown, kind: Exclude<AreaKind, "other">): string | null {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, VIEW_NAME_MAX) : "";
  return text === "" || text.toLowerCase() === VIEW_TITLES[kind].toLowerCase() ? null : text;
}

// Whether Keenan has renamed this run's line: a name that isn't its area's
// standard name. A run from before round 11 (no area tag) reads as typed.
export function lineRenamed(run: QuoteRun): boolean {
  const key = areaKeyOf(run);
  if (!key) return false;
  const name = run.name.trim();
  return name !== "" && name.toLowerCase() !== STANDARD_NAMES[key].toLowerCase();
}

// The name a view goes by on this quote: Keenan's ("Street side") when he
// renamed it on any of its runs, else its own ("Front").
export function viewName(runs: readonly QuoteRun[], kind: Exclude<AreaKind, "other">): string {
  for (const run of runs) {
    if (areaOf(run) !== kind) continue;
    const name = cleanViewName(run.view, kind);
    if (name) return name;
  }
  return VIEW_TITLES[kind];
}

// A run's line as the editor shows it inside its view: "Upper gables (2)",
// or Keenan's own name for it ("Garage peak", "Garage peak (2)").
export function runLineLabel(run: QuoteRun): string {
  const key = areaKeyOf(run);
  if (!key) return run.name.trim() || "Other";
  const count = gableCount(run);
  if (lineRenamed(run)) return count > 1 ? `${run.name.trim()} (${count})` : run.name.trim();
  return lineLabel(key, count);
}

// A run's name wherever it is read on its own (round 18): the breakdown,
// Build your own, the link, the signed copy, the offer's chips. A line under
// its standard name reads with its view ("Front lower", "Street side upper
// gables (2)"); a line Keenan renamed reads as he named it ("Garage peak");
// a run from an older quote with no area tag reads exactly as typed.
export function runDisplayName(run: QuoteRun): string {
  const name = run.name.trim();
  if (!run.area) return name;
  const key = areaKeyOf(run);
  if (!key) return name || "Other";
  const count = gableCount(run);
  if (lineRenamed(run)) return count > 1 ? `${name} (${count})` : name;
  const kind = kindOfKey(key);
  return defaultLineName(key, cleanViewName(run.view, kind) ?? VIEW_TITLES[kind], count);
}

// Round 17's names: the editor and the link read every run the same way.
export const areaDisplayName = runDisplayName;
export const customerAreaName = runDisplayName;

// A new run for a standard area, with these feet, under its standard name
// and in the view's name on this quote when Keenan renamed it.
export function newAreaRun(key: AreaKey, feet: number, view: string | null = null): QuoteRun {
  const kind = kindOfKey(key);
  const gable = key.endsWith("_gable");
  const renamed = kind === "sides" ? null : cleanViewName(view, kind);
  return {
    name: STANDARD_NAMES[key],
    feet: cleanFeet(feet),
    level: key.includes("_upper") ? "upper" : "lower",
    part: gable ? "gable" : kind === "sides" ? "sides" : "eave",
    area: kind,
    gable,
    rate: null,
    flat: null,
    ...(renamed ? { view: renamed } : {}),
  };
}

// A new Other run: a shed, a detached garage, anything off the views.
export function newOtherRun(name: string, feet: number, level: "lower" | "upper"): QuoteRun {
  return { name: name.trim().slice(0, NAME_MAX), feet: cleanFeet(feet), level, part: "other", area: "other", gable: false, rate: null, flat: null };
}

// Keenan names a line ("Garage peak"); empty puts its standard name back.
export function renameRun(run: QuoteRun, name: string): QuoteRun {
  const key = areaKeyOf(run);
  const text = name.replace(/\s+/g, " ").replace(/\$/g, "").trim().slice(0, NAME_MAX);
  if (!key) return { ...run, name: text };
  return { ...run, name: text === "" ? STANDARD_NAMES[key] : text };
}

// Keenan names a view ("Street side"): every run on it carries the name, so
// the breakdown, the link and the signed copy read it. Empty, or the view's
// own name, takes the rename off.
export function renameView(runs: readonly QuoteRun[], kind: Exclude<AreaKind, "other">, name: string): QuoteRun[] {
  const clean = cleanViewName(name, kind);
  return runs.map((run) => {
    if (areaOf(run) !== kind) return run;
    const { view: _old, ...rest } = run;
    void _old;
    return clean ? { ...rest, view: clean } : rest;
  });
}

// Reset names: every view and every line on the views back to its own name.
// Feet, prices and offers stay exactly as they are; an Other keeps its name,
// since it has no other.
export function resetNames(runs: readonly QuoteRun[]): QuoteRun[] {
  return runs.map((run) => {
    const key = areaKeyOf(run);
    if (!key || !run.area) return run;
    const { view: _old, ...rest } = run;
    void _old;
    return { ...rest, name: STANDARD_NAMES[key] };
  });
}

// Whether any name on the quote is Keenan's own: what Reset names would change.
export function hasOwnNames(runs: readonly QuoteRun[]): boolean {
  return runs.some((run) => run.area && areaKeyOf(run) !== null && (lineRenamed(run) || (run.view ?? "").trim() !== ""));
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

// The positions of an old quote's Sides runs, which Keenan can split.
export function sidesRuns(runs: readonly QuoteRun[]): number[] {
  return runs.flatMap((run, at) => (areaOf(run) === "sides" ? [at] : []));
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
