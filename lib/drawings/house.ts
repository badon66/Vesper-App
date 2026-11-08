import type { Rect, Size, Vec } from "@/lib/lights/place";

// The shared two-storey house (round 7): one original line drawing for the
// deck's fallbacks, lifted from the quote link's house diagram
// (quote-link-rework: components/quote-link/house-diagram.tsx and
// lib/quote-link/house.ts, 2026-11-04; that branch keeps its own copy) and
// inverted for the deck: Night Text hairlines on navy, no fills, no text,
// its eaves lit by the light picker's own renderer. Pure geometry, in the
// drawing's own units (350 wide); no React.
//
// A garage on the left with a front gable, a porch over the front door, the
// main floor's roof edge, the upper roof with a front gable, and the roof
// edges running back on the right.
//
// CONTRACT
//   HOUSE_RUNS, HouseRun        the eight runs (the quote link's segments)
//   HOUSE_EDGES[run]            each roof edge, as a polyline
//   HOUSE_EAVES[run]            where the track sits under that edge: the
//                               eave rooflines the lights follow, as polylines
//   HOUSE_OUTLINE, HOUSE_DOORS, HOUSE_WINDOWS, HOUSE_GROUND   the rest, as polylines
//   LIT_RUNS                    the runs the deck's drawings light (eaves,
//                               gables and the garage line)
//   houseLines(runs?)           the eaves to light, for placeAlong
//   HOUSE_UNITS_PER_METRE       the drawing's scale: its double garage door
//                               (76 units) is 16 ft, as a trace's scale is set
//   CORNER_RUNS                 the main block's runs, the sides running back
//                               included (the corner pair)
//   UPPER_FLOOR_BASE, UPPER_RUNS   the upper floor's base (110) and its eaves
//   HousePart, partOf(line)     every line is the garage's, the main floor's
//                               ("lower": walls, porch, sides) or the upper
//                               floor's (the roof band it stands on included)
//   HOUSE_CROPS                 the views, in drawing units:
//     whole     the house with room around it (page 2)
//     medium    the garage gable, the lower eave and the entry, lower floor
//               only (page 3's day and night pair)
//     entry     tight on the garage and entry, lower floor only (page 4)
//     corner    the main block without the garage: both floors and the
//               right front corner with the sides running back, every run
//               ending inside the frame (the warm or cool pair)
//     roofline  the upper floor's gable and eave, upper floor only
//   HOUSE_CROP_PARTS[crop]      which parts a view draws: a view that leaves
//                               out a part leaves out its lines and lights
//                               entirely, never only clips them
//   viewOf(crop)                { rect, parts } for a name or a [x, y, w, h]
//   drawn(line, parts)          whether a line belongs to those parts
//   groundFor(parts)            the ground line a view draws
//   runsFor(runs, parts)        the runs to light in a view
//   fitView(rect, box, fit)     the crop on screen: "contain" fits it whole
//                               and centred (an SVG's xMidYMid meet);
//                               "cover" fills the box edge to edge, centred
//                               on the crop (xMidYMid slice)
//   visibleRect(rect, box, fit) what of the drawing that box shows
//   preserveAspect(fit)         the SVG preserveAspectRatio for a fit
//   cropRect(crop)              a [x, y, w, h] as a Rect
//   TRACK_DEPTH, trackProfile(run)   the day drawing's track: a slim closed
//                               profile tucked under the roof edge, its
//                               bottom where the lights sit at night
//   pathD(polyline, close?)     an SVG path's d

export const HOUSE_RUNS = [
  "garage-gable",
  "garage",
  "lower-eave",
  "porch",
  "upper-eave",
  "upper-gable",
  "lower-sides",
  "upper-sides",
] as const;
export type HouseRun = (typeof HOUSE_RUNS)[number];

export type Crop = [x: number, y: number, width: number, height: number];

