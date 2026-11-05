// The house diagram on the customer's quote link (2026-11-04), kept pure:
// which drawn part of the house each run lights, and how each part looks
// for the runs they have switched on. No React, so it is unit tested.
//
// One two-storey front view for every house (decisions.md, 2026-11-04): a
// garage on the left with a front gable, a porch over the front door, the
// main floor's roof edge, the upper roof with a front gable, and the sides
// as the roof edges running back on the right. The photo is the portrait;
// this is the key. A run's part says where; its level says which roof.
// "Other" runs are listed but not drawn.

import { cleanFeet, runPart, type QuoteRun } from "@/lib/pricing";

export const HOUSE_SEGMENTS = [
  "garage-gable",
  "garage",
  "lower-eave",
  "porch",
  "upper-eave",
  "upper-gable",
  "lower-sides",
  "upper-sides",
] as const;
export type HouseSegment = (typeof HOUSE_SEGMENTS)[number];

// none: not in the quote (the plain outline); on: lit; off: in the quote,
// switched off (a dashed line, so on and off differ in shape, not only
// colour).
export type SegmentState = "none" | "on" | "off";

// Where a run is drawn. Gable, eave and sides follow the level; a garage
// line and a porch are drawn in one place whatever the level.
export function segmentFor(run: QuoteRun): HouseSegment | null {
  const upper = run.level === "upper";
  switch (runPart(run)) {
    case "eave":
      return upper ? "upper-eave" : "lower-eave";
    case "gable":
      return upper ? "upper-gable" : "garage-gable";
    case "sides":
      return upper ? "upper-sides" : "lower-sides";
    case "garage":
      return "garage";
    case "porch":
      return "porch";
    default:
      return null;
  }
}

// Each drawn part's state for the runs in the quote: lit when any run drawn
// there is on, dashed when every run drawn there is off, the plain outline
// when no run is drawn there. Runs with no feet aren't part of the job.
export function segmentStates(runs: { run: QuoteRun; on: boolean }[]): Record<HouseSegment, SegmentState> {
  const states = Object.fromEntries(HOUSE_SEGMENTS.map((segment) => [segment, "none"])) as Record<HouseSegment, SegmentState>;
  for (const { run, on } of runs) {
    if (cleanFeet(run.feet) === 0) continue;
    const segment = segmentFor(run);
    if (!segment) continue;
    if (on) states[segment] = "on";
    else if (states[segment] === "none") states[segment] = "off";
  }
  return states;
}

// The parts as the drawing's description names them, for a screen reader.
export const SEGMENT_NAMES: Record<HouseSegment, string> = {
  "garage-gable": "the garage gable",
  garage: "the garage line",
  "lower-eave": "the main floor eave",
  porch: "the porch",
  "upper-eave": "the upper eave",
  "upper-gable": "the upper gable",
  "lower-sides": "the main floor sides",
  "upper-sides": "the upper sides",
};

// "the porch, the upper eave and the upper gable"
export function listInWords(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// The drawing in words: what is lit, and what is switched off.
export function houseDescription(states: Record<HouseSegment, SegmentState>): string {
  const lit = HOUSE_SEGMENTS.filter((segment) => states[segment] === "on").map((segment) => SEGMENT_NAMES[segment]);
  const off = HOUSE_SEGMENTS.filter((segment) => states[segment] === "off").map((segment) => SEGMENT_NAMES[segment]);
  const parts = [`A drawing of a two-storey house${lit.length > 0 ? ` with lights on ${listInWords(lit)}` : ""}.`];
  if (off.length > 0) parts.push(`Switched off: ${listInWords(off)}.`);
  return parts.join(" ");
}
