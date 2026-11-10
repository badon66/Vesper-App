import { describe, expect, it } from "vitest";

import { EAVE_LABEL_COLUMN, EAVE_LABELS, EAVE_LIGHT, EAVE_SHAPES, EAVE_TRACK, EAVE_VIEW, eaveFit, eaveLabelsFor } from "@/lib/drawings/eave";
import {
  CLOSE_TRACK_DEPTH,
  CORNER_RUNS,
  drawn,
  EAVE_CLOSE,
  fitView,
  groundFor,
  HOUSE_CROP_ANCHOR,
  HOUSE_CROP_PARTS,
  HOUSE_CROPS,
  HOUSE_DOORS,
  HOUSE_EAVES,
  HOUSE_EDGES,
  HOUSE_GROUND,
  HOUSE_OUTLINE,
  HOUSE_RUNS,
  HOUSE_UNITS_PER_METRE,
  HOUSE_WINDOWS,
  LIT_RUNS,
  partOf,
  pathD,
  preserveAspect,
  runsFor,
  trackGap,
  trackOutline,
  trackProfile,
  UPPER_FLOOR_BASE,
  UPPER_RUNS,
  viewOf,
  visibleRect,
  houseLines,
  type HouseCropName,
  type HousePart,
} from "@/lib/drawings/house";
import { PAIR_CAPTION, PAIR_CROP, pairLayout, pairSpace } from "@/lib/drawings/pair";
import { PHONE_BODY, PHONE_OVER, PHONE_SCREEN, PHONE_VIEW, phoneScene } from "@/lib/drawings/phone";
import { fitContain } from "@/lib/lights/frame";
import { BLOOM_RATIO } from "@/lib/lights/glow";
import { boundsOf, LIGHT_SPACING_M, placeAlong, type Rect, type Size, type Vec } from "@/lib/lights/place";

const inside = ([x, y]: Vec, [cx, cy, cw, ch]: readonly number[]) => x >= cx && x <= cx + cw && y >= cy && y <= cy + ch;
const within = ([x, y]: Vec, r: Rect, pad = 0) => x >= r.x + pad && x <= r.x + r.width - pad && y >= r.y + pad && y <= r.y + r.height - pad;

// The photo area above the band (the deck's height less bandHeight) on each
// iPad the deck is used on, landscape: Air and 10th generation, Pro 13,
// Pro 11, mini, 9th generation and the older 9.7 inch in Safari; the Air
// and the Pro 13 in the installed app (1180 x 796, 1366 x 1000), and the
// rehearsal view (about 1180 x 764).
const IPAD_AIR: Size = { width: 1180, height: 574 };
const IPAD_PRO: Size = { width: 1366, height: 737.2 };
const INSTALLED: Size[] = [
  { width: 1180, height: 554.8 },
  { width: 1366, height: 718.1 },
];
const REHEARSAL: Size = { width: 1180, height: 529.2 };
const PHOTO_AREAS: Size[] = [
  IPAD_AIR,
  IPAD_PRO,
  ...INSTALLED,
  REHEARSAL,
  { width: 1194, height: 585.2 },
  { width: 1133, height: 513.2 },
  { width: 1080, height: 566 },
  { width: 1024, height: 532.4 },
];
// A More's picture panel (the left 56%, ending 78 px above the foot) at
// 1180 x 820, 1366 x 1024, 1180 x 796, 1366 x 1000 and in rehearsal.
const MORE_PANELS: Size[] = [
  { width: 660.8, height: 742 },
  { width: 765, height: 946 },
  { width: 660.8, height: 718 },
  { width: 765, height: 922 },
  { width: 660.8, height: 686 },
];
// A light's glow reaches its bloom, BLOOM_RATIO pitches out.
const PITCH = LIGHT_SPACING_M * HOUSE_UNITS_PER_METRE;
const GLOW = BLOOM_RATIO * PITCH;

// Every line a view draws.
function drawnLines(parts: readonly HousePart[]): Vec[][] {
  const lines = [...HOUSE_OUTLINE, ...HOUSE_DOORS, ...HOUSE_WINDOWS, ...HOUSE_RUNS.map((run) => HOUSE_EDGES[run])].filter((line) => drawn(line, parts));
  const ground = groundFor(parts);
  return ground ? [...lines, ground] : lines;
}
// How far a point is from a polyline.
function distanceToLine([px, py]: Vec, line: readonly Vec[]): number {
  let best = Infinity;
  for (let at = 1; at < line.length; at++) {
    const [ax, ay] = line[at - 1];
    const [bx, by] = line[at];
    const [ex, ey] = [bx - ax, by - ay];
    const t = Math.max(0, Math.min(1, ((px - ax) * ex + (py - ay) * ey) / (ex * ex + ey * ey)));
    best = Math.min(best, Math.hypot(px - (ax + t * ex), py - (ay + t * ey)));
  }
  return best;
}
// Whether a line crosses an edge of the frame within the frame's span: a
// level line y (top or bottom) between x0 and x1, or an upright x (a side)
// between y0 and y1.
function crossesEdge(line: Vec[], edge: "x" | "y", at: number, from: number, to: number): boolean {
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]];
    const [u, v] = edge === "y" ? [1, 0] : [0, 1];
    if ((a[u] - at) * (b[u] - at) >= 0) continue;
    const t = (at - a[u]) / (b[u] - a[u]);
    const across = a[v] + t * (b[v] - a[v]);
    if (across > from && across < to) return true;
  }
  return false;
}
const sameLine = (a: Vec[], b: Vec[]) => pathD(a) === pathD(b);

