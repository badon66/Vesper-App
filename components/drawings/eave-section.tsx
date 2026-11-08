"use client";

import { useMemo } from "react";

import { LightCanvas, useBoxSize } from "@/components/lights/light-canvas";
import type { Look } from "@/lib/deck";
import { EAVE_LIGHT, EAVE_LIGHT_PITCH, EAVE_SHAPES, EAVE_TRACK, EAVE_VIEW, eaveLabelsFor, type EaveVariant } from "@/lib/drawings/eave";
import { pathD } from "@/lib/drawings/house";
import { fitContain } from "@/lib/lights/frame";
import { WARM_WHITE } from "@/lib/lights/looks";
import { LIGHT_SPACING_M, type Placement } from "@/lib/lights/place";
import { cn } from "@/lib/utils";

// The eave in section (round 7): the edge of a roof cut through, so a
// customer can see which surface is which. Night Text hairlines on navy, no
// fills; the labels are HTML beside the drawing at 20 px, each on a hairline
// leader to the part it names.
//   "lit"     What's in it's fallback: Roof edge, Fascia, Track, Light and
//             Soffit, with one light drawn by the light renderer under the track.
//   "colour"  Your colours: only Soffit, Fascia and Track, and no light.
//
// CONTRACT
//   <EaveSection variant? look? label? decorative? className? />
//     variant     "lit" (default) | "colour"
//     look        the light's colour (default WARM_WHITE)
//     className   size its width; the height follows the drawing (520 x 440
//                 plus a label column 7.5 rem wide). Best from 440 px wide.

const VIEW = { x: EAVE_VIEW[0], y: EAVE_VIEW[1], width: EAVE_VIEW[2], height: EAVE_VIEW[3] };

const ONE_LIGHT: Placement = {
  lights: [{ x: EAVE_LIGHT[0], y: EAVE_LIGHT[1], line: 0, i: 0 }],
  lines: [[EAVE_LIGHT, EAVE_LIGHT]],
  pxPerMetre: EAVE_LIGHT_PITCH / LIGHT_SPACING_M,
  pitch: EAVE_LIGHT_PITCH,
  count: 1,
  capped: false,
  bounds: { x: EAVE_LIGHT[0], y: EAVE_LIGHT[1], width: 0, height: 0 },
};

export function EaveSection({
  variant = "lit",
  look = WARM_WHITE,
  label,
  decorative = false,
  className,
}: {
  variant?: EaveVariant;
  look?: Look;
  label?: string;
  decorative?: boolean;
  className?: string;
}) {
  const [boxRef, box] = useBoxSize<HTMLDivElement>();
  const labels = eaveLabelsFor(variant);
  const transform = useMemo(() => fitContain(VIEW, box), [box]);
  const words =
    label ??
    (variant === "lit"
      ? "A drawing of the edge of a roof, cut through: the roof edge, the fascia, the soffit, and the track under the soffit with a light in it."
      : "A drawing of the edge of a roof, cut through: the soffit underneath, the fascia board at the end, and the track under the soffit.");
  return (
    <div
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": words })}
      className={cn("dark grid grid-cols-[minmax(0,1fr)_7.5rem] bg-background text-foreground select-none", className)}
    >
      <div ref={boxRef} aria-hidden="true" className="relative aspect-[520/440] w-full">
        <svg viewBox={EAVE_VIEW.join(" ")} className="absolute inset-0 block size-full" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <g stroke="currentColor">
            {EAVE_SHAPES.map((line) => (
              <path key={pathD(line)} d={pathD(line)} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
            ))}
            <path d={pathD(EAVE_TRACK)} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          </g>
          <g className="text-muted-foreground" stroke="currentColor">
            {labels.map((item) => (
              <path key={item.key} d={pathD(item.leader)} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
          </g>
        </svg>
        {variant === "lit" && box.width > 0 ? (
          <LightCanvas placement={ONE_LIGHT} transform={transform} width={box.width} height={box.height} look={look} wash={false} />
        ) : null}
      </div>
      <div aria-hidden="true" className="relative">
        {labels.map((item) => {
          const y = item.leader[item.leader.length - 1][1];
          return (
            <span
              key={item.key}
              className="absolute left-2 -translate-y-1/2 text-[20px] leading-[22px] font-medium whitespace-nowrap"
              style={{ top: `${(y / EAVE_VIEW[3]) * 100}%` }}
            >
              {item.text}
            </span>
          );
        })}
      </div>
    </div>
  );
}
