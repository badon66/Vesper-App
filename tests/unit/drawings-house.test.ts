import { describe, expect, it } from "vitest";

import { EAVE_LABELS, EAVE_LIGHT, EAVE_SHAPES, EAVE_TRACK, EAVE_VIEW, eaveLabelsFor } from "@/lib/drawings/eave";
import {
  CORNER_RUNS,
  HOUSE_CROPS,
  HOUSE_DOORS,
  HOUSE_EAVES,
  HOUSE_EDGES,
  HOUSE_OUTLINE,
  HOUSE_RUNS,
  HOUSE_UNITS_PER_METRE,
  HOUSE_WINDOWS,
  LIT_RUNS,
  UPPER_FLOOR_BASE,
  UPPER_RUNS,
  houseLines,
  pathD,
} from "@/lib/drawings/house";
import { PHONE_BODY, PHONE_SCREEN, PHONE_VIEW } from "@/lib/drawings/phone";
import { boundsOf, placeAlong, type Vec } from "@/lib/lights/place";

const inside = ([x, y]: Vec, [cx, cy, cw, ch]: readonly number[]) => x >= cx && x <= cx + cw && y >= cy && y <= cy + ch;

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
    expect(CORNER_RUNS).toEqual(expect.arrayContaining([...LIT_RUNS, "lower-sides", "upper-sides"]));
    expect(houseLines(["porch"])).toEqual([HOUSE_EAVES.porch]);
  });

  it("shows every light in the whole view", () => {
    const placement = placeAlong(houseLines(CORNER_RUNS), HOUSE_UNITS_PER_METRE);
    for (const light of placement.lights) expect(inside([light.x, light.y], HOUSE_CROPS.whole)).toBe(true);
  });

  it("frames the garage and entry, and the corner with its window", () => {
    // The garage door and the front door are in the entry view.
    for (const point of [...HOUSE_DOORS[0], ...HOUSE_DOORS[4]]) expect(inside(point, HOUSE_CROPS.entry)).toBe(true);
    // The right window and the lit corner are in the corner view.
    for (const point of HOUSE_WINDOWS[2]) expect(inside(point, HOUSE_CROPS.corner)).toBe(true);
    for (const point of HOUSE_EAVES["lower-sides"]) expect(inside(point, HOUSE_CROPS.corner)).toBe(true);
  });

  it("shows the upper floor alone beside the phone, with its own eaves lit", () => {
    for (const run of UPPER_RUNS) {
      for (const point of HOUSE_EAVES[run]) {
        expect(point[1]).toBeLessThan(UPPER_FLOOR_BASE);
        expect(inside(point, HOUSE_CROPS.roofline)).toBe(true);
      }
    }
    const crop = HOUSE_CROPS.roofline;
    expect(crop[1] + crop[3]).toBeGreaterThanOrEqual(UPPER_FLOOR_BASE);
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
});

describe("the phone", () => {
  it("is a plain outline with its screen inside it", () => {
    expect(PHONE_SCREEN.x).toBeGreaterThan(PHONE_BODY.x);
    expect(PHONE_SCREEN.y).toBeGreaterThan(PHONE_BODY.y);
    expect(PHONE_SCREEN.x + PHONE_SCREEN.width).toBeLessThan(PHONE_BODY.x + PHONE_BODY.width);
    expect(PHONE_SCREEN.y + PHONE_SCREEN.height).toBeLessThan(PHONE_BODY.y + PHONE_BODY.height);
    expect(PHONE_BODY.x + PHONE_BODY.width).toBeLessThanOrEqual(PHONE_VIEW[2]);
    expect(PHONE_BODY.height / PHONE_BODY.width).toBeGreaterThan(2);
  });
});
