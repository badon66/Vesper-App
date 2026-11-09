"use client";

import type { DrawingGround } from "@/components/drawings/house-drawing";
import { LitHouse } from "@/components/drawings/lit-house";
import { useBoxSize } from "@/components/lights/light-canvas";
import type { Look } from "@/lib/deck";
import { CORNER_RUNS, HOUSE_CROPS } from "@/lib/drawings/house";
import { PAIR_CAPTION, PAIR_CROP, pairLayout, pairSpace } from "@/lib/drawings/pair";
import { COOL_WHITE, WARM_WHITE } from "@/lib/lights/looks";
import { smartApostrophes } from "@/lib/typography";
import { cn } from "@/lib/utils";

// Warm or cool, drawn (round 7): the same view of the shared house twice,
// one lit warm white and one cool white by the light renderer, so the light
// is the only difference, as in Keenan's photo pair. The fallback for Warm
// white, most nights' More until that pair exists. The view is the upper
// floor standing on its band (PAIR_CROP, "roofline"): its hip, its gable and
// the eave turning the corner down the side, every line and run ending
// inside the frame. It is wide (about 2.1:1), so one above the other each
// drawing takes about 90% of a More's picture panel, and the lights are
// about 8 px apart at 1180 rather than a dotted hairline.
//
// CONTRACT
//   <CornerPair warm? cool? captions? ground? className? />
//     warm, cool   the looks (default WARM_WHITE and COOL_WHITE; pass the
//                  meeting's own with warmWhiteOf / coolWhiteOf)
//     captions     words under each, at the deck's small size (20 to 22 px,
//                  var(--deck-small)) in Night Muted Text (the two looks'
//                  names); none by default
//     ground       "navy" (default) | "none": no ground of its own, for a
//                  More layer's Night Card
//     className    size and place its box; the two drawings are sized by
//                  the box to fill it (pairLayout: side by side, or one
//                  above the other in a tall box), centred, with a margin
//                  and gap of 3% of the box's shorter side (pairSpace)

const [, , CROP_WIDTH, CROP_HEIGHT] = HOUSE_CROPS[PAIR_CROP];
const ASPECT = CROP_WIDTH / CROP_HEIGHT;
const CAPTION_GAP = PAIR_CAPTION.gap;
const CAPTION_LINE = PAIR_CAPTION.line;

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
  const margin = pairSpace(box);
  const gap = margin;
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
                <LitHouse crop={PAIR_CROP} runs={CORNER_RUNS} look={look} ground="none" decorative className="size-full" />
              </div>
              {captions ? (
                <figcaption
                  className="w-full truncate text-center text-[length:var(--deck-small,20px)] text-muted-foreground"
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
