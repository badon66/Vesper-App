"use client";

import type { KeyboardEvent } from "react";

import { AREA_VIEWS, type AreaKey, type AreaKind } from "@/lib/quotes/areas";
import { drawOrder, houseLineLabel, type HouseLine } from "@/lib/quotes/editor";
import { cn } from "@/lib/utils";

// The measuring views, drawn (Keenan, 2026-11-11): two plain two-storey
// house outlines, FRONT and BACK, and a slim strip for the Sides, at the top
// of the quote editor. Each area is a line on the house: the lower roofline
// along the lower eave, the lower gable over one end (the garage end at the
// front), the upper roofline and the upper gable; the Back is the Front seen
// from behind, so its garage end sits on the other side. A measured line is
// solid in the text colour with its feet on it ("64 ft"); an unmeasured one
// is faint and dashed; a line the active offer covers is gold and a little
// thicker, and a measured line the offer leaves out stays as it is. Tapping
// a line (a finger lands on a wide invisible stroke) asks the editor to open
// that area's feet box; nothing is written here. Where a gable's foot meets
// a roofline the roofline takes the tap (round 13: the gables are drawn
// first, drawOrder), so a tap on a roofline lands on it right to its ends.
// Strokes only, hairlines
// that keep their width at any size, no fills, no gradients. Owner only,
// never customer facing: customers see an offer's photo, never this.
//
// CONTRACT
//   <HouseView view lines onTap? className? />
//     view     "front" | "back" (the house outlines) | "sides" (the strip)
//     lines    every line's state (lib/quotes/editor.ts houseLines)
//     onTap    a line tapped, or Enter or Space on it; none while the quote
//              is locked, and the lines are then plain pictures
//   Each line is a <g> with test id house-line, data-area the area key,
//   data-state measured | empty and data-lit true | false; its aria-label is
//   "Front lower, 64 ft" or "Front lower, not measured".

export type HouseViewKind = Exclude<AreaKind, "other">;

type Pt = readonly [number, number];
type LineShape = { points: readonly Pt[]; label: Pt };
type ViewShape = {
  width: number;
  height: number;
  // The house around the lines, faint: ground, walls, doors and windows.
  context: string;
  // Small words on the drawing itself (the Sides strip's Upper and Lower).
  captions: readonly { at: Pt; text: string }[];
  lines: readonly { key: AreaKey; shape: LineShape }[];
};

const WIDTH = 320;

// The front: the garage end on the left under the lower gable, the front
// door under the upper storey, the upper gable centred on it.
const FRONT: ViewShape = {
  width: WIDTH,
  height: 200,
  context: [
    "M12 184 L308 184",
    "M24 112 L24 184 M296 112 L296 184",
    "M128 56 L128 112 M280 56 L280 112",
    "M36 184 L36 140 L104 140 L104 184",
    "M196 184 L196 150 L214 150 L214 184",
    "M240 134 L268 134 L268 154 L240 154 Z",
    "M148 74 L172 74 L172 94 L148 94 Z M236 74 L260 74 L260 94 L236 94 Z",
  ].join(" "),
  captions: [],
  lines: [
    {
      key: "front_lower",
      shape: {
        points: [
          [24, 112],
          [296, 112],
        ],
        label: [204, 112],
      },
    },
    {
      key: "front_lower_gable",
      shape: {
        points: [
          [24, 112],
          [70, 76],
          [116, 112],
        ],
        label: [70, 64],
      },
    },
    {
      key: "front_upper",
      shape: {
        points: [
          [128, 56],
          [280, 56],
        ],
        label: [204, 56],
      },
    },
    {
      key: "front_upper_gable",
      shape: {
        points: [
          [152, 56],
          [204, 22],
          [256, 56],
        ],
        label: [204, 10],
      },
    },
  ],
};

const flip = (shape: LineShape): LineShape => ({
  points: shape.points.map(([x, y]): Pt => [WIDTH - x, y]),
  label: [WIDTH - shape.label[0], shape.label[1]],
});

// The back is the front seen from behind: the same house flipped, so the
// garage end is on the right, with a patio door instead of the front door.
const BACK: ViewShape = {
  width: WIDTH,
  height: 200,
  context: [
    "M12 184 L308 184",
    "M24 112 L24 184 M296 112 L296 184",
    "M40 56 L40 112 M192 56 L192 112",
    "M96 184 L96 142 L140 142 L140 184 M118 142 L118 184",
    "M232 134 L268 134 L268 154 L232 154 Z",
    "M60 74 L84 74 L84 94 L60 94 Z M148 74 L172 74 L172 94 L148 94 Z",
  ].join(" "),
  captions: [],
  lines: FRONT.lines.map(({ key, shape }) => ({ key: key.replace("front", "back") as AreaKey, shape: flip(shape) })),
};

