import { HOUSE_SEGMENTS, houseDescription, type HouseSegment, type SegmentState } from "@/lib/quote-link/house";
import { cn } from "@/lib/utils";

// The house diagram (2026-11-04; round 9, one diagram for the option on
// screen): an original line drawing in navy, with gold where the lights
// go. A lit part, in the option, is a navy track with gold nodes, tucked
// just under the roof edge, as the product sits under the soffit. A part
// measured but left out of the option is a dashed track; a part not
// measured is the plain outline. Changing the option cross-fades the parts.
// One drawing for every house; see lib/quote-link/house.ts.

// The roof edges each part lights, in the drawing's own units.
const EDGES: Record<HouseSegment, string> = {
  "garage-gable": "M6 128 L61 94 L116 128",
  garage: "M6 128 L116 128",
  "lower-eave": "M116 120 L306 120",
  porch: "M210 146 L264 146",
  "upper-eave": "M122 66 L206 66",
  "upper-gable": "M206 66 L253 32 L300 66",
  "lower-sides": "M306 120 L342 104",
  "upper-sides": "M300 66 L336 50",
};

// The same edges, a few units in and down: where the track sits.
const TRACKS: Record<HouseSegment, string> = {
  "garage-gable": "M12 128.5 L61 98 L110 128.5",
  garage: "M9 131.5 L113 131.5",
  "lower-eave": "M119 123.5 L303 123.5",
  porch: "M213 149.5 L261 149.5",
  "upper-eave": "M125 69.5 L203 69.5",
  "upper-gable": "M212 66.5 L253 36 L294 66.5",
  "lower-sides": "M306 124 L339 109.5",
  "upper-sides": "M300 70 L333 55.5",
};

// Everything that is always drawn: walls, roofs that carry no lights here,
// the garage door, the porch, the door and the ground.
const OUTLINE = [
  // garage walls
  "M12 128 L12 196",
  // main floor walls, and the side running back
  "M116 128 L116 196",
  "M300 120 L300 196",
  "M300 196 L336 180 L336 107",
  // the roof band between the floors, and the second floor's walls
  "M122 110 L300 110",
  "M128 110 L128 66",
  "M294 110 L294 66",
  "M294 110 L330 94 L330 53",
  // the upper roof: hip on the left, ridge, and the side running back
  "M122 66 L150 42 L239 42",
  "M336 50 L289 16 L253 32",
  // the upper gable's base
  "M206 66 L300 66",
  // the porch roof and posts
  "M210 146 L216 138 L258 138 L264 146",
  "M215 146 L215 196",
  "M259 146 L259 196",
];

// Finer lines: doors, windows and panels. The doors say "garage" and
// "front door" even at the small size, so the small drawings keep them and
// leave the windows out (the critique, 2026-11-04).
const DOORS = [
  // garage door and panels
  "M26 196 L26 148 L102 148 L102 196",
  "M26 160 L102 160 M26 172 L102 172 M26 184 L102 184",
  // front door
  "M228 196 L228 158 L246 158 L246 196",
];
const WINDOWS = [
  // main floor windows
  "M132 146 L196 146 L196 176 L132 176 Z M164 146 L164 176",
  "M272 148 L292 148 L292 174 L272 174 Z",
  // second floor windows
  "M140 78 L170 78 L170 100 L140 100 Z",
  "M178 78 L200 78 L200 100 L178 100 Z",
  "M236 76 L270 76 L270 98 L236 98 Z M253 76 L253 98",
];

// The whole drawing, in its own units; a small drawing can show part of it.
export const WHOLE_HOUSE: Crop = [0, 8, 350, 196];
export type Crop = [x: number, y: number, width: number, height: number];
// The small drawings in "What do these mean?" are this wide on screen.
const MINI_PX = 128;

export function HouseDiagram({
  states,
  className,
  mini = false,
  crop = WHOLE_HOUSE,
  label,
}: {
  states: Record<HouseSegment, SegmentState>;
  className?: string;
  // The small drawings in "What do these mean?": the house quiet, one part
  // lit, cropped to that part so it reads at the small size.
  mini?: boolean;
  crop?: Crop;
  // Overrides the description a screen reader hears.
  label?: string;
}) {
  // Lines are set in the drawing's units. A small drawing scales them by
  // its own zoom, so its lines and lights look the same size on screen as
  // the big drawing's, however it is cropped.
  const k = mini ? crop[2] / MINI_PX : 1;
  const line = (mini ? 1.2 : 1.5) * k;
  return (
    <svg
      viewBox={crop.join(" ")}
      role="img"
      aria-label={label ?? houseDescription(states)}
      className={cn("house block h-auto w-full text-navy", mini && "house-mini", className)}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g stroke="currentColor" opacity={mini ? 0.35 : 1}>
        <path d="M0 196 L350 196" strokeWidth={k} opacity={0.4} />
        {OUTLINE.map((d) => (
          <path key={d} d={d} strokeWidth={line} />
        ))}
        {(mini ? DOORS : [...DOORS, ...WINDOWS]).map((d) => (
          <path key={d} d={d} strokeWidth={1 * k} opacity={0.4} />
        ))}
      </g>
      {HOUSE_SEGMENTS.map((segment) => (
        <Segment key={segment} segment={segment} state={states[segment]} k={k} mini={mini} />
      ))}
    </svg>
  );
}

// One part, in all three looks at once; only one shows, and changing the
// option cross-fades between them (globals.css, .house-part).
function Segment({ segment, state, k, mini }: { segment: HouseSegment; state: SegmentState; k: number; mini: boolean }) {
  const edge = (mini ? 1.2 : 1.5) * k;
  return (
    <g data-segment={segment} data-state={state} className="house-part">
      {/* Not measured: the plain outline. */}
      <path d={EDGES[segment]} stroke="currentColor" strokeWidth={edge} className="house-none" />
      {/* Measured, not in this option: the roof stays drawn; only the light
          goes, a dashed line where the track would be (navy at 60%, over
          3:1 on white), so it reads as a gap even without colour. */}
      <g className="house-off">
        <path d={EDGES[segment]} stroke="currentColor" strokeWidth={edge} />
        <path d={TRACKS[segment]} stroke="currentColor" strokeWidth={1.5 * k} strokeDasharray={`${4 * k} ${3.5 * k}`} opacity={0.6} />
      </g>
      {/* Lit: the roof edge, the navy track under it and its gold nodes. */}
      <g className="house-on">
        <path d={EDGES[segment]} stroke="currentColor" strokeWidth={edge} />
        <path d={TRACKS[segment]} stroke="currentColor" strokeWidth={4.5 * k} />
        <path d={TRACKS[segment]} stroke="var(--gold)" strokeWidth={3.2 * k} strokeDasharray={`0 ${5.5 * k}`} />
      </g>
    </g>
  );
}
