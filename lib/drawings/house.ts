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
//                               included (the warm or cool pair lights
//                               those of its view)
//   UPPER_FLOOR_BASE, UPPER_RUNS   the upper floor's base (110) and its eaves
//   HousePart, partOf(line)     every line is the garage's, the main floor's
//                               ("lower": walls, porch, sides), the upper
//                               floor's walls ("upper_wall": the band it
//                               stands on, its two wall verticals and its
//                               side) or the rest of the upper floor
//                               ("upper": its roof, eaves and windows).
//                               "eave_detail" is the close eave's own
//                               lines (EAVE_CLOSE), drawn only in that view
//   HOUSE_CROPS                 the views, in drawing units:
//     whole     the house with room around it (page 2)
//     medium    the garage gable, the lit lower eave and the entry, with
//               the upper floor's walls rising out of the top edge, so it
//               reads as a crop of the same two-storey (page 3's day and
//               night pair; for "cover")
//     entry     about 1.67 times closer than medium: the main floor's
//               corner, the main window, the porch and the front door under
//               the lit eave and its wash, the upper floor's wall rising out
//               of the top; its top is kept and its bottom gives way (page
//               4; for "cover")
//     corner    the main block without the garage: both floors and the
//               right front corner with the sides running back, every run
//               ending inside the frame
//     roofline  the upper floor standing on its band: its hip, gable, eave
//               and side running back, every run ending inside the frame,
//               with equal margins (the warm or cool pair)
//     eave      close on the main floor's right front corner by day: the
//               roof's last courses hipping round the corner, the fascia,
//               the slim track tucked under it and turning the corner, the
//               soffit, and the siding and the right window below (Up
//               close; day only, for "cover")
//   HOUSE_CROP_PARTS[crop]      which parts a view draws: a view that leaves
//                               out a part leaves out its lines and lights
//                               entirely, never only clips them
//   HOUSE_CROP_ANCHOR[crop]     where "cover" trims a view: "centre" trims
//                               both ends evenly; "top" keeps its top and
//                               lets the bottom give way (entry)
//   viewOf(crop)                { rect, parts, anchor } for a name or a
//                               [x, y, w, h] (all parts, centred)
//   drawn(line, parts)          whether a line belongs to those parts
//   groundFor(parts)            the ground line a view draws
//   runsFor(runs, parts)        the runs to light in a view
//   fitView(rect, box, fit, anchor?)   the crop on screen: "contain" fits it
//                               whole and centred (an SVG's xMidYMid meet);
//                               "cover" fills the box edge to edge, centred
//                               on the crop (xMidYMid slice), or held at its
//                               top with anchor "top" (xMidYMin slice)
//   visibleRect(rect, box, fit, anchor?)   what of the drawing that box shows
//   preserveAspect(fit, anchor?)   the SVG preserveAspectRatio for a fit
//   cropRect(crop)              a [x, y, w, h] as a Rect
//   trackGap(run), trackProfile(run)   the day drawing's track: a slim strip
//                               tucked under the roof edge, its top on the
//                               edge and its bottom where the lights sit at
//                               night; trackOutline(run) is its ends and
//                               bottom (the top edge is the roof line's)
//   EAVE_CLOSE, CLOSE_TRACK_DEPTH   the close eave's own lines: the roof's
//                               courses and hip, the fascia's top, the
//                               soffit's seams and its line on the wall,
//                               the siding round the corner, and the track
//                               to scale under the fascia
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
// wholly at or above it are the upper floor's: its walls (the band it
// stands on, its two wall verticals and its side, every one starting on the
// band) and the rest (its roof, eaves and windows). A view of the main
// floor can keep the walls and leave out the rest, so the walls rise out of
// the top of a close view, as in a photo crop of a two-storey.
export const UPPER_FLOOR_BASE = 110;
export const UPPER_RUNS: HouseRun[] = ["upper-eave", "upper-gable"];

// The garage's right wall is the main floor's left wall (x 116): lines left
// of it, and somewhere short of it, are the garage's.
const GARAGE_RIGHT = 116;

export type HousePart = "garage" | "lower" | "upper_wall" | "upper" | "eave_detail";
// The parts of the house itself (eave_detail is the close eave's alone).
export const HOUSE_PARTS: readonly HousePart[] = ["garage", "lower", "upper_wall", "upper"];

