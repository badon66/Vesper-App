import type { Rect, Vec } from "@/lib/lights/place";

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
//   CORNER_RUNS                 LIT_RUNS and the sides running back (the corner pair)
//   UPPER_FLOOR_BASE, UPPER_RUNS   the upper floor drawn alone and its eaves (the phone)
//   HOUSE_CROPS                 whole, entry (garage and entry), corner (the
//                               right front corner, both floors), roofline (the
//                               upper floor's gable and eave, beside the phone)
//   pathD(polyline)             an SVG path's d

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
  // main floor walls, and the side running back
  [
    [116, 128],
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

export const HOUSE_GROUND: Vec[] = [
  [-40, 196],
  [390, 196],
];

// The runs the deck lights: the eaves, both gables and the garage line, as
// the hero photo's "every run lit". Not the porch or the sides running back.
export const LIT_RUNS: HouseRun[] = ["garage-gable", "garage", "lower-eave", "upper-eave", "upper-gable"];

// The corner pair lights the front and the sides running back, so the light
// turns the corner as it does on a house lit all the way round.
export const CORNER_RUNS: HouseRun[] = [...LIT_RUNS, "lower-sides", "upper-sides"];

export function houseLines(runs: readonly HouseRun[] = LIT_RUNS): Vec[][] {
  return runs.map((run) => HOUSE_EAVES[run]);
}

// The double garage door is 76 units wide, and 16 ft: the drawing's scale,
// so its lights sit at the real 0.2 m spacing.
export const HOUSE_GARAGE_DOOR_UNITS = 76;
export const HOUSE_UNITS_PER_METRE = HOUSE_GARAGE_DOOR_UNITS / (16 * 0.3048);

// Views of the drawing, with room around the house.
export const HOUSE_CROPS = {
  whole: [-14, 2, 378, 206],
  entry: [-4, 84, 284, 118],
  corner: [204, 12, 148, 190],
  roofline: [112, 10, 236, 104],
} satisfies Record<string, Crop>;
export type HouseCropName = keyof typeof HOUSE_CROPS;

// The upper floor's base: the upper floor drawn alone, above it, beside the
// phone, with only its own eaves lit.
export const UPPER_FLOOR_BASE = 110;
export const UPPER_RUNS: HouseRun[] = ["upper-eave", "upper-gable"];

export function cropRect([x, y, width, height]: Crop): Rect {
  return { x, y, width, height };
}

export function pathD(line: Vec[]): string {
  return line.map(([x, y], at) => `${at === 0 ? "M" : "L"}${round(x)} ${round(y)}`).join(" ");
}

const round = (n: number) => Math.round(n * 100) / 100;