// The roof edges.
export const HOUSE_EDGES: Record<HouseRun, Vec[]> = {
  "garage-gable": [
    [6, 128],
    [61, 94],
    [116, 128],
  ],
  garage: [
    [6, 128],
    [116, 128],
  ],
  "lower-eave": [
    [116, 120],
    [306, 120],
  ],
  porch: [
    [210, 146],
    [264, 146],
  ],
  "upper-eave": [
    [122, 66],
    [206, 66],
  ],
  "upper-gable": [
    [206, 66],
    [253, 32],
    [300, 66],
  ],
  "lower-sides": [
    [306, 120],
    [342, 104],
  ],
  "upper-sides": [
    [300, 66],
    [336, 50],
  ],
};

// The same edges a few units in and down: where the track sits, under the
// soffit. The lights follow these.
export const HOUSE_EAVES: Record<HouseRun, Vec[]> = {
  "garage-gable": [
    [12, 128.5],
    [61, 98],
    [110, 128.5],
  ],
  garage: [
    [9, 131.5],
    [113, 131.5],
  ],
  "lower-eave": [
    [119, 123.5],
    [303, 123.5],
  ],
  porch: [
    [213, 149.5],
    [261, 149.5],
  ],
  "upper-eave": [
    [125, 69.5],
    [203, 69.5],
  ],
  "upper-gable": [
    [212, 66.5],
    [253, 36],
    [294, 66.5],
  ],
  "lower-sides": [
    [306, 124],
    [339, 109.5],
  ],
  "upper-sides": [
    [300, 70],
    [333, 55.5],
  ],
};

// Walls, roofs that carry no lights, the porch's roof and posts.
export const HOUSE_OUTLINE: Vec[][] = [
  // garage walls
  [
    [12, 128],
    [12, 196],
  ],
  // main floor walls (the left one up to its eave, beside the garage's
  // gable), and the side running back
  [
    [116, 120],
    [116, 196],
  ],
  [
    [300, 120],
    [300, 196],
  ],
  [
    [300, 196],
    [336, 180],
    [336, 107],
  ],
  // the roof band between the floors, and the second floor's walls
  [
    [122, 110],
    [300, 110],
  ],
  [
    [128, 110],
    [128, 66],
  ],
  [
    [294, 110],
    [294, 66],
  ],
  [
    [294, 110],
    [330, 94],
    [330, 53],
  ],
  // the upper roof: hip on the left, ridge, and the side running back
  [
    [122, 66],
    [150, 42],
    [239, 42],
  ],
  [
    [336, 50],
    [289, 16],
    [253, 32],
  ],
  // the upper gable's base
  [
    [206, 66],
    [300, 66],
  ],
  // the porch roof and posts
  [
    [210, 146],
    [216, 138],
    [258, 138],
    [264, 146],
  ],
  [
    [215, 146],
    [215, 196],
  ],
  [
    [259, 146],
    [259, 196],
  ],
];

// Finer lines: the doors (with the garage door's panels) and the windows.
export const HOUSE_DOORS: Vec[][] = [
  [
    [26, 196],
    [26, 148],
    [102, 148],
    [102, 196],
  ],
  [
    [26, 160],
    [102, 160],
  ],
  [
    [26, 172],
    [102, 172],
  ],
  [
    [26, 184],
    [102, 184],
  ],
  [
    [228, 196],
    [228, 158],
    [246, 158],
    [246, 196],
  ],
];

const box = (x0: number, y0: number, x1: number, y1: number): Vec[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
  [x0, y0],
];

export const HOUSE_WINDOWS: Vec[][] = [
  // main floor
  box(132, 146, 196, 176),
  [
    [164, 146],
    [164, 176],
  ],
  box(272, 148, 292, 174),
  // second floor
  box(140, 78, 170, 100),
  box(178, 78, 200, 100),
  box(236, 76, 270, 98),
  [
    [253, 76],
    [253, 98],
  ],
];

// The ground: along the front, then up the side wall's base as it runs back,
// so the house stands on it and never floats at the right.
export const HOUSE_GROUND: Vec[] = [
  [-40, 196],
  [300, 196],
  [336, 180],
];