export function partOf(line: readonly Vec[]): HousePart {
  if (line.every(([, y]) => y <= UPPER_FLOOR_BASE)) {
    return line.some(([, y]) => y === UPPER_FLOOR_BASE) ? "upper_wall" : "upper";
  }
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
// installed app's 1180 x 555 is 2.13:1, the mini's 2.2:1): each is no wider
// than 1.85:1, so "cover" always shows its full width and trims only top
// and bottom, and its sides never move.
//   medium   from just left of the garage gable to between the porch and
//            the right window (268 wide), centred on the main floor: the
//            upper floor's walls always leave through the top (never its
//            eave at 66) and the garage gable's glow and the ground always
//            stay in.
//   entry    from just inside the garage's right end (its lit corner
//            showing at the edge) to between the porch and the right window
//            (160.5 wide): the main floor's corner, the band and the upper
//            floor's wall rising out of the top, the lit eave and its wash,
//            the main window, the porch and the front door; 1.67 times
//            closer than medium on every iPad. Held at its top: the top stays
//            put and the bottom gives way (the ground, then the doors; the
//            main window's foot only on the mini and in rehearsal), never
//            within 1.3 units of the window's foot.
//   eave     the main floor's right front corner by day (80 wide, from
//            between the porch and the right window to past the side's
//            end), no wider than 0.81:1, so a More's tall picture panel
//            (0.81:1 at 1366 x 1024 to 0.96:1 in rehearsal) always shows its
//            full width and trims only top and bottom: the upper floor's
//            walls leave through the top, the eave sits about a quarter of
//            the way down, the right window stays whole, and no siding line
//            runs along any panel's foot (centred at 140.15 for that).
export const HOUSE_CROPS = {
  whole: [-14, 2, 378, 206],
  medium: [-1, 68.5, 268, 145],
  entry: [110, 102, 160.5, 87],
  corner: [94, 6, 258, 200],
  roofline: [116, 10, 226, 106],
  eave: [267, 90.65, 80, 99],
} satisfies Record<string, Crop>;
export type HouseCropName = keyof typeof HOUSE_CROPS;

const BOTH_FLOORS: readonly HousePart[] = HOUSE_PARTS;
const LOWER_FLOOR: readonly HousePart[] = ["garage", "lower", "upper_wall"];

export const HOUSE_CROP_PARTS: Record<HouseCropName, readonly HousePart[]> = {
  whole: BOTH_FLOORS,
  medium: LOWER_FLOOR,
  entry: LOWER_FLOOR,
  corner: ["lower", "upper_wall", "upper"],
  roofline: ["upper_wall", "upper"],
  eave: ["lower", "upper_wall", "eave_detail"],
};

export type CropAnchor = "centre" | "top";
export const HOUSE_CROP_ANCHOR: Record<HouseCropName, CropAnchor> = {
  whole: "centre",
  medium: "centre",
  entry: "top",
  corner: "centre",
  roofline: "centre",
  eave: "centre",
};

export type HouseView = { rect: Rect; parts: readonly HousePart[]; anchor: CropAnchor };

export function viewOf(crop: HouseCropName | Crop): HouseView {
  if (typeof crop === "string") return { rect: cropRect(HOUSE_CROPS[crop]), parts: HOUSE_CROP_PARTS[crop], anchor: HOUSE_CROP_ANCHOR[crop] };
  return { rect: cropRect(crop), parts: BOTH_FLOORS, anchor: "centre" };
}

export function cropRect([x, y, width, height]: Crop): Rect {
  return { x, y, width, height };
}

// ---------------------------------------------------------------- on screen

export type DrawingFit = "contain" | "cover";
export type ViewTransform = { scale: number; x: number; y: number };

// Where the crop lands in a box: screen = drawing x scale + (x, y). The same
// numbers an SVG's viewBox gives with preserveAspectRatio xMidYMid meet
// (contain) or slice (cover; xMidYMin slice with anchor "top"), so the
// light canvas lines up with the lines.
export function fitView(rect: Rect, box: Size, fit: DrawingFit = "contain", anchor: CropAnchor = "centre"): ViewTransform {
  if (!(rect.width > 0) || !(rect.height > 0) || !(box.width > 0) || !(box.height > 0)) return { scale: 1, x: 0, y: 0 };
  const across = box.width / rect.width;
  const down = box.height / rect.height;
  const scale = fit === "cover" ? Math.max(across, down) : Math.min(across, down);
  const top = fit === "cover" && anchor === "top";
  return {
    scale,
    x: (box.width - rect.width * scale) / 2 - rect.x * scale,
    y: (top ? 0 : (box.height - rect.height * scale) / 2) - rect.y * scale,
  };
}

// What of the drawing a box shows, in drawing units.
export function visibleRect(rect: Rect, box: Size, fit: DrawingFit = "contain", anchor: CropAnchor = "centre"): Rect {
  const t = fitView(rect, box, fit, anchor);
  return { x: -t.x / t.scale, y: -t.y / t.scale, width: box.width / t.scale, height: box.height / t.scale };
}

export const preserveAspect = (fit: DrawingFit, anchor: CropAnchor = "centre") =>
  fit === "cover" ? (anchor === "top" ? "xMidYMin slice" : "xMidYMid slice") : "xMidYMid meet";

// ---------------------------------------------------------------- the track

// The track by day: a slim strip tucked under the roof edge, its top on the
// edge (so it never draws a line of its own beside it) and its bottom on the
// line the lights follow at night, so the day and night halves line up. Its
// ends stop short of the roof edge's, as the track does. The day drawing
// fills it white and draws only its ends and bottom, faintly.
export function trackProfile(run: HouseRun): Vec[] {
  const bottom = HOUSE_EAVES[run];
  return [...trackTop(run), ...bottom.slice().reverse()];
}

// Its ends and bottom, as one open line: down the left end, along the
// bottom, up the right end.
export function trackOutline(run: HouseRun): Vec[] {
  const top = trackTop(run);
  return [top[0], ...HOUSE_EAVES[run], top[top.length - 1]];
}

// How deep the strip is: the least distance from the line the lights follow
// up to the roof edge (3.5 on a flat run).
export function trackGap(run: HouseRun): number {
  const bottom = HOUSE_EAVES[run];
  const top = trackTop(run);
  return Math.min(...bottom.map(([x, y], at) => Math.hypot(top[at][0] - x, top[at][1] - y)));
}

// Each point of the eave line moved square to it (mitred at a bend) until
// it meets the roof edge.
function trackTop(run: HouseRun): Vec[] {
  const bottom = HOUSE_EAVES[run];
  const edge = HOUSE_EDGES[run];
  return offsetLine(bottom, 1).map(([ox, oy], at) => {
    const [x, y] = bottom[at];
    const reach = reachEdge([x, y], [ox - x, oy - y], edge);
    return [x + (ox - x) * reach, y + (oy - y) * reach] as Vec;
  });
}

// How far along `dir` from `from` the polyline is first met (in lengths of
// dir); a point never met stays where it is.
function reachEdge([px, py]: Vec, [dx, dy]: Vec, line: readonly Vec[]): number {
  let best = Infinity;
  for (let at = 1; at < line.length; at++) {
    const [ax, ay] = line[at - 1];
    const [bx, by] = line[at];
    const [ex, ey] = [bx - ax, by - ay];
    const cross = dx * ey - dy * ex;
    if (Math.abs(cross) < 1e-12) continue;
    const t = ((ax - px) * ey - (ay - py) * ex) / cross;
    const s = ((ax - px) * dy - (ay - py) * dx) / cross;
    if (t > 0 && s >= -1e-9 && s <= 1 + 1e-9) best = Math.min(best, t);
  }
  return Number.isFinite(best) ? best : 0;
}

// ---------------------------------------------------------------- the close eave

// The main floor's right front corner close up, by day (the "eave" view, Up
// close): what a visitor on the front walk sees looking up at the eave. On
// the front, between the band (110) and the roof edge (the lower eave's
// edge, 120): the roof's last courses and the fascia, 2.4 units (about
// 15 cm) deep. Under the fascia, the track to scale (about 8 cm), tucked
// against its foot and turning the corner with it; behind the track, the
// soffit's underside with its panel seams, meeting the wall at 124; then the
// siding, stopping at the windows and the porch and wrapping the corner onto
// the side. The roof hips back at the corner, its courses and fascia
// running back with the side. Drawn only in that view, where it replaces
// the elevation's exaggerated track.
const CLOSE_LEFT = 116;
const CORNER = 306;
const WALL_RIGHT = 300;
const SIDE_WALL = 336;
const FASCIA_DEPTH = 2.4;
const SOFFIT_FOOT = 124;
const SEAM_EVERY = 5.6;
// The seams start here so none falls within 2 units of the wall's corner
// (300) or the view's left edge (267).
const SEAM_FROM = 124.4;
const SIDING_EVERY = 2.8;
export const CLOSE_TRACK_DEPTH = 1.2;
// The sides run back up to the right: 16 up for every 36 across.
const BACK: Vec = [36, -16];
const back = ([x, y]: Vec, by = 1): Vec => [x + BACK[0] * by, y + BACK[1] * by];
const SIDE_END = 342;
const along = (x: number) => (x - CORNER) / BACK[0];
const across = (y: number, x0: number, x1: number): Vec[] => [
  [x0, y],
  [x1, y],
];

// The track: along the front from the eave's start to the corner, then back
// along the side to where the side's lights end (339).
const TRACK_END = along(339);
const CLOSE_TRACK: Vec[] = [
  [119, 120],
  [CORNER, 120],
  back([CORNER, 120], TRACK_END),
  back([CORNER, 120 + CLOSE_TRACK_DEPTH], TRACK_END),
  [CORNER, 120 + CLOSE_TRACK_DEPTH],
  [119, 120 + CLOSE_TRACK_DEPTH],
];

// Where the siding stops on the front: the two main-floor windows (with a
// unit of trim round each) and the porch, from its roof down.
const OPENINGS: [x0: number, y0: number, x1: number, y1: number][] = [
  [131, 145, 197, 177],
  [271, 147, 293, 175],
  [209, 137, 265, 197],
];

// One course of siding at y on the front, broken around the openings it
// meets, and its run back along the side wall from the corner.
function sidingAt(y: number): Vec[][] {
  const gaps = OPENINGS.filter(([, y0, , y1]) => y > y0 && y < y1).sort((a, b) => a[0] - b[0]);
  const pieces: Vec[][] = [];
  let from = CLOSE_LEFT;
  for (const [x0, , x1] of gaps) {
    if (x0 > from) pieces.push(across(y, from, x0));
    from = Math.max(from, x1);
  }
  if (from < WALL_RIGHT) pieces.push(across(y, from, WALL_RIGHT));
  pieces.push([[WALL_RIGHT, y], back([WALL_RIGHT, y], along(SIDE_WALL + CORNER - WALL_RIGHT))]);
  return pieces;
}

const SIDING_ROWS = Array.from({ length: Math.floor((196 - 1 - SOFFIT_FOOT) / SIDING_EVERY) }, (_, at) => SOFFIT_FOOT + SIDING_EVERY * (at + 1));
// The roof's last two courses above the fascia, on the front and back along
// the side, meeting at the hip.
const COURSES = [120 - FASCIA_DEPTH - 2.6, 120 - FASCIA_DEPTH - 5.1];
// The hip: from the band's end down to the fascia's corner.
const HIP: Vec[] = [
  [WALL_RIGHT, 110],
  [CORNER, 120 - FASCIA_DEPTH],
];
const hipX = (y: number) => WALL_RIGHT + ((y - 110) / (120 - FASCIA_DEPTH - 110)) * (CORNER - WALL_RIGHT);

export const EAVE_CLOSE = {
  // Full-weight lines: the fascia's top edge, front and side, its corner and
  // its far end on the side (so it never ends open), the hip, and the
  // soffit's line on the front wall.
  edges: [
    [[CLOSE_LEFT, 120 - FASCIA_DEPTH], [CORNER, 120 - FASCIA_DEPTH], back([CORNER, 120 - FASCIA_DEPTH], along(SIDE_END))],
    [[CORNER, 120 - FASCIA_DEPTH], [CORNER, 120]],
    [back([CORNER, 120 - FASCIA_DEPTH], along(SIDE_END)), back([CORNER, 120], along(SIDE_END))],
    HIP,
    across(SOFFIT_FOOT, CLOSE_LEFT, WALL_RIGHT),
  ] as Vec[][],
  // Fine lines: the roof's last courses, the soffit's panel seams (every
  // 5.6 units, about 36 cm), and the siding (every 2.8, about 18 cm).
  fine: [
    ...COURSES.map((y): Vec[] => [[CLOSE_LEFT, y], [hipX(y), y], back([hipX(y), y], along(SIDE_END))]),
    ...Array.from({ length: Math.floor((WALL_RIGHT - 2 - SEAM_FROM) / SEAM_EVERY) + 1 }, (_, at): Vec[] => [
      [SEAM_FROM + at * SEAM_EVERY, 120],
      [SEAM_FROM + at * SEAM_EVERY, SOFFIT_FOOT],
    ]),
    ...SIDING_ROWS.flatMap(sidingAt),
  ] as Vec[][],
  // The track, white, its top on the fascia's foot: the strip, and its ends
  // and bottom.
  track: CLOSE_TRACK,
  trackOutline: [CLOSE_TRACK[0], CLOSE_TRACK[5], CLOSE_TRACK[4], CLOSE_TRACK[3], CLOSE_TRACK[2]] as Vec[],
} as const;

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
