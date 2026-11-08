"use client";

import { useMemo } from "react";

import { cropOf, HouseDrawing } from "@/components/drawings/house-drawing";
import { LightCanvas, useBoxSize } from "@/components/lights/light-canvas";
import type { Effect, Look } from "@/lib/deck";
import { cropRect, houseLines, HOUSE_UNITS_PER_METRE, LIT_RUNS, type Crop, type HouseCropName, type HouseRun } from "@/lib/drawings/house";
import { fitContain } from "@/lib/lights/frame";
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
//     crop?        "whole" (default) | "entry" (the garage and entry, for Warm
//                  white, most nights) | "corner" | "roofline" | [x, y, w, h]
//     look?        default WARM_WHITE; pass the meeting's own warm white
//                  (warmWhiteOf(deck.looks)) or, in Settings, the look being edited
//     effect?, playing?, lit?, fadeMs?, lookFadeMs?   as LightCanvas
//     runs?        which eaves are lit (default LIT_RUNS)
//     above?       draw only the lines wholly above this height (HouseDrawing)
//     label?       a screen reader's words (a plain default is given)
//     decorative?  hidden from screen readers (beside words that say it)
//     className?   size it with this; it fills its box, the drawing fitted
//                  whole and centred
//   />

const DEFAULT_PLACEMENT = placeAlong(houseLines(LIT_RUNS), HOUSE_UNITS_PER_METRE);

const CROP_WORDS: Record<HouseCropName, string> = {
  whole: "a two-storey house",
  entry: "a garage and front entry",
  corner: "the front corner of a house",
  roofline: "the edge of a roof",
};

export function litHouseLabel(crop: HouseCropName | Crop, look: Pick<Look, "name">): string {
  const what = typeof crop === "string" ? CROP_WORDS[crop] : "a house";
  return `A drawing of ${what} at night, lit in ${look.name.toLowerCase()}.`;
}

export function LitHouse({
  crop = "whole",
  look = WARM_WHITE,
  effect = "steady",
  playing = false,
  lit = 1,
  fadeMs,
  lookFadeMs,
  runs,
  above,
  label,
  decorative = false,
  className,
}: {
  crop?: HouseCropName | Crop;
  look?: Look;
  effect?: Effect;
  playing?: boolean;
  lit?: number;
  fadeMs?: number;
  lookFadeMs?: number;
  runs?: readonly HouseRun[];
  above?: number;
  label?: string;
  decorative?: boolean;
  className?: string;
}) {
  const [boxRef, box] = useBoxSize<HTMLDivElement>();
  const view = cropOf(crop);
  const runsKey = runs ? runs.join(",") : "";
  const placement: Placement = useMemo(
    () => (runsKey ? placeAlong(houseLines(runsKey.split(",") as HouseRun[]), HOUSE_UNITS_PER_METRE) : DEFAULT_PLACEMENT),
    [runsKey],
  );
  const transform = useMemo(() => fitContain(cropRect(view), box), [view, box]);
  return (
    <div
      ref={boxRef}
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": label ?? litHouseLabel(crop, look) })}
      className={cn("dark relative overflow-hidden bg-background text-foreground select-none", className)}
    >
      <HouseDrawing tone="night" crop={view} above={above} decorative className="absolute inset-0" />
      {box.width > 0 && box.height > 0 ? (
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
