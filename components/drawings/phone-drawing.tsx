"use client";

import { LitHouse } from "@/components/drawings/lit-house";
import type { Look } from "@/lib/deck";
import { UPPER_FLOOR_BASE, UPPER_RUNS } from "@/lib/drawings/house";
import { PHONE_BODY, PHONE_SCREEN, PHONE_VIEW } from "@/lib/drawings/phone";
import { WARM_WHITE } from "@/lib/lights/looks";
import { cn } from "@/lib/utils";

// Run it from your phone, drawn (round 7): a plain phone outline in Night
// Text hairlines beside a short lit roofline from the shared house, in warm
// white. Nothing on the phone's screen: no invented interface and no look
// names the real app may not have.
//
// CONTRACT
//   <PhoneDrawing look? label? className? />
//     look        default WARM_WHITE (pass warmWhiteOf(deck.looks))
//     className   size it with this; it lays the two out side by side,
//                 centred in its box

export function PhoneDrawing({
  look = WARM_WHITE,
  label = "A drawing of a phone beside the edge of a roof lit in warm white.",
  className,
}: {
  look?: Look;
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn("dark flex items-center justify-center gap-[5%] bg-background px-[4%] text-foreground", className)}
    >
      <LitHouse
        crop="roofline"
        runs={UPPER_RUNS}
        above={UPPER_FLOOR_BASE}
        look={look}
        decorative
        className="aspect-[236/104] w-[58%] max-h-[70%]"
      />
      <svg
        viewBox={PHONE_VIEW.join(" ")}
        aria-hidden="true"
        className="block h-[64%] max-w-[24%] shrink-0"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
      >
        <rect {...PHONE_BODY} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        <rect {...PHONE_SCREEN} strokeWidth={1} opacity={0.5} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