describe("the shared house", () => {
  it("is drawn from plain polylines", () => {
    const all = [...HOUSE_OUTLINE, ...HOUSE_DOORS, ...HOUSE_WINDOWS, ...Object.values(HOUSE_EDGES), ...Object.values(HOUSE_EAVES)];
    for (const line of all) {
      expect(line.length).toBeGreaterThanOrEqual(2);
      for (const [x, y] of line) {
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
      }
    }
    expect(pathD([[0, 0], [10.126, 5]])).toBe("M0 0 L10.13 5");
    expect(pathD([[0, 0], [1, 1]], true)).toBe("M0 0 L1 1 Z");
  });

  it("tucks every track just under its roof edge", () => {
    for (const run of HOUSE_RUNS) {
      const edge = boundsOf([HOUSE_EDGES[run]])!;
      const track = boundsOf([HOUSE_EAVES[run]])!;
      expect(track.x, run).toBeGreaterThanOrEqual(edge.x - 0.01);
      expect(track.x + track.width, run).toBeLessThanOrEqual(edge.x + edge.width + 0.01);
      expect(track.y + track.height, run).toBeGreaterThan(edge.y + edge.height - 0.01);
      expect(track.y + track.height - (edge.y + edge.height), run).toBeLessThanOrEqual(6);
    }
  });

  it("is lit at the real spacing: its 76-unit garage door is a 16 ft door", () => {
    expect(HOUSE_UNITS_PER_METRE).toBeCloseTo(76 / 4.8768, 9);
    const placement = placeAlong(houseLines(), HOUSE_UNITS_PER_METRE);
    expect(placement.pitch).toBeCloseTo(0.2 * HOUSE_UNITS_PER_METRE, 9);
    // About 37 m of eaves, gables and garage line: around 185 lights.
    expect(placement.count).toBeGreaterThan(170);
    expect(placement.count).toBeLessThan(200);
    expect(placement.capped).toBe(false);
  });

  it("lights the eaves, both gables and the garage line, not the porch", () => {
    expect(LIT_RUNS).toEqual(["garage-gable", "garage", "lower-eave", "upper-eave", "upper-gable"]);
    expect(houseLines(["porch"])).toEqual([HOUSE_EAVES.porch]);
  });

  it("shows every light in the whole view", () => {
    const placement = placeAlong(houseLines([...LIT_RUNS, "lower-sides", "upper-sides"]), HOUSE_UNITS_PER_METRE);
    for (const light of placement.lights) expect(inside([light.x, light.y], HOUSE_CROPS.whole)).toBe(true);
  });

  it("stands on its ground: the ground runs to the front right corner, then up the side wall's base", () => {
    const corner = HOUSE_GROUND.findIndex(([x, y]) => x === 300 && y === 196);
    expect(corner).toBeGreaterThan(0);
    const back = HOUSE_GROUND.slice(corner);
    // The side wall's base is the outline's (300, 196) to (336, 180).
    const sideWall = HOUSE_OUTLINE.find((line) => line[0][0] === 300 && line[0][1] === 196)!;
    expect(back).toEqual(sideWall.slice(0, 2));
    // Nothing of it runs past the house at the right.
    expect(Math.max(...HOUSE_GROUND.map(([x]) => x))).toBe(336);
  });
});

