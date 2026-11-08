"use client";

import type { DrawingGround } from "@/components/drawings/house-drawing";
import { LitHouse } from "@/components/drawings/lit-house";
import { useBoxSize } from "@/components/lights/light-canvas";
import type { Look } from "@/lib/deck";
import { CORNER_RUNS, HOUSE_CROPS } from "@/lib/drawings/house";
import { pairLayout } from "@/lib/drawings/pair";
import { COOL_WHITE, WARM_WHITE } from "@/lib/lights/looks";
import { smartApostrophes } from "@/lib/typography";
import { cn } from "@/lib/utils";

// Warm or cool, drawn (round 7): the same corner of the shared house twice,
// one lit warm white and one cool white by the light renderer, so the light
// is the only difference, as in Keenan's photo pair. The fallback for Warm
// white, most nights' More until that pair exists. The view is the house's
// main block without the garage: both floors and the right front corner
// with the sides running back, so every line and every run ends inside the
// frame and nothing is sliced at an edge.
//
// CONTRACT
//   <CornerPair warm? cool? captions? ground? className? />
//     warm, cool   the looks (default WARM_WHITE and COOL_WHITE; pass the
//                  meeting's own with warmWhiteOf / coolWhiteOf)
//     captions     words under each, at 20 px in Night Muted Text (the two
//                  looks' names); none by default
//     ground       "navy" (default) | "none": no ground of its own, for a
//                  More layer's Night Card
//     className    size and place its box; the two drawings are sized by
//                  the box to fill it (pairLayout: side by side, or one
//                  above the other in a tall box), centred with equal margins

const [, , CROP_WIDTH, CROP_HEIGHT] = HOUSE_CROPS.corner;
const ASPECT = CROP_WIDTH / CROP_HEIGHT;
// A caption is a 24 px line of 20 px type, 12 px under its drawing.
const CAPTION_GAP = 12;
const CAPTION_LINE = 24;

export function CornerPair({
  warm = WARM_WHITE,
  cool = COOL_WHITE,
  captions,
  ground = "navy",
  className,
}: {
  warm?: Look;
  cool?: Look;
  captions?: [string, string];
  ground?: DrawingGround;
  className?: string;
}) {
  const [boxRef, box] = useBoxSize<HTMLDivElement>();
  const margin = Math.max(24, Math.min(box.width, box.height) * 0.05);
  const gap = Math.max(24, Math.min(box.width, box.height) * 0.05);
  const layout = pairLayout(box, ASPECT, { caption: captions ? CAPTION_GAP + CAPTION_LINE : 0, gap, margin });
  const { width, height } = layout.drawing;
  return (
    <div
      ref={boxRef}
      role="img"
      aria-label={`Two drawings of the same house at night, one lit in ${warm.name.toLowerCase()} and one in ${cool.name.toLowerCase()}.`}
      className={cn("dark relative overflow-hidden text-foreground", ground === "navy" && "bg-background", className)}
    >
      {width > 0 ? (
        <div
          className={cn("absolute inset-0 flex items-center justify-center", layout.direction === "column" && "flex-col")}
          style={{ gap }}
        >
          {[warm, cool].map((look, at) => (
            <figure key={at} aria-hidden="true" className="m-0 flex shrink-0 flex-col items-center" style={{ width }}>
              <div style={{ width, height }}>
                <LitHouse crop="corner" runs={CORNER_RUNS} look={look} ground="none" decorative className="size-full" />
              </div>
              {captions ? (
                <figcaption
                  className="w-full truncate text-center text-[20px] text-muted-foreground"
                  style={{ marginTop: CAPTION_GAP, lineHeight: `${CAPTION_LINE}px` }}
                >
                  {smartApostrophes(captions[at])}
                </figcaption>
              ) : null}
            </figure>
          ))}
        </div>
      ) : null}
    </div>
  );
}
