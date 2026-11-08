import { describe, expect, it } from "vitest";

import { EAVE_LABEL_COLUMN, EAVE_LABELS, EAVE_LIGHT, EAVE_SHAPES, EAVE_TRACK, EAVE_VIEW, eaveFit, eaveLabelsFor } from "@/lib/drawings/eave";
import {
  CORNER_RUNS,
  drawn,
  fitView,
  groundFor,
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
  TRACK_DEPTH,
  trackProfile,
  UPPER_FLOOR_BASE,
  UPPER_RUNS,
  viewOf,
  visibleRect,
  houseLines,
  type HouseCropName,
  type HousePart,
} from "@/lib/drawings/house";
import { pairLayout } from "@/lib/drawings/pair";
import { PHONE_BODY, PHONE_OVER, PHONE_SCREEN, PHONE_VIEW, phoneScene } from "@/lib/drawings/phone";
import { fitContain } from "@/lib/lights/frame";
import { BLOOM_RATIO } from "@/lib/lights/glow";
import { boundsOf, LIGHT_SPACING_M, placeAlong, type Rect, type Size, type Vec } from "@/lib/lights/place";

const inside = ([x, y]: Vec, [cx, cy, cw, ch]: readonly number[]) => x >= cx && x <= cx + cw && y >= cy && y <= cy + ch;
const within = ([x, y]: Vec, r: Rect, pad = 0) => x >= r.x + pad && x <= r.x + r.width - pad && y >= r.y + pad && y <= r.y + r.height - pad;

// The photo area above the band (0.8 x the page's height less 82 px) on
// each iPad the deck is used on, landscape: Air and 10th generation, Pro 13,
// Pro 11, mini, 9th generation, and the older 9.7 inch.
const IPAD_AIR: Size = { width: 1180, height: 574 };
const IPAD_PRO: Size = { width: 1366, height: 737.2 };
const PHOTO_AREAS: Size[] = [IPAD_AIR, IPAD_PRO, { width: 1194, height: 585.2 }, { width: 1133, height: 513.2 }, { width: 1080, height: 566 }, { width: 1024, height: 532.4 }];
// A light's glow reaches its bloom, BLOOM_RATIO pitches out.
const PITCH = LIGHT_SPACING_M * HOUSE_UNITS_PER_METRE;
const GLOW = BLOOM_RATIO * PITCH;

// Every line a view draws.
function drawnLines(parts: readonly HousePart[]): Vec[][] {
  const lines = [...HOUSE_OUTLINE, ...HOUSE_DOORS, ...HOUSE_WINDOWS, ...HOUSE_RUNS.map((run) => HOUSE_EDGES[run])].filter((line) => drawn(line, parts));
  const ground = groundFor(parts);
  return ground ? [...lines, ground] : lines;
}
const crossesX = (line: Vec[], x: number) => line.some(([px]) => px < x) && line.some(([px]) => px > x);
const crossesY = (line: Vec[], y: number) => line.some(([, py]) => py < y) && line.some(([, py]) => py > y);
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

