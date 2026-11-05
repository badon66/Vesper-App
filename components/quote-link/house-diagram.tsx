import { HOUSE_SEGMENTS, houseDescription, type HouseSegment, type SegmentState } from "@/lib/quote-link/house";
import { cn } from "@/lib/utils";

// The house diagram (2026-11-04): an original line drawing in navy, with
// gold where the lights go. A lit part is a navy track with gold nodes,
// tucked just under the roof edge, as the product sits under the soffit.
// A part switched off is a dashed line; a part not in the quote is the
// plain outline. One drawing for every house; see lib/quote-link/house.ts.

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

// Finer lines: doors, windows and panels.
const DETAILS = [
  // garage door and panels
  "M26 196 L26 148 L102 148 L102 196",
  "M26 160 L102 160 M26 172 L102 172 M26 184 L102 184",
  // front door
  "M228 196 L228 158 L246 158 L246 196",
  // main floor windows
  "M132 146 L196 146 L196 176 L132 176 Z M164 146 L164 176",
  "M272 148 L292 148 L292 174 L272 174 Z",
  // second floor windows
  "M140 78 L170 78 L170 100 L140 100 Z",
  "M178 78 L200 78 L200 100 L178 100 Z",
  "M236 76 L270 76 L270 98 L236 98 Z M253 76 L253 98",
];

export function HouseDiagram({
  states,
  className,
  mini = false,
  label,
}: {
  states: Record<HouseSegment, SegmentState>;
  className?: string;
  // The small drawings in "What do these mean?": the house quiet, one part lit.
  mini?: boolean;
  // Overrides the description a screen reader hears.
  label?: string;
}) {
  return (
    <svg
      viewBox="0 8 350 196"
      role="img"
      aria-label={label ?? houseDescription(states)}
      className={cn("house block h-auto w-full text-navy", mini && "house-mini", className)}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <g stroke="currentColor" opacity={mini ? 0.35 : 1}>
        <path d="M0 196 L350 196" strokeWidth={mini ? 2 : 1} opacity={0.4} />
        {OUTLINE.map((d) => (
          <path key={d} d={d} strokeWidth={mini ? 2.6 : 1.5} />
        ))}
        {/* Too fine to read at the small size, so the minis leave them out. */}
        {mini
          ? null
          : DETAILS.map((d) => <path key={d} d={d} strokeWidth={1} opacity={0.4} />)}
      </g>
      {HOUSE_SEGMENTS.map((segment) => (
        <Segment key={segment} segment={segment} state={states[segment]} mini={mini} />
      ))}
    </svg>
  );
}

// One part, in all three looks at once; only one shows, and switching
// cross-fades between them (globals.css, .house-part).
// The small drawings are about 40% of the size, so their lines are drawn
// heavier to read the same.
function Segment({ segment, state, mini }: { segment: HouseSegment; state: SegmentState; mini: boolean }) {
  const edge = mini ? 2.6 : 1.5;
  return (
    <g data-segment={segment} data-state={state} className="house-part">
      {/* Not in the quote: the plain outline. */}
      <path d={EDGES[segment]} stroke="currentColor" strokeWidth={edge} className="house-none" />
      {/* Switched off: dashed, so it reads as a gap even without colour. */}
      <path d={EDGES[segment]} stroke="currentColor" strokeWidth={edge} strokeDasharray="4 4" className="house-off" />
      {/* Lit: the roof edge, the navy track under it and its gold nodes. */}
      <g className="house-on">
        <path d={EDGES[segment]} stroke="currentColor" strokeWidth={edge} />
        <path d={TRACKS[segment]} stroke="currentColor" strokeWidth={mini ? 9 : 4.5} />
        <path d={TRACKS[segment]} stroke="var(--gold)" strokeWidth={mini ? 5 : 2.4} strokeDasharray={mini ? "0 11" : "0 6"} />
      </g>
    </g>
  );
}
