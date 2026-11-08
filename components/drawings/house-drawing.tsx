import {
  HOUSE_CROPS,
  HOUSE_DOORS,
  HOUSE_EAVES,
  HOUSE_EDGES,
  HOUSE_GROUND,
  HOUSE_OUTLINE,
  HOUSE_RUNS,
  HOUSE_WINDOWS,
  LIT_RUNS,
  pathD,
  type Crop,
  type HouseCropName,
  type HouseRun,
} from "@/lib/drawings/house";
import type { Vec } from "@/lib/lights/place";
import { cn } from "@/lib/utils";

// The shared two-storey house as an SVG line drawing (round 7): hairlines,
// no fills, no text. Night: Night Text on navy, the way every lit drawing
// sits under the light renderer (LitHouse). Day: navy hairlines on white
// with only a thin track line under the lit eaves, no lights (Hidden by
// day's fallback pair). Lines keep their on-screen width at any size.
//
// CONTRACT
//   <HouseDrawing tone? crop? track? runs? label? decorative? className? />
//     tone       "night" (default) | "day"; sets only the line colour
//     crop       a HOUSE_CROPS name or a [x, y, width, height] in drawing units
//                (default "whole"); it is fitted whole and centred, like
//                fitContain, so a light canvas on the same box lines up
//     track      draw the thin track line under `runs` (the day drawing)
//     runs       which eaves carry the track (default LIT_RUNS)
//     above      draw only lines wholly above this height (drawing units),
//                and no ground: the upper floor alone (110 is its base)
//   <HouseDayDrawing crop? label? decorative? className? />
//     the day half of Hidden by day: navy on white with the thin track, on
//     its own white box. Pair it with <LitHouse /> (the night half) in a box
//     of the same size and the two line up to the pixel.

export function cropOf(crop: HouseCropName | Crop): Crop {
  return typeof crop === "string" ? HOUSE_CROPS[crop] : crop;
}

export function HouseDrawing({
  tone = "night",
  crop = "whole",
  track = false,
  runs = LIT_RUNS,
  above,
  label,
  decorative = false,
  className,
}: {
  tone?: "night" | "day";
  crop?: HouseCropName | Crop;
  track?: boolean;
  runs?: readonly HouseRun[];
  above?: number;
  label?: string;
  decorative?: boolean;
  className?: string;
}) {
  const view = cropOf(crop);
  const fine = tone === "day" ? 0.5 : 0.45;
  // With `above`, only what sits wholly above that height is drawn (the
  // upper floor on its own, beside the phone), and no ground.
  const keep = (line: Vec[]) => above === undefined || line.every(([, y]) => y <= above);
  return (
    <svg
      viewBox={view.join(" ")}
      preserveAspectRatio="xMidYMid meet"
      {...(decorative || !label ? { "aria-hidden": true } : { role: "img", "aria-label": label })}
      className={cn("block size-full", tone === "night" ? "dark text-foreground" : "text-navy", className)}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {above === undefined ? <path d={pathD(HOUSE_GROUND)} strokeWidth={1} opacity={0.35} vectorEffect="non-scaling-stroke" /> : null}
      {HOUSE_OUTLINE.filter(keep).map((line) => (
        <path key={pathD(line)} d={pathD(line)} strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
      ))}
      {HOUSE_RUNS.filter((run) => keep(HOUSE_EDGES[run])).map((run) => (
        <path key={run} d={pathD(HOUSE_EDGES[run])} strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
      ))}
      {[...HOUSE_DOORS, ...HOUSE_WINDOWS].filter(keep).map((line) => (
        <path key={pathD(line)} d={pathD(line)} strokeWidth={1} opacity={fine} vectorEffect="non-scaling-stroke" />
      ))}
      {track
        ? runs.map((run) => (
            <path key={`track-${run}`} d={pathD(HOUSE_EAVES[run])} strokeWidth={1.25} opacity={0.6} vectorEffect="non-scaling-stroke" />
          ))
        : null}
    </svg>
  );
}

export function HouseDayDrawing({
  crop = "whole",
  label = "A drawing of a two-storey house by day, with a thin track under the edge of the roof.",
  decorative = false,
  className,
}: {
  crop?: HouseCropName | Crop;
  label?: string;
  decorative?: boolean;
  className?: string;
}) {
  return (
    <div
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": label })}
      className={cn("relative overflow-hidden bg-white", className)}
    >
      <HouseDrawing tone="day" crop={crop} track decorative className="absolute inset-0" />
    </div>
  );
}