describe("its parts: the garage, the main floor and the upper floor", () => {
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
    // The upper floor's windows, and the roof band it stands on.
    expect(partOf(HOUSE_WINDOWS[3])).toBe("upper");
    expect(partOf([[122, UPPER_FLOOR_BASE], [300, UPPER_FLOOR_BASE]])).toBe("upper");
    expect(UPPER_RUNS.every((run) => partOf(HOUSE_EDGES[run]) === "upper")).toBe(true);
  });

  it("closes the main floor's left corner up to its eave, beside the garage's gable", () => {
    expect(HOUSE_OUTLINE.some((line) => sameLine(line, [[116, 120], [116, 196]]))).toBe(true);
  });

  it("a view of the lower floor leaves out the upper floor's lines and lights entirely", () => {
    for (const crop of ["medium", "entry"] as const) {
      const parts = HOUSE_CROP_PARTS[crop];
      expect(parts).toEqual(["garage", "lower"]);
      for (const line of drawnLines(parts)) expect(partOf(line), `${crop} ${pathD(line)}`).not.toBe("upper");
      expect(runsFor(LIT_RUNS, parts)).toEqual(["garage-gable", "garage", "lower-eave"]);
    }
  });

  it("the upper floor alone draws the band it stands on, and no ground", () => {
    const lines = drawnLines(["upper"]);
    expect(lines.some((line) => sameLine(line, [[122, 110], [300, 110]]))).toBe(true);
    expect(groundFor(["upper"])).toBeNull();
    expect(runsFor(LIT_RUNS, ["upper"])).toEqual(UPPER_RUNS);
  });

  it("names a view's parts with its crop, and a bare rect draws everything", () => {
    expect(viewOf("whole").parts).toEqual(["garage", "lower", "upper"]);
    expect(viewOf("corner").parts).toEqual(["lower", "upper"]);
    expect(viewOf([0, 0, 10, 10])).toEqual({ rect: { x: 0, y: 0, width: 10, height: 10 }, parts: ["garage", "lower", "upper"] });
  });
});

