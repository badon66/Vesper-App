"use client";

import type { DrawingGround } from "@/components/drawings/house-drawing";
import { LitHouse } from "@/components/drawings/lit-house";
import { useBoxSize } from "@/components/lights/light-canvas";
import type { Look } from "@/lib/deck";
import { cropRect, HOUSE_CROPS } from "@/lib/drawings/house";
import { PHONE_BODY, PHONE_SCREEN, PHONE_VIEW, phoneScene } from "@/lib/drawings/phone";
import { WARM_WHITE } from "@/lib/lights/looks";
import { cn } from "@/lib/utils";

// Run it from your phone, drawn (round 7): "phone in hand, house behind".
// The shared house lit warm white, large across the top with its ground
// line, and a plain phone in the lower right in the foreground, standing in
// front of the house's right end, taller than its walls. The phone's body
// is solid so the house stays behind it; its screen is a solid Night Card,
// switched on but blank, inside its hairline. Nothing on the screen: no
// invented interface, no words and no look names the real app may not have.
// Line weights match the house.
//
// CONTRACT
//   <PhoneDrawing look? ground? label? className? />
//     look        default WARM_WHITE (pass warmWhiteOf(deck.looks))
//     ground      "navy" (default) | "none" (the phone's body stays solid)
//     className   size and place its box; the scene is laid out in it
//                 (lib/drawings/phone.ts phoneScene)

const HOUSE = cropRect(HOUSE_CROPS.whole);

export function PhoneDrawing({
  look = WARM_WHITE,
  ground = "navy",
  label = "A drawing of a phone held in front of a house lit in warm white.",
  className,
}: {
  look?: Look;
  ground?: DrawingGround;
  label?: string;
  className?: string;
}) {
  const [boxRef, box] = useBoxSize<HTMLDivElement>();
  const scene = phoneScene(box, HOUSE);
  const place = (rect: typeof scene.house) => ({ left: rect.left, top: rect.top, width: rect.width, height: rect.height });
  return (
    <div
      ref={boxRef}
      role="img"
      aria-label={label}
      className={cn("dark relative overflow-hidden text-foreground", ground === "navy" && "bg-background", className)}
    >
      {box.width > 0 && box.height > 0 ? (
        <>
          <div className="absolute" style={place(scene.house)}>
            <LitHouse crop="whole" look={look} ground="none" decorative className="size-full" />
          </div>
          <svg
            viewBox={PHONE_VIEW.join(" ")}
            aria-hidden="true"
            className="absolute block"
            style={place(scene.phone)}
            stroke="currentColor"
            strokeLinejoin="round"
          >
            <rect {...PHONE_BODY} className="fill-background" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
            {/* A solid Night Card screen; only its hairline is softened. */}
            <rect {...PHONE_SCREEN} className="fill-card" strokeWidth={1} strokeOpacity={0.6} vectorEffect="non-scaling-stroke" />
          </svg>
        </>
      ) : null}
    </div>
  );
}