describe("its parts: the garage, the main floor, the upper floor's walls and the rest of it", () => {
  it("knows each line's part", () => {
    expect(partOf(HOUSE_EDGES["garage-gable"])).toBe("garage");
    expect(partOf(HOUSE_EDGES.garage)).toBe("garage");
    expect(partOf(HOUSE_DOORS[0])).toBe("garage");
    for (const run of ["lower-eave", "porch", "lower-sides"] as const) expect(partOf(HOUSE_EDGES[run]), run).toBe("lower");
    for (const run of ["upper-eave", "upper-gable", "upper-sides"] as const) expect(partOf(HOUSE_EDGES[run]), run).toBe("upper");
    // The front door, the main floor's windows, its walls (the left one is
    // the garage's right wall too) are the main floor's.
    expect(partOf(HOUSE_DOORS[4])).toBe("lower");
    expect(partOf(HOUSE_WINDOWS[0])).toBe("lower");
    expect(partOf(HOUSE_WINDOWS[2])).toBe("lower");
    expect(partOf([[116, 120], [116, 196]])).toBe("lower");
    // The upper floor's walls: the band it stands on, its two walls and its side.
    expect(partOf([[122, UPPER_FLOOR_BASE], [300, UPPER_FLOOR_BASE]])).toBe("upper_wall");
    expect(partOf([[128, 110], [128, 66]])).toBe("upper_wall");
    expect(partOf([[294, 110], [294, 66]])).toBe("upper_wall");
    expect(partOf([[294, 110], [330, 94], [330, 53]])).toBe("upper_wall");
    // The rest of the upper floor: its windows and roof.
    expect(partOf(HOUSE_WINDOWS[3])).toBe("upper");
    expect(partOf([[122, 66], [150, 42], [239, 42]])).toBe("upper");
    expect(UPPER_RUNS.every((run) => partOf(HOUSE_EDGES[run]) === "upper")).toBe(true);
    // Exactly four upper-wall lines, every one starting on the band.
    const walls = HOUSE_OUTLINE.filter((line) => partOf(line) === "upper_wall");
    expect(walls.length).toBe(4);
    for (const line of walls) expect(line.some(([, y]) => y === UPPER_FLOOR_BASE)).toBe(true);
  });

  it("closes the main floor's left corner up to its eave, beside the garage's gable", () => {
    expect(HOUSE_OUTLINE.some((line) => sameLine(line, [[116, 120], [116, 196]]))).toBe(true);
  });

  it("a close view of the main floor keeps the upper floor's walls and leaves out the rest of it, lines and lights", () => {
    for (const crop of ["medium", "entry"] as const) {
      const parts = HOUSE_CROP_PARTS[crop];
      expect(parts).toEqual(["garage", "lower", "upper_wall"]);
      const lines = drawnLines(parts);
      for (const line of lines) expect(partOf(line), `${crop} ${pathD(line)}`).not.toBe("upper");
      expect(lines.filter((line) => partOf(line) === "upper_wall").length).toBe(4);
      // No upper-floor window and no upper-floor light.
      for (const window of HOUSE_WINDOWS.slice(3)) expect(drawn(window, parts)).toBe(false);
      expect(runsFor(LIT_RUNS, parts)).toEqual(["garage-gable", "garage", "lower-eave"]);
    }
  });

  it("the upper floor alone draws the band it stands on, and no ground", () => {
    const lines = drawnLines(["upper_wall", "upper"]);
    expect(lines.some((line) => sameLine(line, [[122, 110], [300, 110]]))).toBe(true);
    expect(groundFor(["upper_wall", "upper"])).toBeNull();
    expect(runsFor(LIT_RUNS, ["upper_wall", "upper"])).toEqual(UPPER_RUNS);
    expect(HOUSE_CROP_PARTS.roofline).toEqual(["upper_wall", "upper"]);
  });

  it("names a view's parts and anchor with its crop, and a bare rect draws everything, centred", () => {
    expect(viewOf("whole").parts).toEqual(["garage", "lower", "upper_wall", "upper"]);
    expect(viewOf("corner").parts).toEqual(["lower", "upper_wall", "upper"]);
    expect(viewOf("entry").anchor).toBe("top");
    expect(viewOf("medium").anchor).toBe("centre");
    expect(viewOf([0, 0, 10, 10])).toEqual({ rect: { x: 0, y: 0, width: 10, height: 10 }, parts: ["garage", "lower", "upper_wall", "upper"], anchor: "centre" });
  });
});

describe("on screen: contain and cover", () => {
  const rect: Rect = { x: -4, y: 68, width: 274, height: 148 };

  it("contain is the lights' fitContain, and an SVG's xMidYMid meet", () => {
    for (const box of PHOTO_AREAS) expect(fitView(rect, box, "contain")).toEqual(fitContain(rect, box));
    expect(preserveAspect("contain")).toBe("xMidYMid meet");
    expect(preserveAspect("cover")).toBe("xMidYMid slice");
    expect(preserveAspect("cover", "top")).toBe("xMidYMin slice");
    expect(preserveAspect("contain", "top")).toBe("xMidYMid meet");
  });

  it("cover fills the box edge to edge, centred on the crop, and shows nothing beyond it", () => {
    for (const box of PHOTO_AREAS) {
      const seen = visibleRect(rect, box, "cover");
      const t = 1e-9;
      expect(seen.x).toBeGreaterThanOrEqual(rect.x - t);
      expect(seen.y).toBeGreaterThanOrEqual(rect.y - t);
      expect(seen.x + seen.width).toBeLessThanOrEqual(rect.x + rect.width + t);
      expect(seen.y + seen.height).toBeLessThanOrEqual(rect.y + rect.height + t);
      // One axis exactly, centred on the other.
      expect(Math.min(Math.abs(seen.width - rect.width), Math.abs(seen.height - rect.height))).toBeLessThan(1e-9);
      expect(seen.x + seen.width / 2).toBeCloseTo(rect.x + rect.width / 2, 9);
      expect(seen.y + seen.height / 2).toBeCloseTo(rect.y + rect.height / 2, 9);
    }
  });

  it("cover held at the top keeps the crop's top and lets the bottom give way", () => {
    for (const box of PHOTO_AREAS) {
      const centred = visibleRect(rect, box, "cover");
      const top = visibleRect(rect, box, "cover", "top");
      expect(top.y).toBeCloseTo(rect.y, 9);
      expect(top.x).toBeCloseTo(centred.x, 9);
      expect(top.width).toBeCloseTo(centred.width, 9);
      expect(top.height).toBeCloseTo(centred.height, 9);
      // contain ignores the anchor.
      expect(fitView(rect, box, "contain", "top")).toEqual(fitView(rect, box, "contain"));
    }
  });
});

