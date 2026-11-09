"use client";

import { useMemo } from "react";

import { HouseDrawing, type DrawingGround } from "@/components/drawings/house-drawing";
import { LightCanvas, useBoxSize } from "@/components/lights/light-canvas";
import type { Effect, Look } from "@/lib/deck";
import {
  fitView,
  houseLines,
  HOUSE_UNITS_PER_METRE,
  LIT_RUNS,
  runsFor,
  viewOf,
  type Crop,
  type DrawingFit,
  type HouseCropName,
  type HouseRun,
} from "@/lib/drawings/house";
import { WARM_WHITE } from "@/lib/lights/looks";
import { placeAlong, type Placement } from "@/lib/lights/place";
import { cn } from "@/lib/utils";

// The shared house at night, lit (round 7): the deck's fallback picture
// wherever Keenan's photo is missing, and Settings' live preview of a look.
// Night Text hairlines on navy with the light picker's own renderer over
// its eaves, at the real 0.2 m spacing (the drawing's garage door is
// 16 ft), so every light in the deck looks like the same light. It is always
// night: it carries its own dark colours whatever the app's theme.
//
// CONTRACT
//   <LitHouse
//     crop?        "whole" (default) | "medium" | "entry" | "corner" |
//                  "roofline" | [x, y, w, h]; a view that leaves out a part
//                  of the house (the upper floor's roof, eave and windows in
//                  medium and entry, whose walls rise out of the top; the
//                  garage in corner and roofline) leaves out its lines and
//                  its lights
//     fit?         "contain" (default) | "cover": as HouseDrawing; the lines
//                  and the light canvas share one transform (entry held at
//                  its top) and both clip to the box, so no line or light
//                  shows beyond it
//     ground?      "navy" (default) | "none": no ground of its own, for a
//                  More layer's Night Card
//     look?        default WARM_WHITE; pass the meeting's own warm white
//                  (warmWhiteOf(deck.looks)) or, in Settings, the look being edited
//     effect?, playing?, lit?, fadeMs?, lookFadeMs?   as LightCanvas
//     runs?        which eaves are lit (default LIT_RUNS), of those in view
//     label?       a screen reader's words (a plain default is given)
//     decorative?  hidden from screen readers (beside words that say it)
//     className?   size it with this; it fills its box
//   />

const CROP_WORDS: Record<HouseCropName, string> = {
  whole: "a two-storey house",
  medium: "the garage and front of a two-storey house",
  entry: "the front entry of a house, under its roof edge",
  corner: "the front corner of a house",
  roofline: "the upper floor of a house",
  eave: "the edge of a roof",
};

export function litHouseLabel(crop: HouseCropName | Crop, look: Pick<Look, "name">): string {
  const what = typeof crop === "string" ? CROP_WORDS[crop] : "a house";
  return `A drawing of ${what} at night, lit in ${look.name.toLowerCase()}.`;
}

const placements = new Map<string, Placement>();

// The lights along those runs, placed once per set of runs.
export function housePlacement(runs: readonly HouseRun[]): Placement {
  const key = runs.join(",");
  let placement = placements.get(key);
  if (!placement) {
    placement = placeAlong(houseLines(runs), HOUSE_UNITS_PER_METRE);
    placements.set(key, placement);
  }
  return placement;
}

export function LitHouse({
  crop = "whole",
  fit = "contain",
  ground = "navy",
  look = WARM_WHITE,
  effect = "steady",
  playing = false,
  lit = 1,
  fadeMs,
  lookFadeMs,
  runs = LIT_RUNS,
  label,
  decorative = false,
  className,
}: {
  crop?: HouseCropName | Crop;
  fit?: DrawingFit;
  ground?: DrawingGround;
  look?: Look;
  effect?: Effect;
  playing?: boolean;
  lit?: number;
  fadeMs?: number;
  lookFadeMs?: number;
  runs?: readonly HouseRun[];
  label?: string;
  decorative?: boolean;
  className?: string;
}) {
  const [boxRef, box] = useBoxSize<HTMLDivElement>();
  const view = viewOf(crop);
  const runsKey = runsFor(runs, view.parts).join(",");
  const placement = useMemo(() => housePlacement(runsKey ? (runsKey.split(",") as HouseRun[]) : []), [runsKey]);
  const { x: rx, y: ry, width: rw, height: rh } = view.rect;
  const anchor = view.anchor;
  const transform = useMemo(() => fitView({ x: rx, y: ry, width: rw, height: rh }, box, fit, anchor), [rx, ry, rw, rh, box, fit, anchor]);
  return (
    <div
      ref={boxRef}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": label ?? litHouseLabel(crop, look) })}
      className={cn("dark relative overflow-hidden text-foreground select-none", ground === "navy" && "bg-background", className)}
    >
      <HouseDrawing tone="night" crop={crop} fit={fit} ground="none" decorative className="absolute inset-0" />
      {box.width > 0 && box.height > 0 && runsKey ? (
        <LightCanvas
          placement={placement}
          transform={transform}
          width={box.width}
          height={box.height}
          look={look}
          effect={effect}
          playing={playing}
          lit={lit}
          fadeMs={fadeMs}
          lookFadeMs={lookFadeMs}
        />
      ) : null}
    </div>
  );
}
