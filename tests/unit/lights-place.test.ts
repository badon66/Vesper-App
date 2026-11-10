import { describe, expect, it } from "vitest";

import type { Pt } from "@/lib/deck";
import {
  LIGHT_SPACING_M,
  MAX_LIGHTS,
  METRES_PER_FOOT,
  SCALE_LOOKS_WRONG,
  boundsOf,
  lightsOnLine,
  pixelsPerMetre,
  placeAlong,
  placeLights,
  polylineLength,
  readBackLine,
  traceReadBack,
  type Light,
  type Vec,
} from "@/lib/lights/place";

// A 1600 x 1200 photo whose garage door (16 ft) is 400 px wide: 400 px over
// 4.8768 m, about 82 px to the metre, so 0.2 m is about 16.4 px.
const PHOTO = { width: 1600, height: 1200 };
const DOOR: { a: Pt; b: Pt; feet: number } = { a: [0.2, 0.8], b: [0.45, 0.8], feet: 16 };
const PPM = 400 / (16 * METRES_PER_FOOT);
const metres = (px: number) => px / PPM;
const gap = (a: Light, b: Light) => Math.hypot(b.x - a.x, b.y - a.y);

// A horizontal line `m` metres long on the photo, starting at x0 (0 to 1).
function lineOf(m: number, x0 = 0.1, y = 0.3): Pt[] {
  return [
    [x0, y],
    [x0 + (m * PPM) / PHOTO.width, y],
  ];
}

describe("scale", () => {
  it("is the garage door's pixels over its metres, measured in the photo's own pixels", () => {
    expect(pixelsPerMetre(DOOR, PHOTO)).toBeCloseTo(PPM, 6);
    // The same door on a photo half as tall measures the same across.
    expect(pixelsPerMetre(DOOR, { width: 1600, height: 600 })).toBeCloseTo(PPM, 6);
  });

  it("is 0 with the handles on one spot or no feet, and then nothing is lit", () => {
    expect(pixelsPerMetre({ a: [0.3, 0.3], b: [0.3, 0.3], feet: 16 }, PHOTO)).toBe(0);
    expect(pixelsPerMetre({ ...DOOR, feet: 0 }, PHOTO)).toBe(0);
    const placement = placeLights({ lines: [lineOf(5)], scale: { ...DOOR, b: DOOR.a } }, PHOTO);
    expect(placement.lights).toHaveLength(0);
    expect(placement.count).toBe(0);
  });
});