describe("the close views (page 3's medium, page 4's entry), on every iPad", () => {
  // The upper floor's walls must leave through the top: each wall's upper
  // end is above the frame (the band, level at 110, stays inside).
  const upperWalls = HOUSE_OUTLINE.filter((line) => partOf(line) === "upper_wall" && line.some(([, y]) => y < UPPER_FLOOR_BASE));
  const MAY_LEAVE: Record<"medium" | "entry", { left: Vec[][]; right: Vec[][]; bottom: Vec[][] }> = {
    medium: {
      left: [HOUSE_GROUND],
      right: [HOUSE_GROUND, HOUSE_EDGES["lower-eave"], [[122, 110], [300, 110]]],
      bottom: [],
    },
    entry: {
      // The garage's lit corner shows at the left edge.
      left: [HOUSE_EDGES["garage-gable"], HOUSE_EDGES.garage],
      right: [HOUSE_EDGES["lower-eave"], [[122, 110], [300, 110]]],
      // The bottom gives way: the main floor's wall, the porch's posts, the
      // front door and (on the mini and in rehearsal) the main window.
      bottom: [[[116, 120], [116, 196]], [[215, 146], [215, 196]], [[259, 146], [259, 196]], HOUSE_DOORS[4], HOUSE_WINDOWS[0], HOUSE_WINDOWS[1]],
    },
  };

  for (const crop of ["medium", "entry"] as const) {
    it(`${crop}: the upper floor's walls leave through the top, the sides and bottom cut only where they may, and no glow cut at the top`, () => {
      const { rect, parts, anchor } = viewOf(crop);
      const lines = drawnLines(parts);
      const lights = placeAlong(houseLines(runsFor(LIT_RUNS, parts)), HOUSE_UNITS_PER_METRE).lights;
      for (const box of PHOTO_AREAS) {
        const seen = visibleRect(rect, box, "cover", anchor);
        const at = `${crop} at ${box.width} x ${box.height}`;
        // Its full width always: the sides never move.
        expect(seen.width, at).toBeCloseTo(rect.width, 9);
        const [x0, x1, y0, y1] = [seen.x, seen.x + seen.width, seen.y, seen.y + seen.height];
        for (const line of lines) {
          const wall = upperWalls.some((ok) => sameLine(ok, line));
          // Only an upper-floor wall crosses the top.
          if (crossesEdge(line, "y", y0, x0, x1)) expect(wall, `${at} top ${pathD(line)}`).toBe(true);
          if (crossesEdge(line, "y", y1, x0, x1)) expect(MAY_LEAVE[crop].bottom.some((ok) => sameLine(ok, line)), `${at} bottom ${pathD(line)}`).toBe(true);
          if (crossesEdge(line, "x", x0, y0, y1)) expect(MAY_LEAVE[crop].left.some((ok) => sameLine(ok, line)), `${at} left ${pathD(line)}`).toBe(true);
          if (crossesEdge(line, "x", x1, y0, y1)) expect(MAY_LEAVE[crop].right.some((ok) => sameLine(ok, line)), `${at} right ${pathD(line)}`).toBe(true);
        }
        // Each wall in frame rises out of the top: its upper end is above it.
        for (const line of upperWalls) {
          const inFrame = line.some(([x]) => x > seen.x && x < seen.x + seen.width);
          if (inFrame) expect(Math.min(...line.map(([, y]) => y)), `${at} ${pathD(line)}`).toBeLessThan(seen.y);
        }
        expect(upperWalls.some((line) => line.some(([x]) => x > seen.x && x < seen.x + seen.width)), at).toBe(true);
        // The band, the lit eave and the porch's roof are whole in height, and the front door's top is in.
        for (const point of [[150, 110], ...HOUSE_EDGES["lower-eave"].map(([x, y]) => [Math.min(x, seen.x + seen.width - 1), y]), ...HOUSE_OUTLINE[HOUSE_OUTLINE.length - 3], [237, 158]] as Vec[]) {
          expect(within(point, seen), `${at} ${point}`).toBe(true);
        }
        // No light's glow is cut at the top, nor at the bottom.
        for (const light of lights) {
          if (light.x < seen.x || light.x > seen.x + seen.width) continue;
          expect(light.y - GLOW, at).toBeGreaterThanOrEqual(seen.y);
          expect(light.y + GLOW, at).toBeLessThanOrEqual(seen.y + seen.height);
        }
      }
    });
  }

  it("medium: the garage gable, its door, the porch and the front door are whole, standing on the ground", () => {
    const { rect, parts } = viewOf("medium");
    const lights = placeAlong(houseLines(runsFor(LIT_RUNS, parts)), HOUSE_UNITS_PER_METRE).lights;
    for (const box of PHOTO_AREAS) {
      const seen = visibleRect(rect, box, "cover");
      const at = `${box.width} x ${box.height}`;
      for (const point of [...HOUSE_EDGES["garage-gable"], ...HOUSE_DOORS[0], ...HOUSE_DOORS[4], ...HOUSE_OUTLINE[HOUSE_OUTLINE.length - 3], [250, 196]] as Vec[]) {
        expect(within(point, seen), `${at} ${point}`).toBe(true);
      }
      // The garage's lights and their glow are whole; the eave's run off the right.
      for (const light of lights) if (light.x < 116) expect(light.x - GLOW, at).toBeGreaterThanOrEqual(seen.x);
      // The upper floor's eave (66) never shows.
      expect(seen.y, at).toBeGreaterThan(66);
    }
    expect(rect.width / rect.height).toBeGreaterThan(1.8);
    expect(rect.width / rect.height).toBeLessThanOrEqual(IPAD_PRO.width / IPAD_PRO.height);
  });

  it("entry: the main floor's corner, the main window, the porch and the front door under the lit eave, its top held", () => {
    const { rect } = viewOf("entry");
    expect(rect.width / rect.height).toBeLessThanOrEqual(IPAD_PRO.width / IPAD_PRO.height);
    for (const box of PHOTO_AREAS) {
      const seen = visibleRect(rect, box, "cover", "top");
      const at = `${box.width} x ${box.height}`;
      expect(seen.y, at).toBeCloseTo(rect.y, 9);
      // It stops between the porch and the right window, and shows the main floor's corner.
      expect(seen.x + seen.width, at).toBeGreaterThan(264 + 1.5);
      expect(seen.x + seen.width, at).toBeLessThanOrEqual(272 - 1.5);
      expect(seen.x, at).toBeLessThan(116 - 1.5);
      expect(seen.x, at).toBeGreaterThan(102 + 1.5);
      // The band and the wall rising from it are in, well clear of the top.
      expect(110 - seen.y, at).toBeGreaterThan(4);
      // The wash under the eave (0.6 m) is in, and the main window's top.
      expect(123.5 + 0.6 * HOUSE_UNITS_PER_METRE, at).toBeLessThan(seen.y + seen.height);
      expect(146, at).toBeLessThan(seen.y + seen.height);
      // The bottom never runs along the main window's foot.
      expect(Math.abs(seen.y + seen.height - 176), at).toBeGreaterThanOrEqual(1.3);
    }
    // The window is whole on the Air and the Pro, in Safari and installed.
    for (const box of [IPAD_AIR, IPAD_PRO, ...INSTALLED]) {
      const seen = visibleRect(rect, box, "cover", "top");
      expect(seen.y + seen.height, `${box.width} x ${box.height}`).toBeGreaterThan(176);
    }
  });

  it("steps in from whole to medium to entry, entry about 1.6 times closer than medium or more", () => {
    for (const box of PHOTO_AREAS) {
      const whole = fitView(viewOf("whole").rect, box, "contain").scale;
      const medium = fitView(viewOf("medium").rect, box, "cover").scale;
      const entry = fitView(viewOf("entry").rect, box, "cover", "top").scale;
      expect(medium, `${box.width}`).toBeGreaterThan(whole * 1.3);
      expect(entry, `${box.width}`).toBeGreaterThan(medium * 1.6);
    }
    expect(HOUSE_CROP_ANCHOR.entry).toBe("top");
    expect(HOUSE_CROP_ANCHOR.medium).toBe("centre");
  });
});