describe("on screen: contain and cover", () => {
  const rect: Rect = { x: -4, y: 68, width: 274, height: 148 };

  it("contain is the lights' fitContain, and an SVG's xMidYMid meet", () => {
    for (const box of PHOTO_AREAS) expect(fitView(rect, box, "contain")).toEqual(fitContain(rect, box));
    expect(preserveAspect("contain")).toBe("xMidYMid meet");
    expect(preserveAspect("cover")).toBe("xMidYMid slice");
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
});

describe("the close views (page 3's medium, page 4's entry), on every iPad", () => {
  // What may run off a side of the frame: the ground, the main floor's roof
  // edge and its lights (entry), and the side running back (medium).
  const MAY_LEAVE: Record<"medium" | "entry", { left: Vec[][]; right: Vec[][] }> = {
    entry: { left: [HOUSE_GROUND], right: [HOUSE_GROUND, HOUSE_EDGES["lower-eave"], HOUSE_EAVES["lower-eave"]] },
    medium: {
      left: [HOUSE_GROUND],
      right: [HOUSE_GROUND, HOUSE_EDGES["lower-sides"], HOUSE_OUTLINE.find((line) => line[0][0] === 300 && line[0][1] === 196)!],
    },
  };

  for (const crop of ["medium", "entry"] as const) {
    it(`${crop}: whole at the top and bottom, cut only at natural breaks at the sides, and no glow cut`, () => {
      const { rect, parts } = viewOf(crop);
      const lines = drawnLines(parts);
      const lights = placeAlong(houseLines(runsFor(LIT_RUNS, parts)), HOUSE_UNITS_PER_METRE).lights;
      for (const box of PHOTO_AREAS) {
        const seen = visibleRect(rect, box, "cover");
        const at = `${crop} at ${box.width}`;
        for (const line of lines) {
          // Nothing crosses the top or bottom: only sky and ground are trimmed.
          expect(crossesY(line, seen.y), `${at} top ${pathD(line)}`).toBe(false);
          expect(crossesY(line, seen.y + seen.height), `${at} bottom ${pathD(line)}`).toBe(false);
          if (crossesX(line, seen.x)) expect(MAY_LEAVE[crop].left.some((ok) => sameLine(ok, line)), `${at} left ${pathD(line)}`).toBe(true);
          if (crossesX(line, seen.x + seen.width)) expect(MAY_LEAVE[crop].right.some((ok) => sameLine(ok, line)), `${at} right ${pathD(line)}`).toBe(true);
        }
        // The garage gable, the garage door, the porch and the front door are whole.
        for (const point of [...HOUSE_EDGES["garage-gable"], ...HOUSE_DOORS[0], ...HOUSE_DOORS[4], ...HOUSE_OUTLINE[HOUSE_OUTLINE.length - 3]]) {
          expect(within(point, seen), `${at} ${point}`).toBe(true);
        }
        // No light's glow is cut at the top, the bottom or the left.
        for (const light of lights) {
          if (light.x > seen.x + seen.width) continue;
          expect(light.y - GLOW, at).toBeGreaterThanOrEqual(seen.y);
          expect(light.y + GLOW, at).toBeLessThanOrEqual(seen.y + seen.height);
          expect(light.x - GLOW, at).toBeGreaterThanOrEqual(seen.x);
        }
      }
    });
  }

  it("entry is tight on the garage and entry: it stops between the porch and the right window", () => {
    const { rect } = viewOf("entry");
    for (const box of PHOTO_AREAS) {
      const seen = visibleRect(rect, box, "cover");
      expect(seen.x + seen.width).toBeGreaterThan(264);
      expect(seen.x + seen.width).toBeLessThan(272);
    }
    // About 2:1, and no wider than the narrowest photo area, so cover only trims sky and ground.
    expect(rect.width / rect.height).toBeGreaterThan(1.8);
    expect(rect.width / rect.height).toBeLessThanOrEqual(IPAD_PRO.width / IPAD_PRO.height + 1e-3);
  });

  it("medium shows the whole lower eave lit, and steps in from whole to medium to entry", () => {
    const { rect } = viewOf("medium");
    const lights = placeAlong(houseLines(["lower-eave"]), HOUSE_UNITS_PER_METRE).lights;
    for (const box of PHOTO_AREAS) {
      const seen = visibleRect(rect, box, "cover");
      for (const light of lights) expect(light.x + GLOW).toBeLessThanOrEqual(seen.x + seen.width);
      const whole = fitView(viewOf("whole").rect, box, "contain").scale;
      const medium = fitView(rect, box, "cover").scale;
      const entry = fitView(viewOf("entry").rect, box, "cover").scale;
      expect(medium).toBeGreaterThan(whole * 1.1);
      expect(entry).toBeGreaterThan(medium * 1.1);
    }
    expect(rect.width / rect.height).toBeGreaterThan(1.85);
    expect(rect.width / rect.height).toBeLessThan(2);
  });
});

describe("the corner (the warm or cool pair)", () => {
  it("is complete: every line and every light it draws ends inside the frame, with equal margins", () => {
    const { rect, parts } = viewOf("corner");
    expect(parts).toEqual(["lower", "upper"]);
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
    const ground = groundFor(["lower", "upper"])!;
    expect(ground[0][0]).toBeLessThan(116);
    expect(ground[0][0]).toBeGreaterThan(100);
    expect(drawnLines(["lower", "upper"]).some((line) => partOf(line) === "garage")).toBe(false);
  });
});

describe("the track by day", () => {
  it("is a slim closed profile under each roof edge, its bottom on the line the lights follow", () => {
    for (const run of LIT_RUNS) {
      const profile = trackProfile(run);
      const eave = HOUSE_EAVES[run];
      expect(profile.length).toBe(eave.length * 2);
      // Its bottom is the eave line, walked back.
      expect(profile.slice(eave.length)).toEqual(eave.slice().reverse());
      // Its top is TRACK_DEPTH above it, square to it, and still under the roof edge.
      const top = profile.slice(0, eave.length);
      const edge = boundsOf([HOUSE_EDGES[run]])!;
      for (const [at, [x, y]] of top.entries()) {
        const [bx, by] = eave[at];
        expect(Math.hypot(x - bx, y - by), run).toBeGreaterThanOrEqual(TRACK_DEPTH - 1e-9);
        expect(y, run).toBeLessThan(by);
        expect(y, run).toBeGreaterThan(edge.y);
      }
    }
    // A flat run: exactly TRACK_DEPTH deep.
    expect(trackProfile("lower-eave")[0]).toEqual([119, 123.5 - TRACK_DEPTH]);
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

describe("the warm or cool pair's layout", () => {
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
    const names: HouseCropName[] = ["whole", "medium", "entry", "corner", "roofline"];
    expect(Object.keys(HOUSE_CROPS).sort()).toEqual([...names].sort());
    for (const name of names) expect(HOUSE_CROP_PARTS[name].length).toBeGreaterThan(0);
  });
});