describe("five per metre", () => {
  it("puts a light every 0.2 m, 0.1 m in from each end of a whole-metre line", () => {
    const placement = placeLights({ lines: [lineOf(10)], scale: DOOR }, PHOTO);
    expect(placement.lights).toHaveLength(50);
    expect(placement.pitch).toBeCloseTo(LIGHT_SPACING_M * PPM, 6);
    const start = 0.1 * PHOTO.width;
    expect(metres(placement.lights[0].x - start)).toBeCloseTo(0.1, 6);
    expect(metres(start + 10 * PPM - placement.lights[49].x)).toBeCloseTo(0.1, 6);
    for (let at = 1; at < placement.lights.length; at++) {
      expect(metres(gap(placement.lights[at - 1], placement.lights[at]))).toBeCloseTo(0.2, 6);
    }
  });

  it("splits what's left over between the two ends, never packing or thinning", () => {
    const placement = placeLights({ lines: [lineOf(10.1)], scale: DOOR }, PHOTO);
    expect(placement.lights).toHaveLength(50);
    const start = 0.1 * PHOTO.width;
    const head = metres(placement.lights[0].x - start);
    const tail = metres(start + 10.1 * PPM - placement.lights[49].x);
    expect(head).toBeCloseTo(0.15, 6);
    expect(tail).toBeCloseTo(0.15, 6);
    expect(metres(gap(placement.lights[0], placement.lights[1]))).toBeCloseTo(0.2, 6);
  });

  it("carries the spacing continuously round a corner within a line", () => {
    // 2 m across, then 2 m down: 20 lights, the 10th and 11th either side
    // of the corner, 0.1 m along each leg from it.
    const corner: Pt = [0.1 + (2 * PPM) / PHOTO.width, 0.3];
    const line: Pt[] = [[0.1, 0.3], corner, [corner[0], 0.3 + (2 * PPM) / PHOTO.height]];
    const placement = placeLights({ lines: [line], scale: DOOR }, PHOTO);
    expect(placement.lights).toHaveLength(20);
    const before = placement.lights[9];
    const after = placement.lights[10];
    const cornerPx = { x: corner[0] * PHOTO.width, y: corner[1] * PHOTO.height };
    expect(metres(cornerPx.x - before.x)).toBeCloseTo(0.1, 6);
    expect(metres(after.y - cornerPx.y)).toBeCloseTo(0.1, 6);
    // Straight across the corner they are closer than 0.2 m: the spacing
    // follows the line, it doesn't restart at the corner.
    expect(metres(gap(before, after))).toBeCloseTo(Math.SQRT2 * 0.1, 6);
    expect(placement.lights.map((light) => light.i)).toEqual(Array.from({ length: 20 }, (_, i) => i));
  });

  it("restarts at each new line", () => {
    const placement = placeLights({ lines: [lineOf(1, 0.1), lineOf(1, 0.5, 0.6)], scale: DOOR }, PHOTO);
    expect(placement.lights.map((light) => `${light.line}:${light.i}`)).toEqual([
      "0:0",
      "0:1",
      "0:2",
      "0:3",
      "0:4",
      "1:0",
      "1:1",
      "1:2",
      "1:3",
      "1:4",
    ]);
    const second = placement.lights[5];
    expect(metres(second.x - 0.5 * PHOTO.width)).toBeCloseTo(0.1, 6);
  });

  it("measures a gable's slope in the photo's own pixels, not in 0 to 1", () => {
    // From (0, 0.5) to (0.5, 0) on a 2:1 photo: 500 px across and 250 px up.
    const wide = { width: 1000, height: 500 };
    const scale = { a: [0, 1] as Pt, b: [0.4, 1] as Pt, feet: 16 };
    const placement = placeLights(
      {
        lines: [
          [
            [0, 0.5],
            [0.5, 0],
          ],
        ],
        scale,
      },
      wide,
    );
    const ppm = 400 / (16 * METRES_PER_FOOT);
    expect(placement.count).toBe(Math.floor(Math.hypot(500, 250) / ppm / 0.2));
    expect(placement.count).not.toBe(Math.floor((Math.hypot(0.5, 0.5) * 1000) / ppm / 0.2));
  });

  it("gives a line with measured feet exactly round(feet x 1.524) lights, evenly", () => {
    const placement = placeLights({ lines: [lineOf(3), lineOf(3, 0.5)], lineFeet: [10, null], scale: DOOR }, PHOTO);
    const first = placement.lights.filter((light) => light.line === 0);
    expect(first).toHaveLength(Math.round(10 * 1.524));
    const gaps = first.slice(1).map((light, at) => gap(first[at], light));
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0], 6);
    // Half a gap at each end.
    expect(first[0].x - 0.1 * PHOTO.width).toBeCloseTo(gaps[0] / 2, 6);
    // The other line still goes by the scale.
    expect(placement.lights.filter((light) => light.line === 1)).toHaveLength(15);
  });

  it("gives a line too short for two lights one light in its middle", () => {
    expect(lightsOnLine(0.1 * PPM, PPM)).toBe(1);
    expect(lightsOnLine(0, PPM)).toBe(0);
    const placement = placeLights({ lines: [lineOf(0.15)], scale: DOOR }, PHOTO);
    expect(placement.lights).toHaveLength(1);
    expect(placement.lights[0].x).toBeCloseTo(0.1 * PHOTO.width + 0.075 * PPM, 6);
  });

  it("keeps the trace's line numbers when a line has too few points", () => {
    const placement = placeLights({ lines: [[[0.1, 0.1]], lineOf(1)], scale: DOOR }, PHOTO);
    expect(placement.lines).toHaveLength(2);
    expect(new Set(placement.lights.map((light) => light.line))).toEqual(new Set([1]));
  });

  it("never draws more than 1,500, and says how many the trace asked for", () => {
    // A garage door marked 10 px wide: the scale looks wrong.
    const tiny = { a: [0.5, 0.9] as Pt, b: [0.5 + 10 / PHOTO.width, 0.9] as Pt, feet: 16 };
    const placement = placeLights({ lines: [[[0.05, 0.3], [0.95, 0.3]]], scale: tiny }, PHOTO);
    expect(placement.count).toBeGreaterThan(MAX_LIGHTS);
    expect(placement.capped).toBe(true);
    expect(placement.lights).toHaveLength(MAX_LIGHTS);
  });

  it("works on lines already in content units (the drawings)", () => {
    const lines: Vec[][] = [
      [
        [0, 0],
        [100, 0],
      ],
    ];
    const placement = placeAlong(lines, 10);
    expect(placement.lights).toHaveLength(50);
    expect(placement.bounds).toEqual({ x: 0, y: 0, width: 100, height: 0 });
    expect(polylineLength(lines[0])).toBe(100);
    expect(boundsOf([])).toBeNull();
  });
});