describe("the corner", () => {
  it("is complete: every line and every light it draws ends inside the frame, with equal margins", () => {
    const { rect, parts } = viewOf("corner");
    expect(parts).toEqual(["lower", "upper_wall", "upper"]);
    const lines = drawnLines(parts);
    for (const line of lines) for (const point of line) expect(within(point, rect), pathD(line)).toBe(true);
    const runs = runsFor(CORNER_RUNS, parts);
    expect(runs).toEqual(CORNER_RUNS);
    expect(CORNER_RUNS).toEqual(["lower-eave", "upper-eave", "upper-gable", "lower-sides", "upper-sides"]);
    for (const light of placeAlong(houseLines(runs), HOUSE_UNITS_PER_METRE).lights) expect(within([light.x, light.y], rect, GLOW)).toBe(true);
    // The drawing sits in the middle of its frame.
    const content = boundsOf(lines)!;
    expect(content.x - rect.x).toBeCloseTo(rect.x + rect.width - (content.x + content.width), 6);
    expect(content.y - rect.y).toBeCloseTo(rect.y + rect.height - (content.y + content.height), 6);
  });

  it("draws no garage, and stands on a ground that starts just short of the main floor", () => {
    const ground = groundFor(["lower", "upper_wall", "upper"])!;
    expect(ground[0][0]).toBeLessThan(116);
    expect(ground[0][0]).toBeGreaterThan(100);
    expect(drawnLines(["lower", "upper_wall", "upper"]).some((line) => partOf(line) === "garage")).toBe(false);
  });
});