// The sides as a slim strip: the house end on, its two rooflines, one
// number each for both sides together.
const SIDES: ViewShape = {
  width: WIDTH,
  height: 84,
  context: ["M40 76 L308 76", "M56 48 L56 76 M296 48 L296 76", "M88 18 L88 48 M264 18 L264 48"].join(" "),
  captions: [
    { at: [46, 18], text: "Upper" },
    { at: [46, 48], text: "Lower" },
  ],
  lines: [
    {
      key: "sides_lower",
      shape: {
        points: [
          [56, 48],
          [296, 48],
        ],
        label: [176, 48],
      },
    },
    {
      key: "sides_upper",
      shape: {
        points: [
          [88, 18],
          [264, 18],
        ],
        label: [176, 18],
      },
    },
  ],
};

const SHAPES: Record<HouseViewKind, ViewShape> = { front: FRONT, back: BACK, sides: SIDES };

const pathOf = (points: readonly Pt[]) => points.map(([x, y], at) => `${at === 0 ? "M" : "L"}${x} ${y}`).join(" ");

export function HouseView({
  view,
  lines,
  onTap,
  className,
}: {
  view: HouseViewKind;
  lines: Record<AreaKey, HouseLine>;
  onTap?: (key: AreaKey) => void;
  className?: string;
}) {
  const shape = SHAPES[view];
  const title = AREA_VIEWS.find((item) => item.kind === view)?.title ?? view;
  return (
    <svg
      viewBox={`0 0 ${shape.width} ${shape.height}`}
      role="group"
      aria-label={`${title} drawing`}
      className={cn("w-full fill-none", className)}
      strokeLinecap="round"
      strokeLinejoin="round"
      data-testid="house-view"
      data-view={view}
    >
      <path d={shape.context} className="stroke-muted-foreground" strokeOpacity={0.35} strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
      {shape.captions.map((caption) => (
        <text
          key={caption.text}
          x={caption.at[0]}
          y={caption.at[1]}
          textAnchor="end"
          dominantBaseline="central"
          fontSize={11}
          className="fill-muted-foreground font-semibold"
          aria-hidden="true"
        >
          {caption.text}
        </text>
      ))}
      {drawOrder(shape.lines).map(({ key, shape: line }) => (
        <LineMark key={key} areaKey={key} line={lines[key]} shape={line} onTap={onTap} />
      ))}
    </svg>
  );
}

// One line on the house: a wide invisible stroke to land a finger on, the
// line itself in its state, and its feet on it once measured.
function LineMark({ areaKey, line, shape, onTap }: { areaKey: AreaKey; line: HouseLine; shape: LineShape; onTap?: (key: AreaKey) => void }) {
  const d = pathOf(shape.points);
  const tone = line.lit ? "lit" : line.measured ? "measured" : "empty";
  const tappable = onTap !== undefined;
  const tap = () => onTap?.(areaKey);
  const key = (event: KeyboardEvent<SVGGElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    tap();
  };
  return (
    <g
      role={tappable ? "button" : "img"}
      tabIndex={tappable ? 0 : undefined}
      aria-label={houseLineLabel(areaKey, line)}
      onClick={tappable ? tap : undefined}
      onKeyDown={tappable ? key : undefined}
      className={cn("group outline-none", tappable && "cursor-pointer")}
      data-testid="house-line"
      data-area={areaKey}
      data-state={line.measured ? "measured" : "empty"}
      data-lit={line.lit ? "true" : "false"}
    >
      <path
        d={d}
        stroke="transparent"
        strokeWidth={28}
        vectorEffect="non-scaling-stroke"
        pointerEvents="stroke"
        className="group-focus-visible:stroke-ring group-focus-visible:[stroke-opacity:0.3]"
      />
      <path
        d={d}
        className={cn("transition-colors", tone === "lit" ? "stroke-gold" : tone === "measured" ? "stroke-foreground" : "stroke-muted-foreground")}
        strokeWidth={tone === "lit" ? 3.25 : tone === "measured" ? 2.25 : 1.5}
        strokeOpacity={tone === "empty" ? 0.45 : 1}
        strokeDasharray={tone === "empty" ? "6 5" : undefined}
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
      />
      {line.measured ? (
        // The feet on the line: the card's colour stroked round the glyphs
        // (paint-order) breaks the line under them. A lit label is gold at
        // night; by day it stays navy, since gold text on white is too faint
        // (DESIGN.md), and the gold line under it says the rest.
        <text
          x={shape.label[0]}
          y={shape.label[1]}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={12}
          paintOrder="stroke"
          strokeWidth={6}
          className={cn("stroke-card font-semibold tabular-nums transition-colors", line.lit ? "fill-foreground dark:fill-gold" : "fill-foreground")}
          pointerEvents="none"
          aria-hidden="true"
        >
          {line.feet} ft
        </text>
      ) : null}
    </g>
  );
}
