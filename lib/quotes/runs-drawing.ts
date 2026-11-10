// The house drawing for a quote's runs (round 9, 2026-11-10), kept pure:
// which drawn part of the house each run lights, how each part looks for an
// option, and the names a drawing puts beside its lit runs. No React, so it
// is unit tested; components/meeting/runs-drawing.tsx draws it.
//
// One house everywhere (the spec, 3.4): the shared two-storey's eight runs
// (lib/drawings/house.ts, the same geometry as the link's house diagram).
// A run is drawn where the link draws it (lib/quote-link/house.ts
// segmentsFor: its part and level). Each part is in one of three states:
//   lit      a run in this option lights it
//   dashed   a measured run lights it, but not in this option
//   outline  no measured run is drawn there
// A run with no feet isn't measured yet, so it lights nothing.
//
// CONTRACT
//   DrawingState                      "lit" | "dashed" | "outline"
//   litPositions(runs, lit)           the positions lit (null: every run)
//   runPartStates(runs, lit, dashedRest)   each house run's state
//   runLabels(runs, lit)              one label per lit house run, naming
//                                     its runs with their feet ("Front 64 ft"),
//                                     and the lit runs drawn nowhere (part
//                                     Other) as their own list
//   runsDrawingWords(runs, lit)       what a screen reader hears

import { HOUSE_RUNS, type HouseRun } from "@/lib/drawings/house";
import { cleanFeet, type QuoteRun } from "@/lib/pricing";
import { segmentsFor } from "@/lib/quote-link/house";
import { offerRunName } from "@/lib/quotes/offers";

export type DrawingState = "lit" | "dashed" | "outline";

// The positions a drawing lights: these, or every run (null), kept to runs
// on the quote.
export function litPositions(runs: readonly QuoteRun[], lit: readonly number[] | null): Set<number> {
  if (lit === null) return new Set(runs.map((_, at) => at));
  return new Set(lit.filter((p) => Number.isInteger(p) && p >= 0 && p < runs.length));
}

// Each house run's state. With dashedRest off, a measured run left out of
// the option is the plain outline, as if it weren't measured.
export function runPartStates(
  runs: readonly QuoteRun[],
  lit: readonly number[] | null,
  dashedRest = false,
): Record<HouseRun, DrawingState> {
  const on = litPositions(runs, lit);
  const states = Object.fromEntries(HOUSE_RUNS.map((part) => [part, "outline"])) as Record<HouseRun, DrawingState>;
  runs.forEach((run, at) => {
    if (cleanFeet(run.feet) === 0) return;
    for (const part of segmentsFor(run)) {
      if (on.has(at)) states[part] = "lit";
      else if (dashedRest && states[part] === "outline") states[part] = "dashed";
    }
  });
  return states;
}

export type RunLabel = { part: HouseRun; lines: string[] };

// "Front 64 ft": a run's name and its feet.
export function runLabelText(run: QuoteRun, position: number): string {
  return `${offerRunName(run, position)} ${cleanFeet(run.feet)} ft`;
}

// The labels for a drawing's lit runs: each lit run named once, beside the
// first part it lights (a sides run on both floors is named at the lower
// one), in the quote's order; runs drawn nowhere (part Other) in `loose`.
export function runLabels(
  runs: readonly QuoteRun[],
  lit: readonly number[] | null,
): { parts: RunLabel[]; loose: string[] } {
  const on = litPositions(runs, lit);
  const byPart = new Map<HouseRun, string[]>();
  const loose: string[] = [];
  runs.forEach((run, at) => {
    if (!on.has(at) || cleanFeet(run.feet) === 0) return;
    const parts = segmentsFor(run);
    const text = runLabelText(run, at);
    if (parts.length === 0) {
      loose.push(text);
      return;
    }
    const list = byPart.get(parts[0]) ?? [];
    list.push(text);
    byPart.set(parts[0], list);
  });
  return {
    parts: HOUSE_RUNS.filter((part) => byPart.has(part)).map((part) => ({ part, lines: byPart.get(part) ?? [] })),
    loose,
  };
}

const listInWords = (items: string[]) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

// What a screen reader hears: "A drawing of the house, lit along Front,
// Garage and Upper gable." Never a price.
export function runsDrawingWords(runs: readonly QuoteRun[], lit: readonly number[] | null): string {
  const on = litPositions(runs, lit);
  const names = runs.flatMap((run, at) => (on.has(at) && cleanFeet(run.feet) > 0 ? [offerRunName(run, at)] : []));
  return names.length > 0 ? `A drawing of the house, lit along ${listInWords(names)}.` : "A drawing of the house.";
}