describe("the warm or cool pair's view: the upper floor on its band", () => {
  it("is complete: every line and light ends inside the frame, the corner turned, with equal margins", () => {
    expect(PAIR_CROP).toBe("roofline");
    const { rect, parts } = viewOf(PAIR_CROP);
    const lines = drawnLines(parts);
    for (const line of lines) for (const point of line) expect(within(point, rect), pathD(line)).toBe(true);
    const runs = runsFor(CORNER_RUNS, parts);
    expect(runs).toEqual(["upper-eave", "upper-gable", "upper-sides"]);
    for (const light of placeAlong(houseLines(runs), HOUSE_UNITS_PER_METRE).lights) expect(within([light.x, light.y], rect, GLOW)).toBe(true);
    const content = boundsOf(lines)!;
    expect(content.x - rect.x).toBeCloseTo(rect.x + rect.width - (content.x + content.width), 6);
    expect(content.y - rect.y).toBeCloseTo(rect.y + rect.height - (content.y + content.height), 6);
  });

  it("one above the other in a More's picture panel, each takes about 90% of its width, its lights about 8 px apart at 1180", () => {
    const [, , width, height] = HOUSE_CROPS[PAIR_CROP];
    const aspect = width / height;
    for (const box of MORE_PANELS) {
      const space = pairSpace(box);
      const layout = pairLayout(box, aspect, { caption: PAIR_CAPTION.gap + PAIR_CAPTION.line, gap: space, margin: space });
      const at = `${box.width} x ${box.height}`;
      expect(layout.direction, at).toBe("column");
      expect(layout.drawing.width / box.width, at).toBeGreaterThan(0.88);
      // The two, their captions and the gap fit with the margin.
      expect(2 * (layout.drawing.height + PAIR_CAPTION.gap + PAIR_CAPTION.line) + space, at).toBeLessThanOrEqual(box.height - 2 * space + 1e-9);
      const pitch = PITCH * (layout.drawing.width / width);
      expect(pitch, at).toBeGreaterThan(7);
    }
    expect(pairSpace({ width: 660.8, height: 742 })).toBeCloseTo(0.03 * 660.8, 9);
    expect(pairSpace({ width: 200, height: 200 })).toBe(16);
  });
});

describe("the track by day", () => {
  it("is a slim strip under each roof edge: its top on the edge, its bottom on the line the lights follow", () => {
    for (const run of LIT_RUNS) {
      const profile = trackProfile(run);
      const eave = HOUSE_EAVES[run];
      expect(profile.length).toBe(eave.length * 2);
      // Its bottom is the eave line, walked back.
      expect(profile.slice(eave.length)).toEqual(eave.slice().reverse());
      // Its top lies on the roof edge, above the bottom.
      const top = profile.slice(0, eave.length);
      for (const [at, point] of top.entries()) {
        expect(distanceToLine(point, HOUSE_EDGES[run]), `${run} ${at}`).toBeLessThan(1e-6);
        expect(point[1], run).toBeLessThan(eave[at][1]);
      }
      // Its outline is its ends and bottom only: the top is the edge's own line.
      expect(trackOutline(run)).toEqual([top[0], ...eave, top[top.length - 1]]);
      expect(trackGap(run), run).toBeGreaterThan(3);
      expect(trackGap(run), run).toBeLessThan(4.5);
    }
    // A flat run: 3.5 deep, from the edge (120) to the lights (123.5).
    expect(trackProfile("lower-eave")[0]).toEqual([119, 120]);
    expect(trackGap("lower-eave")).toBeCloseTo(3.5, 9);
  });
});