// The runs the deck lights: the eaves, both gables and the garage line, as
// the hero photo's "every run lit". Not the porch or the sides running back.
export const LIT_RUNS: HouseRun[] = ["garage-gable", "garage", "lower-eave", "upper-eave", "upper-gable"];

// The corner pair lights the main block's front and the sides running back,
// so the light turns the corner as it does on a house lit all the way round.
export const CORNER_RUNS: HouseRun[] = ["lower-eave", "upper-eave", "upper-gable", "lower-sides", "upper-sides"];

export function houseLines(runs: readonly HouseRun[] = LIT_RUNS): Vec[][] {
  return runs.map((run) => HOUSE_EAVES[run]);
}

// The double garage door is 76 units wide, and 16 ft: the drawing's scale,
// so its lights sit at the real 0.2 m spacing.
export const HOUSE_GARAGE_DOOR_UNITS = 76;
export const HOUSE_UNITS_PER_METRE = HOUSE_GARAGE_DOOR_UNITS / (16 * 0.3048);

// The upper floor's base: the roof band between the floors (110). Lines
// wholly at or above it are the upper floor's, the band included: without
// the upper floor, the main floor's roof is its lit edge alone, so no line
// is left floating over it.
export const UPPER_FLOOR_BASE = 110;
export const UPPER_RUNS: HouseRun[] = ["upper-eave", "upper-gable"];

// The garage's right wall is the main floor's left wall (x 116): lines left
// of it, and somewhere short of it, are the garage's.
const GARAGE_RIGHT = 116;

export type HousePart = "garage" | "lower" | "upper";
export const HOUSE_PARTS: readonly HousePart[] = ["garage", "lower", "upper"];

export function partOf(line: readonly Vec[]): HousePart {
  if (line.every(([, y]) => y <= UPPER_FLOOR_BASE)) return "upper";
  if (line.every(([x]) => x <= GARAGE_RIGHT) && line.some(([x]) => x < GARAGE_RIGHT)) return "garage";
  return "lower";
}

// Whether a view of these parts draws the line.
export function drawn(line: readonly Vec[], parts: readonly HousePart[]): boolean {
  return parts.includes(partOf(line));
}

// The runs a view lights: only those of the parts it draws.
export function runsFor(runs: readonly HouseRun[], parts: readonly HousePart[]): HouseRun[] {
  return runs.filter((run) => parts.includes(partOf(HOUSE_EDGES[run])));
}

// The ground a view stands the house on: from beyond the garage, or, with
// no garage, from just short of the main floor's left wall; none for the
// upper floor alone.
export function groundFor(parts: readonly HousePart[]): Vec[] | null {
  if (!parts.includes("lower")) return null;
  if (parts.includes("garage")) return HOUSE_GROUND;
  return [[GARAGE_RIGHT - 12, HOUSE_GROUND[0][1]], ...HOUSE_GROUND.slice(1)];
}

// Views of the drawing, in drawing units. The close views are shaped for
// the iPads' photo areas (1180 x 574 is 2.06:1, 1366 x 737 is 1.85:1, the
// mini's 2.2:1), so "cover" trims only sky, ground and the side running
// back: entry is 1.85:1, so its sides never move and it always stops
// between the porch and the right window; medium is 1.95:1 with room at
// both sides for the little the iPad Pro trims there. The garage gable,
// the porch and every light's glow stay whole on every iPad, and every
// side edge falls on a natural break (the unit tests check each size).
export const HOUSE_CROPS = {
  whole: [-14, 2, 378, 206],
  medium: [-10, 56, 334, 171],
  entry: [-4, 68, 274, 148],
  corner: [94, 6, 258, 200],
  roofline: [112, 10, 236, 104],
} satisfies Record<string, Crop>;
export type HouseCropName = keyof typeof HOUSE_CROPS;

const BOTH_FLOORS: readonly HousePart[] = HOUSE_PARTS;
const LOWER_FLOOR: readonly HousePart[] = ["garage", "lower"];

