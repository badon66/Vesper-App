import {
  drawn,
  groundFor,
  HOUSE_DOORS,
  HOUSE_EDGES,
  HOUSE_OUTLINE,
  HOUSE_RUNS,
  HOUSE_WINDOWS,
  LIT_RUNS,
  pathD,
  preserveAspect,
  runsFor,
  trackProfile,
  viewOf,
  type Crop,
  type DrawingFit,
  type HouseCropName,
  type HouseRun,
} from "@/lib/drawings/house";
import { cn } from "@/lib/utils";

// The shared two-storey house as an SVG line drawing (round 7): hairlines,
// no fills, no text. Night: Night Text on navy, the way every lit drawing
// sits under the light renderer (LitHouse). Day: navy hairlines on a warm
// paper ground (Night Text, #f4f1eb, not a white that flares in a dim room)
// with the track as a slim closed profile under the lit eaves, no lights
// (Hidden by day's fallback pair). Lines keep their on-screen width at any
// size.
//
// CONTRACT
//   DrawingGround   "navy" (default): the drawing's own ground, Night
//                   Background for the night drawings and the paper tone for
//                   the day one; "none": transparent, so it sits straight on
//                   a More layer's Night Card with no darker box
//   <HouseDrawing tone? crop? fit? ground? track? runs? label? decorative? className? />
//     tone       "night" (default) | "day"; the line colour, and the colour
//                of its own ground (Night Background, or the paper tone)
//     ground     "navy" (default): its own ground fills the box; "none":
//                lines only (LitHouse and HouseDayDrawing paint the ground)
//     crop       a HOUSE_CROPS name or a [x, y, width, height] in drawing units
//                (default "whole"). A view of the lower floor (medium, entry)
//                leaves the upper floor's lines out entirely; the corner
//                leaves out the garage
//     fit        "contain" (default): the crop fitted whole and centred;
//                "cover": the crop fills the box edge to edge, centred on it,
//                like a photo crop. The SVG clips to its box either way, and
//                fitView gives the light canvas the same numbers
//     track      draw the track's slim profile under `runs` (the day drawing)
//     runs       which eaves carry the track (default LIT_RUNS, those in view)
//   <HouseDayDrawing crop? fit? ground? label? decorative? className? />
//     the day half of Hidden by day: navy on the paper tone with the track,
//     in its own box. Pair it with <LitHouse /> (the night half) with the
//     same crop and fit in a box of the same size and the two line up to the
//     pixel.

export type DrawingGround = "navy" | "none";

// The day drawing's paper: Night Text, a warm off-white.
export const DAY_PAPER = "#f4f1eb";

export function HouseDrawing({
  tone = "night",
  crop = "whole",
  fit = "contain",
  ground: groundTone = "navy",
  track = false,
  runs = LIT_RUNS,
  label,
  decorative = false,
  className,
}: {
  tone?: "night" | "day";
  crop?: HouseCropName | Crop;
  fit?: DrawingFit;
  ground?: DrawingGround;
  track?: boolean;
  runs?: readonly HouseRun[];
  label?: string;
  decorative?: boolean;
  className?: string;
}) {
  const { rect, parts } = viewOf(crop);
  const fine = tone === "day" ? 0.5 : 0.45;
  const keep = (line: Parameters<typeof drawn>[0]) => drawn(line, parts);
  const ground = groundFor(parts);
  return (
    <svg
      viewBox={`${rect.x} ${rect.y} ${rect.width} ${rect.height}`}
      preserveAspectRatio={preserveAspect(fit)}
      {...(decorative || !label ? { "aria-hidden": true } : { role: "img", "aria-label": label })}
      className={cn(
        "block size-full overflow-hidden",
        tone === "night" ? "dark text-foreground" : "text-navy",
        groundTone === "navy" && tone === "night" && "bg-background",
        className,
      )}
      style={groundTone === "navy" && tone === "day" ? { backgroundColor: DAY_PAPER } : undefined}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {ground ? <path d={pathD(ground)} strokeWidth={1} opacity={0.35} vectorEffect="non-scaling-stroke" /> : null}
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
        ? runsFor(runs, parts).map((run) => (
            // The stock track is white: a solid white profile (it sits in
            // front of the wall, so no wall line shows through it) with a
            // navy hairline.
            <path
              key={`track-${run}`}
              d={pathD(trackProfile(run), true)}
              fill="#ffffff"
              strokeWidth={1}
              strokeOpacity={0.85}
              vectorEffect="non-scaling-stroke"
            />
          ))
        : null}
    </svg>
  );
}

export function HouseDayDrawing({
  crop = "whole",
  fit = "contain",
  ground = "navy",
  label = "A drawing of a house by day, with a slim track tucked under the edge of the roof.",
  decorative = false,
  className,
}: {
  crop?: HouseCropName | Crop;
  fit?: DrawingFit;
  ground?: DrawingGround;
  label?: string;
  decorative?: boolean;
  className?: string;
}) {
  return (
    <div
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": label })}
      className={cn("relative overflow-hidden", className)}
      style={ground === "navy" ? { backgroundColor: DAY_PAPER } : undefined}
    >
      <HouseDrawing tone="day" crop={crop} fit={fit} ground="none" track decorative className="absolute inset-0" />
    </div>
  );
}