describe("the close eave (Up close by day)", () => {
  const { rect, parts, anchor } = viewOf("eave");
  const horizontal = (line: Vec[]) => line.every(([, y]) => Math.abs(y - line[0][1]) < 1e-9);
  const vertical = (line: Vec[]) => line.every(([x]) => Math.abs(x - line[0][0]) < 1e-9);

  it("draws the main floor and the upper floor's walls with its own lines, and is no wider than a More's panel", () => {
    expect(parts).toEqual(["lower", "upper_wall", "eave_detail"]);
    expect(anchor).toBe("centre");
    for (const box of MORE_PANELS) expect(rect.width / rect.height).toBeLessThanOrEqual(box.width / box.height + 1e-9);
  });

  it("tucks the track to scale under the fascia, turning the corner with it", () => {
    const [a, b, c, d, e, f] = EAVE_CLOSE.track;
    // Along the front at the fascia's foot (120), then back along the side, parallel to the roof edge.
    expect(a[1]).toBe(120);
    expect(b).toEqual([306, 120]);
    const side = HOUSE_EDGES["lower-sides"];
    const slope = (side[1][1] - side[0][1]) / (side[1][0] - side[0][0]);
    expect((c[1] - b[1]) / (c[0] - b[0])).toBeCloseTo(slope, 9);
    expect(c[0]).toBeCloseTo(339, 9);
    expect(d[1] - c[1]).toBeCloseTo(CLOSE_TRACK_DEPTH, 9);
    expect(e).toEqual([306, 120 + CLOSE_TRACK_DEPTH]);
    expect(f[1]).toBe(120 + CLOSE_TRACK_DEPTH);
    // About 8 cm: slim beside the 15 cm fascia.
    expect(CLOSE_TRACK_DEPTH / HOUSE_UNITS_PER_METRE).toBeLessThan(0.1);
    expect(EAVE_CLOSE.trackOutline).toEqual([a, f, e, d, c]);
  });

  it("closes the fascia at the corner and at its far end on the side, down to the roof edge", () => {
    const edgeEnd = HOUSE_EDGES["lower-sides"][1];
    const fasciaTop = EAVE_CLOSE.edges[0];
    const farTop = fasciaTop[fasciaTop.length - 1];
    expect(farTop[0]).toBeCloseTo(edgeEnd[0], 9);
    const ends = EAVE_CLOSE.edges.filter((line) => line.length === 2 && Math.abs(line[0][0] - line[1][0]) < 1e-9);
    expect(ends.some(([top, foot]) => top[0] === 306 && foot[1] === 120)).toBe(true);
    expect(ends.some(([top, foot]) => Math.abs(top[0] - farTop[0]) < 1e-9 && Math.abs(top[1] - farTop[1]) < 1e-9 && Math.abs(foot[1] - edgeEnd[1]) < 1e-9)).toBe(true);
  });

  it("stops the siding at the windows and the porch", () => {
    const openings: [number, number, number, number][] = [
      [132, 146, 196, 176],
      [272, 148, 292, 174],
      [210, 138, 264, 196],
    ];
    for (const line of EAVE_CLOSE.fine.filter((line) => horizontal(line) && line[0][1] > 124)) {
      const y = line[0][1];
      const [x0, x1] = [Math.min(line[0][0], line[1][0]), Math.max(line[0][0], line[1][0])];
      for (const [ox0, oy0, ox1, oy1] of openings) {
        if (y > oy0 && y < oy1) expect(x1 <= ox0 || x0 >= ox1, `${pathD(line)}`).toBe(true);
      }
    }
  });

  it("in every More's panel: full width, the upper walls rise out of the top, the eave in the top third, the right window whole, no line along an edge", () => {
    const lines = [...drawnLines(parts), ...EAVE_CLOSE.fine, ...EAVE_CLOSE.edges];
    for (const box of MORE_PANELS) {
      const seen = visibleRect(rect, box, "cover");
      const at = `${box.width} x ${box.height}`;
      expect(seen.width, at).toBeCloseTo(rect.width, 9);
      // The upper floor's walls rise out of the top; its eave never shows.
      expect(seen.y, at).toBeGreaterThan(66);
      for (const line of drawnLines(parts).filter((line) => partOf(line) === "upper_wall" && line.some(([, y]) => y < UPPER_FLOOR_BASE))) {
        if (line.some(([x]) => x > seen.x && x < seen.x + seen.width)) expect(Math.min(...line.map(([, y]) => y)), `${at} ${pathD(line)}`).toBeLessThan(seen.y);
      }
      const eaveAt = (120 - seen.y) / seen.height;
      expect(eaveAt, at).toBeGreaterThan(0.15);
      expect(eaveAt, at).toBeLessThan(0.34);
      for (const point of HOUSE_WINDOWS[2]) expect(within(point, seen, 2), `${at} ${point}`).toBe(true);
      // The porch is out of frame.
      expect(seen.x, at).toBeGreaterThan(264 + 1.5);
      for (const line of lines) {
        // No level line in frame runs within 0.75 of a unit (6 px) of the top
        // or bottom, no upright one within a unit of a side (one just
        // outside is not seen). The siding every 2.8 can't keep more from
        // all five panels' feet at once.
        const near = (v: number, lo: number, hi: number, by: number) => (v >= lo && v < lo + by) || (v <= hi && v > hi - by);
        if (horizontal(line)) expect(near(line[0][1], seen.y, seen.y + seen.height, 0.75), `${at} ${pathD(line)}`).toBe(false);
        if (vertical(line)) expect(near(line[0][0], seen.x, seen.x + seen.width, 1), `${at} ${pathD(line)}`).toBe(false);
      }
    }
  });
});

describe("the eave in section", () => {
  it("stays inside its view, with the light at the bottom of the track", () => {
    for (const line of [...EAVE_SHAPES, EAVE_TRACK]) {
      for (const [, y] of line) {
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(EAVE_VIEW[3]);
      }
    }
    const track = boundsOf([EAVE_TRACK])!;
    expect(EAVE_LIGHT[0]).toBeCloseTo(track.x + track.width / 2, 6);
    expect(EAVE_LIGHT[1]).toBeGreaterThanOrEqual(track.y + track.height);
  });

  it("labels Roof edge, Fascia, Track, Light and Soffit, or only Soffit, Fascia and Track on the colour page", () => {
    expect(eaveLabelsFor("lit").map((label) => label.text)).toEqual(["Roof edge", "Fascia", "Track", "Light", "Soffit"]);
    expect(
      eaveLabelsFor("colour")
        .map((label) => label.text)
        .sort(),
    ).toEqual(["Fascia", "Soffit", "Track"]);
  });

  it("runs every leader to the right edge, with room between the labels", () => {
    const ends = EAVE_LABELS.map((label) => label.leader[label.leader.length - 1]);
    for (const [x] of ends) expect(x).toBe(EAVE_VIEW[2]);
    const heights = ends.map(([, y]) => y).sort((a, b) => a - b);
    // At 440 px wide the drawing is 320 px, 0.62 px a unit: 44 units is 27 px,
    // more than a 22 px line of 20 px text.
    for (let at = 1; at < heights.length; at++) expect(heights[at] - heights[at - 1]).toBeGreaterThanOrEqual(44);
    expect(heights[heights.length - 1]).toBeLessThanOrEqual(EAVE_VIEW[3] - 22);
  });

  it("fits whole inside a box with a margin, as a More's picture panel", () => {
    for (const box of [{ width: 661, height: 764 }, { width: 765, height: 968 }, { width: 1180, height: 574 }, { width: 300, height: 200 }]) {
      const width = eaveFit(box);
      const height = (width - EAVE_LABEL_COLUMN) * (EAVE_VIEW[3] / EAVE_VIEW[2]);
      expect(width).toBeLessThanOrEqual(box.width - 48);
      expect(height).toBeLessThanOrEqual(box.height - 48 + 1e-9);
      expect(width).toBeGreaterThan(EAVE_LABEL_COLUMN);
    }
    expect(eaveFit({ width: 0, height: 0 })).toBe(0);
  });
});