export const HOUSE_CROP_PARTS: Record<HouseCropName, readonly HousePart[]> = {
  whole: BOTH_FLOORS,
  medium: LOWER_FLOOR,
  entry: LOWER_FLOOR,
  corner: ["lower", "upper"],
  roofline: ["upper"],
};

export type HouseView = { rect: Rect; parts: readonly HousePart[] };

export function viewOf(crop: HouseCropName | Crop): HouseView {
  if (typeof crop === "string") return { rect: cropRect(HOUSE_CROPS[crop]), parts: HOUSE_CROP_PARTS[crop] };
  return { rect: cropRect(crop), parts: BOTH_FLOORS };
}

export function cropRect([x, y, width, height]: Crop): Rect {
  return { x, y, width, height };
}

// ---------------------------------------------------------------- on screen

export type DrawingFit = "contain" | "cover";
export type ViewTransform = { scale: number; x: number; y: number };

// Where the crop lands in a box: screen = drawing x scale + (x, y). The same
// numbers an SVG's viewBox gives with preserveAspectRatio xMidYMid meet
// (contain) or slice (cover), so the light canvas lines up with the lines.
export function fitView(rect: Rect, box: Size, fit: DrawingFit = "contain"): ViewTransform {
  if (!(rect.width > 0) || !(rect.height > 0) || !(box.width > 0) || !(box.height > 0)) return { scale: 1, x: 0, y: 0 };
  const across = box.width / rect.width;
  const down = box.height / rect.height;
  const scale = fit === "cover" ? Math.max(across, down) : Math.min(across, down);
  return {
    scale,
    x: (box.width - rect.width * scale) / 2 - rect.x * scale,
    y: (box.height - rect.height * scale) / 2 - rect.y * scale,
  };
}

// What of the drawing a box shows, in drawing units.
export function visibleRect(rect: Rect, box: Size, fit: DrawingFit = "contain"): Rect {
  const t = fitView(rect, box, fit);
  return { x: -t.x / t.scale, y: -t.y / t.scale, width: box.width / t.scale, height: box.height / t.scale };
}

export const preserveAspect = (fit: DrawingFit) => (fit === "cover" ? "xMidYMid slice" : "xMidYMid meet");

// ---------------------------------------------------------------- the track

// The track by day, as the eave in section draws it: a slim closed profile
// under the roof edge, TRACK_DEPTH deep, its bottom on the line the lights
// follow at night, so the day and night halves line up. Its ends stop short
// of the roof edge's, as the track does.
export const TRACK_DEPTH = 2.5;

export function trackProfile(run: HouseRun, depth = TRACK_DEPTH): Vec[] {
  const bottom = HOUSE_EAVES[run];
  return [...offsetLine(bottom, depth), ...bottom.slice().reverse()];
}

// A polyline moved `d` toward the roof edge, square to each segment, mitred
// at each bend. The eaves run left to right, so the edge is on the left of
// each segment's direction (up on screen).
function offsetLine(line: readonly Vec[], d: number): Vec[] {
  const normals = line.slice(1).map(([x, y], at) => {
    const [px, py] = line[at];
    const length = Math.hypot(x - px, y - py) || 1;
    return [(y - py) / length, -(x - px) / length] as Vec;
  });
  return line.map(([x, y], at) => {
    const before = normals[Math.max(0, at - 1)];
    const after = normals[Math.min(normals.length - 1, at)];
    const mx = before[0] + after[0];
    const my = before[1] + after[1];
    const mLength = Math.hypot(mx, my) || 1;
    const [ux, uy] = [mx / mLength, my / mLength];
    const reach = d / Math.max(0.2, ux * before[0] + uy * before[1]);
    return [x + ux * reach, y + uy * reach] as Vec;
  });
}

export function pathD(line: readonly Vec[], close = false): string {
  const d = line.map(([x, y], at) => `${at === 0 ? "M" : "L"}${round(x)} ${round(y)}`).join(" ");
  return close ? `${d} Z` : d;
}

const round = (n: number) => Math.round(n * 100) / 100;
