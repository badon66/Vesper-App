"use client";

import { LitHouse } from "@/components/drawings/lit-house";
import type { Look } from "@/lib/deck";
import { CORNER_RUNS } from "@/lib/drawings/house";
import { COOL_WHITE, WARM_WHITE } from "@/lib/lights/looks";
import { cn } from "@/lib/utils";

// Warm or cool, drawn (round 7): the same front corner of the shared house
// twice, side by side, one lit warm white and one cool white by the light
// renderer, so the light is the only difference, as in Keenan's photo pair.
// The fallback for Warm white, most nights' More until that pair exists.
//
// CONTRACT
//   <CornerPair warm? cool? captions? className? />
//     warm, cool   the looks (default WARM_WHITE and COOL_WHITE; pass the
//                  meeting's own with warmWhiteOf / coolWhiteOf)
//     captions     optional words under each, at 20 px in Night Muted Text
//                  (for example the two looks' names); none by default
//     className    size it with this; the corners share its width

export function CornerPair({
  warm = WARM_WHITE,
  cool = COOL_WHITE,
  captions,
  className,
}: {
  warm?: Look;
  cool?: Look;
  captions?: [string, string];
  className?: string;
}) {
  return (
    <div
      role="img"
      aria-label={`Two drawings of the same front corner of a house at night, one lit in ${warm.name.toLowerCase()} and one in ${cool.name.toLowerCase()}.`}
      className={cn("dark flex items-center justify-center gap-6 bg-background text-foreground", className)}
    >
      {[warm, cool].map((look, at) => (
        <figure key={at} aria-hidden="true" className="m-0 flex min-w-0 flex-1 flex-col">
          <LitHouse crop="corner" runs={CORNER_RUNS} look={look} decorative className="aspect-[148/190] w-full" />
          {captions ? <figcaption className="mt-3 text-[20px] leading-[22px] text-muted-foreground">{captions[at]}</figcaption> : null}
        </figure>
      ))}
    </div>
  );
}