describe("the pair's layout", () => {
  const aspect = HOUSE_CROPS.corner[2] / HOUSE_CROPS.corner[3];
  const options = { caption: 36, gap: 24, margin: 24 };

  it("fills a More's tall picture panel one above the other, and a wide box side by side", () => {
    for (const box of [{ width: 661, height: 764 }, { width: 765, height: 968 }]) {
      const layout = pairLayout(box, aspect, options);
      expect(layout.direction).toBe("column");
      // Sized by the height: the two and their captions fill it.
      expect(2 * (layout.drawing.height + options.caption) + options.gap).toBeCloseTo(box.height - 2 * options.margin, 6);
      expect(layout.drawing.width).toBeLessThanOrEqual(box.width - 2 * options.margin);
    }
    for (const box of [IPAD_AIR, IPAD_PRO]) {
      const layout = pairLayout(box, aspect, options);
      expect(layout.direction).toBe("row");
      expect(layout.drawing.height + options.caption).toBeLessThanOrEqual(box.height - 2 * options.margin + 1e-9);
      expect(2 * layout.drawing.width + options.gap).toBeLessThanOrEqual(box.width - 2 * options.margin + 1e-9);
    }
  });

  it("keeps each drawing at its crop's shape, and draws nothing in no room", () => {
    const layout = pairLayout({ width: 661, height: 764 }, aspect, options);
    expect(layout.drawing.width / layout.drawing.height).toBeCloseTo(aspect, 9);
    expect(pairLayout({ width: 0, height: 0 }, aspect, options).drawing.width).toBe(0);
  });
});

describe("the phone", () => {
  it("is a plain outline with its screen inside it", () => {
    expect(PHONE_SCREEN.x).toBeGreaterThan(PHONE_BODY.x);
    expect(PHONE_SCREEN.y).toBeGreaterThan(PHONE_BODY.y);
    expect(PHONE_SCREEN.x + PHONE_SCREEN.width).toBeLessThan(PHONE_BODY.x + PHONE_BODY.width);
    expect(PHONE_SCREEN.y + PHONE_SCREEN.height).toBeLessThan(PHONE_BODY.y + PHONE_BODY.height);
    expect(PHONE_BODY.x + PHONE_BODY.width).toBeLessThanOrEqual(PHONE_VIEW[2]);
    expect(PHONE_BODY.y + PHONE_BODY.height).toBeLessThanOrEqual(PHONE_VIEW[3]);
    expect(PHONE_BODY.height / PHONE_BODY.width).toBeGreaterThan(2);
  });

  it("is held in front of the house: the house large across the top, the phone over its right end, taller than its walls", () => {
    const house = viewOf("whole").rect;
    for (const box of PHOTO_AREAS) {
      const scene = phoneScene(box, house);
      const at = `${box.width}`;
      // Everything inside the box.
      for (const r of [scene.house, scene.phone]) {
        expect(r.left, at).toBeGreaterThanOrEqual(0);
        expect(r.top, at).toBeGreaterThanOrEqual(0);
        expect(r.left + r.width, at).toBeLessThanOrEqual(box.width + 1e-9);
        expect(r.top + r.height, at).toBeLessThanOrEqual(box.height + 1e-9);
      }
      // About page 2's scale (the whole house fitted to the photo area), never a small fragment.
      const page2 = fitView(house, box, "contain").scale;
      expect(scene.scale, at).toBeGreaterThan(page2 * 0.75);
      expect(scene.house.width, at).toBeCloseTo(house.width * scene.scale, 9);
      // The house's ground line is in view, above the phone's foot: the phone is in front.
      const groundY = scene.house.top + (196 - house.y) * scene.scale;
      expect(groundY, at).toBeLessThan(scene.phone.top + scene.phone.height);
      // The phone stands over the house's right end, from its right window on.
      expect(scene.phone.left, at).toBeCloseTo(scene.house.left + (PHONE_OVER - house.x) * scene.scale, 9);
      expect(scene.phone.left + scene.phone.width, at).toBeGreaterThan(scene.house.left + (342 - house.x) * scene.scale);
      // Taller than the house's walls (the main floor's, eave to ground), and in the lower right.
      expect(scene.phone.height, at).toBeGreaterThan((196 - 120) * scene.scale * 1.5);
      expect(scene.phone.left + scene.phone.width / 2, at).toBeGreaterThan(box.width / 2);
      expect(scene.phone.top + scene.phone.height / 2, at).toBeGreaterThan(box.height / 2);
      // The pair is centred across the box.
      const right = Math.max(scene.house.left + scene.house.width, scene.phone.left + scene.phone.width);
      expect(scene.house.left, at).toBeCloseTo(box.width - right, 6);
    }
  });
});

describe("every view", () => {
  it("is named, with its parts", () => {
    const names: HouseCropName[] = ["whole", "medium", "entry", "corner", "roofline", "eave"];
    expect(Object.keys(HOUSE_CROPS).sort()).toEqual([...names].sort());
    for (const name of names) expect(HOUSE_CROP_PARTS[name].length).toBeGreaterThan(0);
    for (const name of names) expect(["centre", "top"]).toContain(HOUSE_CROP_ANCHOR[name]);
  });
});