describe("prep's read-back", () => {
  it("reads like Keenan's example", () => {
    const feet = 102;
    const wide = { width: 4000, height: 1200 };
    const ppm = pixelsPerMetre(DOOR, wide);
    const line: Pt[] = [
      [0.02, 0.2],
      [0.02 + (feet * METRES_PER_FOOT * ppm) / wide.width, 0.2],
    ];
    const readBack = traceReadBack({ lines: [line], scale: DOOR }, wide);
    expect(readBack.feet).toBeCloseTo(102, 6);
    expect(readBack.lights).toBe(155);
    expect(readBack.tooMany).toBe(false);
    expect(readBackLine(readBack)).toBe("About 102 ft traced, about 155 lights");
  });

  it("uses measured feet where Keenan typed them", () => {
    const readBack = traceReadBack({ lines: [lineOf(3), lineOf(2, 0.5)], lineFeet: [20, null], scale: DOOR }, PHOTO);
    expect(readBack.feet).toBeCloseTo(20 + 2 / METRES_PER_FOOT, 6);
    expect(readBack.lights).toBe(Math.round(20 * 1.524) + 10);
  });

  it("says when the scale looks wrong, and when no scale is set", () => {
    const tiny = { a: [0.5, 0.9] as Pt, b: [0.5 + 10 / PHOTO.width, 0.9] as Pt, feet: 16 };
    const readBack = traceReadBack({ lines: [[[0.05, 0.3], [0.95, 0.3]]], scale: tiny }, PHOTO);
    expect(readBack.tooMany).toBe(true);
    expect(SCALE_LOOKS_WRONG).toBe("The scale looks wrong. Check the garage door.");
    expect(traceReadBack({ lines: [lineOf(3)], scale: { ...DOOR, b: DOOR.a } }, PHOTO)).toEqual({
      feet: 0,
      lights: 0,
      tooMany: false,
      scaleSet: false,
    });
    expect(readBackLine({ feet: 0.4, lights: 1 })).toBe("About 0 ft traced, about 1 light");
  });

  it("matches the count the table draws", () => {
    const trace = { lines: [lineOf(4.3), lineOf(7.9, 0.4, 0.5)], scale: DOOR };
    expect(traceReadBack(trace, PHOTO).lights).toBe(placeLights(trace, PHOTO).count);
  });
});
